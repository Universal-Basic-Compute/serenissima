import { useState, useEffect } from 'react';
import { getWalletAddress, setWalletAddress, clearWalletAddress, connectAndPersistWallet, storeWalletInAirtable } from '../../lib/utils/walletUtils';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { getBackendBaseUrl } from '@/lib/utils/apiUtils';

export function useWallet() {
  const [walletAddress, setWalletAddressState] = useState<string | null>(null);
  const [walletAdapter, setWalletAdapter] = useState<PhantomWalletAdapter | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [citizenProfile, setCitizenProfile] = useState<any>(null);

  // Initialize wallet adapter
  useEffect(() => {
    console.log("Initializing wallet adapter...");
    const adapter = new PhantomWalletAdapter();
    setWalletAdapter(adapter);
    
    // Check if wallet is already connected in session or local storage
    const storedWallet = getWalletAddress();
    console.log("Stored wallet address:", storedWallet);
    
    if (storedWallet) {
      console.log("Found stored wallet address, setting as connected");
      setWalletAddressState(storedWallet);
      
      // Try to load citizen profile from localStorage first
      const storedProfile = localStorage.getItem('citizenProfile');
      if (storedProfile) {
        try {
          const parsedProfile = JSON.parse(storedProfile);
          console.log('Loaded citizen profile from localStorage:', parsedProfile);
          setCitizenProfile(parsedProfile);
        } catch (e) {
          console.error('Error parsing stored profile:', e);
        }
      }
      
      // Also fetch citizen profile data from backend to ensure it's up to date
      fetch(`${getBackendBaseUrl()}/api/wallet/${storedWallet}`)
        .then(response => {
          if (response.ok) return response.json();
          throw new Error('Failed to fetch citizen profile');
        })
        .then(data => {
          console.log('Fetched citizen profile from backend:', data);
          if (data.citizen_name) {
            const backendProfile = {
              username: data.citizen_name,
              firstName: data.first_name || data.citizen_name.split(' ')[0] || '',
              lastName: data.last_name || data.citizen_name.split(' ').slice(1).join(' ') || '',
              coatOfArmsImageUrl: data.coat_of_arms_image,
              familyMotto: data.family_motto,
              coatOfArms: data.family_coat_of_arms,
              Ducats: data.ducats,
              color: data.color || '#8B4513',
              walletAddress: storedWallet
            };
          
            // Update state with backend data
            setCitizenProfile(backendProfile);
            
            // Also update localStorage
            localStorage.setItem('citizenProfile', JSON.stringify(backendProfile));
          }
        })
        .catch(error => {
          console.error('Error fetching citizen profile:', error);
        });
    } else if (adapter.connected) {
      // If adapter is connected but not in storage, update both
      console.log("Adapter is connected but not in storage");
      const address = adapter.publicKey?.toString() || null;
      if (address) {
        console.log("Setting wallet address from adapter:", address);
        setWalletAddressState(address);
        setWalletAddress(address);
      }
    } else {
      console.log("No stored wallet address and adapter not connected");
    }
    
    setIsInitialized(true);
    
    return () => {
      // Clean up adapter when component unmounts
      if (adapter) {
        console.log("Cleaning up wallet adapter");
        adapter.disconnect();
      }
    };
  }, []);

  // Listen for wallet changes
  useEffect(() => {
    const handleWalletChanged = () => {
      const currentWallet = getWalletAddress();
      setWalletAddressState(currentWallet);
    };
    
    window.addEventListener('walletChanged', handleWalletChanged);
    
    return () => {
      window.removeEventListener('walletChanged', handleWalletChanged);
    };
  }, []);

  // Listen for citizen profile updates
  useEffect(() => {
    const handleProfileUpdated = (event: CustomEvent) => {
      setCitizenProfile(event.detail);
    };
    
    window.addEventListener('citizenProfileUpdated', handleProfileUpdated as EventListener);
    
    return () => {
      window.removeEventListener('citizenProfileUpdated', handleProfileUpdated as EventListener);
    };
  }, []);

  // Connect wallet function
  const connectWallet = async () => {
    console.log("Connecting wallet...");
    if (!walletAdapter) {
      console.log("Wallet adapter not initialized");
      return;
    }
    
    const adapter = walletAdapter;
    
    console.log("Connecting wallet, current state:", adapter.connected ? "connected" : "disconnected");
    
    if (adapter.connected) {
      // If already connected, disconnect first
      console.log("Disconnecting wallet...");
      try {
        // First disconnect the adapter
        await adapter.disconnect();
        
        // Clear wallet from both storages
        clearWalletAddress();
        localStorage.removeItem('citizenProfile'); // Also clear citizen profile from storage
        
        // Update state after successful disconnect
        setWalletAddressState(null);
        setCitizenProfile(null); // Also clear the citizen profile
        
        // Dispatch a custom event to notify other components
        window.dispatchEvent(new CustomEvent('walletChanged'));
        
        console.log("Wallet disconnected successfully");
        
        // Force page reload to completely reset the connection state
        window.location.reload();
        return; // Return early since we're reloading the page
      } catch (error) {
        console.error("Error during disconnect flow:", error);
        alert(`Failed to disconnect wallet: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
    }
  
    // Check if Phantom is installed
    if (adapter.readyState !== WalletReadyState.Installed) {
      console.log("Phantom wallet not installed, opening website");
      window.open('https://phantom.app/', '_blank');
      return;
    }
    
    try {
      console.log("Attempting to connect to wallet...");
      await adapter.connect();
      
      const address = adapter.publicKey?.toString() || null;
      console.log("Wallet connected, address:", address);
      
      if (address) {
        setWalletAddressState(address);
        // Store wallet in both session and local storage
        setWalletAddress(address);
        
        // Store wallet in Airtable and check for username
        const citizenData = await storeWalletInAirtable(address);
        
        if (citizenData) {
          // Check if the citizen has a username
          if (citizenData.citizen_name === undefined || citizenData.citizen_name === null || citizenData.citizen_name === '') {
            // If no username, show the prompt
            window.dispatchEvent(new CustomEvent('showUsernamePrompt'));
          } else {
            // Store the citizen profile information
            console.log('Setting citizen profile with data:', citizenData);
            const citizenProfile = {
              username: citizenData.citizen_name,
              firstName: citizenData.first_name || citizenData.citizen_name.split(' ')[0] || '',
              lastName: citizenData.last_name || citizenData.citizen_name.split(' ').slice(1).join(' ') || '',
              coatOfArmsImageUrl: citizenData.coat_of_arms_image,
              familyMotto: citizenData.family_motto,
              Ducats: citizenData.ducats,
              walletAddress: address
            };
            setCitizenProfile(citizenProfile);
            localStorage.setItem('citizenProfile', JSON.stringify(citizenProfile));
          }
        }
      }
    } catch (error) {
      console.error('Error connecting to wallet:', error);
      alert(`Failed to connect wallet: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return {
    walletAddress,
    citizenProfile,
    isConnected: !!walletAddress,
    isConnecting,
    isInitialized,
    connectWallet
  };
}
