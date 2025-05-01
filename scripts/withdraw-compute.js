require('dotenv').config();
const fs = require('fs');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const bs58 = require('bs58');

async function withdrawCompute() {
  try {
    // Read withdrawal data from the temporary file
    const withdrawData = JSON.parse(fs.readFileSync('withdraw_data.json', 'utf8'));
    const { user, amount } = withdrawData;
    
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
    
    // Get user token account
    const userPublicKey = new PublicKey(user);
    let userTokenAccount;
    
    try {
      userTokenAccount = await token.getOrCreateAssociatedAccountInfo(
        userPublicKey
      );
    } catch (error) {
      console.error('Error getting user token account:', error);
      throw error;
    }
    
    // In a real application, the user would sign a transaction to transfer tokens to the treasury
    // Since we can't do that in this backend flow, we'll simulate it by transferring from treasury to user
    console.log(`Simulating withdrawal by transferring from treasury to user`);
    
    // Transfer tokens (in a real app, this would be from user to treasury)
    const signature = await token.transfer(
      treasuryTokenAccount.address,
      userTokenAccount.address,
      treasuryKeypair.publicKey,
      [],
      amount
    );
    
    console.log(JSON.stringify({
      success: true,
      signature,
      amount,
      user
    }));
    
    // Clean up the temporary file
    fs.unlinkSync('withdraw_data.json');
    
    return signature;
  } catch (error) {
    console.error('Error withdrawing COMPUTE tokens:', error);
    process.exit(1);
  }
}

withdrawCompute();
