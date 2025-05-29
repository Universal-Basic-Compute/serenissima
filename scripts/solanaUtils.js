const { Connection, PublicKey, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction } = require('@solana/spl-token');
const bs58 = require('bs58');

// Constants for token decimal handling
const COMPUTE_DECIMALS = 6;
const COMPUTE_MULTIPLIER = Math.pow(10, COMPUTE_DECIMALS);

// Solana connection - use devnet for testing, mainnet for production
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

// COMPUTE token mint address (replace with your actual token mint)
const COMPUTE_TOKEN_MINT = new PublicKey(
  process.env.COMPUTE_TOKEN_MINT || 'B1N1HcMm4RysYz4smsXwmk2UnS8NziqKCM6Ho8i62vXo'
);

// Treasury public key (this is just for preparing the transaction, we don't need the private key)
const TREASURY_PUBLIC_KEY = new PublicKey(
  process.env.TREASURY_PUBLIC_KEY || 'BECGjgNwEnaaxvK84or6vWvbR1xcX6wQc5Zmy9vvqZ2V'
);

/**
 * Prepare a transaction for injecting COMPUTE tokens from a citizen to the treasury
 * This creates a transaction that needs to be signed by the citizen
 * @param {string} senderAddress The sender's wallet address
 * @param {number} amount The amount of tokens to transfer
 * @returns {Promise<Object>} Serialized transaction that needs to be signed by the citizen
 */
async function prepareInjectComputeTransaction(senderAddress, amount) {
  try {
    // Convert sender address to PublicKey
    const sender = new PublicKey(senderAddress);
    
    // Get the token account for the treasury
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      TREASURY_PUBLIC_KEY
    );
    
    // Get the token account for the sender
    const senderTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      sender
    );
    
    // Check if the sender token account exists
    const accountInfo = await connection.getAccountInfo(senderTokenAccount);
    if (!accountInfo) {
      console.log(`Citizen ${senderAddress} does not have a COMPUTE token account. This is okay - the frontend will create it.`);
      // We don't throw an error here because the frontend will handle creating the token account
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

module.exports = {
  prepareInjectComputeTransaction
};
