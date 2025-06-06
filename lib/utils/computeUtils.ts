import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token';
import { getBackendBaseUrl } from '@/lib/utils/apiUtils';

// Constants for token decimal handling
const COMPUTE_DECIMALS = 6;
const COMPUTE_MULTIPLIER = Math.pow(10, COMPUTE_DECIMALS);

/**
 * Injects compute from a citizen's wallet to the treasury
 * @param walletAddress The wallet address to inject compute from
 * @param amount The amount of compute to inject
 * @returns The response data from the API
 */
export async function transferCompute(walletAddress: string, amount: number) {
  try {
    console.log('Starting compute injection process...');
    
    if (!walletAddress) {
      throw new Error('Please connect your wallet first');
    }
    
    // Check if we have a valid wallet address
    let publicKey;
    try {
      // Log the wallet address for debugging
      console.log('Validating wallet address:', walletAddress);
      
      // Validate the wallet address format
      if (!walletAddress.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
        console.error('Invalid wallet address format:', walletAddress);
        throw new Error('Invalid wallet address format. Please connect a valid Solana wallet.');
      }
      
      publicKey = new PublicKey(walletAddress);
      console.log('Valid PublicKey created:', publicKey.toString());
    } catch (error) {
      console.error('Invalid wallet address:', error);
      
      // Provide more specific error messages for common wallet issues
      if (error.message && error.message.includes('Invalid public key input')) {
        throw new Error('Invalid wallet address format. Please connect a valid Solana wallet.');
      } else if (error.message && error.message.includes('expected a public key')) {
        throw new Error('Expected a valid Solana public key. Please reconnect your wallet.');
      } else {
        throw new Error(`Invalid wallet address. Please connect a valid Solana wallet. Details: ${error.message}`);
      }
    }
    
    // Get the wallet adapter
    const wallet = window.solana;
    if (!wallet) {
      throw new Error('Solana wallet not found. Please install a Phantom wallet extension.');
    }
    
    console.log('Found wallet adapter:', wallet.isPhantom ? 'Phantom' : 'Unknown');
    
    // Request wallet connection if not already connected
    if (!wallet.isPhantom) {
      throw new Error('Please use a Phantom wallet for Solana transactions.');
    }
    
    try {
      console.log('Connecting to wallet...');
      const { publicKey: connectedPublicKey } = await wallet.connect();
      console.log('Connected to wallet with public key:', connectedPublicKey.toString());
      
      // Use the connected wallet's public key instead of the one passed to the function
      publicKey = connectedPublicKey;
      console.log('Using connected wallet public key for transaction:', publicKey.toString());
    } catch (connectError) {
      console.error('Failed to connect to wallet:', connectError);
      throw new Error(`Failed to connect to your wallet: ${connectError.message}`);
    }
    
    // Get the connection to Solana
    console.log('Creating Solana connection...');
    const connection = new Connection(
      process.env.NEXT_PUBLIC_HELIUS_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    
    // Get the COMPUTE token mint address
    console.log('Getting COMPUTE token mint address...');
    const COMPUTE_TOKEN_MINT = new PublicKey(
      process.env.NEXT_PUBLIC_COMPUTE_TOKEN_MINT || 'B1N1HcMm4RysYz4smsXwmk2UnS8NziqKCM6Ho8i62vXo'
    );
    
    // Get the treasury public key
    console.log('Getting treasury public key...');
    const TREASURY_PUBLIC_KEY = new PublicKey(
      process.env.NEXT_PUBLIC_TREASURY_PUBLIC_KEY || 'BECGjgNwEnaaxvK84or6vWvbR1xcX6wQc5Zmy9vvqZ2V'
    );
    
    // Get the token account for the treasury
    console.log('Getting treasury token account...');
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      TREASURY_PUBLIC_KEY
    );
    console.log('Treasury token account:', treasuryTokenAccount.toString());
    
    // Get the token account for the sender
    console.log('Getting sender token account...');
    const senderTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      publicKey
    );
    console.log('Sender token account:', senderTokenAccount.toString());
    
    // Check sender token account balance
    console.log('Checking sender token account balance...');
    console.log(`Using RPC URL: ${process.env.NEXT_PUBLIC_HELIUS_RPC_URL || 'https://api.devnet.solana.com'}`);
    console.log(`Checking balance for token account: ${senderTokenAccount.toString()}`);
    
    try {
      const tokenBalance = await connection.getTokenAccountBalance(senderTokenAccount);
      console.log('Token balance:', tokenBalance.value.uiAmount);
      
      if (!tokenBalance.value.uiAmount || tokenBalance.value.uiAmount < amount) {
        throw new Error(`Insufficient token balance. You have ${tokenBalance.value.uiAmount || 0} COMPUTE tokens, but ${amount} are required for this transaction.`);
      }
    } catch (balanceError) {
      console.error('Error checking token balance:', balanceError);
      
      // If we get here, the account exists but we couldn't get the balance
      throw new Error(`Failed to check token balance: ${balanceError.message}`);
    }
    
    
    // Create transfer instruction - FROM sender TO treasury
    console.log('Creating transfer instruction...');
    // Convert the amount to the correct decimal representation
    const tokenAmount = Math.floor(amount * COMPUTE_MULTIPLIER);
    console.log(`Converting ${amount} COMPUTE to ${tokenAmount} token units (with ${COMPUTE_DECIMALS} decimals)`);
    
    const transferIx = createTransferInstruction(
      senderTokenAccount,
      treasuryTokenAccount,
      publicKey,  // The sender needs to sign this transaction
      tokenAmount
    );
    
    // Create transaction and add the transfer instruction
    console.log('Creating transaction...');
    const transaction = new Transaction().add(transferIx);
    
    // Get the recent blockhash
    console.log('Getting recent blockhash...');
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = publicKey;  // The sender pays the fee
    
    // Request the wallet to sign the transaction
    console.log('Requesting wallet to sign transaction...');
    const signedTransaction = await wallet.signTransaction(transaction);
    
    // Serialize the signed transaction
    console.log('Serializing signed transaction...');
    const serializedTransaction = signedTransaction.serialize();
    
    
    
    // Send the signed transaction to the network
    let signature: string;
    try {
      console.log('Sending transaction to network...');
      signature = await connection.sendRawTransaction(serializedTransaction);
      
      console.log('Transaction sent with signature:', signature);
      
      // Wait for confirmation
      console.log('Waiting for transaction confirmation...');
      try {
        const confirmation = await connection.confirmTransaction(signature);
        console.log('Transaction confirmed!', confirmation);
        
        if (confirmation.value.err) {
          throw new Error(`Transaction confirmed but failed: ${JSON.stringify(confirmation.value.err)}`);
        }
      } catch (confirmError) {
        console.error('Error confirming transaction:', confirmError);
        throw new Error(`Transaction sent but confirmation failed: ${confirmError.message}`);
      }
    } catch (sendError) {
      console.error('Error sending transaction:', sendError);
      
      // Check for specific error types
      if (sendError.message && sendError.message.includes('Attempt to debit an account but found no record of a prior credit')) {
        throw new Error('You don\'t have any COMPUTE tokens in your wallet. Please add tokens to your wallet first.');
      } else if (sendError.message && sendError.message.includes('insufficient funds')) {
        throw new Error('Insufficient funds to complete this transaction. This could be due to not having enough SOL to pay for transaction fees.');
      } else if (sendError.message && sendError.message.includes('Transaction simulation failed')) {
        // Try to get more detailed logs if available
        let errorDetails = sendError.message;
        if (sendError.logs) {
          errorDetails += ` Logs: ${JSON.stringify(sendError.logs)}`;
        }
        
        // Check if it's a token account issue
        if (errorDetails.includes('TokenAccountNotFound') || 
            errorDetails.includes('Account does not exist') ||
            errorDetails.includes('Invalid account owner')) {
          throw new Error('Token account not found. You need to create a COMPUTE token account in your wallet first by receiving some COMPUTE tokens.');
        }
        
        // Check for insufficient token balance in the simulation error
        if (errorDetails.includes('insufficient funds') || 
            errorDetails.includes('Insufficient funds') ||
            errorDetails.includes('would result in negative tokens') ||
            errorDetails.includes('no balance changes found')) {
          throw new Error('You don\'t have enough COMPUTE tokens in your wallet. Please add tokens to your wallet first.');
        }
        
        throw new Error(`Transaction simulation failed: ${errorDetails}`);
      }
      
      // If it's another type of error, just throw it
      throw sendError;
    }
    
    // Now update the backend database with the completed transaction
    console.log('Updating backend database with /api/inject-compute-complete...');
    const { getBackendBaseUrl } = await import('@/lib/utils/apiUtils');
    const apiUrl = `${getBackendBaseUrl()}/api/inject-compute-complete`;
    const requestBody = {
      wallet_address: walletAddress,
      ducats: amount,
      transaction_signature: signature,
    };
    console.log(`Calling ${apiUrl} with body:`, JSON.stringify(requestBody, null, 2));

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`Response status from ${apiUrl}: ${response.status}`);
    const responseText = await response.text();
    console.log(`Response text from ${apiUrl}:`, responseText);
    
    if (!response.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        console.error(`Failed to parse JSON error response from ${apiUrl}. Raw text: ${responseText}`);
        throw new Error(`Failed to update database after injection. Server returned ${response.status}. Response: ${responseText}`);
      }
      console.error(`Error response from ${apiUrl}:`, errorData);
      throw new Error(errorData.detail || `Failed to update database after injection. Server returned ${response.status}`);
    }
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error(`Failed to parse JSON success response from ${apiUrl}. Raw text: ${responseText}`);
      throw new Error(`Successfully updated database, but failed to parse server response. Raw text: ${responseText}`);
    }
    
    console.log('Compute injection successful, backend response:', data);
    
    return data;
  } catch (error) {
    console.error('Error in transferCompute function (either on-chain or during backend update):', error);
    throw error;
  }
}

/**
 * Withdraws compute from a citizen's wallet
 * @param walletAddress The wallet address to withdraw compute from
 * @param amount The amount of compute to withdraw
 * @returns The response data from the API
 */
export async function withdrawCompute(walletAddress: string, amount: number) {
  try {
    if (!walletAddress) {
      throw new Error('Please connect your wallet first');
    }
    
    console.log(`Initiating withdrawal of ${amount.toLocaleString()} ducats...`);
    
    // Try the direct API route first
    try {
      const response = await fetch('/api/withdraw-compute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          ducats: amount,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Compute withdrawal successful:', data);
        return data;
      }
    } catch (directApiError) {
      console.warn('Direct API withdrawal failed, falling back to backend API:', directApiError);
    }
    
    // Fall back to the backend API
    const response = await fetch(`${getBackendBaseUrl()}/api/withdraw-compute-solana`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address: walletAddress,
        ducats: amount,
      }),
      // Add a timeout to prevent hanging requests
      signal: AbortSignal.timeout(15000) // 15 second timeout
    });
    
    // Handle non-OK responses with more detailed error messages
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.detail || `Server returned ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    console.log('Compute withdrawal successful:', data);
    
    return data;
  } catch (error) {
    console.error('Error withdrawing compute:', error);
    throw error;
  }
}

/**
 * Get compute balance for a wallet address
 * @param walletAddress The wallet address to check
 * @returns Promise resolving to the compute balance
 */
export async function getComputeBalance(walletAddress: string): Promise<number> {
  try {
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }
    
    // Try the direct API route first
    try {
      const response = await fetch(`/api/wallet/${walletAddress}/balance`);
      
      if (response.ok) {
        const data = await response.json();
        return data.balance || 0;
      }
    } catch (directApiError) {
      console.warn('Direct API balance check failed, falling back to backend API:', directApiError);
    }
    
    // Fall back to the backend API
    const response = await fetch(`${getBackendBaseUrl()}/api/wallet/${walletAddress}/balance`);
    
    if (!response.ok) {
      // For development, return a mock balance
      if (process.env.NODE_ENV === 'development') {
        console.log('[DEV] Returning mock compute balance of 1000');
        return 1000;
      }
      
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to get compute balance: ${response.status}`);
    }
    
    const data = await response.json();
    return data.balance || 0;
  } catch (error) {
    console.error('Error getting compute balance:', error);
    
    // For development, return a mock balance
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEV] Returning mock compute balance of 1000 after error');
      return 1000;
    }
    
    throw error;
  }
}

/**
 * Deduct compute from a citizen's wallet
 * @param walletAddress The wallet address to deduct from
 * @param amount The amount to deduct
 * @returns Promise resolving when the deduction is complete
 */
export async function deductCompute(walletAddress: string, amount: number): Promise<void> {
  try {
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }
    
    const response = await fetch(`${getBackendBaseUrl()}/api/wallet/${walletAddress}/deduct-compute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to deduct compute: ${response.status}`);
    }
  } catch (error) {
    console.error('Error deducting compute:', error);
    
    // For development, just log the deduction
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] Would deduct ${amount} compute from ${walletAddress}`);
      return; // Don't throw in development
    }
    
    throw error;
  }
}
