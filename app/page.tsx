'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation'; // useRouter est déjà importé
import Link from 'next/link';
import { FaHome, FaBuilding, FaRoad, FaTree, FaStore, FaLandmark, FaBook, FaTimes } from 'react-icons/fa';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { transportService } from '@/lib/services/TransportService'; 
import WalletButton from '@/components/UI/WalletButton';
import ResourceDropdowns from '@/components/UI/ResourceDropdowns';
import Settings from '@/components/UI/Settings';
import GovernancePanel from '@/components/UI/GovernancePanel';
import GuildsPanel from '@/components/UI/GuildsPanel';
import KnowledgeRepository from '@/components/Knowledge/KnowledgeRepository';
import TechTree from '@/components/Knowledge/TechTree'; // Importer TechTree
import CitizenRegistry from '@/components/UI/CitizenRegistry'; // Import CitizenRegistry
// import LoanMarketplace from '@/components/Loans/LoanMarketplace'; // Déplacé vers LoanPanel
// import LoanManagementDashboard from '@/components/Loans/LoanManagementDashboard'; // Déplacé vers LoanPanel
import LoanPanel from '@/components/Loans/LoanPanel'; // Importer le nouveau LoanPanel
import CitizenDetailsPanel from '@/components/UI/CitizenDetailsPanel'; // Import CitizenDetailsPanel
import TransferComputeMenu from '@/components/UI/TransferComputeMenu'; // Importer TransferComputeMenu
import ProfileEditor from '@/components/UI/ProfileEditor'; // Importer ProfileEditor
// import InitialLoadingScreen from '@/components/UI/InitialLoadingScreen'; // Import InitialLoadingScreen - Supprimé
import DailyUpdatePanel from '@/components/UI/DailyUpdatePanel';
import BackgroundMusic from '@/components/UI/BackgroundMusic';
import { ambientAudioManager } from '@/lib/services/AmbientAudioManager';
import { weatherService } from '@/lib/services/WeatherService'; // Import WeatherService
import WeatherTimeDisplay from '@/components/UI/WeatherTimeDisplay'; // Import WeatherTimeDisplay
import { 
  StrategiesArticle, 
  BeginnersGuideArticle, 
  EconomicSystemArticle,
  LandOwnerGuideArticle,
  DecreesGovernanceArticle,
  BuildingOwnersGuideArticle,
  BusinessOwnersGuideArticle,
  HistoricalAccuracyArticle,
  VenetianGuildsArticle,
  GuildLeadershipArticle,
  UnifiedCitizenModelArticle,
  CitizenActivitiesAndNeedsArticle // Import the new article
} from '@/components/Articles';
import { transferCompute } from '@/lib/utils/computeUtils'; // Importer transferCompute
import { useWalletContext } from '@/components/UI/WalletProvider'; // Importer useWalletContext
// LandDetailsPanel est déjà dans components/PolygonViewer, pas besoin d'importer ici s'il est utilisé par IsometricViewer
import { FaSyncAlt } from 'react-icons/fa'; // Pour l'icône du bouton

// Declare global window type
declare global {
  interface Window {
    landDragUpdateTimeout: NodeJS.Timeout | null;
    currentScale: number;
  }
}

// Import the 2D viewer component with no SSR
const IsometricViewer = dynamic(() => import('@/components/PolygonViewer/IsometricViewer'), {
  ssr: false
});

type AppStatus = 'loading' | 'dailyUpdate' | 'ready'; // 'loading' might be vestigial

// Helper function to determine the most recent 9:30 AM reset time
const getMostRecentResetTime = (): Date => {
  const now = new Date();
  const todayResetTime = new Date(now);
  todayResetTime.setHours(9, 30, 0, 0); // Set to 9:30:00.000 today

  if (now < todayResetTime) {
    // If current time is before 9:30 AM today, the relevant reset was yesterday 9:30 AM
    const yesterdayResetTime = new Date(now);
    yesterdayResetTime.setDate(now.getDate() - 1);
    yesterdayResetTime.setHours(9, 30, 0, 0);
    return yesterdayResetTime;
  }
  // Otherwise, the relevant reset time is today 9:30 AM
  return todayResetTime;
};

// Helper function to determine initial application status based on Daily Update visibility
const determineInitialAppStatus = (): AppStatus => {
  if (typeof window === 'undefined') {
    // Default for SSR or if window object is not available yet
    return 'dailyUpdate'; 
  }
  try {
    const lastShownString = localStorage.getItem('dailyUpdateLastShownTimestamp');
    if (!lastShownString) {
      // Never shown before or localStorage was cleared
      return 'dailyUpdate'; 
    }
    
    const lastShownTimestamp = parseInt(lastShownString, 10);
    if (isNaN(lastShownTimestamp)) {
      // Invalid timestamp in localStorage
      console.warn('Invalid dailyUpdateLastShownTimestamp in localStorage. Clearing it.');
      localStorage.removeItem('dailyUpdateLastShownTimestamp'); // Clean up invalid entry
      return 'dailyUpdate';
    }

    const mostRecentReset = getMostRecentResetTime().getTime();

    if (lastShownTimestamp < mostRecentReset) {
      // Last shown before the most recent reset time
      return 'dailyUpdate'; 
    }
    // Shown after the most recent reset time, so skip daily update
    return 'ready'; 
  } catch (e) {
    console.error("Error accessing localStorage for daily update status:", e);
    // Fallback in case of any error (e.g., localStorage disabled)
    return 'dailyUpdate'; 
  }
};

export default function TwoDPage() {
  const router = useRouter();
  
  // UI state
  // Always start with 'dailyUpdate' to match server render for initial hydration.
  // Client-side useEffect will then determine if it should transition to 'ready'.
  const [appStatus, setAppStatus] = useState<AppStatus>('dailyUpdate');
  const [showInfo, setShowInfo] = useState(false);
  type ViewType = 'buildings' | 'land' | 'transport' | 'resources' | 'contracts' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';
  const [activeView, setActiveView] = useState<ViewType>('buildings');

  // Cache constants and helpers for loading images (moved before initialLoadingImage)
  const LOADING_IMAGE_CACHE_KEY = 'loadingScreenImageCache';
  const LOADING_IMAGE_CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  interface LoadingImageCacheItem {
    src: string;
    timestamp: number;
    failed?: boolean;
    lastAttempt?: number;
  }
  type LoadingImageCache = Record<string, LoadingImageCacheItem>; // Keyed by image filename

  // Helper to get loading image cache
  const getLoadingImageCache = (): LoadingImageCache => {
    if (typeof window === 'undefined') return {};
    try {
      const cached = localStorage.getItem(LOADING_IMAGE_CACHE_KEY);
      return cached ? JSON.parse(cached) : {};
    } catch (e) {
      console.error("Error reading loading image cache:", e);
      return {};
    }
  };

  // Helper to set loading image cache
  const setLoadingImageCache = (cache: LoadingImageCache) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LOADING_IMAGE_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
      console.error("Error writing loading image cache:", e);
    }
  };

  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showGovernancePanel, setShowGovernancePanel] = useState<boolean>(false);
  const [showGuildsPanel, setShowGuildsPanel] = useState<boolean>(false);
  // Initialize currentLoadingImage to null for deterministic SSR
  const [currentLoadingImage, setCurrentLoadingImage] = useState<string | null>(null);
  const [currentLoadingTip, setCurrentLoadingTip] = useState<string>('');
  const [showKnowledgePanel, setShowKnowledgePanel] = useState<boolean>(false);
  const [showTechTreePanel, setShowTechTreePanel] = useState<boolean>(false); // État pour TechTree
  const [showCitizenRegistry, setShowCitizenRegistry] = useState<boolean>(false); // State for CitizenRegistry
  const [showTransferMenu, setShowTransferMenu] = useState<boolean>(false); // State for TransferComputeMenu
  const [showProfileEditor, setShowProfileEditor] = useState<boolean>(false); // State for ProfileEditor
  // const [showEnterVeniceButton, setShowEnterVeniceButton] = useState<boolean>(false); // Supprimé
  const [transportMode, setTransportMode] = useState<boolean>(false);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);

  // State for CitizenDetailsPanel opened from non-map contexts
  const [showCitizenDetailsPanelDirect, setShowCitizenDetailsPanelDirect] = useState<boolean>(false);
  const [citizenForPanelDirect, setCitizenForPanelDirect] = useState<any | null>(null);

  // State to control visibility of main panels after daily update
  // Start with false, will be set to true when appStatus becomes 'ready'.
  const [canShowMainPanels, setCanShowMainPanels] = useState<boolean>(false);

  // State for user login status
  const [isUserLoggedIn, setIsUserLoggedIn] = useState<boolean>(false);
  const [loginStatusChecked, setLoginStatusChecked] = useState<boolean>(false);
  const [currentUserUsername, setCurrentUserUsername] = useState<string | null>(null); // Pour stocker le nom d'utilisateur
  const [isAmbientAudioInitialized, setIsAmbientAudioInitialized] = useState(false);
  const { walletAddress, citizenProfile, updateCitizenProfile } = useWalletContext(); // Obtenir les données du contexte du portefeuille

  const handleFlushCaches = async () => {
    console.log("Attempting to flush all client-side caches...");

    // 1. Clear localStorage
    try {
      localStorage.clear();
      console.log("localStorage cleared.");
    } catch (e) {
      console.error("Error clearing localStorage:", e);
    }

    // 2. Clear sessionStorage
    try {
      sessionStorage.clear();
      console.log("sessionStorage cleared.");
    } catch (e) {
      console.error("Error clearing sessionStorage:", e);
    }

    // 3. Clear Service Worker caches (if any)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          console.log("ServiceWorker unregistered:", registration);
        }
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
        console.log("All ServiceWorker caches deleted.");
      } catch (e) {
        console.error("Error clearing ServiceWorker caches:", e);
      }
    } else {
      console.log("No active ServiceWorker found to clear caches from.");
    }
    
    // 4. Force a hard reload
    console.log("Forcing a hard reload of the page.");
    window.location.reload();
  };

  // const handleLoadingComplete = () => { // Supprimé car InitialLoadingScreen est retiré
  //   console.log('InitialLoadingScreen complete, showing Daily Update panel.');
  //   setAppStatus('dailyUpdate');
  // };

  const handleDailyUpdateClose = useCallback(() => {
    console.log('Daily Update panel closed, setting timestamp and emitting event.');
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('dailyUpdateLastShownTimestamp', Date.now().toString());
      } catch (e) {
        console.error("Error writing dailyUpdateLastShownTimestamp to localStorage:", e);
      }
    }
    eventBus.emit(EventTypes.DAILY_UPDATE_PANEL_CLOSED);
    // setAppStatus('ready') and setCanShowMainPanels(true) are handled by the event listener for DAILY_UPDATE_PANEL_CLOSED
  }, []);

  const handleDirectCitizenPanelClose = useCallback(() => {
    setShowCitizenDetailsPanelDirect(false);
    setCitizenForPanelDirect(null);
  }, []);

  // Effect for initial loading image (runs once)
  useEffect(() => {
    // Define loading images
    let loadingImageFiles = [
      'renaissance-architectural-construction.png',
      'renaissance-venetian-merchant-s-ledger.png',
      'secretive-venetian-council-of-ten-meeting.png',
      '1.png', '2.png', '3.png', '4.png', '5.png', '6.png', '7.png', '8.png', '9.png', '10.png', '11.png'
    ];

    // Shuffle the loadingImageFiles array (Fisher-Yates shuffle)
    for (let i = loadingImageFiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [loadingImageFiles[i], loadingImageFiles[j]] = [loadingImageFiles[j], loadingImageFiles[i]];
    }

    const selectInitialLoadingImage = () => {
      if (loadingImageFiles.length === 0) return null;
      const cache = getLoadingImageCache();
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      const viableImageFiles = loadingImageFiles.filter(fileName => {
        const cacheEntry = cache[fileName];
        return !(cacheEntry?.failed && cacheEntry.lastAttempt && (now - cacheEntry.lastAttempt < oneDayMs));
      });

      let selectedFileName: string;
      if (viableImageFiles.length > 0) {
        selectedFileName = viableImageFiles[Math.floor(Math.random() * viableImageFiles.length)];
        console.log("App Page: Selected a viable loading image (client-side):", selectedFileName);
      } else {
        selectedFileName = loadingImageFiles[Math.floor(Math.random() * loadingImageFiles.length)];
        console.log("App Page: All images failed recently, retrying a random one (client-side):", selectedFileName);
      }
      return `https://backend.serenissima.ai/public_assets/images/loading/${selectedFileName}`;
    };
    setCurrentLoadingImage(selectInitialLoadingImage());
  }, []); // Empty dependency array ensures this runs only once on mount

  // Effect to determine client-side initial status and manage ambient audio
  useEffect(() => {
    // Determine app status
    const clientDeterminedStatus = determineInitialAppStatus();
    // Only call handleDailyUpdateClose if appStatus is currently 'dailyUpdate' AND clientDeterminedStatus IS 'ready'
    if (appStatus === 'dailyUpdate' && clientDeterminedStatus === 'ready') {
      console.log("Client-side check: Daily update already shown or not needed. Transitioning to ready state via handleDailyUpdateClose.");
      handleDailyUpdateClose();
    }
    // If clientDeterminedStatus is 'dailyUpdate', no action is needed here,
    // as the state is already 'dailyUpdate'. The DailyUpdatePanel will show.

    // Initialize Ambient Audio Manager
    const initAmbientAudio = async () => {
      if (!isAmbientAudioInitialized) {
        console.log('Attempting to initialize AmbientAudioManager...');
        const success = await ambientAudioManager.initialize();
        if (success) {
          setIsAmbientAudioInitialized(true);
          console.log('AmbientAudioManager initialized by app/page.tsx.');
          if (appStatus === 'ready') { // Start playing if app is already ready
            ambientAudioManager.start();
          }
        } else {
          console.warn('AmbientAudioManager failed to initialize on page load.');
        }
      }
    };

    const handleFirstInteraction = async () => {
      await initAmbientAudio();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('click', handleFirstInteraction, { once: true });
      window.addEventListener('keydown', handleFirstInteraction, { once: true });
    }
    initAmbientAudio(); // Attempt immediate initialization

    // Initialize WeatherService
    weatherService.initialize().then(() => {
      console.log('WeatherService initialized by app/page.tsx.');
    }).catch(error => {
      console.error('Failed to initialize WeatherService from app/page.tsx:', error);
    });

  }, [appStatus, isAmbientAudioInitialized, handleDailyUpdateClose]); // Dependencies for app status and audio logic

  // State for path statistics
  const [pathStats, setPathStats] = useState<{
    totalDistance: number;
    walkingDistance: number;
    waterDistance: number;
    estimatedTimeMinutes: number;
    transportCost: number;
  } | null>(null);

  // Helper function to calculate distance between two points
  const calculateDistance = useCallback((point1: {lat: number, lng: number}, point2: {lat: number, lng: number}): number => {
    const R = 6371000; // Earth radius in meters
    const lat1 = point1.lat * Math.PI / 180;
    const lat2 = point2.lat * Math.PI / 180;
    const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
    const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }, []); // Empty dependency array as it has no external dependencies from component scope
  
  // Data state
  const [polygons, setPolygons] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [transportPath, setTransportPath] = useState<any[]>([]); // Re-add transportPath state
  const [emptyBuildingPoints, setEmptyBuildingPoints] = useState<{lat: number, lng: number}[]>([]);
  const [fullWaterGraphData, setFullWaterGraphData] = useState<{ waterPoints: any[] } | null>(null); // Add state for water graph
  
  // Handle settings modal
  const handleSettingsClose = () => {
    setShowSettings(false);
  };
  
  // Handle panel closings
  const handleGovernancePanelClose = () => {
    setShowGovernancePanel(false);
    // Reset the active view to buildings when closing the panel
    setActiveView('buildings');
  };
  
  const handleGuildsPanelClose = () => {
    setShowGuildsPanel(false);
    // Reset the active view to buildings when closing the panel
    setActiveView('buildings');
  };
  
  const handleKnowledgePanelClose = () => {
    setShowKnowledgePanel(false);
    setSelectedArticle(null); // Clear any selected article
    // Reset the active view to buildings when closing the panel
    setActiveView('buildings');
  };

  const handleCitizenRegistryClose = () => {
    setShowCitizenRegistry(false);
    // Reset the active view to buildings when closing the panel
    setActiveView('buildings');
  };
  
  const handleSelectArticle = (article: string) => {
    console.log(`Selected article: ${article}`);
    setSelectedArticle(article);
    // Hide the knowledge panel when an article is selected
    setShowKnowledgePanel(false);
  };

  const handleCloseArticle = () => {
    setSelectedArticle(null);
    // Show the knowledge panel again when the article is closed
    setShowKnowledgePanel(true);
  };
  
  // Knowledge panel functions
  const handleShowTechTree = () => {
    console.log('Showing tech tree');
    setShowKnowledgePanel(false); // Cacher le KnowledgeRepository
    setShowTechTreePanel(true); // Afficher le TechTree
  };
  
  const handleShowPresentation = () => {
    console.log('Showing presentation');
    // Implement presentation display logic
  };
  
  const handleShowResourceTree = () => {
    console.log('Showing resource tree');
    // Implement resource tree display logic
  };
  
  // Load polygons and buildings data
  useEffect(() => {
    // Add a flag to track if the component is still mounted
    let isMounted = true;
    
    // Fetch polygons with better error handling
    const fetchPolygons = async () => {
      try {
        console.log('Fetching polygons from API...');
        
        // Add a timeout to the fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch('/api/get-polygons', {
          signal: controller.signal
        }).catch(error => {
          console.error('Fetch error:', error);
          return null;
        });
        
        clearTimeout(timeoutId);
        
        // Check if component is still mounted before updating state
        if (!isMounted) return;
        
        if (!response || !response.ok) {
          console.error(`Failed to fetch polygons: ${response?.status} ${response?.statusText}`);
          
          // Try to use cached polygon data if available
          if (typeof window !== 'undefined' && (window as any).__polygonData) {
            console.log('Using cached polygon data from window.__polygonData');
            const cachedPolygons = (window as any).__polygonData;
            setPolygons(cachedPolygons);
            
            // Initialize the transport service with the cached polygon data
            try {
              const success = transportService.setPolygonsData(cachedPolygons);
              console.log(`Transport service initialization with cached data ${success ? 'succeeded' : 'failed'}`);
            } catch (error) {
              console.error('Error initializing transport service with cached data:', error);
            }
          }
          
          return;
        }
        
        const data = await response.json().catch(error => {
          console.error('JSON parsing error:', error);
          return null;
        });
        
        if (!data) {
          console.error('Failed to parse JSON response');
          return;
        }
        
        if (data.polygons) {
          console.log(`Successfully fetched ${data.polygons.length} polygons`);
          setPolygons(data.polygons);
          
          // Store in window for other components
          if (typeof window !== 'undefined') {
            (window as any).__polygonData = data.polygons;
            
            // Initialize the transport service with the polygon data
            console.log(`Setting ${data.polygons.length} polygons to transport service`);
            try {
              const success = transportService.setPolygonsData(data.polygons);
              console.log(`Transport service initialization ${success ? 'succeeded' : 'failed'}`);
            } catch (error) {
              console.error('Error initializing transport service:', error);
            }
          }
        } else {
          console.error('No polygons found in API response');
        }
      } catch (error) {
        // Check if component is still mounted before updating state
        if (!isMounted) return;
        
        console.error('Error loading polygons:', error);
      }
    };
    
    // Fetch buildings with better error handling
    const fetchBuildings = async () => {
      try {
        console.log('Fetching buildings from API...');
        
        // Add a timeout to the fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const response = await fetch('/api/buildings', {
          signal: controller.signal
        }).catch(error => {
          console.error('Fetch error:', error);
          return null;
        });
        
        clearTimeout(timeoutId);
        
        // Check if component is still mounted before updating state
        if (!isMounted) return;
        
        if (!response || !response.ok) {
          console.error(`Failed to fetch buildings: ${response?.status} ${response?.statusText}`);
          return;
        }
        
        const data = await response.json().catch(error => {
          console.error('JSON parsing error:', error);
          return null;
        });
        
        if (!data) {
          console.error('Failed to parse JSON response');
          return;
        }
        
        if (data.buildings) {
          console.log(`Successfully fetched ${data.buildings.length} buildings`);
          setBuildings(data.buildings);
        } else {
          console.error('No buildings found in API response');
        }
      } catch (error) {
        // Check if component is still mounted before updating state
        if (!isMounted) return;
        
        console.error('Error loading buildings:', error);
      }
    };
    
    // Fetch building types
    const fetchBuildingTypes = async () => {
      try {
        console.log('Fetching building types from API...');
        
        // Add a timeout to the fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch('/api/building-types', {
          signal: controller.signal
        }).catch(error => {
          console.error('Fetch error:', error);
          return null;
        });
        
        clearTimeout(timeoutId);
        
        // Check if component is still mounted before updating state
        if (!isMounted) return;
        
        if (!response || !response.ok) {
          console.error(`Failed to fetch building types: ${response?.status} ${response?.statusText}`);
          return;
        }
        
        const data = await response.json().catch(error => {
          console.error('JSON parsing error:', error);
          return null;
        });
        
        if (!data) {
          console.error('Failed to parse JSON response');
          return;
        }
        
        if (data.buildingTypes) {
          console.log(`Successfully fetched ${data.buildingTypes.length} building types`);
          
          // Store in window for other components
          if (typeof window !== 'undefined') {
            (window as any).__buildingTypes = data.buildingTypes;
          }
        } else {
          console.error('No building types found in API response');
        }
      } catch (error) {
        // Check if component is still mounted before updating state
        if (!isMounted) return;
        
        console.error('Error loading building types:', error);
      }
    };
    
    // Execute the fetch functions
    fetchPolygons();
    fetchBuildings();
    fetchBuildingTypes();
    
    // Initialize the transport service with retry logic
    const initializeTransportService = async () => {
      try {
        console.log('Initializing transport service...');
        
        // First check if we have polygon data in window.__polygonData
        if (typeof window !== 'undefined' && (window as any).__polygonData) {
          const windowPolygons = (window as any).__polygonData;
          if (Array.isArray(windowPolygons) && windowPolygons.length > 0) {
            console.log(`Found ${windowPolygons.length} polygons in window.__polygonData, using for transport service`);
            const success = transportService.setPolygonsData(windowPolygons);
            if (success) {
              console.log('Successfully initialized transport service with window.__polygonData');
              return;
            }
          }
        }
        
        // If no window data or initialization failed, try preloading
        const success = await transportService.preloadPolygons();
        console.log(`Transport service initialization ${success ? 'succeeded' : 'failed'}`);
      } catch (error) {
        console.error('Error initializing transport service:', error);
      }
    };
    
    // Initialize transport service after a short delay to allow polygon data to load
    const initTimeout = setTimeout(() => {
      initializeTransportService();
    }, 1000);

    // Load full water graph data
    const loadFullGraph = async () => {
      // Ensure transportService is initialized (it loads waterGraph internally)
      // This might be slightly redundant if initializeTransportService also calls preloadPolygons,
      // but it's safer to ensure it's ready before trying to get data.
      if (!transportService.isPolygonsLoaded()) {
        console.log("Page: transportService polygons not loaded, preloading for water graph...");
        await transportService.preloadPolygons();
      }
      const graphData = transportService.getWaterGraphData();
      if (graphData) {
        setFullWaterGraphData(graphData);
        console.log(`Page: Loaded full water graph with ${graphData.waterPoints.length} points from TransportService.`);
      } else {
        console.warn("Page: Could not retrieve full water graph data from TransportService. Attempting direct API fetch.");
        try {
          const response = await fetch('/api/water-points');
          if (response.ok) {
            const apiData = await response.json();
            if (apiData.success && apiData.waterPoints) {
              setFullWaterGraphData({ waterPoints: apiData.waterPoints });
              console.log(`Page: Loaded full water graph directly from API with ${apiData.waterPoints.length} points.`);
            } else {
              console.error("Page: Failed to load water graph from API fallback:", apiData.error || "Unknown API error");
            }
          } else {
            console.error("Page: API fallback for water graph failed with status:", response.status);
          }
        } catch (apiError) {
          console.error("Page: Error during API fallback for water graph:", apiError);
        }
      }
    };
    loadFullGraph();
    
    // Clean up function
    return () => {
      isMounted = false;
      clearTimeout(initTimeout);
    };
  }, []);

  // Initial dispatch of ensureBuildingsVisible event - only runs once on mount
  useEffect(() => {
    console.log('Initial page load, ensuring buildings are always visible...');
    
    // Dispatch an event to ensure buildings are visible regardless of view
    window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
  }, []); // Empty dependency array means this runs only once on mount
  
  // Fetch land groups data
  const fetchLandGroups = useCallback(async () => {
    try {
      console.log('Fetching land groups data from TwoDPage...');
      const response = await fetch('/api/land-groups?includeUnconnected=true&minSize=1');
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.landGroups) {
          console.log(`TwoDPage: Loaded ${data.landGroups.length} land groups`);
        }
      }
    } catch (error) {
      console.error('Error fetching land groups from TwoDPage:', error);
    }
  }, []);

  // Update view when activeView changes
  useEffect(() => {
    console.log(`View changed to: ${activeView}`);
    
    // Dispatch a viewChanged event to notify other components
    window.dispatchEvent(new CustomEvent('viewChanged', { 
      detail: { view: activeView }
    }));
    
    // Auto-activate transport mode when switching to transport view
    if (activeView === 'transport') {
      console.log('Automatically activating transport mode');
      setTransportMode(true);
      
      // Also notify the transport service
      try {
        transportService.setTransportMode(true);
      } catch (error) {
        console.error('Error setting transport mode:', error);
      }
      
      // Fetch land groups when switching to transport view
      fetchLandGroups();
    } else if (transportMode) {
      // Deactivate transport mode when switching away
      console.log('Deactivating transport mode when leaving transport view');
      setTransportMode(false);
      
      // Also notify the transport service
      try {
        transportService.setTransportMode(false);
      } catch (error) {
        console.error('Error setting transport mode:', error);
      }
    }
    
    // Dispatch additional events for specific views
    if (activeView === 'land') {
      window.dispatchEvent(new CustomEvent('fetchIncomeData'));
      window.dispatchEvent(new CustomEvent('showIncomeVisualization'));
    } else if (activeView === 'citizens') {
      window.dispatchEvent(new CustomEvent('loadCitizens'));
    }
    
    // Define event handlers
    const handleOpenGovernancePanel = () => setShowGovernancePanel(true);
    const handleOpenGuildsPanel = () => setShowGuildsPanel(true);
    const handleOpenKnowledgePanel = () => setShowKnowledgePanel(true);
    const handleOpenCitizenRegistry = () => setShowCitizenRegistry(true); // Handler to open CitizenRegistry
    const handleOpenLoanPanel = () => setShowLoanPanel(true);
    const handleShowTransportDebug = () => setShowTransportDebugPanel(true);
    
    // Event handlers for closing panels
    const handleCloseGovernancePanel = () => setShowGovernancePanel(false);
    const handleCloseGuildsPanel = () => setShowGuildsPanel(false);
    const handleCloseKnowledgePanel = () => setShowKnowledgePanel(false);
    const handleCloseLoanPanel = () => setShowLoanPanel(false);
    
    // Event handler for loading loans
    const handleLoadLoans = () => {
      console.log("Loading loans data...");
      // This event will be caught by the loan components
      window.dispatchEvent(new CustomEvent('refreshLoans'));
    };
    
    // Add event listeners
    window.addEventListener('openGovernancePanel', handleOpenGovernancePanel);
    window.addEventListener('openGuildsPanel', handleOpenGuildsPanel);
    window.addEventListener('openKnowledgePanel', handleOpenKnowledgePanel);
    window.addEventListener('openCitizenRegistry', handleOpenCitizenRegistry); // Listen for openCitizenRegistry
    window.addEventListener('openLoanPanel', handleOpenLoanPanel);
    window.addEventListener('showTransportDebug', handleShowTransportDebug);
    window.addEventListener('closeGovernancePanel', handleCloseGovernancePanel);
    window.addEventListener('closeGuildsPanel', handleCloseGuildsPanel);
    window.addEventListener('closeKnowledgePanel', handleCloseKnowledgePanel);
    window.addEventListener('closeLoanPanel', handleCloseLoanPanel);
    window.addEventListener('loadLoans', handleLoadLoans);
    
    // Clean up event listeners
    return () => {
      window.removeEventListener('openGovernancePanel', handleOpenGovernancePanel);
      window.removeEventListener('openGuildsPanel', handleOpenGuildsPanel);
      window.removeEventListener('openKnowledgePanel', handleOpenKnowledgePanel);
      window.removeEventListener('openCitizenRegistry', handleOpenCitizenRegistry); // Remove listener
      window.removeEventListener('openLoanPanel', handleOpenLoanPanel);
      window.removeEventListener('showTransportDebug', handleShowTransportDebug);
      window.removeEventListener('closeGovernancePanel', handleCloseGovernancePanel);
      window.removeEventListener('closeGuildsPanel', handleCloseGuildsPanel);
      window.removeEventListener('closeKnowledgePanel', handleCloseKnowledgePanel);
      window.removeEventListener('closeLoanPanel', handleCloseLoanPanel);
      window.removeEventListener('loadLoans', handleLoadLoans);
    };
  }, [activeView, transportMode, fetchLandGroups]); // Added fetchLandGroups to dependency array as it's a useCallback
  
  // Event listener for showing CitizenDetailsPanel directly
  useEffect(() => {
    const handleShowCitizenPanel = (eventData: any) => { // eventData peut être l'objet citoyen ou un objet { citizen: ... }
      const citizenProfile = eventData.citizen || eventData; // Gérer les deux formats
      console.log('Received showCitizenPanelEvent, citizen profile:', citizenProfile);
      setCitizenForPanelDirect(citizenProfile);
      setShowCitizenDetailsPanelDirect(true);
    };
    
    // L'ouverture du LandDetailsPanel est maintenant gérée par IsometricViewer
    // via l'événement POLYGON_SELECTED. Nous n'avons plus besoin de le gérer ici.
    // const handlePolygonSelected = (eventData: { polygonId: string, polygonData: any }) => {
    //   if (activeView === 'land') {
    //     console.log('Polygon selected in Land view:', eventData);
    //     setSelectedLandId(eventData.polygonId);
    //     setSelectedLandInitialData(eventData.polygonData); 
    //     setShowLandDetailPanel(true);
    //   } else {
    //     console.log('Polygon selected, but not in Land view. Current view:', activeView);
    //   }
    // };

    const citizenPanelSubscription = eventBus.subscribe(EventTypes.SHOW_CITIZEN_PANEL_EVENT, handleShowCitizenPanel);
    // const polygonSelectedSubscription = eventBus.subscribe(EventTypes.POLYGON_SELECTED, handlePolygonSelected);

    return () => {
      citizenPanelSubscription.unsubscribe();
      // polygonSelectedSubscription.unsubscribe();
    };
  }, [activeView]); // activeView reste une dépendance si d'autres logiques l'utilisent

  // Event listener for when the Daily Update Panel closes
  useEffect(() => {
    const handleDailyUpdateFinished = () => {
      console.log('Received DAILY_UPDATE_PANEL_CLOSED event, setting appStatus to ready and allowing main panels to show.');
      setAppStatus('ready');
      setCanShowMainPanels(true);
      if (isAmbientAudioInitialized && !ambientAudioManager.isCurrentlyPlaying()) {
        console.log('App ready, starting ambient audio manager.');
        ambientAudioManager.start();
      } else if (!isAmbientAudioInitialized) {
        console.log('App ready, but ambient audio not initialized yet. Will start when initialized.');
      }
    };

    const subscription = eventBus.subscribe(EventTypes.DAILY_UPDATE_PANEL_CLOSED, handleDailyUpdateFinished);

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Effect to listen for wallet changes (login status)
  useEffect(() => {
    const handleWalletChange = (walletData?: { address?: string | null; publicKey?: any; [key: string]: any }) => {
      // Attempt to infer login status from common wallet connection event payloads
      const loggedIn = !!(walletData && (walletData.address || walletData.publicKey || walletData.isConnected === true));
      setIsUserLoggedIn(loggedIn);
      setLoginStatusChecked(true);
      
      // Mettre à jour le nom d'utilisateur actuel
      if (loggedIn && walletData?.profile?.username) {
        setCurrentUserUsername(walletData.profile.username);
        console.log(`User logged in: ${walletData.profile.username}`);
      } else if (loggedIn && typeof localStorage !== 'undefined') {
        // Essayer de récupérer depuis localStorage si non présent dans walletData
        const profileStr = localStorage.getItem('citizenProfile');
        if (profileStr) {
          try {
            const profile = JSON.parse(profileStr);
            if (profile && profile.username) {
              setCurrentUserUsername(profile.username);
              console.log(`User logged in (from localStorage): ${profile.username}`);
            } else {
              setCurrentUserUsername(null);
            }
          } catch (e) {
            console.error("Error parsing citizenProfile from localStorage", e);
            setCurrentUserUsername(null);
          }
        } else {
          setCurrentUserUsername(null);
        }
      } else {
        setCurrentUserUsername(null);
        console.log('User logged out or profile not available.');
      }
      console.log(`Wallet status changed. User logged in: ${loggedIn}`, walletData);
    };

    const subscription = eventBus.subscribe(EventTypes.WALLET_CHANGED, handleWalletChange);

    // Émettre un événement pour demander l'état actuel du portefeuille au montage
    // Cela permet de récupérer l'état initial si WalletButton est déjà monté et a déjà émis son état.
    eventBus.emit(EventTypes.REQUEST_WALLET_STATUS);

    // It's assumed that WalletButton or a similar component will emit WALLET_CHANGED on its mount
    // to provide the initial status. If not, loginStatusChecked might remain false until a manual connect/disconnect.

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Effect to bypass DailyUpdatePanel if user is not logged in when appStatus is 'dailyUpdate'
  useEffect(() => {
    if (appStatus === 'dailyUpdate' && loginStatusChecked && !isUserLoggedIn) {
      console.log('User is not logged in. Bypassing DailyUpdatePanel.');
      handleDailyUpdateClose(); // This will emit DAILY_UPDATE_PANEL_CLOSED
    }
  }, [appStatus, isUserLoggedIn, loginStatusChecked, handleDailyUpdateClose]);
  
  // Effect to start/stop ambient audio when appStatus changes or initialization happens
  useEffect(() => {
    if (isAmbientAudioInitialized) {
      if (appStatus === 'ready' && !ambientAudioManager.isCurrentlyPlaying()) {
        console.log('Ambient audio initialized and app ready, starting ambient audio.');
        ambientAudioManager.start();
      } else if (appStatus !== 'ready' && ambientAudioManager.isCurrentlyPlaying()) {
        console.log('App not ready, stopping ambient audio.');
        ambientAudioManager.stop();
      }
    }
    // Cleanup on unmount
    return () => {
      if (ambientAudioManager.isCurrentlyPlaying()) {
        // console.log('Page unmounting, stopping ambient audio.');
        // ambientAudioManager.stop(); // Decide if audio should stop on page/component unmount
      }
    };
  }, [appStatus, isAmbientAudioInitialized]);

  // Listen for showTransferMenu event
  useEffect(() => {
    const handleShowTransferMenu = () => {
      console.log('showTransferMenu event received in app/page.tsx');
      if (citizenProfile && walletAddress) { // Ensure user is connected
        setShowTransferMenu(true);
      } else {
        console.warn('Cannot show transfer menu: user not fully connected.');
        // Optionally, prompt user to connect wallet or complete profile
      }
    };
    window.addEventListener('showTransferMenu', handleShowTransferMenu);
    return () => {
      window.removeEventListener('showTransferMenu', handleShowTransferMenu);
    };
  }, [citizenProfile, walletAddress]); // Dependencies ensure this re-runs if connection state changes

  // Effect to handle ProfileEditor visibility
  useEffect(() => {
    const handleRequestOpenProfileEditor = () => {
      console.log('[app/page.tsx] Received requestShowProfileEditor event');
      // setShowEnterVeniceButton(false); // Plus nécessaire ici
      setShowProfileEditor(true);
    };
    window.addEventListener('requestShowProfileEditor', handleRequestOpenProfileEditor);

    // La logique pour les nouveaux profils/incomplets est maintenant gérée par WalletButton.tsx
    // Cependant, nous devons toujours gérer le 'profilePrompted' pour éviter des ouvertures répétées
    // de ProfileEditor si l'utilisateur ferme /arrival sans compléter.
    if (walletAddress && citizenProfile && !citizenProfile.username) {
      const hasBeenPromptedForProfileThisSession = sessionStorage.getItem('profilePrompted');
      if (!hasBeenPromptedForProfileThisSession) {
        // Le bouton "Enter Venice" s'affichera via WalletButton.
        // On marque ici que l'invite a eu lieu pour cette session.
        sessionStorage.setItem('profilePrompted', 'true');
      }
      // Si l'utilisateur revient de /arrival sans username, ProfileEditor pourrait s'ouvrir
      // si une autre logique le déclenche (par exemple, un clic sur "Edit Profile").
      // Si l'on veut forcer l'ouverture de ProfileEditor après /arrival si username est null :
      // const cameFromArrival = sessionStorage.getItem('cameFromArrival');
      // if (cameFromArrival) {
      //   setShowProfileEditor(true);
      //   sessionStorage.removeItem('cameFromArrival');
      // }

    }

    // Clear the session prompt flag on disconnect
    if (!walletAddress) {
      sessionStorage.removeItem('profilePrompted');
    }

    return () => {
      window.removeEventListener('requestShowProfileEditor', handleRequestOpenProfileEditor);
    };
  }, [walletAddress, citizenProfile]);


  // Set up event listener for ensureBuildingsVisible
  useEffect(() => {
    // Create a function to calculate empty building points
    const calculateEmptyBuildingPoints = () => {
      if (polygons.length === 0 || buildings.length === 0) return;
      
      // Force recalculation of empty building points
      const allBuildingPoints: {lat: number, lng: number}[] = [];
      
      polygons.forEach(polygon => {
        if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
          polygon.buildingPoints.forEach(point => {
            if (point && typeof point === 'object' && 'lat' in point && 'lng' in point) {
              allBuildingPoints.push({
                lat: point.lat,
                lng: point.lng
              });
            }
          });
        }
      });
      
      // Check which building points don't have buildings on them
      const emptyPoints = allBuildingPoints.filter(point => {
        return !buildings.some(building => {
          if (!building.position) return false;
          
          let position;
          if (typeof building.position === 'string') {
            try {
              position = JSON.parse(building.position);
            } catch (e) {
              return false;
            }
          } else {
            position = building.position;
          }
          
          const threshold = 0.0001;
          if ('lat' in position && 'lng' in position) {
            return Math.abs(position.lat - point.lat) < threshold && 
                   Math.abs(position.lng - point.lng) < threshold;
          }
          return false;
        });
      });
      
      // Use a deep comparison to avoid unnecessary state updates
      if (JSON.stringify(emptyPoints) !== JSON.stringify(emptyBuildingPoints)) {
        setEmptyBuildingPoints(emptyPoints);
      }
    };
    
    // Event handler that uses the calculation function
    const ensureBuildingsVisible = () => {
      console.log('Ensuring buildings are visible in all views');
      calculateEmptyBuildingPoints();
    };
    
    // Only calculate empty building points when polygons or buildings change
    if (polygons.length > 0 && buildings.length > 0) {
      calculateEmptyBuildingPoints();
    }
    
    // Set up event listener
    window.addEventListener('ensureBuildingsVisible', ensureBuildingsVisible);
    
    return () => {
      window.removeEventListener('ensureBuildingsVisible', ensureBuildingsVisible);
    };
  }, [polygons, buildings]); // Remove emptyBuildingPoints from dependencies

  // Effect to update user's last active time
  useEffect(() => {
    const updateUserLastActiveAt = async () => {
      if (!document.hidden) { // Only update if the tab is visible
        console.log('Updating user LastActiveAt:', new Date().toISOString());
        try {
          const response = await fetch('/api/user/update-activity', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            // Vous pouvez envoyer des données supplémentaires si nécessaire, par exemple l'heure actuelle côté client
            // body: JSON.stringify({ lastActiveAt: new Date().toISOString() }), 
          });
          if (!response.ok) {
            console.error('Failed to update user LastActiveAt:', response.status, await response.text());
          } else {
            console.log('User LastActiveAt updated successfully.');
          }
        } catch (error) {
          console.error('Error updating user LastActiveAt:', error);
        }
      }
    };

    // Call it once immediately when the component mounts and tab is visible
    updateUserLastActiveAt();

    // Set up the interval to call it every 2 minutes
    const intervalId = setInterval(updateUserLastActiveAt, 2 * 60 * 1000); // 2 minutes in milliseconds

    // Clean up the interval when the component unmounts
    return () => {
      clearInterval(intervalId);
    };
  }, []); // Empty dependency array ensures this runs once on mount and cleans up on unmount

  // Effect to calculate path statistics when transportPath changes
  useEffect(() => {
    if (activeView === 'transport' && transportPath.length > 0) {
      let newTotalDistance = 0;
      let newWalkingDistance = 0;
      let newWaterDistance = 0;
      let totalGondolaDistanceKm = 0;

      for (let i = 0; i < transportPath.length - 1; i++) {
        const point1 = transportPath[i];
        const point2 = transportPath[i + 1];
        const segmentDistance = calculateDistance({ lat: point1.lat, lng: point1.lng }, { lat: point2.lat, lng: point2.lng });
        newTotalDistance += segmentDistance;

        if (point1.transportMode === 'gondola') {
          newWaterDistance += segmentDistance;
          totalGondolaDistanceKm += segmentDistance / 1000;
        } else {
          newWalkingDistance += segmentDistance;
        }
      }

      const walkingTimeHours = newWalkingDistance / 1000 / 3.5; // Assuming 3.5 km/h walking speed
      const waterTimeHours = newWaterDistance / 1000 / 10;    // Assuming 10 km/h gondola speed
      const newEstimatedTimeMinutes = Math.round((walkingTimeHours + waterTimeHours) * 60);
      
      const newTransportCost = totalGondolaDistanceKm > 0 ? 10 + (5 * totalGondolaDistanceKm) : 0;

      setPathStats({
        totalDistance: newTotalDistance,
        walkingDistance: newWalkingDistance,
        waterDistance: newWaterDistance,
        estimatedTimeMinutes: newEstimatedTimeMinutes,
        transportCost: newTransportCost,
      });
    } else {
      setPathStats(null); // Clear stats if no path or not in transport view
    }
  }, [transportPath, activeView, calculateDistance]);

  // Land images are now handled by LandService and preloaded after polygons are fetched
  
  // State for loan panel
  const [showLoanPanel, setShowLoanPanel] = useState<boolean>(false);
  // State for transport debug panel
  const [showTransportDebugPanel, setShowTransportDebugPanel] = useState<boolean>(false);
  
  // Handle loan panel closing
  const handleLoanPanelClose = () => {
    setShowLoanPanel(false);
    // Reset the active view to buildings when closing the panel
    setActiveView('buildings');
  };
  
  // Transport debug panel is now handled within IsometricViewer component
  
  // Update view when activeView changes
  useEffect(() => {
    console.log(`2D Page: Switching to ${activeView} view`);
    
    // Always ensure buildings are visible regardless of view
    window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
    
    // Dispatch a viewChanged event to notify other components
    window.dispatchEvent(new CustomEvent('viewChanged', { 
      detail: { view: activeView }
    }));
    
    // Manage panel visibility based on activeView
    // This ensures only the panel corresponding to activeView (if any) is marked to be shown.
    // Actual rendering of these panels is gated by appStatus === 'ready'.
    setShowGovernancePanel(activeView === 'governance');
    setShowGuildsPanel(activeView === 'guilds');
    setShowCitizenRegistry(activeView === 'citizens');
    setShowKnowledgePanel(activeView === 'knowledge');
    setShowLoanPanel(activeView === 'loans');
    // Note: Settings, TechTree, SelectedArticle, CitizenDetailsPanelDirect are managed by their own separate boolean flags.

    // Dispatch additional events for specific views
    if (activeView === 'land') {
      window.dispatchEvent(new CustomEvent('fetchIncomeData'));
      window.dispatchEvent(new CustomEvent('showIncomeVisualization'));
    } else if (activeView === 'citizens') {
      // setShowCitizenRegistry is handled above, now dispatch event
      window.dispatchEvent(new CustomEvent('loadCitizens'));
    } else if (activeView === 'resources') {
      // Dispatch an event to load resources for map display
      window.dispatchEvent(new CustomEvent('loadMapResources'));
    }
    // No specific action needed for 'governance', 'guilds', 'knowledge', 'loans' here
    // other than setting their visibility state based on activeView.
  }, [activeView]);

  // if (appStatus === 'loading') { // Supprimé car InitialLoadingScreen est retiré
  //   return <InitialLoadingScreen onLoadingComplete={handleLoadingComplete} />;
  // }

  if (appStatus === 'dailyUpdate') {
    // Render the main app components in the background, DailyUpdatePanel will overlay them
    return (
      <div className="relative w-full h-screen">
        {/* Main 2D Isometric Viewer */}
        <IsometricViewer activeView={activeView} setActiveView={setActiveView} fullWaterGraphData={fullWaterGraphData} />
        
        {/* Top Navigation Bar */}
        <div className="absolute top-0 left-0 right-0 bg-black/50 text-white p-4 flex justify-between items-center z-30">
          <div className="flex items-center space-x-4">
            <Link href="/" className="text-xl font-serif font-bold hover:text-amber-400 transition-colors">
              La Serenissima
            </Link>
            
            <div className="ml-6">
              <ResourceDropdowns />
            </div>
          </div>
              
          <div className="flex space-x-4">
            {/* 3D View button removed */}
          </div>
        </div>

        {/* Left Side Menu */}
        <div className="absolute left-0 top-2/5 transform -translate-y-1/2 bg-black/70 text-white z-20 flex flex-col w-16 rounded-lg">
          {/* Menu Items */}
          <div className="flex-1 overflow-y-auto py-4">
            <ul className="space-y-2 px-2">
              <li>
                <button
                  onClick={() => {
                    setActiveView('governance');
                    setShowGovernancePanel(true);
                  }}
                  className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                    activeView === 'governance' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                  }`}
                  title="Governance"
                >
                  <FaLandmark className="mx-auto h-5 w-5" />
                </button>
              </li>
              {/* ... (autres boutons de menu - gardés pour la structure, mais non interactifs tant que le panneau est affiché) ... */}
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
        </div>
        
        {/* Wallet Button - visible mais potentiellement non interactif */}
        <WalletButton 
          className="absolute top-4 right-4 z-30" 
          onSettingsClick={() => setShowSettings(true)}
        />

        {/* Daily Update Panel - s'affiche par-dessus */}
        <DailyUpdatePanel onClose={handleDailyUpdateClose} isUserLoggedIn={isUserLoggedIn} />
      </div>
    );
  }
  
  // appStatus === 'ready'
  return (
    <div className="relative w-full h-screen">
      {/* Main 2D Isometric Viewer */}
      <IsometricViewer activeView={activeView} setActiveView={setActiveView} fullWaterGraphData={fullWaterGraphData} />

      {/* Profile Editor Modal - Géré par app/page.tsx */}
      {canShowMainPanels && showProfileEditor && citizenProfile && (
        <ProfileEditor
          onClose={() => {
            setShowProfileEditor(false);
            // Le flag sessionStorage 'profilePrompted' reste pour cette session si le profil est toujours incomplet.
          }}
          onSuccess={(updatedProfile) => {
            // ProfileEditor émet 'citizenProfileUpdated', WalletProvider met à jour le contexte.
            setShowProfileEditor(false);
            if (updatedProfile.username) {
              // Si le nom d'utilisateur est maintenant défini, on peut supprimer le flag.
              sessionStorage.removeItem('profilePrompted');
            }
          }}
        />
      )}
      
      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 bg-black/50 text-white p-4 flex justify-between items-center z-30">
        <div className="flex items-center space-x-4">
          <Link href="/" className="text-xl font-serif font-bold hover:text-amber-400 transition-colors">
            La Serenissima
          </Link>
              
          <div className="ml-6">
            <ResourceDropdowns />
          </div>
        </div>
            
        <div className="flex space-x-4">
          {/* 3D View button removed */}
        </div>
      </div>
      
      {/* Left Side Menu */}
      <div className="absolute left-0 top-2/5 transform -translate-y-1/2 bg-black/70 text-white z-20 flex flex-col w-16 rounded-lg">
        {/* Menu Items */}
        <div className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-2 px-2">
            <li>
              <button
                onClick={() => {
                  setActiveView('governance');
                  setShowGovernancePanel(true);
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
                  setActiveView('guilds');
                  setShowGuildsPanel(true);
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
                  setActiveView('citizens');
                  setShowCitizenRegistry(true); // Directly show the registry
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
                  setActiveView('knowledge');
                  setShowKnowledgePanel(true);
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
                  setActiveView('loans');
                  // Dispatch event to load loans data
                  window.dispatchEvent(new CustomEvent('loadLoans'));
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
                onClick={() => setActiveView('contracts')}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'contracts' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Contracts"
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
                onClick={() => {
                  setActiveView('buildings');
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
        {/* Version number will be moved to the bottom right of the screen */}
      </div>
      
      {/* Wallet Button */}
      <WalletButton 
        className="absolute top-4 right-4 z-30" 
        onSettingsClick={() => setShowSettings(true)}
      />
      
      {/* Settings */}
      {showSettings && <Settings onClose={handleSettingsClose} />}
      
      {/* Governance Panel */}
      {canShowMainPanels && showGovernancePanel && (
        <GovernancePanel onClose={handleGovernancePanelClose} />
      )}

      {/* Citizen Registry Panel */}
      {canShowMainPanels && showCitizenRegistry && (
        <CitizenRegistry onClose={handleCitizenRegistryClose} />
      )}
      
      {/* Guilds Panel */}
      {canShowMainPanels && showGuildsPanel && (
        <GuildsPanel onClose={handleGuildsPanelClose} />
      )}
      
      {/* Knowledge Panel */}
      {canShowMainPanels && showKnowledgePanel && (
        <KnowledgeRepository 
          onClose={handleKnowledgePanelClose}
          onShowTechTree={handleShowTechTree}
          onShowPresentation={handleShowPresentation}
          onShowResourceTree={handleShowResourceTree}
          onSelectArticle={handleSelectArticle}
        />
      )}
      
      {/* Selected Article Modal */}
      {canShowMainPanels && selectedArticle && (
        <div className="fixed inset-0 bg-black/50 z-50 overflow-auto">
          <div className="max-w-4xl mx-auto my-8 bg-amber-50 rounded-lg shadow-xl">
            <div className="p-4 flex justify-end">
              <button 
                onClick={handleCloseArticle}
                className="text-amber-600 hover:text-amber-800 p-2"
                aria-label="Close article"
              >
                <FaTimes size={24} />
              </button>
            </div>
            <div className="px-8 pb-8">
              {selectedArticle === 'strategies' && <StrategiesArticle onClose={handleCloseArticle} />}
              {selectedArticle === 'beginners-guide' && <BeginnersGuideArticle onClose={handleCloseArticle} />}
              {selectedArticle === 'economic-system' && <EconomicSystemArticle onClose={handleCloseArticle} />}
              {selectedArticle === 'landowner-guide' && <LandOwnerGuideArticle onClose={handleCloseArticle} />}
              {selectedArticle === 'decrees-governance' && <DecreesGovernanceArticle onClose={handleCloseArticle} />}
              {selectedArticle === 'building-owners-guide' && <BuildingOwnersGuideArticle onClose={handleCloseArticle} />}
              {selectedArticle === 'business-owners-guide' && <BusinessOwnersGuideArticle onClose={handleCloseArticle} />}
              {selectedArticle === 'historical-accuracy' && <HistoricalAccuracyArticle onClose={handleCloseArticle} />}
              {selectedArticle === 'venetian-guilds' && <VenetianGuildsArticle onClose={handleCloseArticle} />}
              {selectedArticle === 'guild-leadership' && <GuildLeadershipArticle onClose={handleCloseArticle} />}
              {selectedArticle === 'unified-citizen-model' && <UnifiedCitizenModelArticle onClose={handleCloseArticle} />}
              {selectedArticle === 'citizen-activities-needs' && <CitizenActivitiesAndNeedsArticle onClose={handleCloseArticle} />}
            </div>
          </div>
        </div>
      )}
      
      {/* Citizen Details Panel (Directly managed) */}
      {canShowMainPanels && showCitizenDetailsPanelDirect && citizenForPanelDirect && (
        <CitizenDetailsPanel
          citizen={citizenForPanelDirect}
          onClose={handleDirectCitizenPanelClose}
        />
      )}
      
      {/* Loan Panel */}
      {canShowMainPanels && showLoanPanel && (
        <LoanPanel onClose={handleLoanPanelClose} />
      )}

      {/* Land Detail Panel - Il est maintenant géré et rendu par IsometricViewer */}
      {/* 
      {canShowMainPanels && showLandDetailPanel && selectedLandId && (
        <LandDetailsPanel // Assurez-vous que le nom du composant est correct
          selectedPolygonId={selectedLandId} // Le prop attendu par LandDetailsPanel
          onClose={handleLandDetailPanelClose}
          polygons={polygons} // Passez les polygones si nécessaire
          landOwners={{}} // Passez les propriétaires de terrains si nécessaire, ou laissez IsometricViewer gérer cela
          visible={showLandDetailPanel}
          // currentUser={currentUserUsername} // Passez currentUserUsername si LandDetailsPanel l'utilise
        />
      )}
      */}

      {/* Version Indicator and Flush Cache Button - Bottom Center */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col items-center space-y-2">
        {/* Flush Caches button removed */}
        <div className="text-xs text-gray-400">v0.2.2</div>
      </div>

      {/* TechTree Panel */}
      {canShowMainPanels && showTechTreePanel && (
        <TechTree onClose={() => setShowTechTreePanel(false)} />
      )}

      {/* Background Music Component - Contrôlé par l'état de l'application */}
      {/* Enveloppé dans un div pour un positionnement optionnel si nécessaire, sinon il peut être placé directement */}
      <div className="absolute bottom-4 right-1/2 transform translate-x-1/2 z-10 pointer-events-none hidden"> 
        <BackgroundMusic isAppReady={appStatus === 'ready'} />
      </div>

      {/* Weather and Time Display */}
      {canShowMainPanels && <WeatherTimeDisplay />}

      {/* Transfer Compute Menu */}
      {canShowMainPanels && showTransferMenu && citizenProfile && walletAddress && (
        <TransferComputeMenu
          onClose={() => setShowTransferMenu(false)}
          onTransfer={async (amountToTransfer) => {
            // walletAddress and citizenProfile are confirmed by the conditional render
            try {
              const backendResponse = await transferCompute(walletAddress!, amountToTransfer);
              if (backendResponse && updateCitizenProfile) {
                // Assuming backendResponse is the updated profile or contains it.
                // The API /api/inject-compute-complete returns `data`.
                // We assume `data` is the updated profile or { citizen: updatedProfile }
                // WalletProvider's updateCitizenProfile expects the full new profile.
                await updateCitizenProfile(backendResponse.citizen || backendResponse);
                console.log('Citizen profile updated after COMPUTE injection.');
              }
              // TransferComputeMenu handles its own onClose upon successful transfer.
            } catch (error) {
              console.error("Failed to inject COMPUTE from page.tsx:", error);
              // Re-throw for TransferComputeMenu to display the error to the user
              throw error;
            }
          }}
        />
      )}

      {/* "Enter Venice" Button for new users - Supprimé d'ici, géré par WalletButton */}
    </div>
  );
}
