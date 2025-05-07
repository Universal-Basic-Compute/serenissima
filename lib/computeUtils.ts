import { getApiBaseUrl } from '@/lib/apiUtils';

/**
 * Injects compute from a user's wallet to the treasury
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
      // Import Solana web3 libraries
      const { PublicKey } = await import('@solana/web3.js');
      
      // Validate the wallet address format
      if (!walletAddress.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
        throw new Error('Invalid wallet address format. Please connect a valid Solana wallet.');
      }
      
      publicKey = new PublicKey(walletAddress);
    } catch (error) {
      console.error('Invalid wallet address:', error);
      throw new Error('Invalid wallet address. Please connect a valid Solana wallet.');
    }
    
    // Get the wallet adapter
    const wallet = window.solana;
    if (!wallet) {
      throw new Error('Solana wallet not found. Please install a Solana wallet extension like Phantom.');
    }
    
    // Request wallet connection if not already connected
    if (!wallet.isPhantom) {
      throw new Error('Please use a Phantom wallet for Solana transactions.');
    }
    
    try {
      await wallet.connect();
    } catch (connectError) {
      console.error('Failed to connect to wallet:', connectError);
      throw new Error('Failed to connect to your wallet. Please try again.');
    }
    
    // Now proceed with the transaction
    const { Connection, Transaction } = await import('@solana/web3.js');
    const { getAssociatedTokenAddress, createTransferInstruction } = await import('@solana/spl-token');
    
    // Get the connection to Solana
    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    
    // Get the COMPUTE token mint address
    const COMPUTE_TOKEN_MINT = new PublicKey(
      process.env.NEXT_PUBLIC_COMPUTE_TOKEN_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
    );
    
    // Get the treasury public key
    const TREASURY_PUBLIC_KEY = new PublicKey(
      process.env.NEXT_PUBLIC_TREASURY_PUBLIC_KEY || 'YOUR_TREASURY_PUBLIC_KEY_HERE'
    );
    
    // Get the token account for the treasury
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      TREASURY_PUBLIC_KEY
    );
    
    // Get the token account for the sender
    const senderTokenAccount = await getAssociatedTokenAddress(
      COMPUTE_TOKEN_MINT,
      publicKey
    );
    
    // Create transfer instruction - FROM sender TO treasury
    const transferIx = createTransferInstruction(
      senderTokenAccount,
      treasuryTokenAccount,
      publicKey,  // The sender needs to sign this transaction
      amount
    );
    
    // Create transaction and add the transfer instruction
    const transaction = new Transaction().add(transferIx);
    
    // Get the recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = publicKey;  // The sender pays the fee
    
    // Request the wallet to sign the transaction
    const signedTransaction = await wallet.signTransaction(transaction);
    
    // Serialize the signed transaction
    const serializedTransaction = signedTransaction.serialize();
    
    // Send the signed transaction to the network
    const signature = await connection.sendRawTransaction(serializedTransaction);
    
    console.log('Transaction sent with signature:', signature);
    
    // Wait for confirmation
    await connection.confirmTransaction(signature);
    
    console.log('Transaction confirmed!');
    
    // Now update the backend database with the completed transaction
    const { getApiBaseUrl } = await import('@/lib/apiUtils');
    const response = await fetch(`${getApiBaseUrl()}/api/inject-compute-complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address: walletAddress,
        compute_amount: amount,
        transaction_signature: signature,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to update database after injection');
    }
    
    const data = await response.json();
    console.log('Compute injection successful:', data);
    
    return data;
  } catch (error) {
    console.error('Error injecting compute:', error);
    throw error;
  }
}

/**
 * Withdraws compute from a user's wallet
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
          compute_amount: amount,
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
    const response = await fetch(`${getApiBaseUrl()}/api/withdraw-compute-solana`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address: walletAddress,
        compute_amount: amount,
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
