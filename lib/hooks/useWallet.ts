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
    // console.log("Initializing wallet adapter (useWallet hook - largely deprecated)...");
    // const adapter = new PhantomWalletAdapter();
    // setWalletAdapter(adapter);
    
    // // Check if wallet is already connected in session or local storage
    // const storedWallet = getWalletAddress();
    // console.log("useWallet hook: Stored wallet address:", storedWallet);
    
    // if (storedWallet) {
    //   console.log("useWallet hook: Found stored wallet address, setting as connected in hook state");
    //   setWalletAddressState(storedWallet); // Update hook's local state
      
    //   const storedProfile = localStorage.getItem('citizenProfile');
    //   if (storedProfile) {
    //     try {
    //       const parsedProfile = JSON.parse(storedProfile);
    //       setCitizenProfile(parsedProfile);
    //     } catch (e) {
    //       console.error('useWallet hook: Error parsing stored profile:', e);
    //     }
    //   }
    //   // Backend fetch for profile update is removed to avoid conflicts. WalletProvider handles this.
    // } else if (adapter.connected) {
    //   const address = adapter.publicKey?.toString() || null;
    //   if (address) {
    //     console.log("useWallet Hook: Adapter is connected, reflecting address in hook state:", address);
    //     setWalletAddressState(address);
    //   }
    // } else {
    //   // console.log("useWallet hook: No stored wallet address and adapter not connected");
    // }
    
    setIsInitialized(true); // Mark as initialized so consumers don't wait indefinitely
    
    // return () => {
    //   if (adapter) {
    //     adapter.disconnect();
    //   }
    // };
  }, []);

  // Listen for wallet changes (e.g., from WalletProvider)
  useEffect(() => {
    const handleWalletChanged = () => {
      // const currentWallet = getWalletAddress(); // Read from localStorage for its own state
      // setWalletAddressState(currentWallet);
      // console.log("useWallet hook: walletChanged event detected, updated hook state.");
    };
    
    window.addEventListener('walletChanged', handleWalletChanged);
    
    return () => {
      window.removeEventListener('walletChanged', handleWalletChanged);
    };
  }, []);

  // Listen for citizen profile updates (e.g., from WalletProvider)
  useEffect(() => {
    const handleProfileUpdated = (event: CustomEvent) => {
      // setCitizenProfile(event.detail);
      // console.log("useWallet hook: citizenProfileUpdated event detected, updated hook state.");
    };
    
    window.addEventListener('citizenProfileUpdated', handleProfileUpdated as EventListener);
    
    return () => {
      window.removeEventListener('citizenProfileUpdated', handleProfileUpdated as EventListener);
    };
  }, []);

  // Connect wallet function - This should ideally be removed or use WalletProvider's connectWallet
  const connectWallet = async () => {
    console.warn("useWallet hook's connectWallet called. This function is deprecated and may cause conflicts. Please use useWalletContext().connectWallet instead.");
    // if (!walletAdapter) {
    //   return;
    // }
    // const adapter = walletAdapter;
    // if (adapter.connected) {
    //   // Disconnect logic
    //   try {
    //     await adapter.disconnect();
    //     clearWalletAddress(); // Utility function
    //     localStorage.removeItem('citizenProfile');
    //     setWalletAddressState(null);
    //     setCitizenProfile(null);
    //     window.dispatchEvent(new CustomEvent('walletChanged'));
    //     window.location.reload();
    //   } catch (error) {
    //     console.error("useWallet hook: Error during disconnect flow:", error);
    //   }
    //   return;
    // }
    // if (adapter.readyState !== WalletReadyState.Installed) {
    //   window.open('https://phantom.app/', '_blank');
    //   return;
    // }
    // try {
    //   await adapter.connect();
    //   const address = adapter.publicKey?.toString() || null;
    //   if (address) {
    //     setWalletAddressState(address);
    //     // The rest of the logic (Airtable, profile prompt) is now handled by WalletProvider.
    //     // This hook should not duplicate it.
    //     // Forcing a dispatch of walletChanged so WalletProvider can pick up if it missed the initial connection.
    //     window.dispatchEvent(new CustomEvent('walletChanged')); 
    //   }
    // } catch (error) {
    //   console.error('useWallet hook: Error connecting to wallet:', error);
    // }
  };

  return {
    walletAddress: null, // Return null to ensure it doesn't provide a conflicting address
    citizenProfile: null, // Return null for profile as well
    isConnected: false, // Always return false
    isConnecting: false, // Always return false
    isInitialized, // isInitialized can be true, indicating the hook itself has "run"
    connectWallet // Provide the (now warning) connectWallet function
  };
}
