'use client';

import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useWallet } from '@/lib/hooks/useWallet';
import { eventBus, EventTypes } from '@/lib/utils/eventBus'; // Added import

// Normalize profile data to ensure consistent casing (camelCase)
// Moved outside the component to allow export
export const normalizeProfileData = (profile: any): any => {
  if (!profile || typeof profile !== 'object') { // Handle null or non-object input
    console.log('[WalletProvider] normalizeProfileData received null or non-object, returning null.');
    return null;
  }
  const normalized = { ...profile };

  const fieldsToNormalize = [
    { pascal: 'SocialClass', camel: 'socialClass' },
    { pascal: 'FirstName', camel: 'firstName' },
    { pascal: 'LastName', camel: 'lastName' },
    { pascal: 'CoatOfArmsImageUrl', camel: 'coatOfArmsImageUrl' },
    { pascal: 'FamilyMotto', camel: 'familyMotto' },
    { api: 'citizen_name', camel: 'username' }, // Map citizen_name from API to username
    { pascal: 'Username', camel: 'username' },   // Also handle Username (PascalCase) to username
  ];

  fieldsToNormalize.forEach(field => {
    const keyToCheck = field.pascal || field.api;
    if (keyToCheck && profile[keyToCheck] !== undefined && normalized[field.camel] === undefined) {
      normalized[field.camel] = profile[keyToCheck];
      // delete normalized[keyToCheck]; // Optional: remove original
    }
  });

  // Ensure 'username' is present if not mapped from citizen_name or Username
  if (!normalized.username && profile.username) {
    normalized.username = profile.username;
  }


  // Handle Ducats: prefer 'ducats', ensure it exists
  if (profile.Ducats !== undefined && normalized.ducats === undefined) {
    normalized.ducats = profile.Ducats;
  } else if (profile.ducats !== undefined) {
    normalized.ducats = profile.ducats; // Ensure it's there if already lowercase
  }
  // PlayerProfile expects 'Ducats' prop, but WalletButton passes 'citizenProfile.ducats'.
  // To simplify, WalletProvider will ensure 'citizenProfile.ducats' (lowercase) is the source of truth.

  return normalized;
};

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

  // Centralized function to set citizen profile state, localStorage, and emit event
  const setAndLogCitizenProfile = (profile: any, source: string, currentWalletAddr: string | null) => {
    console.log(`[WalletProvider] Attempting to set profile from "${source}" with address "${currentWalletAddr}". Raw profile:`, JSON.stringify(profile, null, 2));
    
    const normalizedProfile = normalizeProfileData(profile); // Normalize first
    console.log(`[WalletProvider] Normalized profile from "${source}":`, JSON.stringify(normalizedProfile, null, 2));

    setCitizenProfile(normalizedProfile); // Update state

    if (normalizedProfile) {
      localStorage.setItem('citizenProfile', JSON.stringify(normalizedProfile));
      if (normalizedProfile.username) {
        localStorage.setItem('username', normalizedProfile.username);
        sessionStorage.setItem('username', normalizedProfile.username);
        console.log(`[WalletProvider] Stored username '${normalizedProfile.username}' in localStorage and sessionStorage from "${source}".`);
      } else {
        localStorage.removeItem('username');
        sessionStorage.removeItem('username');
        console.log(`[WalletProvider] Removed 'username' from localStorage and sessionStorage because it's missing in normalizedProfile from "${source}".`);
      }
    } else {
      localStorage.removeItem('citizenProfile');
      localStorage.removeItem('username');
      sessionStorage.removeItem('username');
      console.log(`[WalletProvider] Cleared 'citizenProfile' and 'username' from localStorage and sessionStorage due to null profile from "${source}".`);
    }
    // Emit event with the (potentially null) normalized profile and current connection status
    eventBus.emit(EventTypes.WALLET_CHANGED, { 
      profile: normalizedProfile, 
      isConnected: !!currentWalletAddr, // Use passed currentWalletAddr
      address: currentWalletAddr     // Use passed currentWalletAddr
    });
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
        console.log('[WalletProvider] registerCitizen successful:', data.citizen);
        return data.citizen; // Return raw citizen data
      } else {
        console.error('[WalletProvider] registerCitizen error:', data.error);
        return null;
      }
    } catch (error) {
      console.error('[WalletProvider] Error in registerCitizen:', error);
      return null;
    }
  };
  
  // Fetch citizen profile
  const fetchCitizenProfile = async (walletAddress: string) => {
    try {
      const response = await fetch(`/api/citizens/wallet/${walletAddress}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[WalletProvider] fetchCitizenProfile successful:', data.citizen);
        return data.citizen; // Return raw citizen data
      } else {
        console.error('[WalletProvider] Failed to fetch citizen profile:', response.status);
        return null;
      }
    } catch (error) {
      console.error('[WalletProvider] Error in fetchCitizenProfile:', error);
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
      let rawProfileData = await registerCitizen(address);
      if (!rawProfileData) { // If registration failed or returned no profile, try fetching
        console.log('[WalletProvider] Registration did not return profile, trying fetchCitizenProfile for', address);
        rawProfileData = await fetchCitizenProfile(address);
      }
      
      setAndLogCitizenProfile(rawProfileData, "connectWallet_after_register_or_fetch", address); // Pass address
      // Event emission is now handled by setAndLogCitizenProfile
      
    } catch (error) {
      console.error('[WalletProvider] Error connecting wallet:', error);
      
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
    // This function is typically called from ProfileEditor upon successful update.
    // The updatedProfile here should be the new, complete profile from the backend.
    setAndLogCitizenProfile(updatedProfile, "updateCitizenProfile_external", walletAddress); // Pass current walletAddress state
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
              setAndLogCitizenProfile(parsedProfile, "initWallet_localStorage", storedAddress); // Pass storedAddress
            } catch (e) {
              console.error('[WalletProvider] Error parsing stored citizen profile:', e);
              localStorage.removeItem('citizenProfile'); // Clear corrupted profile
              if (storedAddress) {
                 const fetchedProfile = await fetchCitizenProfile(storedAddress);
                 setAndLogCitizenProfile(fetchedProfile, "initWallet_fetch_after_parse_error", storedAddress); // Pass storedAddress
              } else {
                 setAndLogCitizenProfile(null, "initWallet_no_address_after_parse_error", null); // Pass null
              }
            }
          } else if (storedAddress) { // No stored profile, but have address
            const fetchedProfile = await fetchCitizenProfile(storedAddress);
            setAndLogCitizenProfile(fetchedProfile, "initWallet_fetch_no_stored_profile", storedAddress); // Pass storedAddress
          } else { // No stored address, no profile
            setAndLogCitizenProfile(null, "initWallet_no_address_no_profile", null); // Pass null
          }
        } else { // No stored address, so no user is connected from previous session
            setAndLogCitizenProfile(null, "initWallet_no_stored_address", null); // Pass null
        }
      } catch (error) {
        console.error('[WalletProvider] Error initializing wallet:', error);
        setAndLogCitizenProfile(null, "initWallet_exception", null); // Pass null
      } finally {
        setIsInitialized(true);
      }
    };
    
    // Add event listener for profile updates from external sources (like ProfileEditor)
    const handleExternalProfileUpdate = (event: CustomEvent) => {
      if (event.detail) {
        console.log('[WalletProvider] Received citizenProfileUpdated event:', event.detail);
        // The event.detail should be the full, updated profile object
        // Pass the current walletAddress from the provider's state
        setAndLogCitizenProfile(event.detail, "handleExternalProfileUpdate_event", walletAddress);
      }
    };
    
    window.addEventListener('citizenProfileUpdated', handleExternalProfileUpdate as EventListener);
    
    initWallet();
    
    return () => {
      window.removeEventListener('citizenProfileUpdated', handleExternalProfileUpdate as EventListener);
    };
  }, []); // walletAddress is not needed in deps here, setWalletAddress will trigger re-renders if it changes.
  
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
