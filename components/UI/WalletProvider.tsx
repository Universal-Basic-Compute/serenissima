'use client';

import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useWallet } from '@/lib/hooks/useWallet';

// Create a context for the wallet
interface WalletContextType {
  walletAddress: string | null;
  citizenProfile: any;
  isConnected: boolean;
  isConnecting: boolean;
  isInitialized: boolean;
  connectWallet: () => Promise<void>;
  updateCitizenProfile: (updatedProfile: any) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Create a provider component
export function WalletProvider({ children }: { children: ReactNode }) {
  // Define the useWallet hook directly here
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [citizenProfile, setCitizenProfile] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Normalize profile data to ensure consistent casing (camelCase)
  const normalizeProfileData = (profile: any): any => {
    if (!profile) return null;
    const normalized = { ...profile };

    const fieldsToNormalize = [
      { pascal: 'SocialClass', camel: 'socialClass' },
      { pascal: 'FirstName', camel: 'firstName' },
      { pascal: 'LastName', camel: 'lastName' },
      { pascal: 'CoatOfArmsImageUrl', camel: 'coatOfArmsImageUrl' },
      { pascal: 'FamilyMotto', camel: 'familyMotto' },
      // Ducats is special due to existing handling, ensure ducats (lowercase) is primary
    ];

    fieldsToNormalize.forEach(field => {
      if (profile[field.pascal] !== undefined && profile[field.camel] === undefined) {
        normalized[field.camel] = profile[field.pascal];
        // delete normalized[field.pascal]; // Optional: remove original
      }
    });

    // Handle Ducats: prefer 'ducats', ensure it exists
    if (profile.Ducats !== undefined && profile.ducats === undefined) {
      normalized.ducats = profile.Ducats;
    } else if (profile.ducats !== undefined) {
      normalized.ducats = profile.ducats; // Ensure it's there if already lowercase
    }
    // PlayerProfile expects 'Ducats' prop, but WalletButton passes 'citizenProfile.ducats'.
    // To simplify, WalletProvider will ensure 'citizenProfile.ducats' (lowercase) is the source of truth.

    return normalized;
  };
  
  // Register citizen with the API
  const registerCitizen = async (walletAddress: string) => {
    try {
      console.log('Registering citizen with wallet address:', walletAddress);
      
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
        console.log('Citizen registration successful:', data.citizen);
        console.log('[WalletProvider] registerCitizen - data.citizen:', data.citizen); // DEBUG
        return data.citizen;
      } else {
        console.error('Registration error:', data.error);
        return null;
      }
    } catch (error) {
      console.error('Error registering citizen:', error);
      return null;
    }
  };
  
  // Fetch citizen profile
  const fetchCitizenProfile = async (walletAddress: string) => {
    try {
      const response = await fetch(`/api/citizens/wallet/${walletAddress}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[WalletProvider] fetchCitizenProfile - raw data.citizen:', data.citizen); // DEBUG
        const normalizedProfile = normalizeProfileData(data.citizen);
        console.log('[WalletProvider] fetchCitizenProfile - normalizedProfile:', normalizedProfile); // DEBUG
        setCitizenProfile(normalizedProfile);
        localStorage.setItem('citizenProfile', JSON.stringify(normalizedProfile));
        return normalizedProfile;
      } else {
        console.error('Failed to fetch citizen profile:', response.status);
        return null;
      }
    } catch (error) {
      console.error('Error fetching citizen profile:', error);
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
      
      // Register or fetch the citizen profile
      let profileData = await registerCitizen(address);
      
      if (profileData) {
        const normalizedProfile = normalizeProfileData(profileData);
        setCitizenProfile(normalizedProfile);
        localStorage.setItem('citizenProfile', JSON.stringify(normalizedProfile));
      } else {
        // If registration fails, fetchCitizenProfile will handle normalization and setting state
        await fetchCitizenProfile(address);
      }
      
      // Dispatch event to notify components about wallet change
      window.dispatchEvent(new Event('walletChanged'));
    } catch (error) {
      console.error('Error connecting wallet:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Citizen rejected')) {
          console.log('Citizen rejected the connection request');
        } else {
          alert(`Failed to connect wallet: ${error.message}`);
        }
      }
    } finally {
      setIsConnecting(false);
    }
  };
  
  // Function to update citizen profile
  const updateCitizenProfile = async (updatedProfile: any) => {
    if (updatedProfile) {
      console.log('[WalletProvider] updateCitizenProfile - raw updatedProfile:', updatedProfile); // DEBUG
      const normalizedProfile = normalizeProfileData(updatedProfile);
      console.log('[WalletProvider] updateCitizenProfile - normalizedProfile:', normalizedProfile); // DEBUG
      setCitizenProfile(normalizedProfile);
      localStorage.setItem('citizenProfile', JSON.stringify(normalizedProfile));
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
          
          // Try to load citizen profile from localStorage first
          const storedProfile = localStorage.getItem('citizenProfile');
          if (storedProfile) {
            try {
              const parsedProfile = JSON.parse(storedProfile);
              console.log('[WalletProvider] initWallet - raw parsedProfile from localStorage:', parsedProfile); // DEBUG
              const normalizedProfile = normalizeProfileData(parsedProfile);
              console.log('[WalletProvider] initWallet - normalizedProfile from localStorage:', normalizedProfile); // DEBUG
              setCitizenProfile(normalizedProfile);
            } catch (e) {
              console.error('Error parsing stored citizen profile:', e);
              // If parsing fails, fetch from API
              await fetchCitizenProfile(storedAddress);
            }
          } else {
            // If no stored profile, fetch from API
            await fetchCitizenProfile(storedAddress);
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
        console.log('[WalletProvider] handleProfileUpdate - event.detail:', event.detail); // DEBUG
        updateCitizenProfile(event.detail);
      }
    };
    
    window.addEventListener('citizenProfileUpdated', handleProfileUpdate as EventListener);
    
    initWallet();
    
    return () => {
      window.removeEventListener('citizenProfileUpdated', handleProfileUpdate as EventListener);
    };
  }, []);
  
  const isConnected = !!walletAddress;
  
  const wallet = {
    walletAddress,
    citizenProfile,
    isConnected,
    isConnecting,
    isInitialized,
    connectWallet,
    updateCitizenProfile
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
