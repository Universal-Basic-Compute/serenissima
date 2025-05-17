'use client';

import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useWallet } from '@/lib/hooks/useWallet';

// Create a context for the wallet
interface WalletContextType {
  walletAddress: string | null;
  userProfile: any;
  isConnected: boolean;
  isConnecting: boolean;
  isInitialized: boolean;
  connectWallet: () => Promise<void>;
  updateUserProfile: (updatedProfile: any) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Create a provider component
export function WalletProvider({ children }: { children: ReactNode }) {
  // Define the useWallet hook directly here
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Register user with the API
  const registerUser = async (walletAddress: string) => {
    try {
      console.log('Registering user with wallet address:', walletAddress);
      
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress }),
      });

      if (!response.ok) {
        throw new Error(`Registration failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        console.log('User registration successful:', data.user);
        return data.user;
      } else {
        console.error('Registration error:', data.error);
        return null;
      }
    } catch (error) {
      console.error('Error registering user:', error);
      return null;
    }
  };
  
  // Fetch user profile
  const fetchUserProfile = async (walletAddress: string) => {
    try {
      const response = await fetch(`/api/users/wallet/${walletAddress}`);
      
      if (response.ok) {
        const data = await response.json();
        setUserProfile(data.user);
        localStorage.setItem('userProfile', JSON.stringify(data.user));
        return data.user;
      } else {
        console.error('Failed to fetch user profile:', response.status);
        return null;
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  };
  
  // Connect wallet function
  const connectWallet = async () => {
    if (isConnecting) return;
    
    setIsConnecting(true);
    
    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined') {
        console.error('Cannot connect wallet: window is undefined');
        return;
      }
      
      // Check if Phantom is installed
      if (!window.solana || !window.solana.isPhantom) {
        alert('Phantom wallet is not installed. Please install it from https://phantom.app/');
        window.open('https://phantom.app/', '_blank');
        return;
      }
      
      // Connect to Phantom wallet
      const { publicKey } = await window.solana.connect();
      const address = publicKey.toString();
      
      console.log('Connected to wallet:', address);
      
      // Store wallet address
      setWalletAddress(address);
      localStorage.setItem('walletAddress', address);
      
      // Register or fetch the user profile
      const userProfile = await registerUser(address);
      
      if (userProfile) {
        setUserProfile(userProfile);
        localStorage.setItem('userProfile', JSON.stringify(userProfile));
      } else {
        // If registration fails, try to fetch the user profile from the API
        await fetchUserProfile(address);
      }
      
      // Dispatch event to notify components about wallet change
      window.dispatchEvent(new Event('walletChanged'));
    } catch (error) {
      console.error('Error connecting wallet:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('User rejected')) {
          console.log('User rejected the connection request');
        } else {
          alert(`Failed to connect wallet: ${error.message}`);
        }
      }
    } finally {
      setIsConnecting(false);
    }
  };
  
  // Function to update user profile
  const updateUserProfile = async (updatedProfile: any) => {
    if (updatedProfile) {
      setUserProfile(updatedProfile);
      localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
    }
  };

  // Initialize wallet from localStorage on component mount
  useEffect(() => {
    const initWallet = async () => {
      try {
        // Check if we're in a browser environment
        if (typeof window === 'undefined') {
          return;
        }
        
        // Check if wallet address is stored in localStorage
        const storedAddress = localStorage.getItem('walletAddress');
        if (storedAddress) {
          setWalletAddress(storedAddress);
          
          // Try to load user profile from localStorage first
          const storedProfile = localStorage.getItem('userProfile');
          if (storedProfile) {
            try {
              const parsedProfile = JSON.parse(storedProfile);
              setUserProfile(parsedProfile);
            } catch (e) {
              console.error('Error parsing stored user profile:', e);
              // If parsing fails, fetch from API
              await fetchUserProfile(storedAddress);
            }
          } else {
            // If no stored profile, fetch from API
            await fetchUserProfile(storedAddress);
          }
        }
      } catch (error) {
        console.error('Error initializing wallet:', error);
      } finally {
        setIsInitialized(true);
      }
    };
    
    // Add event listener for profile updates
    const handleProfileUpdate = (event: CustomEvent) => {
      if (event.detail) {
        updateUserProfile(event.detail);
      }
    };
    
    window.addEventListener('userProfileUpdated', handleProfileUpdate as EventListener);
    
    initWallet();
    
    return () => {
      window.removeEventListener('userProfileUpdated', handleProfileUpdate as EventListener);
    };
  }, []);
  
  const isConnected = !!walletAddress;
  
  const wallet = {
    walletAddress,
    userProfile,
    isConnected,
    isConnecting,
    isInitialized,
    connectWallet,
    updateUserProfile
  };
  
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
