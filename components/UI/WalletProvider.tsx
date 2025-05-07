'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useWallet } from '@/lib/hooks/useWallet';

// Create a context for the wallet
interface WalletContextType {
  walletAddress: string | null;
  userProfile: any;
  isConnected: boolean;
  isConnecting: boolean;
  isInitialized: boolean;
  connectWallet: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Create a provider component
export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  
  return (
    <WalletContext.Provider value={wallet}>
      {children}
    </WalletContext.Provider>
  );
}

// Create a hook to use the wallet context
export function useWalletContext() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWalletContext must be used within a WalletProvider');
  }
  return context;
}
