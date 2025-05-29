import { 
  Connection, 
  PublicKey, 
  Transaction, 
  sendAndConfirmTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  createTransferInstruction, 
  getAssociatedTokenAddress, 
  TOKEN_PROGRAM_ID 
} from '@solana/spl-token';

// The token we're using for compute
const COMPUTE_TOKEN_MINT = new PublicKey('B1N1HcMm4RysYz4smsXwmk2UnS8NziqKCM6Ho8i62vXo');
// The treasury wallet address
const TREASURY_WALLET = new PublicKey('BECGjgNwEnaaxvK84or6vWvbR1xcX6wQc5Zmy9vvqZ2V');
// Token decimals - COMPUTE token has 6 decimals
const COMPUTE_TOKEN_DECIMALS = 6;

export async function transferComputeTokens(
  walletAdapter: any,
  amount: number
): Promise<string> {
  try {
    if (!walletAdapter) {
      throw new Error('Wallet adapter is not initialized');
    }
    
    if (!walletAdapter.connected) {
      throw new Error('Wallet is not connected. Please connect your wallet first.');
    }
    
    if (!walletAdapter.publicKey) {
      throw new Error('No public key found. Please reconnect your wallet.');
    }

    console.log('Starting token transfer with wallet:', walletAdapter.publicKey.toString());
    console.log(`Original amount: ${amount} COMPUTE`);
    
    // Connect to Solana network using the Helius RPC URL from environment variables
    const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_HELIUS_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/demo';
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    
    // Get the sender's token account
    const senderTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      walletAdapter.publicKey
    );
    
    console.log('Sender token account:', senderTokenAccount.toString());
    
    // Check if the token account exists and has sufficient balance
    try {
      const tokenAccountInfo = await connection.getTokenAccountBalance(senderTokenAccount);
      console.log('Token account balance:', tokenAccountInfo.value.uiAmount);
      
      // Check if there's enough balance
      if (!tokenAccountInfo.value.uiAmount || tokenAccountInfo.value.uiAmount < amount / Math.pow(10, COMPUTE_TOKEN_DECIMALS)) {
        throw new Error(`Insufficient balance. You have ${tokenAccountInfo.value.uiAmount || 0} COMPUTE, but tried to transfer ${amount / Math.pow(10, COMPUTE_TOKEN_DECIMALS)} COMPUTE.`);
      }
    } catch (error) {
      if ((error as Error).message && (error as Error).message.includes('Insufficient balance')) {
        throw error; // Re-throw our custom error
      }
      
      // Check if the account doesn't exist
      console.error('Error checking token balance:', error);
      
      // Create the associated token account if it doesn't exist
      console.log('Token account may not exist. Checking if we need to create it...');
      
      try {
        const accountInfo = await connection.getAccountInfo(senderTokenAccount);
        if (!accountInfo) {
          throw new Error('Token account does not exist. Please add some COMPUTE tokens to your wallet first.');
        }
      } catch (e) {
        throw new Error('Unable to check token account. You may not have any COMPUTE tokens in your wallet.');
      }
    }
    
    // Get the treasury's token account
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      TREASURY_WALLET
    );
    
    console.log('Treasury token account:', treasuryTokenAccount.toString());
    
    // Check if the treasury token account exists
    try {
      const treasuryAccountInfo = await connection.getAccountInfo(treasuryTokenAccount);
      if (!treasuryAccountInfo) {
        console.log('Treasury token account does not exist. Creating it...');
        // In a real app, you would create the treasury token account here
        throw new Error('Treasury token account does not exist. Please contact support.');
      }
    } catch (error) {
      console.error('Error checking treasury token account:', error);
      throw new Error('Error checking treasury account. Please try again later.');
    }
    
    // Convert the amount to the correct decimal representation
    const adjustedAmount = amount * Math.pow(10, COMPUTE_TOKEN_DECIMALS);
    console.log(`Adjusted amount with decimals: ${adjustedAmount}`);
    
    // Create the transfer instruction with the adjusted amount
    const transferInstruction = createTransferInstruction(
      senderTokenAccount,
      treasuryTokenAccount,
      walletAdapter.publicKey,
      BigInt(Math.floor(adjustedAmount)), // Convert to BigInt and ensure it's an integer
      [],
      TOKEN_PROGRAM_ID
    );
    
    // Create a new transaction and add the transfer instruction
    const transaction = new Transaction().add(transferInstruction);
    
    // Set the recent blockhash and fee payer
    transaction.feePayer = walletAdapter.publicKey;
    const { blockhash } = await connection.getRecentBlockhash();
    transaction.recentBlockhash = blockhash;
    
    console.log('Transaction created, requesting signature...');
    
    // Sign the transaction
    const signedTransaction = await walletAdapter.signTransaction(transaction);
    
    console.log('Transaction signed, sending to network...');
    
    // Send the transaction
    const signature = await connection.sendRawTransaction(signedTransaction.serialize());
    
    console.log('Transaction sent, signature:', signature);
    
    // Confirm the transaction
    await connection.confirmTransaction(signature, 'confirmed');
    
    console.log('Transaction confirmed');
    
    return signature;
  } catch (error) {
    console.error('Error transferring compute tokens:', error);
    throw new Error(`Failed to transfer tokens: ${(error as Error).message}`);
  }
}
