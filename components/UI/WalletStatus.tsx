import { useEffect, useState } from 'react';

interface WalletStatusProps {
  className?: string;
}

export default function WalletStatus({ className = '' }: WalletStatusProps) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  
  useEffect(() => {
    // Get wallet address from localStorage
    const storedWallet = localStorage.getItem('walletAddress');
    if (storedWallet) {
      setWalletAddress(storedWallet);
    }
    
    // Listen for changes to localStorage
    const handleStorageChange = () => {
      const currentWallet = localStorage.getItem('walletAddress');
      setWalletAddress(currentWallet);
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
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
