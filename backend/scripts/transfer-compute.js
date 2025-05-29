require('dotenv').config();
const fs = require('fs');
const { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { createTransferCheckedInstruction, getAssociatedTokenAddress, getMint, getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
const bs58 = require('bs58');

async function transferCompute() {
  try {
    // Read transfer data from the temporary file
    const transferData = JSON.parse(fs.readFileSync('transfer_data.json', 'utf8'));
    const { recipient, amount } = transferData;
    
    // Initialize Solana connection with proper commitment level
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
    
    // Get mint info to determine decimals
    const mintInfo = await getMint(connection, computeTokenMint);
    
    // Get or create treasury token account
    const treasuryTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      treasuryKeypair,
      computeTokenMint,
      treasuryKeypair.publicKey
    );
    
    // Get or create recipient token account
    const recipientPublicKey = new PublicKey(recipient);
    const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      treasuryKeypair, // Payer for account creation if needed
      computeTokenMint,
      recipientPublicKey
    );
    
    // Check treasury balance before transfer
    if (Number(treasuryTokenAccount.amount) < amount) {
      throw new Error(`Insufficient balance: Treasury has ${treasuryTokenAccount.amount} tokens, trying to send ${amount}`);
    }
    
    // Create transfer instruction with proper decimals
    const transferInstruction = createTransferCheckedInstruction(
      treasuryTokenAccount.address,
      computeTokenMint,
      recipientTokenAccount.address,
      treasuryKeypair.publicKey,
      amount * (10 ** mintInfo.decimals), // Convert to proper decimal representation
      mintInfo.decimals
    );
    
    // Create and sign transaction
    const transaction = new Transaction().add(transferInstruction);
    transaction.feePayer = treasuryKeypair.publicKey;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    
    // Send and confirm transaction with proper error handling
    try {
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [treasuryKeypair],
        { commitment: 'confirmed', maxRetries: 5 }
      );
      
      console.log(JSON.stringify({
        success: true,
        signature,
        amount,
        recipient,
        blockTime: new Date().toISOString()
      }));
      
      // Clean up the temporary file
      fs.unlinkSync('transfer_data.json');
      
      return signature;
    } catch (txError) {
      console.error('Transaction failed:', txError);
      console.log(JSON.stringify({
        success: false,
        error: txError.message,
        errorCode: txError.code || 'UNKNOWN',
        amount,
        recipient
      }));
      process.exit(1);
    }
  } catch (error) {
    console.error('Error transferring COMPUTE tokens:', error);
    console.log(JSON.stringify({
      success: false,
      error: error.message,
      errorCode: error.code || 'UNKNOWN'
    }));
    process.exit(1);
  }
}

transferCompute();
