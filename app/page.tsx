'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getApiBaseUrl } from '@/lib/apiUtils';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import dynamic from 'next/dynamic';
import { GoogleMap, LoadScript, DrawingManager } from '@react-google-maps/api';
import PlayerProfile from '../components/UI/PlayerProfile';
import TransferComputeMenu from '../components/UI/TransferComputeMenu';
import WithdrawComputeMenu from '../components/UI/WithdrawComputeMenu';
import BackgroundMusic from '../components/UI/BackgroundMusic';
import LoadingScreen from '../components/UI/LoadingScreen';
import SuccessAlert from '../components/UI/SuccessAlert';
import { transferComputeTokens } from '../lib/tokenUtils';
import { transferComputeInAirtable } from '../lib/airtableUtils';

// Import PolygonViewer with no SSR to avoid hydration issues
const PolygonViewer = dynamic(() => import('../components/PolygonViewer/PolygonViewer'), {
  ssr: false
});

// Venice coordinates
const center = {
  lat: 45.4371908,
  lng: 12.3345898
};

const mapContainerStyle = {
  width: '100vw',
  height: '100vh'
};

// Polygon styling options
const polygonOptions = {
  fillColor: '#3388ff',
  fillOpacity: 0.3,
  strokeWeight: 2,
  strokeColor: '#3388ff',
  editable: true,
  draggable: true
};

// Libraries we need to load
const libraries = ['drawing', 'geometry'];

export default function Home() {
  // State for loading screen
  const [isLoading, setIsLoading] = useState(true);
  
  // State for wallet connection
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletAdapter, setWalletAdapter] = useState<PhantomWalletAdapter | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [transferMenuOpen, setTransferMenuOpen] = useState(false);
  const [withdrawMenuOpen, setWithdrawMenuOpen] = useState(false);
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [familyCoatOfArms, setFamilyCoatOfArms] = useState<string>('');
  const [familyMotto, setFamilyMotto] = useState<string>('');
  const [coatOfArmsImage, setCoatOfArmsImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(false);
  const [selectedColor, setSelectedColor] = useState<string>('#8B4513'); // Default brown color
  const [successMessage, setSuccessMessage] = useState<{message: string, signature: string} | null>(null);
  
  // Venice-themed color palette
  const veniceColorPalette = [
    // Venetian reds
    '#8B0000', '#A52A2A', '#B22222', '#CD5C5C',
    // Venetian blues
    '#1E5799', '#3A7CA5', '#00AAFF', '#0066CC',
    // Venetian golds
    '#DAA520', '#B8860B', '#CD853F', '#D2B48C',
    // Venetian greens
    '#2E8B57', '#3CB371', '#6B8E23', '#556B2F',
    // Venetian purples and other colors
    '#4B0082', '#800080', '#8B4513', '#A0522D',
    // Add more distinct colors to ensure uniqueness
    '#FF5733', '#33FF57', '#3357FF', '#F033FF', '#FF33A8'
  ];
  // Add user profile state
  const [userProfile, setUserProfile] = useState<{
    username: string;
    firstName: string;
    lastName: string;
    coatOfArmsImage: string | null;
    familyMotto?: string;
    familyCoatOfArms?: string;
    color?: string;
    computeAmount?: number;
    walletAddress?: string;
  } | null>(null);
  
  // Get API key from environment variable
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const [savedPolygons, setSavedPolygons] = useState<any[]>([]);
  const mapRef = useRef<google.maps.Map | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  
  // Add these states to the Home component
  const [bridgeMode, setBridgeMode] = useState(false);
  const [bridgeStart, setBridgeStart] = useState<google.maps.LatLng | null>(null);
  const [bridgeStartLandId, setBridgeStartLandId] = useState<string | null>(null);
  const [activeLandPolygons, setActiveLandPolygons] = useState<{[id: string]: google.maps.Polygon}>({});
  const [centroidDragMode, setCentroidDragMode] = useState(false);
  const [centroidMarkers, setCentroidMarkers] = useState<{[id: string]: google.maps.Marker}>({});
  const [isDraggingCentroid, setIsDraggingCentroid] = useState(false);
  
  // Add these new state variables for delete mode
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedMapPolygon, setSelectedMapPolygon] = useState<google.maps.Polygon | null>(null);
  const [selectedMapPolygonId, setSelectedMapPolygonId] = useState<string | null>(null);
  // Add state to track selected polygon in normal mode
  const [selectedPolygon, setSelectedPolygon] = useState<{
    id: string;
    polygon: google.maps.Polygon;
  } | null>(null);
  
  // Add state for users data and active view
  const [users, setUsers] = useState<Record<string, any>>({});
  const [activeView, setActiveView] = useState<'buildings' | 'land'>('land');
  const [marketPanelVisible, setMarketPanelVisible] = useState(false);
  const polygonRendererRef = useRef<any>(null);
  
  // Initialize wallet adapter
  useEffect(() => {
    console.log("Initializing wallet adapter...");
    const adapter = new PhantomWalletAdapter();
    setWalletAdapter(adapter);
    
    // Check if wallet is already connected in session or local storage
    const storedWallet = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress');
    console.log("Stored wallet address:", storedWallet);
    
    if (storedWallet) {
      console.log("Found stored wallet address, setting as connected");
      setWalletAddress(storedWallet);
      
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
              color: data.color || '#8B4513'
            };
          
            // Update state with backend data
            setUserProfile(backendProfile);
            setSelectedColor(data.color || '#8B4513');
            
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
        setWalletAddress(address);
        sessionStorage.setItem('walletAddress', address);
        localStorage.setItem('walletAddress', address);
      }
    } else {
      console.log("No stored wallet address and adapter not connected");
    }
    
    return () => {
      // Clean up adapter when component unmounts
      if (adapter) {
        console.log("Cleaning up wallet adapter");
        adapter.disconnect();
      }
    };
  }, []);
  
  // Add effect to handle clicking outside the dropdown to close it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Add this useEffect to check wallet connection status
  useEffect(() => {
    const checkWalletConnection = async () => {
      if (walletAdapter) {
        console.log("Checking wallet connection status...");
        console.log("Wallet adapter ready state:", walletAdapter.readyState);
        console.log("Wallet connected:", walletAdapter.connected);
        
        if (walletAdapter.connected) {
          const address = walletAdapter.publicKey?.toString() || null;
          console.log("Wallet is connected with address:", address);
          
          if (address && !walletAddress) {
            console.log("Setting wallet address from connected adapter");
            setWalletAddress(address);
            sessionStorage.setItem('walletAddress', address);
            localStorage.setItem('walletAddress', address);
          }
        }
      }
    };
    
    checkWalletConnection();
  }, [walletAdapter, walletAddress]);

  // Functions to interact with the backend
  const storeWalletInAirtable = async (walletAddress: string) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to store wallet');
      }
      
      const data = await response.json();
      console.log('Wallet stored in Airtable:', data);
      
      // Check if the user has a username
      if (!data.user_name) {
        // If no username, show the prompt
        setShowUsernamePrompt(true);
      } else {
        // Store the user profile information
        console.log('Setting user profile with data:', data);
        setUserProfile({
          username: data.user_name,
          firstName: data.first_name || data.user_name.split(' ')[0] || '',
          lastName: data.last_name || data.user_name.split(' ').slice(1).join(' ') || '',
          coatOfArmsImage: data.coat_of_arms_image,
          familyMotto: data.family_motto,
          computeAmount: data.compute_amount // Add this line
        });
      }
      
      return data;
    } catch (error) {
      console.error('Error storing wallet:', error);
      return null;
    }
  };
  

  // Add this function to generate the coat of arms image
  const generateCoatOfArmsImage = async () => {
    if (!familyCoatOfArms.trim()) {
      alert('Please enter a description of your family coat of arms first');
      return;
    }
    
    try {
      setIsGeneratingImage(true);
      
      const response = await fetch(`${getApiBaseUrl()}/api/generate-coat-of-arms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: familyCoatOfArms
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate coat of arms image');
      }
      
      const data = await response.json();
      
      if (data.success && data.image_url) {
        setCoatOfArmsImage(data.image_url);
      } else {
        throw new Error(data.error || 'Failed to generate image');
      }
    } catch (error) {
      console.error('Error generating coat of arms image:', error);
      alert(`Failed to generate image: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleUsernameSubmit = async () => {
    // When editing a profile, we need to ensure all required fields are present
    // When creating a new profile, we need username, first name, and last name
    if ((!userProfile && (!usernameInput.trim() || !firstName.trim() || !lastName.trim())) || 
        (userProfile && (!firstName.trim() || !lastName.trim()))) {
      alert('Please fill in all required fields');
      return;
    }
    
    if (!walletAddress) {
      alert('Wallet connection is required');
      return;
    }
    
    try {
      // When editing, use the existing username
      const username = userProfile ? userProfile.username : usernameInput.trim();
      
      // If this is a new user (no userProfile), assign a random color from the palette
      // Otherwise, use the selected color
      const userColor = !userProfile 
        ? veniceColorPalette[Math.floor(Math.random() * veniceColorPalette.length)]
        : selectedColor;
      
      console.log('Submitting profile data to backend:', {
        wallet_address: walletAddress,
        user_name: username,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        family_coat_of_arms: familyCoatOfArms.trim(),
        family_motto: familyMotto.trim(),
        coat_of_arms_image: coatOfArmsImage,
        color: userColor
      });
          
      // Update the user record with the username, first name, last name, coat of arms, family motto, and image URL
      const response = await fetch(`${getApiBaseUrl()}/api/wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          user_name: username,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          family_coat_of_arms: familyCoatOfArms.trim(),
          family_motto: familyMotto.trim(),
          coat_of_arms_image: coatOfArmsImage,
          color: userColor
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to update profile: ${errorData.detail || response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Profile updated successfully:', data);
      
      // Create updated user profile object
      const updatedProfile = {
        username: username,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        coatOfArmsImage: coatOfArmsImage,
        familyMotto: familyMotto.trim(),
        familyCoatOfArms: familyCoatOfArms.trim(),
        computeAmount: data.compute_amount,
        color: selectedColor
      };
      
      // Update the user profile state
      setUserProfile(updatedProfile);
      
      // Also store the updated profile in localStorage for persistence
      localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
      
      // Dispatch a custom event to notify other components about the profile update
      window.dispatchEvent(new CustomEvent('userProfileUpdated', { 
        detail: updatedProfile 
      }));
      
      // Close the prompt
      setShowUsernamePrompt(false);
      
      // Show success message
      if (userProfile) {
        alert(`Your noble identity has been updated, ${firstName} ${lastName}!`);
      } else {
        alert(`Welcome to La Serenissima, ${firstName} ${lastName}!`);
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      alert(`Failed to update profile. Please try again. Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Add function to update polygon colors
  const updatePolygonColors = useCallback(() => {
    if (polygonRendererRef.current && users && Object.keys(users).length > 0) {
      console.log('Updating polygon colors with user data:', users);
      
      // Create a map of user colors
      const colorMap: Record<string, string> = {};
      Object.values(users).forEach(user => {
        if (user.user_name) {
          if (user.color) {
            colorMap[user.user_name] = user.color;
            console.log(`Added color for ${user.user_name}: ${user.color}`);
          } else if (user.user_name === 'ConsiglioDeiDieci') {
            // Special case for ConsiglioDeiDieci
            colorMap[user.user_name] = '#8B0000'; // Dark red
            console.log(`Added default color for ConsiglioDeiDieci: #8B0000`);
          }
        }
      });
      
      // Always add ConsiglioDeiDieci if not present
      if (!colorMap['ConsiglioDeiDieci']) {
        colorMap['ConsiglioDeiDieci'] = '#8B0000'; // Dark red
        console.log('Added missing ConsiglioDeiDieci with default color #8B0000');
      }
      
      // Update colors in the renderer
      if (Object.keys(colorMap).length > 0) {
        polygonRendererRef.current.updateOwnerColors(colorMap);
        // Force an update of owner colors
        polygonRendererRef.current.updatePolygonOwnerColors();
      }
    }
  }, [users]);
  
  // Add function to update coat of arms
  const updateCoatOfArms = useCallback(() => {
    if (polygonRendererRef.current && users && Object.keys(users).length > 0) {
      console.log('Updating coat of arms with user data:', users);
      
      // Create a map of user coat of arms
      const coatOfArmsMap: Record<string, string> = {};
      Object.values(users).forEach(user => {
        if (user.user_name && user.coat_of_arms_image) {
          coatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          console.log(`Added coat of arms for ${user.user_name}:`, user.coat_of_arms_image);
        }
      });
      
      // Update coat of arms in the renderer
      if (Object.keys(coatOfArmsMap).length > 0) {
        polygonRendererRef.current.updateOwnerCoatOfArms(coatOfArmsMap);
        // Force an update of coat of arms sprites
        polygonRendererRef.current.updateCoatOfArmsSprites();
      }
    }
  }, [users]);

  // Add function to load users data
  const loadUsers = useCallback(async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/users`);
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data)) {
          const usersMap: Record<string, any> = {};
          data.forEach(user => {
            if (user.user_name) {
              usersMap[user.user_name] = user;
            }
          });
          setUsers(usersMap);
          console.log('Loaded users data:', Object.keys(usersMap).length, 'users');
          
          // Dispatch event to notify components that users data is loaded
          window.dispatchEvent(new CustomEvent('usersDataLoaded'));
        }
      }
    } catch (error) {
      console.error('Error loading users data:', error);
    }
  }, []);

  // Add effect to load users data when component mounts
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Add effect to check users data and update polygon renderer
  useEffect(() => {
    if (users && Object.keys(users).length > 0) {
      console.log('Users data loaded:', users);
      
      // Check if ConsiglioDeiDieci is in the users data
      if (users['ConsiglioDeiDieci']) {
        console.log('ConsiglioDeiDieci user data:', users['ConsiglioDeiDieci']);
        console.log('ConsiglioDeiDieci color:', users['ConsiglioDeiDieci'].color);
        
        // If ConsiglioDeiDieci has no color, add a default color
        if (!users['ConsiglioDeiDieci'].color) {
          console.warn('ConsiglioDeiDieci has no color defined in user data! Adding default color.');
          users['ConsiglioDeiDieci'].color = '#8B0000'; // Dark red
        }
      } else {
        // If ConsiglioDeiDieci is missing, add it with default values
        console.warn('ConsiglioDeiDieci not found in users data! Adding default entry.');
        users['ConsiglioDeiDieci'] = {
          user_name: 'ConsiglioDeiDieci',
          color: '#8B0000', // Dark red
          coat_of_arms_image: null
        };
      }
      
      // Force an update of the polygon renderer with the users data
      if (polygonRendererRef.current) {
        console.log('Updating polygon renderer with users data');
        polygonRendererRef.current.updateViewMode(activeView);
        
        // Explicitly update colors and coat of arms
        updatePolygonColors();
        updateCoatOfArms();
        
        // Force additional updates for land view
        if (activeView === 'land') {
          polygonRendererRef.current.updatePolygonOwnerColors();
          polygonRendererRef.current.updateCoatOfArmsSprites();
        }
      }
    }
  }, [users, activeView, updatePolygonColors, updateCoatOfArms]);
  
  // Add effect to log when transferMenuOpen changes
  useEffect(() => {
    console.log('transferMenuOpen state changed:', transferMenuOpen);
  }, [transferMenuOpen]);
  
  // Add a dedicated effect to ensure market panel visibility is properly updated
  useEffect(() => {
    // Make sure this is properly set when activeView changes
    const isMarketView = activeView === 'markets';
    setMarketPanelVisible(isMarketView);
    console.log('Active view changed to:', activeView, 'Market panel visible:', isMarketView);
  }, [activeView]);
  
  // Add effect to trigger color and coat of arms updates when users data changes
  useEffect(() => {
    updatePolygonColors();
    updateCoatOfArms();
  }, [updatePolygonColors, updateCoatOfArms]);

  // Handle compute transfer
  const handleTransferCompute = async (amount: number) => {
    try {
      console.log('Starting compute transfer process...');
      
      // Get the wallet address from session or local storage
      const walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress');
      
      if (!walletAddress) {
        alert('Please connect your wallet first');
        return;
      }
      
      // Call the backend API to transfer compute using Solana
      const response = await fetch(`${getApiBaseUrl()}/api/transfer-compute-solana`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          compute_amount: amount,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to transfer compute');
      }
      
      const data = await response.json();
      console.log('Compute transfer successful:', data);
      
      // Update the user profile with the new compute amount
      if (userProfile) {
        const updatedProfile = {
          ...userProfile,
          computeAmount: data.compute_amount
        };
        setUserProfile(updatedProfile);
        
        // Update localStorage
        localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
        
        // Dispatch event to update other components
        window.dispatchEvent(new CustomEvent('userProfileUpdated', {
          detail: updatedProfile
        }));
      }
      
      // Show success message with custom component instead of alert
      setSuccessMessage({
        message: `Successfully transferred ${amount.toLocaleString()}`,
        signature: data.transaction_signature || 'Transaction completed'
      });
      return data;
    } catch (error) {
      console.error('Error transferring compute:', error);
      alert(`Failed to transfer compute: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  };
  
  // Handle compute withdrawal
  const handleWithdrawCompute = async (amount: number) => {
    try {
      // Get the wallet address from session or local storage
      const walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress');
      
      if (!walletAddress) {
        alert('Please connect your wallet first');
        return;
      }
      
      console.log(`Initiating withdrawal of ${amount.toLocaleString()} ducats...`);
      
      // Try the direct API route first
      try {
        const response = await fetch('/api/withdraw-compute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            wallet_address: walletAddress,
            compute_amount: amount,
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('Compute withdrawal successful:', data);
          
          // Update the user profile with the new compute amount
          if (userProfile) {
            const updatedProfile = {
              ...userProfile,
              computeAmount: data.compute_amount
            };
            setUserProfile(updatedProfile);
            
            // Update localStorage
            localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
            
            // Dispatch event to update other components
            window.dispatchEvent(new CustomEvent('userProfileUpdated', {
              detail: updatedProfile
            }));
          }
          
          return data;
        }
      } catch (directApiError) {
        console.warn('Direct API withdrawal failed, falling back to backend API:', directApiError);
      }
      
      // Fall back to the backend API
      const response = await fetch(`${getApiBaseUrl()}/api/withdraw-compute-solana`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          compute_amount: amount,
        }),
        // Add a timeout to prevent hanging requests
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });
      
      // Handle non-OK responses with more detailed error messages
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || `Server returned ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log('Compute withdrawal successful:', data);
      
      // Update the user profile with the new compute amount
      if (userProfile) {
        const updatedProfile = {
          ...userProfile,
          computeAmount: data.compute_amount
        };
        setUserProfile(updatedProfile);
        
        // Update localStorage
        localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
        
        // Dispatch event to update other components
        window.dispatchEvent(new CustomEvent('userProfileUpdated', {
          detail: updatedProfile
        }));
      }
      
      // Return the data instead of showing an alert (the component will handle the success message)
      return data;
    } catch (error) {
      console.error('Error withdrawing compute:', error);
      // Don't show alert here, let the component handle the error
      throw error;
    }
  };

  // Handle wallet connection
  const connectWallet = useCallback(async () => {
    if (!walletAdapter) {
      console.log("Wallet adapter not initialized");
      return;
    }
    
    console.log("Connecting wallet, current state:", walletAdapter.connected ? "connected" : "disconnected");
    
    if (walletAdapter.connected) {
      // If already connected, disconnect
      console.log("Disconnecting wallet...");
      try {
        await walletAdapter.disconnect();
        
        // Only update state after successful disconnect
        setWalletAddress(null);
        setUserProfile(null); // Also clear the user profile
        
        // Clear wallet from both storages
        sessionStorage.removeItem('walletAddress');
        localStorage.removeItem('walletAddress');
        
        // Dispatch a custom event to notify other components
        window.dispatchEvent(new CustomEvent('walletChanged'));
        
        console.log("Wallet disconnected successfully");
      } catch (error) {
        console.error("Error disconnecting wallet:", error);
        alert(`Failed to disconnect wallet: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    
    // Check if Phantom is installed
    if (walletAdapter.readyState !== WalletReadyState.Installed) {
      console.log("Phantom wallet not installed, opening website");
      window.open('https://phantom.app/', '_blank');
      return;
    }
    
    try {
      console.log("Attempting to connect to wallet...");
      await walletAdapter.connect();
      const address = walletAdapter.publicKey?.toString() || null;
      console.log("Wallet connected, address:", address);
      
      if (address) {
        setWalletAddress(address);
        // Store wallet in both session and local storage
        sessionStorage.setItem('walletAddress', address);
        localStorage.setItem('walletAddress', address);
        console.log("Wallet address stored in session and local storage");
        
        // Store wallet in Airtable and check for username
        const userData = await storeWalletInAirtable(address);
        console.log("User data from Airtable:", userData);
        console.log("User profile after wallet connection:", userProfile);
      } else {
        console.log("No wallet address returned after connection");
      }
    } catch (error) {
      console.error('Error connecting to wallet:', error);
      alert(`Failed to connect wallet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [walletAdapter]);

  if (!apiKey && walletAddress) {
    return <div className="w-screen h-screen flex items-center justify-center">
      <p>Google Maps API key is missing. Please add it to your .env.local file.</p>
    </div>;
  }

  // Function to save polygon data to a file
  const savePolygonToFile = (polygon: google.maps.Polygon) => {
    const path = polygon.getPath();
    const coordinates = Array.from({ length: path.getLength() }, (_, i) => {
      const point = path.getAt(i);
      return { lat: point.lat(), lng: point.lng() };
    });

    // In a real app, you would send this to your backend
    // For now, we'll log it to console
    console.log('Saving polygon:', coordinates);
    
    // Add to our local state
    setSavedPolygons(prev => [...prev, polygon]);

    // Send polygon data to the API
    fetch('/api/save-polygon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log(`Polygon ${data.isNew ? 'created' : 'updated'}: ${data.filename}`);
      } else {
        console.error('Failed to save polygon:', data.error);
      }
    })
    .catch(error => {
      console.error('Error saving polygon:', error);
    });
  };

  // Handle polygon complete event
  const onPolygonComplete = (polygon: google.maps.Polygon) => {
    // Apply rounded corners (this is a visual effect only)
    polygon.setOptions({
      ...polygonOptions,
      // The geodesic option helps create slightly rounded paths
      geodesic: true
    });

    // Auto-close the polygon if needed
    const path = polygon.getPath();
    if (path.getLength() > 2) {
      const firstPoint = path.getAt(0);
      const lastPoint = path.getAt(path.getLength() - 1);
      
      // If the first and last points are close enough, snap to close
      const threshold = 0.0001; // Adjust based on your needs
      if (
        Math.abs(firstPoint.lat() - lastPoint.lat()) < threshold &&
        Math.abs(firstPoint.lng() - lastPoint.lng()) < threshold
      ) {
        // Remove the last point and use the first point to close the polygon
        path.removeAt(path.getLength() - 1);
        // No need to add the first point again as polygons auto-close visually
      }
    }

    // Save the polygon
    savePolygonToFile(polygon);

    // Add listener for changes to save updated polygon
    // Use a debounce to prevent saving on every small change
    if (typeof google !== 'undefined') {
      let saveTimeout: NodeJS.Timeout | null = null;
      
      const debouncedSave = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          savePolygonToFile(polygon);
          saveTimeout = null;
        }, 1000); // Wait 1 second after changes stop before saving
      };
      
      google.maps.event.addListener(polygon.getPath(), 'set_at', debouncedSave);
      google.maps.event.addListener(polygon.getPath(), 'insert_at', debouncedSave);
    }
  };

  // Add this function to handle bridge creation
  const handleBridgeMode = () => {
    // Turn off delete mode if it's on
    if (deleteMode) {
      setDeleteMode(false);
      setSelectedMapPolygon(null);
      setSelectedMapPolygonId(null);
    }
    
    // Reset selected polygon when entering bridge mode
    if (selectedPolygon) {
      selectedPolygon.polygon.setOptions({
        strokeColor: '#3388ff',
        strokeOpacity: 0.8,
        fillColor: '#3388ff',
        fillOpacity: 0.35
      });
      setSelectedPolygon(null);
    }
    
    setBridgeMode(!bridgeMode);
    
    // Reset bridge start if turning off bridge mode
    if (bridgeMode) {
      setBridgeStart(null);
      setBridgeStartLandId(null);
    }
    
    // Change cursor style based on bridge mode
    if (mapRef.current) {
      mapRef.current.setOptions({
        draggableCursor: !bridgeMode ? 'crosshair' : ''
      });
    }
  };

  // Add this function to handle map clicks for bridge creation and polygon selection
  const handleMapClick = (event: google.maps.MapMouseEvent) => {
    if (!event.latLng) return;
    
    // Skip if we're dragging a centroid
    if (isDraggingCentroid) return;
    
    if (deleteMode) {
      // Find which polygon was clicked
      let clickedPolygonId = null;
      let clickedPolygon = null;
      
      for (const [id, polygon] of Object.entries(activeLandPolygons)) {
        if (google.maps.geometry.poly.containsLocation(event.latLng, polygon)) {
          clickedPolygonId = id;
          clickedPolygon = polygon;
          break;
        }
      }
      
      if (!clickedPolygonId || !clickedPolygon) {
        // If we didn't click on a polygon, deselect the current one
        if (selectedMapPolygon) {
          selectedMapPolygon.setOptions({
            strokeColor: '#3388ff',
            strokeOpacity: 0.8,
            fillColor: '#3388ff',
            fillOpacity: 0.35
          });
        }
        setSelectedMapPolygon(null);
        setSelectedMapPolygonId(null);
        return;
      }
      
      // If we already had a selected polygon, reset its style
      if (selectedMapPolygon && selectedMapPolygon !== clickedPolygon) {
        selectedMapPolygon.setOptions({
          strokeColor: '#3388ff',
          strokeOpacity: 0.8,
          fillColor: '#3388ff',
          fillOpacity: 0.35
        });
      }
      
      // Select the clicked polygon
      setSelectedMapPolygon(clickedPolygon);
      setSelectedMapPolygonId(clickedPolygonId);
      
      // Highlight the selected polygon
      clickedPolygon.setOptions({
        strokeColor: '#ff0000',
        strokeOpacity: 1.0,
        fillColor: '#ff0000',
        fillOpacity: 0.5
      });
      
      return;
    }
    
    if (bridgeMode) {
      // Find which polygon was clicked
      let clickedPolygonId = null;
      
      for (const [id, polygon] of Object.entries(activeLandPolygons)) {
        if (google.maps.geometry.poly.containsLocation(event.latLng, polygon)) {
          clickedPolygonId = id;
          break;
        }
      }
      
      if (!clickedPolygonId) {
        alert('Please click on a land polygon');
        return;
      }
      
      if (!bridgeStart) {
        // Set bridge start point
        setBridgeStart(event.latLng);
        setBridgeStartLandId(clickedPolygonId);
        alert(`Bridge start point set on land ${clickedPolygonId}`);
      } else {
        // Set bridge end point and create bridge
        if (clickedPolygonId === bridgeStartLandId) {
          alert('Bridge must connect two different lands');
          return;
        }
        
        // Create bridge
        const bridge = {
          id: `bridge-${Date.now()}`,
          startPoint: {
            lat: bridgeStart.lat(),
            lng: bridgeStart.lng()
          },
          endPoint: {
            lat: event.latLng.lat(),
            lng: event.latLng.lng()
          },
          startLandId: bridgeStartLandId,
          endLandId: clickedPolygonId
        };
        
        // Save bridge to file
        saveBridgeToFile(bridge);
        
        // Reset bridge mode
        setBridgeStart(null);
        setBridgeStartLandId(null);
        
        // Draw bridge line on map
        const bridgeLine = new google.maps.Polyline({
          path: [
            { lat: bridge.startPoint.lat, lng: bridge.startPoint.lng },
            { lat: bridge.endPoint.lat, lng: bridge.endPoint.lng }
          ],
          geodesic: true,
          strokeColor: '#FF0000',
          strokeOpacity: 1.0,
          strokeWeight: 3
        });
        
        bridgeLine.setMap(mapRef.current);
      }
    } else {
      // Normal mode - select polygon on click
      let clickedPolygonId = null;
      let clickedPolygon = null;
      
      for (const [id, polygon] of Object.entries(activeLandPolygons)) {
        if (google.maps.geometry.poly.containsLocation(event.latLng, polygon)) {
          clickedPolygonId = id;
          clickedPolygon = polygon;
          break;
        }
      }
      
      // If we clicked on a polygon, select it
      if (clickedPolygonId && clickedPolygon) {
        // If we already had a selected polygon, reset its style
        if (selectedPolygon && selectedPolygon.polygon !== clickedPolygon) {
          selectedPolygon.polygon.setOptions({
            strokeColor: '#3388ff',
            strokeOpacity: 0.8,
            fillColor: '#3388ff',
            fillOpacity: 0.35
          });
        }
        
        // Select the clicked polygon
        setSelectedPolygon({
          id: clickedPolygonId,
          polygon: clickedPolygon
        });
        
        // Highlight the selected polygon
        clickedPolygon.setOptions({
          strokeColor: '#ff0000',
          strokeOpacity: 1.0,
          fillColor: '#ff0000',
          fillOpacity: 0.5
        });
      } else {
        // If we clicked on empty space, deselect the current polygon
        if (selectedPolygon) {
          selectedPolygon.polygon.setOptions({
            strokeColor: '#3388ff',
            strokeOpacity: 0.8,
            fillColor: '#3388ff',
            fillOpacity: 0.35
          });
          setSelectedPolygon(null);
        }
      }
    }
  };
  
  // Add this function to handle polygon deletion
  const handleDeletePolygon = async () => {
    if (!selectedMapPolygonId || !selectedMapPolygon) {
      alert('Please select a polygon to delete first');
      return;
    }
    
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete this polygon: ${selectedMapPolygonId}?`)) {
      return;
    }
    
    try {
      const response = await fetch('/api/delete-polygon', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: selectedMapPolygonId }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete polygon');
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Remove the polygon from the map
        selectedMapPolygon.setMap(null);
        
        // Remove from active polygons
        const newActiveLandPolygons = { ...activeLandPolygons };
        delete newActiveLandPolygons[selectedMapPolygonId];
        setActiveLandPolygons(newActiveLandPolygons);
        
        // Reset selection
        setSelectedMapPolygon(null);
        setSelectedMapPolygonId(null);
        
        alert('Polygon deleted successfully');
      } else {
        alert(`Failed to delete polygon: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting polygon:', error);
      alert('An error occurred while deleting the polygon');
    }
  };

  // Add this function to save bridge to file
  const saveBridgeToFile = (bridge: any) => {
    // Send bridge data to the API
    fetch('/api/save-bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bridge)
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log(`Bridge created: ${data.filename}`);
        alert(`Bridge created between lands ${bridge.startLandId} and ${bridge.endLandId}`);
      } else {
        console.error('Failed to save bridge:', data.error);
        alert('Failed to create bridge');
      }
    })
    .catch(error => {
      console.error('Error saving bridge:', error);
      alert('Error creating bridge');
    });
  };

  // Handle map load
  const onMapLoad = (map: google.maps.Map) => {
    console.log('Google Map loaded');
    mapRef.current = map;
    
    // Add click listener for bridge creation
    map.addListener('click', handleMapClick);
    
    // Load polygons immediately when map is ready
    if (isGoogleLoaded) {
      console.log('Loading polygons on map load...');
      loadPolygonsOnMap();
    }
  };

  // Handle drawing manager load
  const onDrawingManagerLoad = (drawingManager: google.maps.drawing.DrawingManager) => {
    drawingManagerRef.current = drawingManager;
    setIsGoogleLoaded(true);
  };
  
  // Add a function to update a centroid
  const updateCentroid = async (polygonId: string, newCentroid: {lat: number, lng: number}) => {
    try {
      const response = await fetch('/api/update-centroid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: polygonId,
          centroid: newCentroid
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update centroid');
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log(`Successfully updated centroid for ${polygonId}`);
      } else {
        console.error(`Failed to update centroid: ${data.error}`);
      }
    } catch (error) {
      console.error('Error updating centroid:', error);
    }
  };

  // Add a function to load polygons onto the map
  const loadPolygonsOnMap = useCallback(() => {
    console.log('loadPolygonsOnMap called');
    
    if (!mapRef.current) {
      console.warn('Map reference not available');
      return;
    }
    
    if (!isGoogleLoaded) {
      console.warn('Google Maps API not loaded');
      return;
    }
    
    console.log('Loading polygons onto map...');
    
    // Clear existing polygons
    Object.values(activeLandPolygons).forEach(polygon => {
      polygon.setMap(null);
    });
    
    // Clear existing centroid markers
    Object.values(centroidMarkers).forEach(marker => {
      marker.setMap(null);
    });
    
    // Reset selected polygon
    if (selectedPolygon) {
      setSelectedPolygon(null);
    }
    
    // Reset active polygons and centroid markers
    const newActiveLandPolygons: Record<string, google.maps.Polygon> = {};
    const newCentroidMarkers: Record<string, google.maps.Marker> = {};
    
    // Fetch polygons from API
    fetch('/api/get-polygons')
      .then(response => response.json())
      .then(data => {
        console.log(`Fetched ${data.polygons?.length || 0} polygons from API`);
        
        if (!data.polygons || data.polygons.length === 0) {
          console.warn('No polygons returned from API');
          return;
        }
        
        data.polygons.forEach((polygon: any, index: number) => {
          if (polygon.coordinates && polygon.coordinates.length > 2) {
            console.log(`Creating polygon ${index} (${polygon.id}) on map`);
            
            const path = polygon.coordinates.map((coord: any) => ({
              lat: coord.lat,
              lng: coord.lng
            }));
            
            const mapPolygon = new google.maps.Polygon({
              paths: path,
              strokeColor: '#3388ff',
              strokeOpacity: 0.8,
              strokeWeight: 2,
              fillColor: '#3388ff',
              fillOpacity: 0.35,
              map: mapRef.current
            });
            
            // Store reference to polygon
            newActiveLandPolygons[polygon.id] = mapPolygon;
            
            // Create a centroid marker if centroid exists
            if (polygon.centroid) {
              const centroidMarker = new google.maps.Marker({
                position: {
                  lat: polygon.centroid.lat,
                  lng: polygon.centroid.lng
                },
                map: centroidDragMode ? mapRef.current : null, // Only show if in centroid drag mode
                draggable: centroidDragMode,
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 7,
                  fillColor: '#FF0000',
                  fillOpacity: 0.7,
                  strokeWeight: 2,
                  strokeColor: '#FFFFFF'
                },
                title: `Centroid: ${polygon.id}`
              });
              
              // Add drag event listeners
              centroidMarker.addListener('dragstart', () => {
                setIsDraggingCentroid(true);
              });
              
              centroidMarker.addListener('dragend', async () => {
                setIsDraggingCentroid(false);
                const newPosition = centroidMarker.getPosition();
                if (newPosition) {
                  // Update the centroid in the backend
                  await updateCentroid(polygon.id, {
                    lat: newPosition.lat(),
                    lng: newPosition.lng()
                  });
                }
              });
              
              newCentroidMarkers[polygon.id] = centroidMarker;
            }
          } else {
            console.warn(`Polygon ${index} (${polygon.id}) has invalid coordinates:`, polygon.coordinates);
          }
        });
        
        console.log(`Added ${Object.keys(newActiveLandPolygons).length} polygons to map`);
        setActiveLandPolygons(newActiveLandPolygons);
        setCentroidMarkers(newCentroidMarkers);
      })
      .catch(error => {
        console.error('Error loading polygons:', error);
      });
  }, [isGoogleLoaded, centroidDragMode]);

  // Add useEffect to load polygons when map is ready
  useEffect(() => {
    if (mapRef.current && isGoogleLoaded) {
      console.log('Map and Google Maps API ready, loading polygons...');
      loadPolygonsOnMap();
    }
  }, [mapRef.current, isGoogleLoaded, loadPolygonsOnMap]);
  
  // Add this useEffect to listen for usersDataLoaded events
  useEffect(() => {
    const handleUsersLoaded = () => {
      console.log('Users data loaded event detected');
      
      // Add ConsiglioDeiDieci if not present
      if (!users['ConsiglioDeiDieci']) {
        console.log('Adding ConsiglioDeiDieci to users data');
        const updatedUsers = {
          ...users,
          'ConsiglioDeiDieci': {
            user_name: 'ConsiglioDeiDieci',
            color: '#8B0000', // Dark red
            coat_of_arms_image: null
          }
        };
        // Update the store with the modified users data
        usePolygonStore.setState({ users: updatedUsers });
      }
      
      updatePolygonColors();
      updateCoatOfArms();
      
      // Force additional updates for land view
      if (activeView === 'land' && polygonRendererRef.current) {
        polygonRendererRef.current.updatePolygonOwnerColors();
        polygonRendererRef.current.updateCoatOfArmsSprites();
      }
    };
    
    window.addEventListener('usersDataLoaded', handleUsersLoaded);
    
    return () => {
      window.removeEventListener('usersDataLoaded', handleUsersLoaded);
    };
  }, [updatePolygonColors, updateCoatOfArms, users, activeView]);

  // Also add this to ensure polygons are loaded when the component mounts
  useEffect(() => {
    // This will run once when the component mounts
    const loadPolygonsWhenReady = () => {
      if (mapRef.current && isGoogleLoaded) {
        console.log('Loading polygons on mount...');
        loadPolygonsOnMap();
      } else {
        // If map or Google Maps API isn't ready yet, check again in a moment
        // Map or Google Maps API not ready yet, waiting...
        const timer = setTimeout(loadPolygonsWhenReady, 500);
        return () => clearTimeout(timer);
      }
    };
    
    loadPolygonsWhenReady();
  }, []);

  // Handle script load
  const handleScriptLoad = () => {
    setIsGoogleLoaded(true);
  };

  // Create drawing manager options with client-side safety
  const [drawingManagerOptions, setDrawingManagerOptions] = useState({
    drawingControl: true,
    drawingControlOptions: {
      position: 1, // TOP_CENTER
      drawingModes: ['polygon']
    },
    polygonOptions
  });

  // Update drawing manager options when Google is loaded
  useEffect(() => {
    if (isGoogleLoaded && typeof google !== 'undefined') {
      setDrawingManagerOptions({
        drawingControl: true,
        drawingControlOptions: {
          position: google.maps.ControlPosition.TOP_CENTER,
          drawingModes: [google.maps.drawing.OverlayType.POLYGON]
        },
        polygonOptions
      });
    }
  }, [isGoogleLoaded]);

  return (
    <div className="relative w-screen h-screen">
      {/* Loading Screen */}
      {isLoading && (
        <LoadingScreen 
          onLoadingComplete={() => setIsLoading(false)}
          duration={5000}
        />
      )}
    
      {/* Transfer Compute Menu - moved to top level */}
      {transferMenuOpen && (
        <TransferComputeMenu
          onClose={() => setTransferMenuOpen(false)}
          onTransfer={handleTransferCompute}
        />
      )}
      
      {/* Withdraw Compute Menu */}
      {withdrawMenuOpen && (
        <WithdrawComputeMenu
          onClose={() => setWithdrawMenuOpen(false)}
          onWithdraw={handleWithdrawCompute}
          computeAmount={userProfile?.computeAmount || 0}
        />
      )}
      
      {/* Wallet button/dropdown or User Profile */}
      {walletAddress ? (
        userProfile ? (
          // Show user profile with coat of arms and name
          <div className="absolute top-4 right-4 z-10" ref={dropdownRef}>
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="bg-amber-50 px-6 py-3 rounded-lg shadow-md hover:bg-amber-100 transition-colors flex items-center border-2 border-amber-300"
            >
              <PlayerProfile
                username={userProfile.username || usernameInput}
                firstName={userProfile.firstName || firstName}
                lastName={userProfile.lastName || lastName}
                coatOfArmsImage={userProfile.coatOfArmsImage || coatOfArmsImage}
                familyMotto={userProfile.familyMotto || familyMotto}
                computeAmount={userProfile.computeAmount}
                size="medium" // Change from small to medium
                className="mr-3" // Increase margin
                showMotto={false}
                showDucats={true}
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl py-1 z-20 border-2 border-amber-300 overflow-hidden">
                <div className="px-4 py-3 border-b border-amber-100 bg-amber-50">
                  <p className="text-xs text-amber-700">Wallet</p>
                  <p className="text-sm truncate font-medium">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</p>
                  {userProfile.familyMotto && (
                    <p className="text-xs italic text-amber-600 mt-1">"{userProfile.familyMotto}"</p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowUsernamePrompt(true); // Reuse the username prompt for profile editing
                    // Don't set username input when editing
                    setFirstName(userProfile.firstName || '');
                    setLastName(userProfile.lastName || '');
                    setFamilyCoatOfArms(userProfile.familyCoatOfArms || '');
                    setFamilyMotto(userProfile.familyMotto || '');
                    setCoatOfArmsImage(userProfile.coatOfArmsImage || null);
                    setDropdownOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-amber-500 hover:text-white transition-colors"
                >
                  Edit Profile
                </button>

                <button
                  onClick={() => {
                    setTransferMenuOpen(true);
                    setDropdownOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-amber-500 hover:text-white transition-colors"
                >
                  Inject <span className="compute-token">$COMPUTE</span>
                </button>
                <button
                  onClick={() => {
                    setWithdrawMenuOpen(true);
                    setDropdownOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-amber-500 hover:text-white transition-colors"
                >
                  Cash out <span className="compute-token">$COMPUTE</span>
                </button>
                <button
                  onClick={() => {
                    connectWallet();
                    setDropdownOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-red-500 hover:text-white transition-colors"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        ) : (
          // Show wallet address if profile not loaded yet
          <div className="absolute top-4 right-4 z-10" ref={dropdownRef}>
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="bg-white px-4 py-2 rounded shadow hover:bg-gray-100 transition-colors flex items-center"
            >
              <span className="mr-2">{walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-20">
                <button
                  onClick={() => {
                    setTransferMenuOpen(true);
                    setDropdownOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-blue-500 hover:text-white transition-colors"
                >
                  Transfer Compute
                </button>
                <button
                  onClick={() => {
                    connectWallet();
                    setDropdownOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-red-500 hover:text-white transition-colors"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        )
      ) : (
        <button 
          onClick={connectWallet}
          className="absolute top-4 right-4 z-10 bg-white px-4 py-2 rounded shadow hover:bg-purple-100 transition-colors"
        >
          Connect Wallet
        </button>
      )}
      
      {/* Username prompt modal - non-dismissable */}
      {showUsernamePrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-lg w-[900px] max-w-[90vw] border-4 border-amber-700 flex flex-col md:flex-row">
            {/* Left side - Form */}
            <div className="md:w-1/2 pr-0 md:pr-6">
              <h2 className="text-2xl font-serif font-semibold mb-4 text-amber-800 text-center">
                {userProfile ? 'Edit Your Noble Profile' : 'Welcome to La Serenissima'}
              </h2>
              
              <div className="mb-6 text-gray-700 italic text-center">
                {userProfile ? (
                  <p>Update your noble identity and family heraldry as registered with the Council of Ten.</p>
                ) : (
                  <>
                    <p>The year is 1525. The Most Serene Republic of Venezia stands as a beacon of wealth and power in the Mediterranean.</p>
                    <p className="mt-2">As a noble of Venice, you must now register your identity with the Council of Ten.</p>
                  </>
                )}
              </div>
              
              <div className="mb-6">
                <h3 className="text-lg font-medium text-amber-700 mb-2">Your Noble Identity</h3>
                
                <div className="flex flex-col space-y-4">
                  {/* Only show username field when creating a new profile, not when editing */}
                  {!userProfile && (
                    <div className="flex items-center">
                      <div className="w-1/3">
                        <label className="block text-gray-700">Username</label>
                      </div>
                      <div className="w-2/3">
                        <input
                          type="text"
                          value={usernameInput}
                          onChange={(e) => setUsernameInput(e.target.value)}
                          placeholder="Enter your username..."
                          className="w-full px-3 py-2 border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center">
                    <div className="w-1/3">
                      <label className="block text-gray-700">First Name</label>
                    </div>
                    <div className="w-2/3 flex">
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Enter your first name..."
                        className="w-full px-3 py-2 border border-amber-300 rounded-l focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        onClick={() => {
                          const venetianFirstNames = [
                            "Marco", "Antonio", "Giovanni", "Francesco", "Alvise",
                            "Domenico", "Pietro", "Paolo", "Nicolo", "Giacomo",
                            "Maria", "Caterina", "Isabella", "Lucia", "Elena",
                            "Beatrice", "Chiara", "Francesca", "Vittoria", "Laura"
                          ];
                          const randomName = venetianFirstNames[Math.floor(Math.random() * venetianFirstNames.length)];
                          setFirstName(randomName);
                        }}
                        className="bg-amber-600 text-white p-2 rounded-r hover:bg-amber-700 transition-colors text-xl"
                        title="Roll the dice for a random name"
                        type="button"
                      >
                        🎲
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center mt-4">
                    <div className="w-1/3">
                      <label className="block text-gray-700">Family Name</label>
                    </div>
                    <div className="w-2/3 flex">
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Enter your family name..."
                        className="w-full px-3 py-2 border border-amber-300 rounded-l focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        onClick={() => {
                          const venetianLastNames = [
                            "Contarini", "Morosini", "Dandolo", "Foscari", "Grimani",
                            "Barbarigo", "Mocenigo", "Venier", "Loredan", "Gritti",
                            "Pisani", "Tiepolo", "Bembo", "Priuli", "Trevisan",
                            "Donato", "Giustinian", "Zeno", "Corner", "Gradenigo"
                          ];
                          const randomName = venetianLastNames[Math.floor(Math.random() * venetianLastNames.length)];
                          setLastName(randomName);
                        }}
                        className="bg-amber-600 text-white p-2 rounded-r hover:bg-amber-700 transition-colors text-xl"
                        title="Roll the dice for a random name"
                        type="button"
                      >
                        🎲
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <div className="w-1/3">
                      <label className="block text-gray-700">Family Coat of Arms</label>
                    </div>
                    <div className="w-2/3 flex flex-col">
                      <div className="flex">
                        <textarea
                          value={familyCoatOfArms}
                          onChange={(e) => setFamilyCoatOfArms(e.target.value)}
                          placeholder="Describe your family's coat of arms..."
                          className="w-full px-3 py-2 border border-amber-300 rounded-l focus:outline-none focus:ring-2 focus:ring-amber-500"
                          rows={3}
                        />
                        <button
                          onClick={() => {
                            const coatOfArmsElements = [
                              "A golden winged lion of St. Mark rampant on a field of azure, holding an open book with the words 'Pax Tibi Marce'",
                              "A silver eagle displayed on a field of crimson, with a golden crown above its head",
                              "Three golden fleurs-de-lis on a field of azure, bordered with a silver and red checkered pattern",
                              "A red rose with golden center on a field of silver, surrounded by eight smaller golden stars",
                              "A black wolf passant on a field of gold, with three silver crescents in chief",
                              "A golden sun with sixteen rays on a field of azure, above a silver galley ship on waves",
                              "A silver crescent moon on a field of sable, with three golden stars arranged in a triangle",
                              "A golden Venetian galley with white sails on a sea of azure, beneath a red sky",
                              "A red griffin segreant on a field of silver, holding a golden key in its claws",
                              "Three silver stars on a field of gules, above a silver bridge spanning blue waves",
                              "A golden lion and a silver winged horse supporting a shield divided per pale azure and gules",
                              "A black double-headed eagle on a gold field, with a red shield on its breast",
                              "A silver tower between two cypress trees on a field of blue, with a red chief bearing three gold coins",
                              "A golden doge's cap (corno ducale) on a field of crimson, with silver tassels",
                              "A silver dolphin naiant on a field of blue and green waves, beneath a golden sun",
                              "A red and gold checkerboard pattern, with a black eagle in the center square",
                              "Three golden crowns on a field of azure, separated by a silver chevron",
                              "A silver gondola on blue waves, beneath a night sky of gold stars on black",
                              "A golden lion's head erased on a field of red, surrounded by a border of alternating gold and blue squares",
                              "A silver winged horse rampant on a field of blue, with golden stars in each corner",
                              "A red cross on a silver field, with four golden keys in the quarters",
                              "A golden tree with deep roots on a green mound, on a field of azure with silver stars",
                              "Three black ravens on a field of gold, above a red rose on a silver chief",
                              "A silver unicorn rampant on a field of blue, with a golden crown around its neck",
                              "A golden portcullis on a field of red, with three silver shells in chief",
                              "A silver mermaid holding a mirror on a field of blue waves, beneath a golden sun",
                              "A red and gold striped field, with a silver lion passant in chief",
                              "A golden phoenix rising from flames on a field of azure, with silver stars in chief",
                              "Three silver crescents on a field of blue, with a golden sun in the center",
                              "A silver tower between two red roses on a field of blue, with a golden chief"
                            ];
                            const randomCoatOfArms = coatOfArmsElements[Math.floor(Math.random() * coatOfArmsElements.length)];
                            setFamilyCoatOfArms(randomCoatOfArms);
                          }}
                          className="bg-amber-600 text-white p-2 rounded-r hover:bg-amber-700 transition-colors text-xl self-stretch"
                          title="Roll the dice for a random coat of arms"
                          type="button"
                        >
                          🎲
                        </button>
                      </div>
                      
                      <div className="mt-2 flex justify-between">
                        <button
                          onClick={generateCoatOfArmsImage}
                          disabled={!familyCoatOfArms.trim() || isGeneratingImage}
                          className={`px-3 py-1 rounded text-white text-sm ${
                            !familyCoatOfArms.trim() || isGeneratingImage 
                              ? 'bg-gray-400 cursor-not-allowed' 
                              : 'bg-amber-600 hover:bg-amber-700'
                          }`}
                        >
                          {isGeneratingImage ? 'Generating...' : 'Generate Image'}
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center mt-4">
                    <div className="w-1/3">
                      <label className="block text-gray-700">Family Motto</label>
                    </div>
                    <div className="w-2/3">
                      <textarea
                        value={familyMotto}
                        onChange={(e) => setFamilyMotto(e.target.value)}
                        placeholder="Enter your family motto..."
                        className="w-full px-3 py-2 border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                        rows={2}
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center mt-4">
                    <div className="w-1/3">
                      <label className="block text-gray-700">Family Color</label>
                    </div>
                    <div className="w-2/3">
                      <div className="flex flex-wrap gap-2">
                        {veniceColorPalette.map((color) => (
                          <button
                            key={color}
                            onClick={() => setSelectedColor(color)}
                            className={`w-8 h-8 rounded-full border-2 ${
                              selectedColor === color ? 'border-white ring-2 ring-amber-500' : 'border-gray-300'
                            }`}
                            style={{ backgroundColor: color }}
                            title={`Select ${color} as your family color`}
                            type="button"
                            aria-label={`Select ${color} as your family color`}
                          />
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        This color will represent your family on the map of Venice.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
            </div>
            
            {/* Right side - Coat of Arms Image and Oath */}
            <div className="md:w-1/2 mt-6 md:mt-0 flex flex-col items-center justify-center">
              {/* Coat of Arms Image */}
              <div className="flex-1 flex flex-col items-center justify-center w-full">
                {coatOfArmsImage ? (
                  <div className="flex flex-col items-center">
                    <div className="border-8 border-amber-700 rounded-lg shadow-xl p-2 bg-amber-50 flex items-center justify-center">
                      <img 
                        src={coatOfArmsImage} 
                        alt="Family Coat of Arms" 
                        className="w-full h-auto max-h-[400px] object-contain"
                        style={{ maxWidth: "300px" }} // Add fixed width for better consistency
                      />
                    </div>
                    <p className="mt-4 text-center italic text-amber-800 font-medium">
                      The Coat of Arms of the House of {lastName || "Your Family"}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-64 h-64 border-4 border-dashed border-amber-300 rounded-lg flex items-center justify-center bg-amber-50">
                      <p className="text-amber-700 text-center p-4">
                        {isGeneratingImage 
                          ? "Creating your family's coat of arms..." 
                          : "Describe your family's coat of arms and click 'Generate Image' to visualize it"}
                      </p>
                    </div>
                    <p className="mt-4 text-center italic text-amber-800">
                      Every noble Venetian family is known by its distinctive emblem
                    </p>
                  </div>
                )}
              </div>
        
              {/* Oath Section - Moved below the image */}
              <div className="mt-6 border-2 border-amber-600 rounded-lg p-4 bg-amber-50 w-full">
                <h4 className="text-lg font-medium text-amber-800 mb-2">
                  {userProfile ? 'Confirm Your Changes' : 'Swear Your Oath to Venice'}
                </h4>
          
                <p className="text-sm text-amber-700 mb-4 italic">
                  "I solemnly pledge my loyalty to the Most Serene Republic of Venice, to uphold her laws, defend her interests, and increase her glory. May my family prosper under the wings of the Lion of Saint Mark."
                </p>
          
                <button
                  onClick={handleUsernameSubmit}
                  className={`w-full px-6 py-3 bg-amber-600 text-white rounded-lg transition-colors font-medium flex items-center justify-center ${
                    (!userProfile && (!usernameInput.trim() || !firstName.trim() || !lastName.trim() || !familyCoatOfArms.trim() || !familyMotto.trim())) ||
                    (userProfile && (!firstName.trim() || !lastName.trim() || !familyCoatOfArms.trim() || !familyMotto.trim()))
                      ? 'opacity-50 cursor-not-allowed bg-amber-400'
                      : 'hover:bg-amber-700'
                  }`}
                  disabled={Boolean((!userProfile && (!usernameInput.trim() || !firstName.trim() || !lastName.trim() || !familyCoatOfArms.trim() || !familyMotto.trim())) ||
                    (userProfile && (!firstName.trim() || !lastName.trim() || !familyCoatOfArms.trim() || !familyMotto.trim())))}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 2v20h-2v-8h-2v8h-2v-8h-2v8h-2v-8h-2v8H8v-8H6v8H4v-8H2V2h18z" />
                    <path d="M2 2l8 8" />
                    <path d="M20 2l-8 8" />
                  </svg>
                  {userProfile ? 'Update Your Noble Identity' : 'Sign and Seal Your Oath'}
                </button>
          
                {userProfile && (
                  <button
                    onClick={() => setShowUsernamePrompt(false)}
                    className="w-full mt-2 px-6 py-2 bg-gray-300 text-gray-700 rounded-lg transition-colors font-medium hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                )}
          
                <p className="mt-3 text-xs text-center text-amber-600">
                  {userProfile 
                    ? 'Your updated information will be recorded in the official registers of Venice.'
                    : 'By signing this oath, you will be granted the rights and privileges of a Venetian noble, including the ability to own property and conduct trade within the Republic.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Bridge mode button */}
      {isGoogleLoaded && (
        <div className="absolute bottom-4 left-4 z-10">
          <button
            onClick={handleBridgeMode}
            className={`px-4 py-2 rounded shadow ${
              bridgeMode ? 'bg-red-500 text-white' : 'bg-white'
            }`}
          >
            {bridgeMode ? 'Cancel Bridge' : 'Add Bridge'}
          </button>
        </div>
      )}
      
      {/* Delete mode button */}
      {isGoogleLoaded && (
        <div className="absolute bottom-4 left-36 z-10">
          <button
            onClick={() => {
              // Turn off bridge mode if it's on
              if (bridgeMode) {
                setBridgeMode(false);
                setBridgeStart(null);
                setBridgeStartLandId(null);
              }
              
              // Reset selected polygon when entering delete mode
              if (selectedPolygon) {
                selectedPolygon.polygon.setOptions({
                  strokeColor: '#3388ff',
                  strokeOpacity: 0.8,
                  fillColor: '#3388ff',
                  fillOpacity: 0.35
                });
                setSelectedPolygon(null);
              }
              
              // Toggle delete mode
              setDeleteMode(!deleteMode);
              
              // Reset selection when turning off delete mode
              if (deleteMode) {
                if (selectedMapPolygon) {
                  // Reset the polygon style
                  selectedMapPolygon.setOptions({
                    strokeColor: '#3388ff',
                    strokeOpacity: 0.8,
                    fillColor: '#3388ff',
                    fillOpacity: 0.35
                  });
                }
                setSelectedMapPolygon(null);
                setSelectedMapPolygonId(null);
              }
              
              // Change cursor style based on delete mode
              if (mapRef.current) {
                mapRef.current.setOptions({
                  draggableCursor: !deleteMode ? 'crosshair' : ''
                });
              }
            }}
            className={`px-4 py-2 rounded shadow ${
              deleteMode ? 'bg-red-500 text-white' : 'bg-white'
            }`}
          >
            {deleteMode ? 'Cancel Delete' : 'Delete Polygon'}
          </button>
        </div>
      )}
      
      {/* Centroid drag mode button */}
      {isGoogleLoaded && (
        <div className="absolute bottom-4 left-72 z-10">
          <button
            onClick={() => {
              // Toggle centroid drag mode
              const newMode = !centroidDragMode;
              setCentroidDragMode(newMode);
              
              // Show/hide and enable/disable dragging for all centroid markers
              Object.values(centroidMarkers).forEach(marker => {
                marker.setMap(newMode ? mapRef.current : null);
                marker.setDraggable(newMode);
              });
              
              // Turn off other modes if enabling centroid drag mode
              if (newMode) {
                if (bridgeMode) {
                  setBridgeMode(false);
                  setBridgeStart(null);
                  setBridgeStartLandId(null);
                }
                
                if (deleteMode) {
                  setDeleteMode(false);
                  if (selectedMapPolygon) {
                    selectedMapPolygon.setOptions({
                      strokeColor: '#3388ff',
                      strokeOpacity: 0.8,
                      fillColor: '#3388ff',
                      fillOpacity: 0.35
                    });
                  }
                  setSelectedMapPolygon(null);
                  setSelectedMapPolygonId(null);
                }
              }
              
              // Change cursor style based on centroid drag mode
              if (mapRef.current) {
                mapRef.current.setOptions({
                  draggableCursor: newMode ? 'move' : ''
                });
              }
            }}
            className={`px-4 py-2 rounded shadow ${
              centroidDragMode ? 'bg-purple-500 text-white' : 'bg-white'
            }`}
          >
            {centroidDragMode ? 'Exit Centroid Mode' : 'Edit Centroids'}
          </button>
        </div>
      )}
      
      {/* Delete confirmation button - only show when a polygon is selected in delete mode */}
      {deleteMode && selectedMapPolygonId && (
        <div className="absolute bottom-16 left-36 z-10 bg-white p-2 rounded shadow">
          <p className="mb-2">Selected: {selectedMapPolygonId}</p>
          <button
            onClick={handleDeletePolygon}
            className="px-4 py-2 bg-red-500 text-white rounded shadow hover:bg-red-600"
          >
            Confirm Delete
          </button>
        </div>
      )}
      
      {/* Delete button - only show when a polygon is selected in normal mode */}
      {selectedPolygon && !deleteMode && !bridgeMode && (
        <div className="absolute top-16 right-4 z-10 bg-white p-3 rounded shadow">
          <div className="flex flex-col items-start">
            <p className="mb-2 font-medium">Selected: {selectedPolygon.id}</p>
            <button
              onClick={async () => {
                if (!selectedPolygon) return;
                
                // Confirm deletion
                if (!confirm(`Are you sure you want to delete this polygon: ${selectedPolygon.id}?`)) {
                  return;
                }
                
                try {
                  const response = await fetch('/api/delete-polygon', {
                    method: 'DELETE',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ id: selectedPolygon.id }),
                  });
                  
                  if (!response.ok) {
                    throw new Error('Failed to delete polygon');
                  }
                  
                  const data = await response.json();
                  
                  if (data.success) {
                    // Remove the polygon from the map
                    selectedPolygon.polygon.setMap(null);
                    
                    // Remove from active polygons
                    const newActiveLandPolygons = { ...activeLandPolygons };
                    delete newActiveLandPolygons[selectedPolygon.id];
                    setActiveLandPolygons(newActiveLandPolygons);
                    
                    // Reset selection
                    setSelectedPolygon(null);
                    
                    alert('Polygon deleted successfully');
                  } else {
                    alert(`Failed to delete polygon: ${data.error}`);
                  }
                } catch (error) {
                  console.error('Error deleting polygon:', error);
                  alert('An error occurred while deleting the polygon');
                }
              }}
              className="px-4 py-2 bg-red-500 text-white rounded shadow hover:bg-red-600 w-full"
            >
              Delete Polygon
            </button>
          </div>
        </div>
      )}
      
      {/* Success message alert */}
      {/* Success message alert */}
      {successMessage && (
        <SuccessAlert 
          message={successMessage.message}
          signature={successMessage.signature}
          onClose={() => setSuccessMessage(null)}
        />
      )}
      
      {/* Always show the 3D Polygon Viewer regardless of wallet connection status */}
      <PolygonViewer />
      
    </div>
  );
}
