import { useEffect, useState } from 'react';
import { getWalletAddress } from '../../lib/utils/walletUtils';

interface WalletStatusProps {
  className?: string;
}

export default function WalletStatus({ className = '' }: WalletStatusProps) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  
  useEffect(() => {
    // Get wallet address from session or local storage
    const storedWallet = getWalletAddress();
    if (storedWallet) {
      setWalletAddress(storedWallet);
      
      // Attempt to reconnect with the stored wallet address
      // This ensures citizen data is properly loaded
      const reconnectWallet = async () => {
        try {
          // Store the wallet address directly in localStorage
          localStorage.setItem('walletAddress', storedWallet);
          // Dispatch a wallet changed event to notify other components
          window.dispatchEvent(new CustomEvent('walletChanged'));
          console.log('Successfully reconnected wallet from storage');
        } catch (error) {
          console.error('Error reconnecting stored wallet:', error);
          // Don't clear the wallet on error - just log it
        }
      };
      
      reconnectWallet();
    }
    
    // Listen for changes to storage
    const handleStorageChange = () => {
      const currentWallet = getWalletAddress();
      setWalletAddress(currentWallet);
    };
    
    // Listen for custom wallet changed event
    const handleWalletChanged = () => {
      const currentWallet = getWalletAddress();
      setWalletAddress(currentWallet);
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('walletChanged', handleWalletChanged);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('walletChanged', handleWalletChanged);
    };
  }, []);
  
  if (!walletAddress) {
    return (
      <div className={`text-sm text-red-500 ${className}`}>
        Not connected to wallet
      </div>
    );
  }
  
  return (
    <div className={`text-sm text-green-600 ${className}`}>
      Connected: {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
    </div>
  );
}
