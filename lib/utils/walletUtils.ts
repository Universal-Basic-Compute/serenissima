// Utility functions for wallet management
import { getBackendBaseUrl } from '@/lib/utils/apiUtils';

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
    // Store in both session storage and local storage for persistence
    try {
      sessionStorage.setItem('walletAddress', address);
      localStorage.setItem('walletAddress', address);
      
      // Also store the connection timestamp
      localStorage.setItem('walletConnectedAt', Date.now().toString());
      
      // Dispatch a custom event to notify components
      window.dispatchEvent(new Event('walletChanged'));
    } catch (error) {
      console.error('Error storing wallet address:', error);
    }
  } else {
    clearWalletAddress();
  }
}

export function clearWalletAddress(): void {
  if (typeof window === 'undefined') return;
  
  // Clear wallet address from storage
  sessionStorage.removeItem('walletAddress');
  localStorage.removeItem('walletAddress');
  
  // Also clear wallet connection timestamp if it exists
  localStorage.removeItem('walletConnectedAt');
  
  // Try to disconnect Phantom at the browser level if available
  if (window.solana && window.solana.isPhantom) {
    try {
      console.log("Attempting to disconnect Phantom at browser level");
      window.solana.disconnect();
    } catch (e) {
      console.warn("Could not disconnect Phantom at browser level:", e);
    }
  }
  
  // Dispatch a custom event to notify components
  window.dispatchEvent(new Event('walletChanged'));
  
  // Force a page reload to completely reset the connection state
  // setTimeout(() => {
  //   window.location.reload(); // Callers should handle reload if necessary
  // }, 100); 
  
  console.log("Wallet address cleared from storage. Page reload should be handled by caller if needed.");
}

/**
 * Stores a wallet address in Airtable and retrieves citizen data
 * @param walletAddress The wallet address to store
 * @returns The citizen data from Airtable
 */
export async function storeWalletInAirtable(walletAddress: string) {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/api/wallet`, {
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

/**
 * Connects and persists a wallet address
 * @param address The wallet address to connect and persist
 * @returns The citizen data from the API
 */
export async function connectAndPersistWallet(address: string): Promise<any> {
  if (!address) return null;
  
  try {
    // Store the wallet address first
    setWalletAddress(address);
    
    // Then connect it through the API
    const response = await fetch(`${getBackendBaseUrl()}/api/wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address: address,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to store wallet: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Wallet connected and persisted:', data);
    
    // Dispatch a custom event to notify components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('walletConnected', { 
        detail: { address, citizenData: data } 
      }));
    }
    
    return data;
  } catch (error) {
    console.error('Error connecting and persisting wallet:', error);
    // Don't clear the wallet on error - just log it and return null
    return null;
  }
}

/**
 * @deprecated Prefer `useWalletContext().citizenProfile?.username` in React components.
 * Retrieves the current citizen's username from storage.
 * Prefers sessionStorage, then falls back to localStorage.
 * @returns The citizen's username or null if not found.
 */
export function getCurrentCitizenUsername(): string | null {
  if (typeof window === 'undefined') return null;

  // Try sessionStorage first
  const sessionUsername = sessionStorage.getItem('username');
  if (sessionUsername) {
    return sessionUsername;
  }

  // Fallback to localStorage
  const localUsername = localStorage.getItem('username');
  if (localUsername) {
    return localUsername;
  }

  return null;
}
