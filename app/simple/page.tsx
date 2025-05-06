'use client';

import dynamic from 'next/dynamic';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import PlayerProfile from '../../components/UI/PlayerProfile';
import TransferComputeMenu from '../../components/UI/TransferComputeMenu';
import WithdrawComputeMenu from '../../components/UI/WithdrawComputeMenu';
import SuccessAlert from '../../components/UI/SuccessAlert';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { getApiBaseUrl } from '@/lib/apiUtils';
import { getWalletAddress, setWalletAddress, clearWalletAddress, storeWalletInAirtable } from '@/lib/walletUtils';
import { transferCompute, withdrawCompute } from '@/lib/computeUtils';
import { generateCoatOfArmsImage } from '@/app/utils/coatOfArmsUtils';
import { FaHome, FaBuilding, FaRoad, FaTree, FaStore, FaLandmark } from 'react-icons/fa';
import * as THREE from 'three';

// Add type declaration for window properties
declare global {
  interface Window {
    _polygonSnapshotCache: { result: any; deps: string | null };
    getCachedSnapshot: <T>(getSnapshotFn: () => T, deps: any[]) => T;
    dispatchEvent(event: Event): boolean;
  }
}

// Import SimpleViewer with no SSR to avoid hydration issues
const SimpleViewer = dynamic(() => import('../../components/PolygonViewer/SimpleViewer'), {
  ssr: false
});

export default function SimplePage() {
  // UI state
  const [showInfo, setShowInfo] = useState(false);
  const [activeView, setActiveView] = useState<'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance'>('land');
  const [qualityMode, setQualityMode] = useState<'high' | 'performance'>('high');
  const [marketPanelVisible, setMarketPanelVisible] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Sidebar is always compact
  
  // Wallet and user state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletAdapter, setWalletAdapter] = useState<PhantomWalletAdapter | null>(null);
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
  const [cacheCleared, setCacheCleared] = useState<boolean>(false);
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
  
  // Add the handleUsernameSubmit function inside the component
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
      const username = userProfile !== null ? userProfile.username : usernameInput.trim();
      
      // If this is a new user (no userProfile), assign a random color from the palette
      // Otherwise, use the selected color
      const userColor = userProfile === null
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
  
  // Add effect to handle clicking outside the dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Function to flush all caches
  const flushAllCaches = () => {
    console.log('Flushing all caches...');
    
    try {
      // Clear localStorage
      localStorage.clear();
      console.log('localStorage cleared');
      
      // Clear sessionStorage
      sessionStorage.clear();
      console.log('sessionStorage cleared');
      
      // Clear any in-memory caches
      if (window._polygonSnapshotCache) {
        window._polygonSnapshotCache = { result: null, deps: null };
        console.log('Polygon snapshot cache cleared');
      }
      
      // Clear any cached textures
      if (THREE && THREE.Cache) {
        THREE.Cache.clear();
        console.log('THREE.js texture cache cleared');
      }
      
      // Reset any global state
      if (typeof window.getCachedSnapshot === 'function') {
        // Use type assertion to handle the delete operation properly
        delete (window as any).getCachedSnapshot;
        console.log('getCachedSnapshot function removed');
      }
      
      // Show success message
      setCacheCleared(true);
      
      // Hide success message after 3 seconds
      setTimeout(() => {
        setCacheCleared(false);
      }, 3000);
      
      // Reload the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('Error clearing caches:', error);
      alert(`Error clearing caches: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Function to generate coat of arms image
  const handleGenerateCoatOfArmsImage = async () => {
    if (!familyCoatOfArms.trim()) {
      alert('Please enter a description of your family coat of arms first');
      return;
    }
      
    try {
      setIsGeneratingImage(true);
        
      const imageUrl = await generateCoatOfArmsImage(familyCoatOfArms);
        
      // Update state with the local image URL
      setCoatOfArmsImage(imageUrl);
        
    } catch (error) {
      console.error('Error generating coat of arms image:', error);
      alert(`Failed to generate image: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGeneratingImage(false);
    }
  };
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

  return (
    <>
    <div className="relative w-full h-screen">
      {/* Main 3D Viewer (should be first in the DOM for proper layering) */}
      <SimpleViewer qualityMode={qualityMode} activeView={activeView} />
      
      {/* Left Side Menu */}
      <div className="absolute left-0 top-0 bottom-0 bg-black/70 text-white z-20 flex flex-col w-16">
        {/* Logo */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-center">
          <span className="text-2xl font-serif text-amber-500">V</span>
        </div>
        
        {/* Menu Items - in the correct order from main page */}
        <div className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-2 px-2">
            <li>
              <button
                onClick={() => setActiveView('governance')}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'governance' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Governance"
              >
                <FaLandmark className="mx-auto h-5 w-5" />
              </button>
            </li>
            <li>
              <button
                onClick={() => {
                  setActiveView('markets');
                  setMarketPanelVisible(true);
                }}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'markets' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Markets"
              >
                <FaStore className="mx-auto h-5 w-5" />
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('resources')}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'resources' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Resources"
              >
                <FaTree className="mx-auto h-5 w-5" />
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('transport')}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'transport' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Transport"
              >
                <FaRoad className="mx-auto h-5 w-5" />
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('buildings')}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'buildings' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Buildings"
              >
                <FaBuilding className="mx-auto h-5 w-5" />
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('land')}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'land' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Land"
              >
                <FaHome className="mx-auto h-5 w-5" />
              </button>
            </li>
          </ul>
        </div>
        
        {/* Bottom section */}
        <div className="p-4 border-t border-gray-700 text-center">
          <div className="text-xs text-gray-400">v1.0</div>
        </div>
      </div>
      
      {/* Debug overlay - will show even if other components fail */}
      <div className="fixed top-0 left-0 z-50 bg-white p-2 text-xs">
        <button 
          onClick={() => window.location.reload()}
          className="bg-red-500 text-white px-2 py-1 rounded mr-2"
        >
          Reload
        </button>
        <span>Simple Viewer</span>
      </div>
      
      {/* Cache flush button */}
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={flushAllCaches}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg flex items-center"
          title="Clear all caches and reload the page"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          Flush Caches
        </button>
        
        {cacheCleared && (
          <div className="absolute top-0 right-0 mt-[-40px] bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-out">
            Caches cleared!
          </div>
        )}
      </div>
      
      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 bg-black/50 text-white p-4 flex justify-between items-center">
        <Link href="/" className="text-xl font-serif font-bold hover:text-amber-400 transition-colors">
          La Serenissima
        </Link>
        
        <div className="flex space-x-4">
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors font-serif"
          >
            {showInfo ? 'Hide Info' : 'Show Info'}
          </button>
        </div>
      </div>
      
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
      
      
      {/* Information Panel */}
      {showInfo && (
        <div className="absolute top-20 right-4 bg-black/70 text-white p-4 rounded-lg max-w-sm border-2 border-amber-600 shadow-lg">
          <h2 className="text-lg font-serif font-bold mb-2 text-amber-400">About La Serenissima</h2>
          <p className="text-sm mb-3">
            Welcome to a simplified view of La Serenissima, a digital recreation of Renaissance Venice.
            This view shows the basic layout of the city with land and water.
          </p>
          
          <h3 className="text-md font-serif font-bold mb-1 text-amber-400">Legend</h3>
          <div className="flex items-center space-x-2 mb-1">
            <div className="w-4 h-4 bg-amber-500 border border-amber-700"></div>
            <span className="text-sm">Land Parcels</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-blue-500 border border-blue-700"></div>
            <span className="text-sm">Water</span>
          </div>
          
          <div className="mt-4 text-xs text-amber-400">
            Simple Viewer v1.0
          </div>
        </div>
      )}
      
      
    </div>
    
    {/* Transfer Compute Menu */}
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
                        onClick={handleGenerateCoatOfArmsImage}
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
                disabled={(!userProfile && (!usernameInput.trim() || !firstName.trim() || !lastName.trim() || !familyCoatOfArms.trim() || !familyMotto.trim())) ||
                  (userProfile && (!firstName.trim() || !lastName.trim() || !familyCoatOfArms.trim() || !familyMotto.trim()))}
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
    
    {/* Success message alert */}
    {successMessage && (
      <SuccessAlert 
        message={successMessage.message}
        signature={successMessage.signature}
        onClose={() => setSuccessMessage(null)}
      />
    )}
    <style jsx>{`
      @keyframes fadeOut {
        0% { opacity: 1; }
        70% { opacity: 1; }
        100% { opacity: 0; }
      }
      .animate-fade-out {
        animation: fadeOut 3s forwards;
      }
    `}</style>
    </>
  );
  // Add the connectWallet function
  async function connectWallet() {
    console.log("Connecting wallet...");
    if (!walletAdapter) {
      console.log("Wallet adapter not initialized");
      return;
    }
    
    const adapter = walletAdapter;
    
    console.log("Connecting wallet, current state:", adapter.connected ? "connected" : "disconnected");
    
    if (adapter.connected) {
      // If already connected, disconnect
      console.log("Disconnecting wallet...");
      adapter.disconnect().then(() => {
        // Only update state after successful disconnect
        setWalletAddress(null);
        setUserProfile(null); // Also clear the user profile
    
        // Clear wallet from both storages
        clearWalletAddress();
        localStorage.removeItem('userProfile'); // Also clear user profile from storage
      
        // Dispatch a custom event to notify other components
        window.dispatchEvent(new CustomEvent('walletChanged'));
      
        console.log("Wallet disconnected successfully");
      }).catch(error => {
        console.error("Error disconnecting wallet:", error);
        alert(`Failed to disconnect wallet: ${error instanceof Error ? error.message : String(error)}`);
      });
      return;
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
        setWalletAddress(address);
        // Store wallet in both session and local storage
        setWalletAddress(address);
        
        // Store wallet in Airtable and check for username
        const userData = await storeWalletInAirtable(address);
        
        if (userData) {
          // Check if the user has a username
          if (userData.user_name === undefined || userData.user_name === null || userData.user_name === '') {
            // If no username, show the prompt
            setShowUsernamePrompt(true);
          } else {
            // Store the user profile information
            console.log('Setting user profile with data:', userData);
            const userProfile = {
              username: userData.user_name,
              firstName: userData.first_name || userData.user_name.split(' ')[0] || '',
              lastName: userData.last_name || userData.user_name.split(' ').slice(1).join(' ') || '',
              coatOfArmsImage: userData.coat_of_arms_image,
              familyMotto: userData.family_motto,
              computeAmount: userData.compute_amount
            };
            setUserProfile(userProfile);
          }
        }
      }
    } catch (error) {
      console.error('Error connecting to wallet:', error);
      alert(`Failed to connect wallet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }




  // Add the handleTransferCompute function
  async function handleTransferCompute(amount: number) {
    try {
      // Get the wallet address from state or storage
      const currentWalletAddress = walletAddress || getWalletAddress();
      
      if (!currentWalletAddress) {
        alert('Please connect your wallet first');
        return;
      }
      
      const data = await transferCompute(currentWalletAddress, amount);
      
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
        message: `Successfully transferred ${amount.toLocaleString()} $COMPUTE`,
        signature: data.transaction_signature || 'Transaction completed'
      });
      return data;
    } catch (error) {
      console.error('Error transferring compute:', error);
      alert(`Failed to transfer compute: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  // Add the handleWithdrawCompute function
  async function handleWithdrawCompute(amount: number) {
    try {
      // Get the wallet address from state or storage
      const currentWalletAddress = walletAddress || getWalletAddress();
      
      if (!currentWalletAddress) {
        alert('Please connect your wallet first');
        return;
      }
      
      const data = await withdrawCompute(currentWalletAddress, amount);
      
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
    } catch (error) {
      console.error('Error withdrawing compute:', error);
      throw error;
    }
  }
}
