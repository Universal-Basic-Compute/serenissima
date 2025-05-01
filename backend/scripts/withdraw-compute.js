require('dotenv').config();
const fs = require('fs');
const { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { createTransferCheckedInstruction, getAssociatedTokenAddress, getMint, getOrCreateAssociatedTokenAccount, getAccount } = require('@solana/spl-token');
const bs58 = require('bs58');
const nacl = require('tweetnacl');

async function withdrawCompute() {
  try {
    // Read withdrawal data from the temporary file
    const withdrawData = JSON.parse(fs.readFileSync('withdraw_data.json', 'utf8'));
    const { user, amount, signature: userSignature, message } = withdrawData;
    
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
    
    // Get user public key
    const userPublicKey = new PublicKey(user);
    
    // In a real application, we would verify the user's signature here
    // This ensures the user has authorized this withdrawal
    if (userSignature && message) {
      const messageBytes = Buffer.from(message, 'utf8');
      const signatureBytes = Buffer.from(userSignature, 'base64');
      
      // Verify the signature
      const isValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        userPublicKey.toBytes()
      );
      
      if (!isValid) {
        throw new Error('Invalid signature: User has not properly authorized this withdrawal');
      }
    } else {
      console.warn('WARNING: Proceeding without signature verification. This should be required in production.');
    }
    
    // Get user token account
    const userTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      treasuryKeypair, // Payer for account creation if needed
      computeTokenMint,
      userPublicKey
    );
    
    // Get treasury token account
    const treasuryTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      treasuryKeypair,
      computeTokenMint,
      treasuryKeypair.publicKey
    );
    
    // Check user balance before withdrawal
    const userAccountInfo = await getAccount(connection, userTokenAccount.address);
    const userBalance = Number(userAccountInfo.amount) / (10 ** mintInfo.decimals);
    
    if (userBalance < amount) {
      throw new Error(`Insufficient balance: User has ${userBalance} tokens, trying to withdraw ${amount}`);
    }
    
    // Create transfer instruction with proper decimals (from user to treasury)
    const transferInstruction = createTransferCheckedInstruction(
      userTokenAccount.address,
      computeTokenMint,
      treasuryTokenAccount.address,
      userPublicKey, // Owner of the source account
      BigInt(Math.floor(amount * (10 ** mintInfo.decimals))), // Convert to proper decimal representation
      mintInfo.decimals
    );
    
    // Create transaction
    const transaction = new Transaction().add(transferInstruction);
    transaction.feePayer = treasuryKeypair.publicKey; // Treasury pays the fee
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    
    // Serialize the transaction for the user to sign
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    }).toString('base64');
    
    console.log(JSON.stringify({
      success: true,
      status: 'pending_signature',
      serializedTransaction,
      message: 'User must sign this transaction to complete withdrawal',
      amount,
      user
    }));
    
    // In a real application, the frontend would:
    // 1. Receive this serialized transaction
    // 2. Have the user sign it with their wallet
    // 3. Send the signed transaction back to the server
    // 4. The server would then submit it to the blockchain
    
    // For now, we'll simulate this by logging what would happen next
    console.log('NOTE: In a production environment, the user would sign this transaction with their wallet');
    
    // Clean up the temporary file
    fs.unlinkSync('withdraw_data.json');
    
    return {
      status: 'pending_signature',
      serializedTransaction
    };
  } catch (error) {
    console.error('Error processing withdrawal:', error);
    console.log(JSON.stringify({
      success: false,
      error: error.message,
      errorCode: error.code || 'UNKNOWN'
    }));
    process.exit(1);
  }
}

withdrawCompute();
