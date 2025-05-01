// Utility functions for wallet management

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
    // Store in both storages
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
