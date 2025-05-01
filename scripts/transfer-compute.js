require('dotenv').config();
const fs = require('fs');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const bs58 = require('bs58');

async function transferCompute() {
  try {
    // Read transfer data from the temporary file
    const transferData = JSON.parse(fs.readFileSync('transfer_data.json', 'utf8'));
    const { recipient, amount } = transferData;
    
    // Initialize Solana connection
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    
    // Load treasury keypair from private key
    const privateKeyString = process.env.WALLET_PRIVATE_KEY;
    if (!privateKeyString) {
      throw new Error('WALLET_PRIVATE_KEY is not set in environment variables');
    }
    
    const privateKeyBytes = bs58.decode(privateKeyString);
    const treasuryKeypair = Keypair.fromSecretKey(privateKeyBytes);
    
    // COMPUTE token mint address
    const computeTokenMint = new PublicKey(
      process.env.COMPUTE_TOKEN_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
    );
    
    // Create token instance
    const token = new Token(
      connection,
      computeTokenMint,
      TOKEN_PROGRAM_ID,
      treasuryKeypair
    );
    
    // Get treasury token account
    const treasuryTokenAccount = await token.getOrCreateAssociatedAccountInfo(
      treasuryKeypair.publicKey
    );
    
    // Get or create recipient token account
    const recipientPublicKey = new PublicKey(recipient);
    let recipientTokenAccount;
    
    try {
      recipientTokenAccount = await token.getOrCreateAssociatedAccountInfo(
        recipientPublicKey
      );
    } catch (error) {
      console.error('Error getting or creating recipient token account:', error);
      throw error;
    }
    
    // Transfer tokens
    const signature = await token.transfer(
      treasuryTokenAccount.address,
      recipientTokenAccount.address,
      treasuryKeypair.publicKey,
      [],
      amount
    );
    
    console.log(JSON.stringify({
      success: true,
      signature,
      amount,
      recipient
    }));
    
    // Clean up the temporary file
    fs.unlinkSync('transfer_data.json');
    
    return signature;
  } catch (error) {
    console.error('Error transferring COMPUTE tokens:', error);
    process.exit(1);
  }
}

transferCompute();
