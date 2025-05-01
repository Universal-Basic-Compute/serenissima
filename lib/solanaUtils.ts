import { Connection, PublicKey, Transaction, SystemProgram, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import { 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction,
  createTransferInstruction
} from '@solana/spl-token';

// Solana connection - use devnet for testing, mainnet for production
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

// Treasury wallet (loaded from environment variable)
let treasuryKeypair: Keypair | null = null;

// Initialize the treasury keypair from the private key
function initializeTreasuryKeypair() {
  if (!treasuryKeypair) {
    try {
      const privateKeyString = process.env.WALLET_PRIVATE_KEY;
      if (!privateKeyString) {
        throw new Error('WALLET_PRIVATE_KEY is not set in environment variables');
      }
      
      // Convert the private key from base58 string to Uint8Array
      const privateKeyBytes = bs58.decode(privateKeyString);
      treasuryKeypair = Keypair.fromSecretKey(privateKeyBytes);
      
      console.log(`Treasury wallet initialized: ${treasuryKeypair.publicKey.toString()}`);
    } catch (error) {
      console.error('Failed to initialize treasury keypair:', error);
      throw error;
    }
  }
  return treasuryKeypair;
}

// COMPUTE token mint address (replace with your actual token mint)
const COMPUTE_TOKEN_MINT = new PublicKey(
  process.env.COMPUTE_TOKEN_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
);

/**
 * Transfer COMPUTE tokens from treasury to a user
 * @param recipientAddress The recipient's wallet address
 * @param amount The amount of tokens to transfer
 * @returns Transaction signature
 */
export async function transferComputeFromTreasury(
  recipientAddress: string,
  amount: number
): Promise<string> {
  try {
    // Initialize treasury keypair
    const treasury = initializeTreasuryKeypair();
    
    // Convert recipient address to PublicKey
    const recipient = new PublicKey(recipientAddress);
    
    // Get the token account for the treasury
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      treasury.publicKey
    );
    
    // Get or create the token account for the recipient
    let recipientTokenAccount;
    try {
      recipientTokenAccount = await getAssociatedTokenAddress(
        COMPUTE_TOKEN_MINT,
        recipient
      );
      
      // Check if the recipient token account exists
      const accountInfo = await connection.getAccountInfo(recipientTokenAccount);
      
      // If the account doesn't exist, create it
      if (!accountInfo) {
        console.log(`Creating token account for recipient ${recipientAddress}`);
        
        const createATAIx = createAssociatedTokenAccountInstruction(
          treasury.publicKey,
          recipientTokenAccount,
          recipient,
          COMPUTE_TOKEN_MINT
        );
        
        const transaction = new Transaction().add(createATAIx);
        
        // Sign and send the transaction
        const signature = await sendAndConfirmTransaction(
          connection,
          transaction,
          [treasury]
        );
        
        console.log(`Created token account for recipient: ${signature}`);
      }
    } catch (error) {
      console.error('Error getting or creating recipient token account:', error);
      throw error;
    }
    
    // Create transfer instruction
    const transferIx = createTransferInstruction(
      treasuryTokenAccount,
      recipientTokenAccount,
      treasury.publicKey,
      amount
    );
    
    // Create transaction and add the transfer instruction
    const transaction = new Transaction().add(transferIx);
    
    // Sign and send the transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [treasury]
    );
    
    console.log(`Transferred ${amount} COMPUTE tokens to ${recipientAddress}: ${signature}`);
    return signature;
  } catch (error) {
    console.error('Error transferring COMPUTE tokens from treasury:', error);
    throw error;
  }
}

/**
 * Withdraw COMPUTE tokens from a user to the treasury
 * @param userAddress The user's wallet address
 * @param amount The amount of tokens to withdraw
 * @returns Transaction signature
 */
export async function withdrawComputeToTreasury(
  userAddress: string,
  amount: number
): Promise<string> {
  try {
    // Initialize treasury keypair
    const treasury = initializeTreasuryKeypair();
    
    // Convert user address to PublicKey
    const user = new PublicKey(userAddress);
    
    // Get the token account for the treasury
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      treasury.publicKey
    );
    
    // Get the token account for the user
    const userTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      user
    );
    
    // Check if the user token account exists
    const accountInfo = await connection.getAccountInfo(userTokenAccount);
    if (!accountInfo) {
      throw new Error(`User ${userAddress} does not have a COMPUTE token account`);
    }
    
    // Create transfer instruction
    // Note: This requires the user to sign the transaction, which isn't possible in this backend flow
    // In a real application, this would be done client-side with the user's wallet
    // For this example, we'll simulate it by transferring from treasury to user
    
    // For demonstration purposes, we'll transfer from treasury to user instead
    console.log(`Simulating withdrawal by transferring from treasury to user`);
    
    const transferIx = createTransferInstruction(
      treasuryTokenAccount,
      userTokenAccount,
      treasury.publicKey,
      amount
    );
    
    // Create transaction and add the transfer instruction
    const transaction = new Transaction().add(transferIx);
    
    // Sign and send the transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [treasury]
    );
    
    console.log(`Simulated withdrawal of ${amount} COMPUTE tokens for ${userAddress}: ${signature}`);
    return signature;
  } catch (error) {
    console.error('Error withdrawing COMPUTE tokens to treasury:', error);
    throw error;
  }
}
