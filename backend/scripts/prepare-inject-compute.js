const fs = require('fs');

async function main() {
  try {
    // Read the transfer data from the temporary file
    const transferData = JSON.parse(fs.readFileSync('inject_data.json', 'utf8'));
    
    const { sender, amount } = transferData;
    
    if (!sender) {
      throw new Error('Sender address is required');
    }
    
    if (!amount || amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    
    // Simulate preparing a transaction
    const serializedTransaction = "simulated_transaction_data";
    const message = `You are injecting ${amount} COMPUTE tokens to the Republic's treasury.`;
    
    // Return the transaction data
    console.log(JSON.stringify({
      success: true,
      serializedTransaction,
      message,
      sender,
      amount,
      status: "pending_signature"
    }));
    
  } catch (error) {
    console.error('Error preparing inject compute transaction:', error);
    
    // Return error information
    console.log(JSON.stringify({
      success: false,
      error: error.message,
      errorCode: error.code || 'UNKNOWN'
    }));
    
    process.exit(1);
  }
}

main();
