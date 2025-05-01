import { useEffect, useState } from 'react';
import { getWalletAddress } from '@/lib/walletUtils';

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
