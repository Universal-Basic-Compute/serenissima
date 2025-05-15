'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FaHome, FaBuilding, FaRoad, FaTree, FaStore, FaLandmark, FaBook } from 'react-icons/fa';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { transportService } from '@/lib/services/TransportService';
import WalletButton from '@/components/UI/WalletButton';
import ResourceDropdowns from '@/components/UI/ResourceDropdowns';
import Settings from '@/components/UI/Settings';
import GovernancePanel from '@/components/UI/GovernancePanel';
import GuildsPanel from '@/components/UI/GuildsPanel';
import KnowledgeRepository from '@/components/Knowledge/KnowledgeRepository';
import LoanMarketplace from '@/components/Loans/LoanMarketplace';
import LoanManagementDashboard from '@/components/Loans/LoanManagementDashboard';

// Import the 2D viewer component with no SSR
const IsometricViewer = dynamic(() => import('@/components/PolygonViewer/IsometricViewer'), {
  ssr: false
});

export default function TwoDPage() {
  const router = useRouter();
  
  // UI state
  const [showInfo, setShowInfo] = useState(false);
  type ViewType = 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';
  const [activeView, setActiveView] = useState<ViewType>('buildings');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showGovernancePanel, setShowGovernancePanel] = useState<boolean>(false);
  const [showGuildsPanel, setShowGuildsPanel] = useState<boolean>(false);
  const [showKnowledgePanel, setShowKnowledgePanel] = useState<boolean>(false);
  
  // Data state
  const [polygons, setPolygons] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [emptyBuildingPoints, setEmptyBuildingPoints] = useState<{lat: number, lng: number}[]>([]);
  
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
    // Reset the active view to buildings when closing the panel
    setActiveView('buildings');
  };
  
  // Knowledge panel functions
  const handleShowTechTree = () => {
    console.log('Showing tech tree');
    // Implement tech tree display logic
  };
  
  const handleShowPresentation = () => {
    console.log('Showing presentation');
    // Implement presentation display logic
  };
  
  const handleShowResourceTree = () => {
    console.log('Showing resource tree');
    // Implement resource tree display logic
  };
  
  const handleSelectArticle = (article: string) => {
    console.log(`Selected article: ${article}`);
    // Implement article selection logic
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
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
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
    
    // Execute the fetch functions
    fetchPolygons();
    fetchBuildings();
    
    // Initialize the transport service with retry logic
    const initializeTransportService = async () => {
      try {
        console.log('Initializing transport service...');
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
  
  // Set up event listeners for panel visibility
  useEffect(() => {
    // Event handlers for opening panels
    const handleOpenGovernancePanel = () => setShowGovernancePanel(true);
    const handleOpenGuildsPanel = () => setShowGuildsPanel(true);
    const handleOpenKnowledgePanel = () => setShowKnowledgePanel(true);
    const handleOpenLoanPanel = () => setShowLoanPanel(true);
    
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
    window.addEventListener('openLoanPanel', handleOpenLoanPanel);
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
      window.removeEventListener('openLoanPanel', handleOpenLoanPanel);
      window.removeEventListener('closeGovernancePanel', handleCloseGovernancePanel);
      window.removeEventListener('closeGuildsPanel', handleCloseGuildsPanel);
      window.removeEventListener('closeKnowledgePanel', handleCloseKnowledgePanel);
      window.removeEventListener('closeLoanPanel', handleCloseLoanPanel);
      window.removeEventListener('loadLoans', handleLoadLoans);
    };
  }, []);
  
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

  // State for loan panel
  const [showLoanPanel, setShowLoanPanel] = useState<boolean>(false);
  
  // Handle loan panel closing
  const handleLoanPanelClose = () => {
    setShowLoanPanel(false);
    // Reset the active view to buildings when closing the panel
    setActiveView('buildings');
  };
  
  // Update view when activeView changes
  useEffect(() => {
    console.log(`2D Page: Switching to ${activeView} view`);
    
    // Always ensure buildings are visible regardless of view
    window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
    
    // Dispatch a viewChanged event to notify other components
    window.dispatchEvent(new CustomEvent('viewChanged', { 
      detail: { view: activeView }
    }));
    
    // Dispatch additional events for specific views
    if (activeView === 'land') {
      window.dispatchEvent(new CustomEvent('fetchIncomeData'));
      window.dispatchEvent(new CustomEvent('showIncomeVisualization'));
    } else if (activeView === 'citizens') {
      window.dispatchEvent(new CustomEvent('loadCitizens'));
    } else if (activeView === 'governance') {
      setShowGovernancePanel(true);
    } else if (activeView === 'guilds') {
      setShowGuildsPanel(true);
    } else if (activeView === 'knowledge') {
      setShowKnowledgePanel(true);
    } else if (activeView === 'loans') {
      setShowLoanPanel(true);
    }
  }, [activeView]);

  return (
    <div className="relative w-full h-screen">
      {/* Main 2D Isometric Viewer */}
      <IsometricViewer activeView={activeView} />
      
      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 bg-black/50 text-white p-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <Link href="/" className="text-xl font-serif font-bold hover:text-amber-400 transition-colors">
            La Serenissima
          </Link>
              
          <div className="ml-6">
            <ResourceDropdowns />
          </div>
        </div>
            
        <div className="flex space-x-4">
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('showTransportRoutes'))}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-white transition-colors font-serif"
          >
            Transport Routes
          </button>
          <Link 
            href="/"
            className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-white transition-colors font-serif"
          >
            3D View
          </Link>
        </div>
      </div>
      
      {/* Left Side Menu */}
      <div className="absolute left-0 top-0 bottom-0 bg-black/70 text-white z-20 flex flex-col w-16">
        {/* Logo */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-center">
          <span className="text-2xl font-serif text-amber-500">V</span>
        </div>
        
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
                onClick={() => setActiveView('citizens')}
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
                onClick={() => setActiveView('markets')}
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
        
        {/* Bottom section with version number */}
        <div className="p-4 border-t border-gray-700 text-center">
          <div className="text-xs text-gray-400">La Serenissima v0.2.1</div>
        </div>
      </div>
      
      {/* Wallet Button */}
      <WalletButton 
        className="absolute top-4 right-4 z-10" 
        onSettingsClick={() => setShowSettings(true)}
      />
      
      {/* Settings */}
      {showSettings && <Settings onClose={handleSettingsClose} />}
      
      {/* Information Panel */}
      {showInfo && (
        <div className="absolute top-20 right-4 bg-black/70 text-white p-4 rounded-lg max-w-sm border-2 border-amber-600 shadow-lg">
          <h2 className="text-lg font-serif font-bold mb-2 text-amber-400">About 2D View</h2>
          <p className="text-sm mb-3">
            This is a simplified 2D isometric view of La Serenissima, designed for better performance.
            It shows the same data as the 3D view but with a different rendering approach.
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
            2D Isometric View v0.1.0
          </div>
        </div>
      )}
      
      {/* Governance Panel */}
      {showGovernancePanel && (
        <GovernancePanel onClose={handleGovernancePanelClose} />
      )}
      
      {/* Guilds Panel */}
      {showGuildsPanel && (
        <GuildsPanel onClose={handleGuildsPanelClose} />
      )}
      
      {/* Knowledge Panel */}
      {showKnowledgePanel && (
        <KnowledgeRepository 
          onClose={handleKnowledgePanelClose}
          onShowTechTree={handleShowTechTree}
          onShowPresentation={handleShowPresentation}
          onShowResourceTree={handleShowResourceTree}
          onSelectArticle={handleSelectArticle}
        />
      )}
      
      {/* Loan Panel */}
      {showLoanPanel && (
        <div className="absolute top-20 left-20 right-4 bottom-4 bg-black/30 z-40 rounded-lg p-4 overflow-auto">
          <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-serif text-amber-800">
                Venetian Banking & Finance
              </h2>
              <button 
                onClick={handleLoanPanelClose}
                className="text-amber-600 hover:text-amber-800 p-2"
                aria-label="Close loan panel"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="grid grid-cols-1 gap-8">
              <LoanMarketplace />
              <LoanManagementDashboard />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
