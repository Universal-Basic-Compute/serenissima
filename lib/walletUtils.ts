// Utility functions for wallet management
import { getApiBaseUrl } from '@/lib/apiUtils';

export function getWalletAddress(): string | null {
  if (typeof window === 'undefined') return null;
  
  // First check session storage
  const sessionWallet = sessionStorage.getItem('walletAddress');
  if (sessionWallet) {
    return sessionWallet;
  }
  
  // Fall back to localStorage
  return localStorage.getItem('walletAddress');
}

export function setWalletAddress(address: string | null): void {
  if (typeof window === 'undefined') return;
  
  if (address) {
    // Store in session storage first, then local storage as backup
    sessionStorage.setItem('walletAddress', address);
    localStorage.setItem('walletAddress', address);
    
    // Dispatch a custom event to notify components
    window.dispatchEvent(new Event('walletChanged'));
  } else {
    clearWalletAddress();
  }
}

export function clearWalletAddress(): void {
  if (typeof window === 'undefined') return;
  
  sessionStorage.removeItem('walletAddress');
  localStorage.removeItem('walletAddress');
  
  // Dispatch a custom event to notify components
  window.dispatchEvent(new Event('walletChanged'));
}

/**
 * Stores a wallet address in Airtable and retrieves user data
 * @param walletAddress The wallet address to store
 * @returns The user data from Airtable
 */
export async function storeWalletInAirtable(walletAddress: string) {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address: walletAddress,
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to store wallet');
    }
    
    const data = await response.json();
    console.log('Wallet stored in Airtable:', data);
    
    return data;
  } catch (error) {
    console.error('Error storing wallet:', error);
    return null;
  }
}
