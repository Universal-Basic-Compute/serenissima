'use client';

import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useWallet } from '@/lib/hooks/useWallet';
import { eventBus, EventTypes } from '@/lib/utils/eventBus'; // Added import
import UsernamePrompt from './UsernamePrompt'; // Import UsernamePrompt

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
  clearWalletState: () => void; // Nouvelle fonction pour effacer l'état
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Create a provider component
export function WalletProvider({ children }: { children: ReactNode }) {
  // Define the useWallet hook directly here
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [citizenProfile, setCitizenProfile] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [usernamePromptError, setUsernamePromptError] = useState<string | null>(null);

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
  
  // Register citizen with the API - now accepts username
  const registerCitizen = async (walletAddr: string, usernameToRegister?: string) => {
    try {
      console.log(`Registering citizen. Wallet: ${walletAddr}, Username: ${usernameToRegister}`);
      
      const payload: { walletAddress: string; username?: string } = { walletAddress: walletAddr };
      if (usernameToRegister) {
        payload.username = usernameToRegister;
      }

      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json(); // Toujours essayer de parser la réponse

      if (!response.ok) {
        // Si la réponse n'est pas OK, utiliser l'erreur de la réponse JSON si disponible
        const errorMsg = data?.error || `Registration failed: ${response.status}`;
        console.error('[WalletProvider] registerCitizen error from API:', errorMsg, data);
        throw new Error(errorMsg); // Lancer une erreur pour être attrapée par connectWallet
      }
      
      if (data.success) {
        console.log('[WalletProvider] registerCitizen successful:', data.citizen);
        return data.citizen; // Return raw citizen data
      } else {
        // Si success est false mais la réponse était OK (ex: 200 mais avec une erreur logique)
        const errorMsg = data?.error || 'Registration returned success:false';
        console.error('[WalletProvider] registerCitizen logical error:', errorMsg, data);
        throw new Error(errorMsg); // Lancer une erreur
      }
    } catch (error) {
      console.error('[WalletProvider] Error in registerCitizen:', error);
      throw error; // Relancer pour que connectWallet puisse le gérer
    }
  }; // Corrected: This is the end of registerCitizen
  
  // Fetch citizen profile
  const fetchCitizenProfile = async (walletAddr: string) => { // Renamed parameter for clarity
    try {
      const response = await fetch(`/api/citizens/wallet/${walletAddr}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[WalletProvider] fetchCitizenProfile successful:', data.citizen);
        return data.citizen; // Return raw citizen data
      } else if (response.status === 404) {
        console.log(`[WalletProvider] No citizen found for wallet ${walletAddr} via fetchCitizenProfile.`);
        return null; // Explicitement null si 404
      } else {
        console.error(`[WalletProvider] Failed to fetch citizen profile for ${walletAddr}:`, response.status);
        return null;
      }
    } catch (error) {
      console.error(`[WalletProvider] Error in fetchCitizenProfile for ${walletAddr}:`, error);
      // Ne pas relancer l'erreur ici, retourner null pour que le flux de connexion puisse continuer
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
      const newAddress = publicKey.toString();
      
      console.log('Connected to wallet:', newAddress);
      setWalletAddress(newAddress); // Met à jour l'état du walletAddress ici
      localStorage.setItem('walletAddress', newAddress);
      
      // Essayer de récupérer le profil existant avec le nouveau walletAddress
      let profileData = await fetchCitizenProfile(newAddress);
      
      if (profileData && profileData.username) {
        // Le profil existe et a un nom d'utilisateur, tout va bien
        console.log(`[WalletProvider] Existing profile found for ${newAddress} with username ${profileData.username}`);
        setAndLogCitizenProfile(profileData, "connectWallet_existing_profile_found", newAddress);
      } else {
        // Pas de profil existant, ou profil existant sans nom d'utilisateur (ne devrait plus arriver)
        // Afficher le prompt pour le nom d'utilisateur
        console.log(`[WalletProvider] No existing profile or no username for ${newAddress}. Showing username prompt.`);
        setShowUsernamePrompt(true);
        // La logique de `handleUsernameSubmitted` s'occupera de l'enregistrement et de la mise à jour du profil.
        // Ne pas appeler setAndLogCitizenProfile ici si on attend le prompt.
      }
      
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
    updateCitizenProfile,
    clearWalletState: () => { // Implémentation de clearWalletState
      console.log("[WalletProvider] clearWalletState called.");
      setWalletAddress(null);
      setCitizenProfile(null);
      localStorage.removeItem('walletAddress');
      localStorage.removeItem('citizenProfile');
      sessionStorage.removeItem('walletAddress'); // Effacer aussi de sessionStorage
      localStorage.removeItem('walletConnectedAt');
      
      // Émettre un événement pour informer les autres parties de l'application
      eventBus.emit(EventTypes.WALLET_CHANGED, { 
        profile: null, 
        isConnected: false, 
        address: null 
      });
    }
  };

  const handleUsernameSubmitted = async (chosenUsername: string) => {
    if (!walletAddress) {
      setUsernamePromptError("Wallet address is not available. Cannot register.");
      return;
    }
    setIsConnecting(true); // Indiquer que nous traitons quelque chose
    setUsernamePromptError(null);
    try {
      // Appeler registerCitizen avec le nom d'utilisateur choisi
      const newProfile = await registerCitizen(walletAddress, chosenUsername);
      setAndLogCitizenProfile(newProfile, "handleUsernameSubmitted_register", walletAddress);
      setShowUsernamePrompt(false); // Fermer le prompt en cas de succès
    } catch (error: any) {
      console.error("[WalletProvider] Error during username submission (registerCitizen call):", error);
      setUsernamePromptError(error.message || "Failed to set username. It might be taken or invalid.");
      // Ne pas fermer le prompt si l'enregistrement échoue, pour que l'utilisateur puisse réessayer
    } finally {
      setIsConnecting(false);
    }
  };
  
  return (
    <WalletContext.Provider value={wallet}>
      {children}
      {showUsernamePrompt && (
        <UsernamePrompt 
          onUsernameSubmit={handleUsernameSubmitted}
          onClose={() => {
            // Théoriquement, l'utilisateur ne devrait pas pouvoir fermer sans soumettre
            // Mais si c'est le cas, il faudrait déconnecter ou gérer l'état.
            // Pour l'instant, on suppose que la soumission est la seule sortie.
            // Si on ajoute un bouton "Annuler" au prompt, il faudrait déconnecter le portefeuille ici.
            setShowUsernamePrompt(false);
            setUsernamePromptError(null);
            // Potentiellement déconnecter le portefeuille si l'utilisateur annule le choix du nom
            // clearWalletAddress(); // Assurez-vous que cette fonction existe et fait ce qu'il faut
          }}
          initialError={usernamePromptError}
        />
      )}
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
