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

export async function transferComputeTokens(
  walletAdapter: any,
  amount: number
): Promise<string> {
  try {
    if (!walletAdapter.connected) {
      throw new Error('Wallet not connected');
    }

    // Connect to Solana network
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    // Get the sender's token account
    const senderTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      walletAdapter.publicKey
    );
    
    // Get the treasury's token account
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      TREASURY_WALLET
    );
    
    // Create the transfer instruction
    const transferInstruction = createTransferInstruction(
      senderTokenAccount,
      treasuryTokenAccount,
      walletAdapter.publicKey,
      amount,
      [],
      TOKEN_PROGRAM_ID
    );
    
    // Create a new transaction and add the transfer instruction
    const transaction = new Transaction().add(transferInstruction);
    
    // Set the recent blockhash and fee payer
    transaction.feePayer = walletAdapter.publicKey;
    const { blockhash } = await connection.getRecentBlockhash();
    transaction.recentBlockhash = blockhash;
    
    // Sign the transaction
    const signedTransaction = await walletAdapter.signTransaction(transaction);
    
    // Send the transaction
    const signature = await connection.sendRawTransaction(signedTransaction.serialize());
    
    // Confirm the transaction
    await connection.confirmTransaction(signature, 'confirmed');
    
    return signature;
  } catch (error) {
    console.error('Error transferring compute tokens:', error);
    throw error;
  }
}
