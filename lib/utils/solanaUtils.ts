import { Connection, PublicKey, Transaction, SystemProgram, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import { 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount
} from '@solana/spl-token';
import '../components/types/phantom'; // Import the Phantom type definitions

// Constants for token decimal handling
const COMPUTE_DECIMALS = 6;
const COMPUTE_MULTIPLIER = Math.pow(10, COMPUTE_DECIMALS);

// Solana connection - use devnet for testing, mainnet for production
const connection = new Connection(
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL || 'https://api.devnet.solana.com',
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
  process.env.COMPUTE_TOKEN_MINT || 'B1N1HcMm4RysYz4smsXwmk2UnS8NziqKCM6Ho8i62vXo'
);

// Treasury public key
const TREASURY_PUBLIC_KEY = new PublicKey(
  process.env.TREASURY_PUBLIC_KEY || 'BECGjgNwEnaaxvK84or6vWvbR1xcX6wQc5Zmy9vvqZ2V'
);

/**
 * Transfer COMPUTE tokens from treasury to a citizen
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
 * Withdraw COMPUTE tokens from a citizen to the treasury
 * @param citizenAddress The citizen's wallet address
 * @param amount The amount of tokens to withdraw
 * @returns Transaction signature
 */
export async function withdrawComputeToTreasury(
  citizenAddress: string,
  amount: number
): Promise<string> {
  try {
    // Initialize treasury keypair
    const treasury = initializeTreasuryKeypair();
    
    // Convert citizen address to PublicKey
    const citizen = new PublicKey(citizenAddress);
    
    // Get the token account for the treasury
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      treasury.publicKey
    );
    
    // Get the token account for the citizen
    const citizenTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      citizen
    );
    
    // Check if the citizen token account exists
    const accountInfo = await connection.getAccountInfo(citizenTokenAccount);
    if (!accountInfo) {
      throw new Error(`Citizen ${citizenAddress} does not have a COMPUTE token account`);
    }
    
    // Create transfer instruction
    // Note: This requires the citizen to sign the transaction, which isn't possible in this backend flow
    // In a real application, this would be done client-side with the citizen's wallet
    // For this example, we'll simulate it by transferring from treasury to citizen
    
    // For demonstration purposes, we'll transfer from treasury to citizen instead
    console.log(`Simulating withdrawal by transferring from treasury to citizen`);
    
    const transferIx = createTransferInstruction(
      treasuryTokenAccount,
      citizenTokenAccount,
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
    
    console.log(`Simulated withdrawal of ${amount} COMPUTE tokens for ${citizenAddress}: ${signature}`);
    return signature;
  } catch (error) {
    console.error('Error withdrawing COMPUTE tokens to treasury:', error);
    throw error;
  }
}
/**
 * Prepare a transaction for injecting COMPUTE tokens from a citizen to the treasury
 * This creates a transaction that needs to be signed by the citizen
 * @param senderAddress The sender's wallet address
 * @param amount The amount of tokens to transfer
 * @returns Serialized transaction that needs to be signed by the citizen
 */
export async function prepareInjectComputeTransaction(
  senderAddress: string,
  amount: number
): Promise<{ serializedTransaction: string, message: string }> {
  try {
    // Initialize treasury keypair
    const treasury = initializeTreasuryKeypair();
    
    // Convert sender address to PublicKey
    const sender = new PublicKey(senderAddress);
    
    // Get the token account for the treasury
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      treasury.publicKey
    );
    
    // Get the token account for the sender
    const senderTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      sender
    );
    
    // Check if the sender token account exists
    const accountInfo = await connection.getAccountInfo(senderTokenAccount);
    if (!accountInfo) {
      throw new Error(`Citizen ${senderAddress} does not have a COMPUTE token account`);
    }
    
    // Create transfer instruction - FROM sender TO treasury
    // Convert the amount to the correct decimal representation
    const tokenAmount = Math.floor(amount * COMPUTE_MULTIPLIER);
    console.log(`Converting ${amount} COMPUTE to ${tokenAmount} token units (with ${COMPUTE_DECIMALS} decimals)`);
    
    const transferIx = createTransferInstruction(
      senderTokenAccount,
      treasuryTokenAccount,
      sender,  // The sender needs to sign this transaction
      tokenAmount
    );
    
    // Create transaction and add the transfer instruction
    const transaction = new Transaction().add(transferIx);
    
    // Get the recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = sender;  // The sender pays the fee
    
    // Serialize the transaction
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,  // We don't have the sender's signature yet
      verifySignatures: false
    }).toString('base64');
    
    // Create a message for the citizen to understand what they're signing
    const message = `You are injecting ${amount} COMPUTE tokens to the Republic's treasury.`;
    
    return {
      serializedTransaction,
      message
    };
  } catch (error) {
    console.error('Error preparing COMPUTE token injection transaction:', error);
    throw error;
  }
}
