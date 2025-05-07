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
    
    // Call the backend API to inject compute FROM user TO treasury using Solana
    const response = await fetch(`${getApiBaseUrl()}/api/inject-compute-solana`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address: walletAddress,
        compute_amount: amount,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to inject compute');
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
