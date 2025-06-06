'use client'; // Ensure this is a client component if using hooks like useWalletContext

import React from 'react'; // Import React
import { useWalletContext } from './WalletProvider'; // Import the context hook

interface WalletStatusProps {
  className?: string;
}

export default function WalletStatus({ className = '' }: WalletStatusProps) {
  const { walletAddress, isConnected, isInitialized } = useWalletContext();
  
  // Wait for the WalletProvider to be initialized before rendering status
  if (!isInitialized) {
    return (
      <div className={`text-sm text-gray-500 ${className}`}>
        Loading wallet status...
      </div>
    );
  }
  
  if (!isConnected || !walletAddress) {
    return (
      <div className={`text-sm text-red-500 ${className}`}>
        Not connected
      </div>
    );
  }
  
  return (
    <div className={`text-sm text-green-600 ${className}`}>
      Connected: {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
    </div>
  );
}
