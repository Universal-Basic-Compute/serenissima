import { useState, useEffect } from 'react';
import { getWalletAddress, setWalletAddress, clearWalletAddress, connectAndPersistWallet, storeWalletInAirtable } from '@/lib/walletUtils';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { getApiBaseUrl } from '@/lib/apiUtils';

export function useWallet() {
  const [walletAddress, setWalletAddressState] = useState<string | null>(null);
  const [walletAdapter, setWalletAdapter] = useState<PhantomWalletAdapter | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

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
      
      // Try to load user profile from localStorage first
      const storedProfile = localStorage.getItem('userProfile');
      if (storedProfile) {
        try {
          const parsedProfile = JSON.parse(storedProfile);
          console.log('Loaded user profile from localStorage:', parsedProfile);
          setUserProfile(parsedProfile);
        } catch (e) {
          console.error('Error parsing stored profile:', e);
        }
      }
      
      // Also fetch user profile data from backend to ensure it's up to date
      fetch(`${getApiBaseUrl()}/api/wallet/${storedWallet}`)
        .then(response => {
          if (response.ok) return response.json();
          throw new Error('Failed to fetch user profile');
        })
        .then(data => {
          console.log('Fetched user profile from backend:', data);
          if (data.user_name) {
            const backendProfile = {
              username: data.user_name,
              firstName: data.first_name || data.user_name.split(' ')[0] || '',
              lastName: data.last_name || data.user_name.split(' ').slice(1).join(' ') || '',
              coatOfArmsImage: data.coat_of_arms_image,
              familyMotto: data.family_motto,
              familyCoatOfArms: data.family_coat_of_arms,
              computeAmount: data.compute_amount,
              color: data.color || '#8B4513',
              walletAddress: storedWallet
            };
          
            // Update state with backend data
            setUserProfile(backendProfile);
            
            // Also update localStorage
            localStorage.setItem('userProfile', JSON.stringify(backendProfile));
          }
        })
        .catch(error => {
          console.error('Error fetching user profile:', error);
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

  // Listen for user profile updates
  useEffect(() => {
    const handleProfileUpdated = (event: CustomEvent) => {
      setUserProfile(event.detail);
    };
    
    window.addEventListener('userProfileUpdated', handleProfileUpdated as EventListener);
    
    return () => {
      window.removeEventListener('userProfileUpdated', handleProfileUpdated as EventListener);
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
        await adapter.disconnect();
        
        // Clear wallet from both storages
        clearWalletAddress();
        localStorage.removeItem('userProfile'); // Also clear user profile from storage
        
        // Update state after successful disconnect
        setWalletAddressState(null);
        setUserProfile(null); // Also clear the user profile
        
        // Dispatch a custom event to notify other components
        window.dispatchEvent(new CustomEvent('walletChanged'));
        
        console.log("Wallet disconnected successfully");
        
        // Force Phantom to show the account selector by completely resetting the adapter
        // This is the key change - we need to create a new adapter instance
        setWalletAdapter(null);
        
        // Wait a moment before creating a new adapter
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Create a new adapter instance
        const newAdapter = new PhantomWalletAdapter();
        setWalletAdapter(newAdapter);
        
        // Wait for the new adapter to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Force Phantom to forget the previous connection
        // This is a workaround to make Phantom show the account selector
        if (window.solana && window.solana.isPhantom) {
          // Access the internal _popup property if available (this is implementation-specific)
          try {
            // @ts-ignore - accessing private property
            if (window.solana._popup) {
              // @ts-ignore - accessing private property
              window.solana._popup.forgetIdentity();
            }
          } catch (e) {
            console.error("Could not access Phantom internal API:", e);
          }
        }
        
        // Now attempt to connect with the new adapter
        console.log("Attempting to reconnect with new adapter...");
        await newAdapter.connect();
        
        const address = newAdapter.publicKey?.toString() || null;
        console.log("Wallet reconnected, address:", address);
        
        if (address) {
          setWalletAddressState(address);
          // Store wallet in both session and local storage
          setWalletAddress(address);
          
          // Store wallet in Airtable and check for username
          const userData = await storeWalletInAirtable(address);
          
          if (userData) {
            // Check if the user has a username
            if (userData.user_name === undefined || userData.user_name === null || userData.user_name === '') {
              // If no username, show the prompt
              window.dispatchEvent(new CustomEvent('showUsernamePrompt'));
            } else {
              // Store the user profile information
              console.log('Setting user profile with data:', userData);
              const userProfile = {
                username: userData.user_name,
                firstName: userData.first_name || userData.user_name.split(' ')[0] || '',
                lastName: userData.last_name || userData.user_name.split(' ').slice(1).join(' ') || '',
                coatOfArmsImage: userData.coat_of_arms_image,
                familyMotto: userData.family_motto,
                computeAmount: userData.compute_amount,
                walletAddress: address
              };
              setUserProfile(userProfile);
              localStorage.setItem('userProfile', JSON.stringify(userProfile));
            }
          }
        }
        
        return;
      } catch (error) {
        console.error("Error during disconnect/reconnect flow:", error);
        alert(`Failed to switch accounts: ${error instanceof Error ? error.message : String(error)}`);
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
        const userData = await storeWalletInAirtable(address);
        
        if (userData) {
          // Check if the user has a username
          if (userData.user_name === undefined || userData.user_name === null || userData.user_name === '') {
            // If no username, show the prompt
            window.dispatchEvent(new CustomEvent('showUsernamePrompt'));
          } else {
            // Store the user profile information
            console.log('Setting user profile with data:', userData);
            const userProfile = {
              username: userData.user_name,
              firstName: userData.first_name || userData.user_name.split(' ')[0] || '',
              lastName: userData.last_name || userData.user_name.split(' ').slice(1).join(' ') || '',
              coatOfArmsImage: userData.coat_of_arms_image,
              familyMotto: userData.family_motto,
              computeAmount: userData.compute_amount,
              walletAddress: address
            };
            setUserProfile(userProfile);
            localStorage.setItem('userProfile', JSON.stringify(userProfile));
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
    userProfile,
    isConnected: !!walletAddress,
    isConnecting,
    isInitialized,
    connectWallet
  };
}
