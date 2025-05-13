'use client';

import dynamic from 'next/dynamic';
import { useState, useRef, useEffect, useCallback } from 'react';
import GovernancePanel from '../components/UI/GovernancePanel';
import GuildsPanel from '../components/UI/GuildsPanel';
import TechTree from '../components/Knowledge/TechTree';
import ProjectPresentation from '../components/Knowledge/ProjectPresentation';
import ResourceTree from '../components/Knowledge/ResourceTree';
import KnowledgeRepository from '../components/Knowledge/KnowledgeRepository';
import { StrategiesArticle, BeginnersGuideArticle, EconomicSystemArticle, LandOwnerGuideArticle, DecreesGovernanceArticle, BuildingOwnersGuideArticle, BusinessOwnersGuideArticle, HistoricalAccuracyArticle, VenetianGuildsArticle, GuildLeadershipArticle } from '../components/Articles';
import CitizenDetailsPanel from '../components/UI/CitizenDetailsPanel';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { clearLandOwnershipCaches } from '@/lib/cacheUtils';
import { eventBus, EventTypes } from '@/lib/eventBus';
import PlayerProfile from '../components/UI/PlayerProfile';
import TransferComputeMenu from '../components/UI/TransferComputeMenu';
import WithdrawComputeMenu from '../components/UI/WithdrawComputeMenu';
import SuccessAlert from '../components/UI/SuccessAlert';
import BackgroundMusic from '../components/UI/BackgroundMusic';
import WalletButton from '../components/UI/WalletButton';
import LandPurchaseConfirmation from '../components/UI/LandPurchaseConfirmation';
import BuildingsToolbar from '../components/BuildingsView/BuildingsToolbar';
import BuildingMenu from '../components/PolygonViewer/BuildingMenu';
import { LoanMarketplace, LoanManagementDashboard, LoanApplicationModal } from '../components/Loans';
import Settings from '../components/UI/Settings';
import ResourceDropdowns from '../components/UI/ResourceDropdowns';
import { getBackendBaseUrl } from '@/lib/apiUtils';
import { getWalletAddress } from '@/lib/walletUtils';
import { transferCompute, withdrawCompute } from '@/lib/computeUtils';
import { generateCoatOfArmsImage } from '@/app/utils/coatOfArmsUtils';
import { FaHome, FaBuilding, FaRoad, FaTree, FaStore, FaLandmark, FaBook } from 'react-icons/fa';
import * as THREE from 'three';
import { SceneReadyProvider } from '@/lib/components/SceneReadyProvider';

// Add type declaration for window properties
declare global {
  interface Window {
    _polygonSnapshotCache: { result: any; deps: string | null };
    getCachedSnapshot: <T>(getSnapshotFn: () => T, deps: any[]) => T;
    dispatchEvent(event: Event): boolean;
    __polygonData?: any[];
    __threeContext?: {
      scene?: THREE.Scene;
      camera?: THREE.Camera;
      renderer?: THREE.WebGLRenderer;
      controls?: any;
    };
    __isClientNavigation?: boolean;
    __directNavigation?: boolean;
  }
  
  // Add custom properties to HTMLCanvasElement
  interface HTMLCanvasElement {
    __scene?: THREE.Scene;
    __camera?: THREE.Camera;
    __renderer?: THREE.WebGLRenderer;
  }
}

// Import SimpleViewer with no SSR to avoid hydration issues
const SimpleViewer = dynamic(() => import('../components/PolygonViewer/SimpleViewer'), {
  ssr: false
});

export default function SimplePage() {
  const router = useRouter();
  const pathname = usePathname();
  
  // UI state
  const [showInfo, setShowInfo] = useState(false);
  // Define the view type to ensure consistency with our ActiveViewMode type
  type ViewType = 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';
  const [activeView, setActiveView] = useState<ViewType>('land');
  const [show3DView, setShow3DView] = useState<boolean>(true);
  const [selectedCitizen, setSelectedCitizen] = useState<any>(null);
  
  // Panel visibility state
  const [showGovernancePanel, setShowGovernancePanel] = useState<boolean>(false);
  const [showKnowledgePanel, setShowKnowledgePanel] = useState<boolean>(false);
  const [showLoansPanel, setShowLoansPanel] = useState<boolean>(false);
  const [showGuildsPanel, setShowGuildsPanel] = useState<boolean>(false);
  
  // Update activeView based on current pathname or panel visibility
  useEffect(() => {
    if (pathname === '/governance' || showGovernancePanel) {
      setActiveView('governance');
    } else if (pathname === '/loans' || showLoansPanel) {
      setActiveView('loans');
    } else if (pathname === '/knowledge' || showKnowledgePanel) {
      setActiveView('knowledge');
    } else if (pathname === '/citizens') {
      setActiveView('citizens');
    } else if (pathname === '/guilds' || showGuildsPanel) {
      setActiveView('guilds');
    }
  }, [pathname, showGovernancePanel, showKnowledgePanel, showLoansPanel, showGuildsPanel]);
  
  // Close the guilds panel when switching to a different view
  useEffect(() => {
    if (activeView !== 'guilds' && showGuildsPanel) {
      setShowGuildsPanel(false);
    }
  }, [activeView, showGuildsPanel]);
  
  // Since 'land' is the default view, fetch income data on initial load
  useEffect(() => {
    if (activeView === 'land') {
      console.log('Initial load with land view, fetching income data...');
      
      // Dispatch an event to trigger income data loading
      const fetchIncomeDataEvent = new CustomEvent('fetchIncomeData');
      window.dispatchEvent(fetchIncomeDataEvent);
      
      // Also dispatch an event to ensure income visualization is shown
      const showIncomeVisualizationEvent = new CustomEvent('showIncomeVisualization');
      window.dispatchEvent(showIncomeVisualizationEvent);
    }
  }, []); // Empty dependency array means this runs once on mount
  
  // Listen for events to hide/show 3D view and handle settings changes
  useEffect(() => {
    const handleHide3DView = () => {
      setShow3DView(false);
    };
    
    const handleShow3DView = () => {
      setShow3DView(true);
    };
    
    const handleWaterQualityChanged = (event: CustomEvent) => {
      if (event.detail && event.detail.waterQuality) {
        console.log('Water quality changed to:', event.detail.waterQuality);
        setWaterQuality(event.detail.waterQuality);
        
        // Store the setting in localStorage
        localStorage.setItem('waterQuality', event.detail.waterQuality);
      }
    };
    
    // We'll remove these handlers as they're now handled directly in the Compagno component
    
    const handleBuildingMenuClosed = () => {
      // Reset to buildings view when menu is closed
      setActiveView('buildings');
      // Force show the 3D view
      setShow3DView(true);
      console.log('Received buildingMenuClosed event, setting activeView to buildings');
      
      // Force a re-render
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
      
      // Ensure buildings are visible after menu is closed
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
      }, 500);
    };
    
    const handleShowBuildings = () => {
      console.log('Received showBuildings event');
      // Remove the reference to polygonRendererRef since it doesn't exist in this component
      console.log('Buildings should be visible now');
      
      // Instead, dispatch another event that the PolygonViewer component can listen for
      window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
    };
    
    const handleShowCitizenDetails = (data: any) => {
      console.log('Show citizen details:', data.citizen);
      setSelectedCitizen(data.citizen);
    };
    
    window.addEventListener('hide3DView', handleHide3DView);
    window.addEventListener('show3DView', handleShow3DView);
    window.addEventListener('buildingMenuClosed', handleBuildingMenuClosed);
    window.addEventListener('showBuildings', handleShowBuildings);
    window.addEventListener('waterQualityChanged', handleWaterQualityChanged as EventListener);
    // These event listeners are now handled directly in the Compagno component
    
    // Subscribe to citizen details event
    const subscription = eventBus.subscribe(EventTypes.SHOW_CITIZEN_DETAILS, handleShowCitizenDetails);
    
    // Dispatch showBuildings event immediately if we're in buildings view
    if (activeView === 'buildings') {
      console.log('Currently in buildings view, dispatching showBuildings event immediately');
      window.dispatchEvent(new CustomEvent('showBuildings'));
      
      // Also ensure buildings are visible with debug markers
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
      }, 1000);
    }
    
    return () => {
      window.removeEventListener('hide3DView', handleHide3DView);
      window.removeEventListener('show3DView', handleShow3DView);
      window.removeEventListener('buildingMenuClosed', handleBuildingMenuClosed);
      window.removeEventListener('showBuildings', handleShowBuildings);
      window.removeEventListener('waterQualityChanged', handleWaterQualityChanged as EventListener);
      // These event listeners are now handled directly in the Compagno component
      subscription.unsubscribe();
    };
  }, [activeView]);

  // Ensure buildings are visible on initial load if we're starting in buildings view
  useEffect(() => {
    if (activeView === 'buildings') {
      console.log('Starting in buildings view, dispatching showBuildings event');
      
      // Dispatch events to make buildings visible
      window.dispatchEvent(new CustomEvent('showBuildings'));
      
      // Also ensure buildings are visible with a slight delay to allow for initialization
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
      }, 1000);
    }
  }, []); // Empty dependency array means this runs once on mount

  // Handle URL changes to show appropriate panels
  useEffect(() => {
    // Handle initial URL on page load
    if (pathname === '/governance') {
      setShowGovernancePanel(true);
      setActiveView('governance');
    } else if (pathname === '/loans') {
      setShowLoansPanel(true);
      setActiveView('loans');
    } else if (pathname === '/knowledge') {
      setShowKnowledgePanel(true);
      setActiveView('knowledge');
    } else if (pathname === '/citizens') {
      setActiveView('citizens');
    } else if (pathname === '/guilds') {
      setShowGuildsPanel(true);
      setActiveView('guilds');
    }
    
    // Set up a popstate event listener to handle browser back/forward buttons
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/governance') {
        setShowGovernancePanel(true);
        setShowKnowledgePanel(false);
        setShowLoansPanel(false);
        setShowGuildsPanel(false);
        setActiveView('governance');
      } else if (path === '/loans') {
        setShowGovernancePanel(false);
        setShowKnowledgePanel(false);
        setShowLoansPanel(true);
        setShowGuildsPanel(false);
        setActiveView('loans');
      } else if (path === '/knowledge') {
        setShowGovernancePanel(false);
        setShowKnowledgePanel(true);
        setShowLoansPanel(false);
        setShowGuildsPanel(false);
        setActiveView('knowledge');
      } else if (path === '/citizens') {
        setShowGovernancePanel(false);
        setShowKnowledgePanel(false);
        setShowLoansPanel(false);
        setShowGuildsPanel(false);
        setActiveView('citizens');
      } else if (path === '/guilds') {
        setShowGovernancePanel(false);
        setShowKnowledgePanel(false);
        setShowLoansPanel(false);
        setShowGuildsPanel(true);
        setActiveView('guilds');
      } else if (path === '/') {
        setShowGovernancePanel(false);
        setShowKnowledgePanel(false);
        setShowLoansPanel(false);
        setShowGuildsPanel(false);
        setActiveView('land');
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [pathname]);
  const [qualityMode, setQualityMode] = useState<'high' | 'performance'>('high');
  const [waterQuality, setWaterQuality] = useState<'high' | 'medium' | 'low'>('high');
  const [marketPanelVisible, setMarketPanelVisible] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Sidebar is always compact
  
  // UI state
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [landRendered, setLandRendered] = useState(false);
  const [showLandPurchaseModal, setShowLandPurchaseModal] = useState<boolean>(false);
  const [landPurchaseData, setLandPurchaseData] = useState<{
    landId: string;
    landName?: string;
    transaction: any;
    onComplete?: () => void;
  } | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [governanceTab, setGovernanceTab] = useState<'loans'>('loans');
  const [showLoanApplicationModal, setShowLoanApplicationModal] = useState<boolean>(false);
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showTechTree, setShowTechTree] = useState<boolean>(false);
  const [showPresentation, setShowPresentation] = useState<boolean>(false);
  const [showResourceTree, setShowResourceTree] = useState<boolean>(false);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
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
    
    // Get the current wallet address
    const currentWalletAddress = getWalletAddress();
    
    if (!currentWalletAddress) {
      alert('Wallet connection is required');
      return;
    }
    
    // Update the state
    setWalletAddress(currentWalletAddress);
    
    try {
      // When editing, use the existing username
      const username = userProfile !== null ? userProfile.username : usernameInput.trim();
      
      // If this is a new user (no userProfile), assign a random color from the palette
      // Otherwise, use the selected color
      const userColor = userProfile === null
        ? veniceColorPalette[Math.floor(Math.random() * veniceColorPalette.length)]
        : selectedColor;
      
      console.log('Submitting profile data to backend:', {
        wallet_address: currentWalletAddress,
        user_name: username,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        family_coat_of_arms: familyCoatOfArms.trim(),
        family_motto: familyMotto.trim(),
        coat_of_arms_image: coatOfArmsImage,
        color: userColor
      });
          
      // Update the user record with the username, first name, last name, coat of arms, family motto, and image URL
      const response = await fetch(`${getBackendBaseUrl()}/api/wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: currentWalletAddress,
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
        color: selectedColor,
        walletAddress: currentWalletAddress
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
      
      // Clear coat of arms cache in PolygonRenderer
      if (typeof window !== 'undefined') {
        // Use a custom event to notify PolygonRenderer to clear its caches
        window.dispatchEvent(new CustomEvent('clearPolygonRendererCaches'));
        console.log('Dispatched event to clear PolygonRenderer caches');
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
      
      // Use the username from the form or the existing profile
      const usernameToUse = userProfile ? userProfile.username : usernameInput;
      
      if (!usernameToUse) {
        alert('Please enter a username first');
        return;
      }
      
      const imageUrl = await generateCoatOfArmsImage(familyCoatOfArms, usernameToUse);
        
      // Update state with the local image URL
      setCoatOfArmsImage(imageUrl);
        
    } catch (error) {
      console.error('Error generating coat of arms image:', error);
      alert(`Failed to generate image: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGeneratingImage(false);
    }
  };
  // Load user profile and settings from localStorage on component mount
  useEffect(() => {
    // Try to load the user profile from localStorage
    const savedProfile = localStorage.getItem('userProfile');
    if (savedProfile) {
      try {
        const parsedProfile = JSON.parse(savedProfile);
        setUserProfile(parsedProfile);
        
        // Check if the profile has preferences
        if (parsedProfile.preferences) {
          try {
            // Parse preferences if it's a string
            const preferences = typeof parsedProfile.preferences === 'string' 
              ? JSON.parse(parsedProfile.preferences) 
              : parsedProfile.preferences;
            
            // Load quality settings if they exist
            if (preferences.qualityMode) {
              setQualityMode(preferences.qualityMode);
              localStorage.setItem('qualityMode', preferences.qualityMode);
            }
            
            if (preferences.waterQuality) {
              setWaterQuality(preferences.waterQuality);
              localStorage.setItem('waterQuality', preferences.waterQuality);
            }
          } catch (error) {
            console.error('Error parsing user preferences:', error);
          }
        }
      } catch (error) {
        console.error('Error parsing saved user profile:', error);
      }
    }
    
    // Check if this was a direct navigation
    if (typeof window !== 'undefined' && window.__directNavigation) {
      // Clear the flag
      window.__directNavigation = false;
      
      // Check which panel to open based on the specific flag
      if (window.__knowledgeDirectNavigation) {
        // Clear the knowledge-specific flag
        window.__knowledgeDirectNavigation = false;
        
        // Open the knowledge panel
        setShowKnowledgePanel(true);
        setActiveView('knowledge');
      } else {
        // Open the guilds panel (default behavior)
        setShowGuildsPanel(true);
        setActiveView('guilds');
      }
    }
  }, []);

  // Prefill form fields when editing a profile
  useEffect(() => {
    // When the username prompt is shown and we have a userProfile, prefill the form
    if (showUsernamePrompt && userProfile) {
      // Prefill all form fields with existing user data
      setFirstName(userProfile.firstName || '');
      setLastName(userProfile.lastName || '');
      setFamilyCoatOfArms(userProfile.familyCoatOfArms || '');
      setFamilyMotto(userProfile.familyMotto || '');
      setCoatOfArmsImage(userProfile.coatOfArmsImage || null);
      setSelectedColor(userProfile.color || '#8B4513');
    } else if (showUsernamePrompt && !userProfile) {
      // Clear form fields when creating a new profile
      setUsernameInput('');
      setFirstName('');
      setLastName('');
      setFamilyCoatOfArms('');
      setFamilyMotto('');
      setCoatOfArmsImage(null);
      setSelectedColor('#8B4513'); // Default color
    }
  }, [showUsernamePrompt, userProfile]);

  // Listen for custom events
  useEffect(() => {
    const handleShowTransferMenu = () => setTransferMenuOpen(true);
    const handleShowWithdrawMenu = () => setWithdrawMenuOpen(true);
    const handleShowUsernamePrompt = () => setShowUsernamePrompt(true);
    const handleCloseGuildsPanel = () => setShowGuildsPanel(false);
    
    // Add this handler for the land purchase modal
    const handleShowLandPurchaseModal = (event: CustomEvent) => {
      console.log('Received showLandPurchaseModal event with data:', event.detail);
      setLandPurchaseData(event.detail);
      setShowLandPurchaseModal(true);
    };
    
    // Add handler for loan application modal
    const handleShowLoanApplicationModal = (event: CustomEvent) => {
      console.log('Received showLoanApplicationModal event with data:', event.detail);
      setSelectedLoan(event.detail.loan);
      setShowLoanApplicationModal(true);
    };
    
    window.addEventListener('showTransferMenu', handleShowTransferMenu);
    window.addEventListener('showWithdrawMenu', handleShowWithdrawMenu);
    window.addEventListener('showUsernamePrompt', handleShowUsernamePrompt);
    window.addEventListener('showLandPurchaseModal', handleShowLandPurchaseModal as EventListener);
    window.addEventListener('showLoanApplicationModal', handleShowLoanApplicationModal as EventListener);
    window.addEventListener('closeGuildsPanel', handleCloseGuildsPanel);
    
    return () => {
      window.removeEventListener('showTransferMenu', handleShowTransferMenu);
      window.removeEventListener('showWithdrawMenu', handleShowWithdrawMenu);
      window.removeEventListener('showUsernamePrompt', handleShowUsernamePrompt);
      window.removeEventListener('showLandPurchaseModal', handleShowLandPurchaseModal as EventListener);
      window.removeEventListener('showLoanApplicationModal', handleShowLoanApplicationModal as EventListener);
      window.removeEventListener('closeGuildsPanel', handleCloseGuildsPanel);
    };
  }, []);

  return (
    <>
    <div className="relative w-full h-screen">
      {/* Main 3D Viewer (should be first in the DOM for proper layering) */}
      {show3DView && (
        <SceneReadyProvider>
          <>
            <SimpleViewer 
              qualityMode={qualityMode} 
              waterQuality={waterQuality}
              activeView={activeView as 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance'} 
            />
          </>
        </SceneReadyProvider>
      )}
      
      {/* Buildings Toolbar - only visible in buildings view */}
      {activeView === 'buildings' && (
        <>
          {/* First ensure buildings are visible */}
          <script dangerouslySetInnerHTML={{
            __html: `
              // Force buildings to be visible immediately
              window.dispatchEvent(new CustomEvent('showBuildings'));
              
              // Also ensure buildings are visible with debug markers
              setTimeout(() => {
                console.log('Dispatching ensureBuildingsVisible event from inline script');
                window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
              }, 2000);
            `
          }} />
          
          {/* Then show the toolbar */}
          <BuildingsToolbar 
            polygons={typeof window !== 'undefined' ? window.__polygonData || [] : []}
            onRefreshBuildings={() => {
              // Refresh buildings by dispatching an event
              eventBus.emit(EventTypes.BUILDING_PLACED, { refresh: true });
              
              // Also ensure buildings are visible after refresh
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
              }, 1000);
            }}
          />
          
          {/* Building menu */}
          <BuildingMenu 
            visible={true} 
            onClose={() => {
              // Keep the buildings view active, just close the menu
              setActiveView('buildings');
              // Show the 3D view again
              setShow3DView(true);
              
              // Ensure buildings are visible after closing menu
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
              }, 500);
            }}
            onBuildingSelect={() => {
              // Hide the 3D view when a building is selected
              setShow3DView(false);
            }}
            onBuildingClose={() => {
              // Show the 3D view again when the building detail is closed
              setShow3DView(true);
              
              // Ensure buildings are visible after closing building detail
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
              }, 500);
            }}
          />
        </>
      )}
      
      {/* Governance Panel */}
      {showGovernancePanel && (
        <GovernancePanel 
          onClose={() => {
            setShowGovernancePanel(false);
            setActiveView('land');
            // Update URL without page navigation
            window.history.replaceState(null, '', '/');
            window.__isClientNavigation = true;
          }}
          standalone={false}
        />
      )}
      
      {/* Knowledge Repository Panel */}
      {showKnowledgePanel && (
        <KnowledgeRepository
          onShowTechTree={() => setShowTechTree(true)}
          onShowPresentation={() => setShowPresentation(true)}
          onShowResourceTree={() => setShowResourceTree(true)}
          onSelectArticle={setSelectedArticle}
          onClose={() => {
            setShowKnowledgePanel(false);
            setActiveView('land');
            // Update URL without page navigation
            window.history.replaceState(null, '', '/');
            window.__isClientNavigation = true;
          }}
          standalone={false}
        />
      )}
      
      {/* Loans Panel */}
      {showLoansPanel && (
        <div className="absolute top-20 left-20 right-4 bottom-4 bg-black/30 z-40 rounded-lg p-4 overflow-auto">
          <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-serif text-amber-800">
                Loans & Banking
              </h2>
              <button 
                onClick={() => {
                  setShowLoansPanel(false);
                  setActiveView('land');
                  // Update URL without page navigation
                  window.history.replaceState(null, '', '/');
                  window.__isClientNavigation = true;
                }}
                className="text-amber-600 hover:text-amber-800 p-2"
                aria-label="Return to main view"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-8">
              <LoanMarketplace />
              <LoanManagementDashboard />
            </div>
          </div>
        </div>
      )}
      
      {/* Guilds Panel */}
      {showGuildsPanel && (
        <GuildsPanel 
          onClose={() => {
            setShowGuildsPanel(false);
            setActiveView('land');
            // Update URL without page navigation
            window.history.replaceState(null, '', '/');
            window.__isClientNavigation = true;
          }}
          standalone={false}
        />
      )}
      
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
                onClick={() => {
                  setShowGovernancePanel(true);
                  setShowKnowledgePanel(false);
                  setShowLoansPanel(false);
                  setShowGuildsPanel(false);
                  setActiveView('governance');
                  // Update URL without page navigation using replaceState
                  window.history.replaceState(null, '', '/governance');
                  window.__isClientNavigation = true;
                }}
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
                  setShowGuildsPanel(true);
                  setShowGovernancePanel(false);
                  setShowKnowledgePanel(false);
                  setShowLoansPanel(false);
                  setActiveView('guilds');
                  // Update URL without page navigation using replaceState
                  window.history.replaceState(null, '', '/guilds');
                  window.__isClientNavigation = true;
                }}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'guilds' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Guilds"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                </svg>
              </button>
            </li>
            <li>
              <button
                onClick={() => {
                  setShowGovernancePanel(false);
                  setShowKnowledgePanel(false);
                  setShowLoansPanel(false);
                  setShowGuildsPanel(false);
                  setActiveView('citizens');
                  // Update URL without page navigation using replaceState
                  window.history.replaceState(null, '', '/citizens');
                  window.__isClientNavigation = true;
                }}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'citizens' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Citizens"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </button>
            </li>
            <li>
              <button
                onClick={() => {
                  setShowKnowledgePanel(true);
                  setShowGovernancePanel(false);
                  setShowLoansPanel(false);
                  setShowGuildsPanel(false);
                  setActiveView('knowledge');
                  // Update URL without page navigation using replaceState
                  window.history.replaceState(null, '', '/knowledge');
                  window.__isClientNavigation = true;
                }}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'knowledge' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Knowledge"
              >
                <FaBook className="mx-auto h-5 w-5" />
              </button>
            </li>
            <li>
              <button
                onClick={() => {
                  setShowLoansPanel(true);
                  setShowGovernancePanel(false);
                  setShowKnowledgePanel(false);
                  setShowGuildsPanel(false);
                  setActiveView('loans');
                  // Update URL without page navigation using replaceState
                  window.history.replaceState(null, '', '/loans');
                  window.__isClientNavigation = true;
                }}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'loans' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Loans"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12a8 8 0 01-8 8m0 0a8 8 0 01-8-8m8 8a8 8 0 018-8m-8 0a8 8 0 00-8 8m8-8v14m0-14v14" />
                </svg>
              </button>
            </li>
            <li>
              <button
                onClick={() => {
                  setActiveView('markets');
                  setMarketPanelVisible(true);
                  setShowGuildsPanel(false);
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
                onClick={() => {
                  setActiveView('resources');
                  setShowGuildsPanel(false);
                }}
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
                onClick={() => {
                  setActiveView('transport');
                  setShowGuildsPanel(false);
                }}
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
                onClick={() => {
                  setActiveView('buildings');
                  setShowGuildsPanel(false);
                  // Dispatch an event to refresh buildings
                  eventBus.emit(EventTypes.BUILDING_PLACED, { refresh: true });
                }}
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
                onClick={() => {
                  setActiveView('land');
                  setShowGuildsPanel(false);
                }}
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
        
        {/* Bottom section with version number */}
        <div className="p-4 border-t border-gray-700 text-center">
          <div className="text-xs text-gray-400">La Serenissima v0.2.0</div>
        </div>
      </div>
      
      
      
      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 bg-black/50 text-white p-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <Link href="/" className="text-xl font-serif font-bold hover:text-amber-400 transition-colors">
            La Serenissima
          </Link>
          
          {/* Add the ResourceDropdowns component here */}
          <div className="ml-6">
            <ResourceDropdowns />
          </div>
        </div>
        
        <div className="flex space-x-4">
          <button 
            onClick={() => setShowSettingsModal(true)}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 rounded text-white transition-colors font-serif"
          >
            Settings
          </button>
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors font-serif"
          >
            {showInfo ? 'Hide Info' : 'Show Info'}
          </button>
        </div>
      </div>
      
      {/* Loan Application Modal - will be shown when triggered by event */}
      {showLoanApplicationModal && selectedLoan && (
        <LoanApplicationModal 
          loan={selectedLoan}
          onClose={() => setShowLoanApplicationModal(false)}
        />
      )}
      
      {/* Wallet Button */}
      <WalletButton 
        className="absolute top-4 right-4 z-10" 
        onSettingsClick={() => setShowSettingsModal(true)}
      />
      
      
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
            Simple Viewer v0.2.0
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
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-lg w-[900px] max-w-[95vw] max-h-[90vh] border-4 border-amber-700 flex flex-col md:flex-row overflow-hidden">
          {/* Left side - Form */}
          <div className="md:w-1/2 pr-0 md:pr-6 overflow-y-auto max-h-[80vh] p-6">
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
              
              <div className="flex flex-col space-y-3">
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
                    <div className="flex flex-wrap gap-1">
                      {veniceColorPalette.map((color) => (
                        <button
                          key={color}
                          onClick={() => setSelectedColor(color)}
                          className={`w-6 h-6 rounded-full border-2 ${
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
          <div className="md:w-1/2 mt-6 md:mt-0 flex flex-col items-center overflow-y-auto max-h-[80vh] p-6">
            {/* Coat of Arms Image */}
            <div className="flex-1 flex flex-col items-center justify-center w-full">
              {coatOfArmsImage ? (
                <div className="flex flex-col items-center">
                  <div className="border-8 border-amber-700 rounded-lg shadow-xl p-2 bg-amber-50 flex items-center justify-center">
                    <img 
                      src={coatOfArmsImage} 
                      alt="Family Coat of Arms" 
                      className="w-full h-auto max-h-[300px] object-contain"
                      style={{ maxWidth: "250px" }} // Slightly smaller for better fit
                      onError={(e) => {
                        console.error('Error loading coat of arms image:', coatOfArmsImage);
                        // Add a fallback image or placeholder
                        (e.target as HTMLImageElement).style.display = 'none';
                        // You could also set a fallback image:
                        // (e.target as HTMLImageElement).src = '/images/placeholder.png';
                      }}
                    />
                  </div>
                  <p className="mt-4 text-center italic text-amber-800 font-medium">
                    The Coat of Arms of the House of {lastName || "Your Family"}
                  </p>
                  {/* Add this for debugging */}
                  <p className="text-xs text-gray-500 mt-1">Image path: {coatOfArmsImage}</p>
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
  
      /* Add notification-specific styles */
      .notification-unread {
        border-left: 3px solid #f59e0b;
      }
  
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); }
        100% { transform: scale(1); }
      }
      .animate-pulse {
        animation: pulse 2s infinite;
      }
    `}</style>
      <BackgroundMusic />
      
      <style jsx global>{`
        .overflow-y-auto {
          scrollbar-width: thin;
          scrollbar-color: rgba(217, 119, 6, 0.5) rgba(255, 255, 255, 0.1);
        }
        .overflow-y-auto::-webkit-scrollbar {
          width: 8px;
        }
        .overflow-y-auto::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .overflow-y-auto::-webkit-scrollbar-thumb {
          background-color: rgba(217, 119, 6, 0.5);
          border-radius: 4px;
          border: 2px solid transparent;
        }
        .overflow-y-auto::-webkit-scrollbar-thumb:hover {
          background-color: rgba(217, 119, 6, 0.8);
        }
        
        /* Time description styling */
        .time-description {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-style: italic;
          color: #92400e;
          letter-spacing: 0.02em;
          text-shadow: 0 1px 1px rgba(255, 255, 255, 0.7);
        }
      `}</style>
      
      {/* Settings Modal */}
      {showSettingsModal && (
        <Settings onClose={() => setShowSettingsModal(false)} />
      )}
      
      {/* Tech Tree Modal */}
      {showTechTree && (
        <TechTree onClose={() => setShowTechTree(false)} />
      )}
      
      {/* Project Presentation Modal */}
      {showPresentation && (
        <ProjectPresentation onClose={() => setShowPresentation(false)} />
      )}
      
      {/* Resource Tree Modal */}
      {showResourceTree && (
        <ResourceTree onClose={() => setShowResourceTree(false)} />
      )}
      
      {/* Article Modals */}
      {selectedArticle === "strategies" && (
        <StrategiesArticle onClose={() => setSelectedArticle(null)} />
      )}
      {selectedArticle === "beginners-guide" && (
        <BeginnersGuideArticle onClose={() => setSelectedArticle(null)} />
      )}
      {selectedArticle === "economic-system" && (
        <EconomicSystemArticle onClose={() => setSelectedArticle(null)} />
      )}
      
      {selectedArticle === "landowner-guide" && (
        <LandOwnerGuideArticle onClose={() => setSelectedArticle(null)} />
      )}
      
      {selectedArticle === "decrees-governance" && (
        <DecreesGovernanceArticle onClose={() => setSelectedArticle(null)} />
      )}
      
      {selectedArticle === "building-owners-guide" && (
        <BuildingOwnersGuideArticle onClose={() => setSelectedArticle(null)} />
      )}
      
      {selectedArticle === "business-owners-guide" && (
        <BusinessOwnersGuideArticle onClose={() => setSelectedArticle(null)} />
      )}
      
      {selectedArticle === "historical-accuracy" && (
        <HistoricalAccuracyArticle onClose={() => setSelectedArticle(null)} />
      )}
      
      {selectedArticle === "venetian-guilds" && (
        <VenetianGuildsArticle onClose={() => setSelectedArticle(null)} />
      )}
      
      {selectedArticle === "guild-leadership" && (
        <GuildLeadershipArticle onClose={() => setSelectedArticle(null)} />
      )}
      
      {/* Citizen Details Panel */}
      {selectedCitizen && (
        <CitizenDetailsPanel 
          citizen={selectedCitizen} 
          onClose={() => setSelectedCitizen(null)} 
        />
      )}
      
      {/* Land Purchase Confirmation Modal */}
      {showLandPurchaseModal && landPurchaseData && (
        <LandPurchaseConfirmation
          landId={landPurchaseData.landId}
          landName={landPurchaseData.landName}
          price={landPurchaseData.transaction.price}
          onConfirm={async () => {
            try {
              // Get the current wallet address
              const walletAddress = getWalletAddress();
              
              if (!walletAddress) {
                alert('Please connect your wallet first');
                return;
              }
              
              // Execute the transaction
              const response = await fetch(`${getBackendBaseUrl()}/api/transaction/${landPurchaseData.transaction.id}/execute`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  buyer: walletAddress
                }),
              });
              
              if (!response.ok) {
                throw new Error(`Failed to execute transaction: ${response.status} ${response.statusText}`);
              }
              
              const data = await response.json();
              
              // Show success message
              setSuccessMessage({
                message: `Successfully purchased ${landPurchaseData.landName || 'land'} for ${landPurchaseData.transaction.price.toLocaleString()} $COMPUTE`,
                signature: 'Transaction completed'
              });
              
              // Clear caches to ensure UI updates
              clearLandOwnershipCaches();
              
              // Dispatch events to update UI
              console.log('Dispatching events to update UI after land purchase');
              
              // Use both the event bus and custom events for maximum compatibility
              eventBus.emit(EventTypes.LAND_OWNERSHIP_CHANGED, {
                landId: landPurchaseData.landId,
                newOwner: walletAddress,
                previousOwner: landPurchaseData.transaction.seller,
                timestamp: Date.now()
              });
              
              window.dispatchEvent(new CustomEvent('landOwnershipChanged', {
                detail: {
                  landId: landPurchaseData.landId,
                  newOwner: walletAddress,
                  previousOwner: landPurchaseData.transaction.seller
                }
              }));
              
              // Force polygon renderer to update owner colors
              eventBus.emit(EventTypes.POLYGON_OWNER_UPDATED, {
                polygonId: landPurchaseData.landId,
                owner: walletAddress
              });
              
              // Keep land details panel open
              eventBus.emit(EventTypes.KEEP_LAND_DETAILS_PANEL_OPEN, {
                polygonId: landPurchaseData.landId
              });
              
              // Call the onComplete callback if provided
              if (landPurchaseData.onComplete) {
                landPurchaseData.onComplete();
              }
              
              // Close the modal
              setShowLandPurchaseModal(false);
            } catch (error) {
              console.error('Error executing transaction:', error);
              alert(`Failed to complete purchase: ${error instanceof Error ? error.message : String(error)}`);
            }
          }}
          onCancel={() => {
            setShowLandPurchaseModal(false);
          }}
          isLoading={false}
        />
      )}
    </>
  );




  // Add the handleTransferCompute function
  async function handleTransferCompute(amount: number) {
    try {
      // Get the wallet address from storage
      const currentWalletAddress = getWalletAddress();
      
      if (!currentWalletAddress) {
        alert('Please connect your wallet first');
        return;
      }
      
      const data = await transferCompute(currentWalletAddress, amount);
      
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
      // Get the wallet address from storage
      const currentWalletAddress = getWalletAddress();
      
      if (!currentWalletAddress) {
        alert('Please connect your wallet first');
        return;
      }
      
      const data = await withdrawCompute(currentWalletAddress, amount);
      return data;
    } catch (error) {
      console.error('Error withdrawing compute:', error);
      throw error;
    }
  }
}
