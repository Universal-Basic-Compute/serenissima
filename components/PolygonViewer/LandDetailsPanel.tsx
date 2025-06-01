import { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';
import ActionButton from '../UI/ActionButton';
import WalletStatus from '../UI/WalletStatus';
import PlayerProfile from '../UI/PlayerProfile';
import LandPurchaseConfirmation from '../UI/LandPurchaseConfirmation';
import ListLandForSaleModal from '../UI/ListLandForSaleModal';
import AnimatedDucats from '../UI/AnimatedDucats';
import { Polygon } from './types';
import { eventBus, EventTypes } from '../../lib/utils/eventBus';
import { getWalletAddress, getCurrentCitizenUsername } from '../../lib/utils/walletUtils'; // Added getCurrentCitizenUsername

// Helper function to normalize identifiers for comparison
const normalizeIdentifier = (id: string | null | undefined): string | null => {
  if (!id) return null;
  // Convert to lowercase and trim
  return id.toLowerCase().trim();
};

interface LandDetailsPanelProps {
  selectedPolygonId: string | null;
  onClose: () => void;
  polygons: Polygon[];
  landOwners: Record<string, string>;
  visible?: boolean; // Add this prop
  preventAutoClose?: boolean; // Add this prop to prevent auto-closing after purchase
}

// Helper function to check if current citizen is the seller
const isCurrentCitizenTheSeller = (transaction: any): boolean => {
  if (!transaction || !transaction.seller) return false;
  
  // Get current citizen identifier (username or wallet)
  const currentCitizen = sessionStorage.getItem('username') || 
                     localStorage.getItem('username') ||
                     sessionStorage.getItem('walletAddress') || 
                     localStorage.getItem('walletAddress');
  
  if (!currentCitizen) return false;
  
  // Get citizen profile from localStorage
  let citizenProfile = null;
  try {
    const profileStr = localStorage.getItem('citizenProfile');
    if (profileStr) {
      citizenProfile = JSON.parse(profileStr);
    }
  } catch (e) {
    console.error('Error parsing citizen profile:', e);
  }
  
  // Log the comparison details
  console.log('Transaction seller:', transaction.seller);
  console.log('Current citizen identifier:', currentCitizen);
  console.log('Citizen profile:', citizenProfile);
  
  // Compare normalized identifiers
  const normalizedSeller = normalizeIdentifier(transaction.seller);
  const normalizedCurrentCitizen = normalizeIdentifier(currentCitizen);
  const normalizedUsername = citizenProfile?.username ? normalizeIdentifier(citizenProfile.username) : null;
  
  console.log('Normalized seller:', normalizedSeller);
  console.log('Normalized current citizen:', normalizedCurrentCitizen);
  console.log('Normalized username:', normalizedUsername);
  
  // Check if seller matches either the wallet address or username
  const isSellerCurrentCitizen = normalizedSeller === normalizedCurrentCitizen || 
                             normalizedSeller === normalizedUsername;
  
  console.log('Is seller the current citizen?', isSellerCurrentCitizen);
  
  return isSellerCurrentCitizen;
};

// Helper function to check if current citizen is the owner
const isCurrentCitizenTheOwner = (ownerIdentifier: string | null): boolean => {
  if (!ownerIdentifier) return false;
  
  // Get current citizen identifier (username or wallet)
  const currentCitizen = sessionStorage.getItem('username') || 
                     localStorage.getItem('username') ||
                     sessionStorage.getItem('walletAddress') || 
                     localStorage.getItem('walletAddress');
  
  if (!currentCitizen) return false;
  
  // Get citizen profile from localStorage
  let citizenProfile = null;
  try {
    const profileStr = localStorage.getItem('citizenProfile');
    if (profileStr) {
      citizenProfile = JSON.parse(profileStr);
    }
  } catch (e) {
    console.error('Error parsing citizen profile:', e);
  }
  
  // Compare normalized identifiers
  const normalizedOwner = normalizeIdentifier(ownerIdentifier);
  const normalizedCurrentCitizen = normalizeIdentifier(currentCitizen);
  const normalizedUsername = citizenProfile?.username ? normalizeIdentifier(citizenProfile.username) : null;
  
  // Check if owner matches either the wallet address or username
  return normalizedOwner === normalizedCurrentCitizen || normalizedOwner === normalizedUsername;
};

export default function LandDetailsPanel({ selectedPolygonId, onClose, polygons, landOwners, visible = true, preventAutoClose = false }: LandDetailsPanelProps) {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  // Combined state for all relevant land contracts (listings and offers)
  const [activeLandContracts, setActiveLandContracts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [offerAmount, setOfferAmount] = useState<number>(100000); // Default offer amount
  const [showOfferInput, setShowOfferInput] = useState<boolean>(false);
  // showPurchaseConfirmation and isPurchasing might be reused or adapted if direct purchase confirmation is kept for some flow
  const [showPurchaseConfirmation, setShowPurchaseConfirmation] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [justCompletedTransaction, setJustCompletedTransaction] = useState<boolean>(false);
  const [landRendered, setLandRendered] = useState<boolean>(false);
  const [dynamicOwner, setDynamicOwner] = useState<string | null>(null);
  const [ownerDetails, setOwnerDetails] = useState<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Find the selected polygon
  const selectedPolygon = selectedPolygonId 
    ? polygons.find(p => p.id === selectedPolygonId)
    : null;
  
  // Use the dynamically fetched owner instead of accessing landOwners directly
  const owner = dynamicOwner;
  
  
  // Add useEffect to set the owner from landOwners prop
  useEffect(() => {
    if (selectedPolygonId) {
      // Reset owner when a new polygon is selected
      setDynamicOwner(null);
      setOwnerDetails(null);
      
      // Get the owner directly from the landOwners prop
      const owner = selectedPolygonId && landOwners ? landOwners[selectedPolygonId] : null;
      
      if (owner) {
        console.log('Owner from landOwners prop:', owner);
        setDynamicOwner(owner);
        
        // Fetch the owner details directly
        const fetchOwnerDetails = async () => {
          try {
            const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';
            const apiUrl = `${API_BASE_URL}/api/citizens/${owner}`;
            console.log('Fetching owner details from:', apiUrl); // Log the constructed URL
            const citizenResponse = await fetch(apiUrl);
            
            if (citizenResponse.ok) {
              const citizenData = await citizenResponse.json();
              console.log('Fetched citizen details:', citizenData);
              
              if (citizenData.success && citizenData.citizen) {
                setOwnerDetails(citizenData.citizen);
              }
            } else {
              console.error(`Failed to fetch citizen details: ${citizenResponse.status} ${citizenResponse.statusText}`);
            }
          } catch (citizenError) {
            console.error('Error fetching citizen details:', citizenError);
          }
        };
        
        fetchOwnerDetails();
      } else {
        console.log('No owner found for this land');
      }
    }
  }, [selectedPolygonId, landOwners]);
  
  // Debug logging
  useEffect(() => {
    if (selectedPolygonId) {
      console.log('Selected polygon ID:', selectedPolygonId);
      console.log('Selected polygon data:', selectedPolygon);
      console.log('Dynamically fetched owner:', dynamicOwner);
    }
  }, [selectedPolygonId, selectedPolygon, dynamicOwner]);
  
  // Add this useEffect to render the top view of the land
  useEffect(() => {
    if (selectedPolygon && canvasRef.current && !landRendered) {
      // Clear the canvas first to remove any previous rendering
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      
      // Now render the new polygon
      renderLandTopView(selectedPolygon, canvasRef.current);
      setLandRendered(true);
    }
  }, [selectedPolygon, landRendered]);

  // Function to render a top-down view of the land
  const renderLandTopView = (polygon: Polygon, canvas: HTMLCanvasElement): void => {
    if (!polygon.coordinates || polygon.coordinates.length < 3) return;
    
    // Set canvas size to be square
    canvas.width = 200;
    canvas.height = 200;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Extract coordinates
    const coords = polygon.coordinates;
    
    // Find min/max to scale the polygon to fit the canvas
    let minLat = coords[0]?.lat || 0, maxLat = coords[0]?.lat || 0;
    let minLng = coords[0]?.lng || 0, maxLng = coords[0]?.lng || 0;
    
    coords.forEach(coord => {
      if (coord) {
        minLat = Math.min(minLat, coord.lat);
        maxLat = Math.max(maxLat, coord.lat);
        minLng = Math.min(minLng, coord.lng);
        maxLng = Math.max(maxLng, coord.lng);
      }
    });
    
    // Apply the 0.7 factor to latitude range to correct the aspect ratio
    const latRange = (maxLat - minLat) * 0.7;
    const lngRange = maxLng - minLng;
    
    // Add padding
    const padding = 20;
    const scaleX = (canvas.width - padding * 2) / lngRange;
    const scaleY = (canvas.height - padding * 2) / latRange; // Use adjusted latRange
    
    // Use the smaller scale to maintain aspect ratio
    const scale = Math.min(scaleX, scaleY);
    
    // Center the polygon
    const centerX = (canvas.width / 2) - ((minLng + maxLng) / 2) * scale;
    const centerY = (canvas.height / 2) + ((minLat + maxLat) / 2) * scale;
    
    // Draw the polygon
    ctx.beginPath();
    coords.forEach((coord, index) => {
      // Apply the 0.7 factor to latitude when drawing
      const x = (coord.lng * scale) + centerX;
      const y = centerY - (coord.lat * scale * 0.7); // Apply 0.7 factor here
        
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
      
    // Fill with a sand color
    ctx.fillStyle = '#f5e9c8';
    ctx.fill();
      
    // Draw border
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.stroke();
      
    // If there's a last income or income from service, color the polygon accordingly
    const hasIncome = polygon.lastIncome !== undefined || (() => {
      try {
        const { getIncomeDataService } = require('../../lib/services/IncomeDataService');
        return getIncomeDataService().getIncome(polygon.id) !== undefined;
      } catch (error) {
        return false;
      }
    })();
    
    if (hasIncome) {
      try {
        // Get income from polygon or service
        const income = polygon.lastIncome !== undefined 
          ? polygon.lastIncome 
          : (() => {
              const { getIncomeDataService } = require('../../lib/services/IncomeDataService');
              return getIncomeDataService().getIncome(polygon.id);
            })();
        
        // Get min/max income from service
        const minIncome = (() => {
          try {
            const { getIncomeDataService } = require('../../lib/services/IncomeDataService');
            return getIncomeDataService().getMinIncome();
          } catch (error) {
            return 0;
          }
        })();
        
        const maxIncome = (() => {
          try {
            const { getIncomeDataService } = require('../../lib/services/IncomeDataService');
            return getIncomeDataService().getMaxIncome();
          } catch (error) {
            return 1000;
          }
        })();
        
        // Normalize income to a 0-1 scale for coloring
        const normalizedIncome = Math.min(Math.max((income - minIncome) / (maxIncome - minIncome), 0), 1);
        
        // Create a semi-transparent overlay with color based on income
        ctx.globalAlpha = 0.4;
        
        if (normalizedIncome >= 0.5) {
          // Higher income: yellow to red
          const t = (normalizedIncome - 0.5) * 2; // Scale 0.5-1.0 to 0-1
          const r = Math.floor(255);
          const g = Math.floor(255 * (1 - t));
          const b = 0;
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else {
          // Lower income: green to yellow
          const t = normalizedIncome * 2; // Scale 0-0.5 to 0-1
          const r = Math.floor(255 * t);
          const g = Math.floor(255);
          const b = 0;
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        }
        
        ctx.fill();
        ctx.globalAlpha = 1.0;
      } catch (error) {
        console.warn('Error applying income-based coloring:', error);
        
        // Fallback to simple coloring if there's an error
        if (polygon.lastIncome !== undefined) {
          // Normalize income to a 0-1 scale for coloring
          const maxIncome = 1000; // Default max income
          const normalizedIncome = Math.min(Math.max(polygon.lastIncome / maxIncome, 0), 1);
          
          // Create a semi-transparent overlay with color based on income
          ctx.globalAlpha = 0.4;
          
          if (normalizedIncome >= 0.5) {
            // Higher income: yellow to red
            const t = (normalizedIncome - 0.5) * 2; // Scale 0.5-1.0 to 0-1
            const r = Math.floor(255);
            const g = Math.floor(255 * (1 - t));
            const b = 0;
            ctx.fillStyle = `rgb(${r},${g},${b})`;
          } else {
            // Lower income: green to yellow
            const t = normalizedIncome * 2; // Scale 0-0.5 to 0-1
            const r = Math.floor(255 * t);
            const g = Math.floor(255);
            const b = 0;
            ctx.fillStyle = `rgb(${r},${g},${b})`;
          }
          
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }
      }
    }
    
    // If there's a last income, color the polygon accordingly
    if (polygon.lastIncome !== undefined) {
      // Normalize income to a 0-1 scale for coloring
      const maxIncome = 1000; // Adjust based on your actual data range
      const normalizedIncome = Math.min(Math.max(polygon.lastIncome / maxIncome, 0), 1);
      
      // Create a semi-transparent overlay with color based on income
      ctx.globalAlpha = 0.4;
      
      if (normalizedIncome >= 0.5) {
        // Higher income: yellow to red
        const t = (normalizedIncome - 0.5) * 2; // Scale 0.5-1.0 to 0-1
        const r = Math.floor(255);
        const g = Math.floor(255 * (1 - t));
        const b = 0;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
      } else {
        // Lower income: green to yellow
        const t = normalizedIncome * 2; // Scale 0-0.5 to 0-1
        const r = Math.floor(255 * t);
        const g = Math.floor(255);
        const b = 0;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
      }
      
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }
    
    // If there's a centroid, mark it
    if (polygon.centroid) {
      const x = (polygon.centroid.lng * scale) + centerX;
      const y = centerY - (polygon.centroid.lat * scale);
      
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ff0000';
      ctx.fill();
    }
  };

  // Land purchase events are no longer handled to prevent land modification
  
  // Add effect to maintain panel visibility after a purchase
  useEffect(() => {
    if (transaction && transaction.buyer === (sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress'))) {
      // If the current citizen is the buyer, ensure the panel stays visible
      setIsVisible(true);
    }
  }, [transaction]);
  
  // Add additional effect to maintain visibility when preventAutoClose is true
  useEffect(() => {
    if (preventAutoClose && selectedPolygonId) {
      setIsVisible(true);
    }
  }, [preventAutoClose, selectedPolygonId]);
  
  // Reset landRendered when selectedPolygonId changes
  useEffect(() => {
    if (selectedPolygonId) {
      setLandRendered(false);
    }
  }, [selectedPolygonId]);
  
  // Add this useEffect to listen for the custom event to keep panel open
  useEffect(() => {
    const handleKeepOpen = (data: any) => {
      if (data.polygonId === selectedPolygonId) {
        console.log('Keeping land details panel open for', selectedPolygonId);
        setIsVisible(true);
      }
    };
    
    // Subscribe to keep panel open events using the event bus
    const subscription = eventBus.subscribe(EventTypes.KEEP_LAND_DETAILS_PANEL_OPEN, handleKeepOpen);
    
    return () => {
      subscription.unsubscribe();
    };
  }, [selectedPolygonId]);
  
  // State for list for sale modal
  const [showListForSaleModal, setShowListForSaleModal] = useState<boolean>(false);
  const [showLandPurchaseModal, setShowLandPurchaseModal] = useState<boolean>(false);
  const [landPurchaseData, setLandPurchaseData] = useState<{
    landId: string;
    landName?: string;
    transaction: any;
    onComplete?: () => void;
  } | null>(null);
  
  // Add this useEffect to listen for the custom event to keep panel open
  useEffect(() => {
    const handleKeepOpen = (event: CustomEvent) => {
      if (event.detail.polygonId === selectedPolygonId) {
        console.log('Keeping land details panel open for', selectedPolygonId);
        setIsVisible(true);
      }
    };
    
    window.addEventListener('keepLandDetailsPanelOpen', handleKeepOpen as EventListener);
    
    return () => {
      window.removeEventListener('keepLandDetailsPanelOpen', handleKeepOpen as EventListener);
    };
  }, [selectedPolygonId]);

  // Effect to fetch active land contracts (listings and offers) when a polygon is selected
  useEffect(() => {
    if (selectedPolygonId) {
      setIsLoading(true);
      setActiveLandContracts([]); // Clear previous contracts
      console.log(`Fetching active land contracts for land ${selectedPolygonId}`);

      const fetchActiveLandContractsWithRetry = async (retries = 3, delay = 1000) => {
        try {
          const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';
          // Fetch all active contracts (listings and offers) for this land asset
          // Ensure 'Status' is part of the query, and consider if other types like 'land_offer' are needed.
          const apiUrl = `${API_BASE_URL}/api/contracts?AssetType=land&Asset=${selectedPolygonId}&Status=active`;
          console.log(`Fetching land contracts from URL: ${apiUrl}`);
          
          const response = await fetch(apiUrl);

          if (!response.ok) {
            if (response.status === 404) {
              console.log(`No active contracts found for land ${selectedPolygonId} (API returned 404).`);
              setActiveLandContracts([]);
              return; // Explicitly return to avoid proceeding to .finally() too early in this path
            }
            throw new Error(`Failed to fetch land contracts: ${response.status} ${response.statusText}`);
          }

          const responseData = await response.json();
          
          if (responseData.success && Array.isArray(responseData.contracts)) {
            console.log(`Found ${responseData.contracts.length} active contract(s) for land ${selectedPolygonId}:`, responseData.contracts);
            setActiveLandContracts(responseData.contracts);
          } else {
            console.log(`No active contracts or unexpected data format for land ${selectedPolygonId}:`, responseData);
            setActiveLandContracts([]);
            if (responseData.error) {
              console.error(`API error message: ${responseData.error}`);
            }
          }
        } catch (error) {
          console.error(`Error fetching land contracts (attempt ${4 - retries}/3):`, error);
          if (retries > 1) {
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchActiveLandContractsWithRetry(retries - 1, delay * 2);
          } else {
            console.warn('All retry attempts for land contracts failed.');
            setActiveLandContracts([]);
          }
        }
      };

      fetchActiveLandContractsWithRetry().finally(() => {
        setIsLoading(false);
      });
    } else {
      setActiveLandContracts([]);
      setIsLoading(false);
    }
  }, [selectedPolygonId, refreshKey]);

  // Show panel with animation when a polygon is selected
  useEffect(() => {
    if (selectedPolygonId) {
      setIsVisible(true);
    } else if (!preventAutoClose) {
      // Only hide the panel if preventAutoClose is false
      setIsVisible(false);
    }
  }, [selectedPolygonId, preventAutoClose]);
  
  // Early return if not visible or no selected polygon
  if (!visible || !selectedPolygonId) return null;

  const currentCitizenUsername = getCurrentCitizenUsername();
  // isOwner needs to be determined based on dynamicOwner and currentCitizenUsername
  const isOwner = dynamicOwner && currentCitizenUsername && normalizeIdentifier(dynamicOwner) === normalizeIdentifier(currentCitizenUsername);

  // Derive specific contracts from activeLandContracts
  const landListingByOwner = activeLandContracts.find(
    c => c.Type === 'land_listing' && c.Seller && dynamicOwner && normalizeIdentifier(c.Seller) === normalizeIdentifier(dynamicOwner)
  );

  const myLandListing = activeLandContracts.find(
    c => c.Type === 'land_listing' && c.Seller && currentCitizenUsername && normalizeIdentifier(c.Seller) === normalizeIdentifier(currentCitizenUsername)
  );
  
  const incomingBuyOffers = activeLandContracts.filter(
    c => c.Type === 'land_offer' && c.Buyer && (!currentCitizenUsername || normalizeIdentifier(c.Buyer) !== normalizeIdentifier(currentCitizenUsername))
  );

  const myBuyOffer = activeLandContracts.find(
    c => c.Type === 'land_offer' && c.Buyer && currentCitizenUsername && normalizeIdentifier(c.Buyer) === normalizeIdentifier(currentCitizenUsername)
  );
  
  // Determine if the land is "Available for Purchase" (unowned and no specific listing)
  const isAvailableFromState = !dynamicOwner && !landListingByOwner;

  const handleGenericActivity = async (activityType: string, parameters: Record<string, any>) => {
    if (!currentCitizenUsername) {
      alert('Citizen username not found. Please ensure you are logged in.');
      return;
    }
    setIsLoading(true);
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const response = await fetch(`${API_BASE_URL}/api/activities/try-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          citizenUsername: currentCitizenUsername,
          activityType,
          activityParameters: parameters,
        }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        alert(`Action "${activityType}" initiated successfully! Activity ID: ${result.activityId || 'N/A'}`);
        setRefreshKey(prev => prev + 1); // Refresh panel data
        setShowOfferInput(false); // Close offer input if open
        // Potentially close modals or navigate if needed
      } else {
        throw new Error(result.error || `Failed to initiate "${activityType}"`);
      }
    } catch (error: any) {
      console.error(`Error initiating activity "${activityType}":`, error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div 
      className={`fixed top-0 right-0 h-full w-144 bg-amber-50 shadow-xl transform transition-transform duration-300 ease-in-out z-40 border-l-4 border-amber-600 ${
        isVisible ? 'translate-x-0' : 'translate-x-full'
      }`}
      key={refreshKey}
      onTransitionEnd={() => {
        // Reset landRendered when panel becomes visible
        if (isVisible && !landRendered && selectedPolygonId) {
          setLandRendered(false);
        }
      }}
    >
      <div className="p-6 h-full flex flex-col">
        {/* Header with improved styling */}
        <div className="flex justify-between items-center mb-6 border-b-2 border-amber-300 pb-3">
          <h2 className="text-2xl font-serif font-semibold text-amber-800">
            {selectedPolygon?.historicalName || 'Land Details'}
          </h2>
          <button 
            onClick={onClose}
            className="text-amber-700 hover:text-amber-900 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-6 overflow-y-auto flex-grow">
          {/* 1. Top view representation of the land */}
          <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200 mb-6">
            <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Land Overview</h3>
            <div className="flex flex-col items-center">
              <canvas 
                ref={canvasRef} 
                className="w-[200px] h-[200px] border border-amber-100 rounded-lg mb-2"
                style={{ aspectRatio: '1/1' }}
              />
              
              {/* Change buildable area to building points count */}
              {selectedPolygon?.buildingPoints && (
                <div className="text-center mt-1">
                  <span className="text-sm text-amber-700">Buildable Buildings: </span>
                  <span className="text-sm font-semibold text-amber-800">
                    {selectedPolygon.buildingPoints.length}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 2. Income information */}
          {(selectedPolygon?.lastIncome !== undefined || 
            (selectedPolygonId && (() => {
              try {
                const { getIncomeDataService } = require('../../lib/services/IncomeDataService');
                return getIncomeDataService().getIncome(selectedPolygonId) !== undefined;
              } catch (error) {
                return false;
              }
            })())) && (
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Income</h3>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Daily Income:</span>
                <span className="font-semibold text-amber-800">
                  {(() => {
                    try {
                      const income = selectedPolygon?.lastIncome !== undefined 
                        ? selectedPolygon.lastIncome 
                        : (() => {
                            const { getIncomeDataService } = require('../../lib/services/IncomeDataService');
                            return getIncomeDataService().getIncome(selectedPolygonId!);
                          })();
                      return income !== undefined ? income.toLocaleString() : '0';
                    } catch (error) {
                      return selectedPolygon?.lastIncome !== undefined 
                        ? selectedPolygon.lastIncome.toLocaleString() 
                        : '0';
                    }
                  })()} ⚜️ ducats
                </span>
              </div>
          
              {/* Income visualization */}
              <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full" 
                  style={{
                    width: `${(() => {
                      try {
                        const { getIncomeDataService } = require('../../lib/services/IncomeDataService');
                        const incomeService = getIncomeDataService();
                        const income = selectedPolygon?.lastIncome !== undefined 
                          ? selectedPolygon.lastIncome 
                          : incomeService.getIncome(selectedPolygonId!);
                        return Math.min(100, Math.max(5, ((income || 0) / incomeService.getMaxIncome()) * 100));
                      } catch (error) {
                        return selectedPolygon?.lastIncome !== undefined 
                          ? Math.min(100, Math.max(5, (selectedPolygon.lastIncome / 1000) * 100))
                          : 5;
                      }
                    })()}%`,
                    background: 'linear-gradient(90deg, #33cc33 0%, #ffcc00 50%, #ff3300 100%)'
                  }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Low</span>
                <span>Medium</span>
                <span>High</span>
              </div>
            </div>
          )}

          {/* 3. Owner information with enhanced styling */}
          <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
            <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Owner</h3>
            {owner && owner !== "" ? (
              <div className="flex items-center justify-center">
                <PlayerProfile 
                  username={ownerDetails?.username || owner}
                  firstName={ownerDetails?.firstName}
                  lastName={ownerDetails?.lastName}
                  coatOfArmsImageUrl={ownerDetails?.coatOfArmsImageUrl}
                  familyMotto={ownerDetails?.familyMotto}
                  walletAddress={ownerDetails?.walletAddress || owner}
                  Ducats={ownerDetails?.ducats}
                  size="medium"
                  className="mx-auto"
                />
              </div>
            ) : (
              <div className="bg-amber-100 p-3 rounded-lg text-center">
                <p className="font-semibold text-amber-800">Available for Purchase</p>
                <p className="text-xs text-amber-600 mt-1">This land has no current owner</p>
              </div>
            )}
          </div>
          
          {/* 4. Land Market Information & Actions */}
          <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200 space-y-4">
            <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Market Status</h3>

            {isLoading && <p className="text-amber-700">Loading market data...</p>}

            {/* Case 1: Land is listed for sale by the owner */}
            {landListingByOwner && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-lg font-semibold text-amber-800">
                  For Sale by {landListingByOwner.SellerName || landListingByOwner.Seller}
                </p>
                <p className="text-2xl font-semibold text-center my-2">
                  <span style={{ color: '#d4af37' }}>
                    <AnimatedDucats 
                      value={landListingByOwner.PricePerResource} 
                      suffix="⚜️ ducats" 
                      duration={1500}
                    />
                  </span>
                </p>
                {!isOwner && currentCitizenUsername && normalizeIdentifier(landListingByOwner.Seller) !== normalizeIdentifier(currentCitizenUsername) && (
                  <ActionButton
                    onClick={() => handleGenericActivity('buy_listed_land', { contractId: landListingByOwner.id, landId: selectedPolygonId, price: landListingByOwner.PricePerResource })}
                    variant="primary"
                    className="w-full mt-2"
                  >
                    Buy Now at {landListingByOwner.PricePerResource.toLocaleString()} ⚜️
                  </ActionButton>
                )}
                {isOwner && normalizeIdentifier(landListingByOwner.Seller) === normalizeIdentifier(currentCitizenUsername) && (
                   <ActionButton
                    onClick={() => handleGenericActivity('cancel_land_listing', { contractId: landListingByOwner.id, landId: selectedPolygonId })}
                    variant="danger"
                    className="w-full mt-2"
                  >
                    Cancel Your Listing
                  </ActionButton>
                )}
              </div>
            )}

            {/* Case 2: Current citizen is owner and land is NOT listed by them */}
            {isOwner && !myLandListing && (
              <ActionButton
                onClick={() => setShowListForSaleModal(true)}
                variant="primary"
                className="w-full"
              >
                List Your Land for Sale
              </ActionButton>
            )}
            
            {/* Case 3: Land is unowned (available from state) */}
            {isAvailableFromState && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
                    <p className="text-lg font-semibold text-green-800">Available from the Republic</p>
                    {/* Assuming a fixed price for state land, e.g., 10000. This should come from config or game balance. */}
                    <p className="text-xl text-green-700 my-1">Price: 10,000 ⚜️ ducats</p> 
                    <ActionButton
                        onClick={() => handleGenericActivity('buy_available_land', { landId: selectedPolygonId, expectedPrice: 10000, targetBuildingId: "town_hall_default" })} // targetBuildingId might be needed by processor
                        variant="success"
                        className="w-full mt-2"
                    >
                        Acquire from Republic
                    </ActionButton>
                </div>
            )}

            {/* Display Incoming Buy Offers (if current citizen is the owner and land is not listed by them OR is listed by them) */}
            {isOwner && incomingBuyOffers.length > 0 && (
              <div className="mt-4">
                <h4 className="text-md font-semibold text-amber-700 mb-2">Incoming Offers to Buy:</h4>
                {incomingBuyOffers.map(offer => (
                  <div key={offer.id} className="p-3 mb-2 rounded-lg bg-blue-50 border border-blue-200">
                    <p>Offer from: {offer.BuyerName || offer.Buyer}</p>
                    <p>Amount: {offer.PricePerResource.toLocaleString()} ⚜️ ducats</p>
                    <ActionButton
                      onClick={() => handleGenericActivity('accept_land_offer', { contractId: offer.id, landId: selectedPolygonId })}
                      variant="success"
                      className="w-full mt-1"
                    >
                      Accept Offer
                    </ActionButton>
                  </div>
                ))}
              </div>
            )}

            {/* Display Current Citizen's Buy Offer (if they are not the owner) */}
            {myBuyOffer && !isOwner && (
              <div className="mt-4 p-3 rounded-lg bg-purple-50 border border-purple-200">
                <h4 className="text-md font-semibold text-purple-700 mb-1">Your Offer to Buy:</h4>
                <p>Amount: {myBuyOffer.PricePerResource.toLocaleString()} ⚜️ ducats</p>
                <ActionButton
                  onClick={() => handleGenericActivity('cancel_land_offer', { contractId: myBuyOffer.id, landId: selectedPolygonId })}
                  variant="danger"
                  className="w-full mt-1"
                >
                  Cancel Your Offer
                </ActionButton>
              </div>
            )}
            
            {/* Show "Make an Offer" input/button if:
                - Land is owned by someone else OR land is unowned but NOT available from state (e.g. specific auction)
                - AND current citizen does not already have an active buy offer for this land
                - AND the land is not currently listed by the owner (to avoid confusion with "Buy Now")
            */}
            {currentCitizenUsername && !isOwner && !myBuyOffer && !landListingByOwner && !isAvailableFromState && (
              showOfferInput ? (
                <div className="flex flex-col w-full space-y-3 mt-3">
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      value={offerAmount}
                      onChange={(e) => setOfferAmount(parseInt(e.target.value) || 0)}
                      className="px-3 py-2 border border-amber-300 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="Offer amount in ⚜️ ducats"
                      min="1"
                    />
                    <ActionButton
                      onClick={() => {
                        if (offerAmount <= 0) {
                          alert('Please enter a valid offer amount.');
                          return;
                        }
                        handleGenericActivity('make_offer_for_land', { 
                          landId: selectedPolygonId, 
                          offerPrice: offerAmount, 
                          sellerUsername: owner // Can be null if land is unowned and offers are allowed
                        });
                      }}
                      variant="primary"
                      disabled={isLoading}
                    >
                      Submit Offer
                    </ActionButton>
                  </div>
                  <ActionButton onClick={() => setShowOfferInput(false)} variant="secondary" disabled={isLoading}>
                    Cancel
                  </ActionButton>
                </div>
              ) : (
                <ActionButton
                  onClick={() => setShowOfferInput(true)}
                  variant="primary"
                  className="w-full mt-2"
                  disabled={isLoading}
                >
                  Make an Offer to Purchase
                </ActionButton>
              )
            )}
          </div>

          {/* 5. Historical Name with enhanced styling */}
          {selectedPolygon?.historicalName && (
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Historical Name</h3>
              <p className="font-serif text-xl font-semibold text-amber-800">{selectedPolygon.historicalName}</p>
              {selectedPolygon.englishName && (
                <p className="mt-1 text-sm italic text-amber-600">{selectedPolygon.englishName}</p>
              )}
            </div>
          )}
          
          {/* 6. Historical Description with enhanced styling */}
          {selectedPolygon?.historicalDescription && (
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Historical Description</h3>
              <p className="text-sm text-gray-700 leading-relaxed">{selectedPolygon.historicalDescription}</p>
            </div>
          )}
        </div>

        {/* Action buttons at the bottom are now integrated above or removed if redundant */}
        <div className="pt-4 mt-auto border-t-2 border-amber-300">
           {/* This section can be used for general actions or kept empty if all actions are contextual above */}
        </div>
        
        {/* Add a decorative Venetian footer */}
        <div className="mt-4 text-center">
          <div className="text-amber-600 text-xs italic">
            La Serenissima Repubblica di Venezia
          </div>
          <div className="flex justify-center mt-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
      
      {showPurchaseConfirmation && transaction && (
        <LandPurchaseConfirmation
          landId={selectedPolygonId || ''}
          landName={selectedPolygon?.historicalName || selectedPolygon?.englishName}
          price={transaction.price}
          onConfirm={() => {
            handleConfirmPurchase();
            return null;
          }}
          onCancel={() => setShowPurchaseConfirmation(false)}
          isLoading={isPurchasing}
        />
      )}
      
      {/* List Land For Sale Modal */}
      {showListForSaleModal && selectedPolygonId && (
        <ListLandForSaleModal
          landId={selectedPolygonId}
          landName={selectedPolygon?.historicalName}
          englishName={selectedPolygon?.englishName}
          landDescription={selectedPolygon?.historicalDescription}
          onClose={() => setShowListForSaleModal(false)}
          onComplete={(price: number) => {
            // Refresh the panel to show the new listing
            // The modal now calls handleGenericActivity directly.
            // This onComplete might still be useful for UI cleanup or notifications.
            console.log(`ListLandForSaleModal completed, price: ${price}`);
            setRefreshKey(prevKey => prevKey + 1);
            setShowListForSaleModal(false); // Ensure modal closes
          }}
          // Pass the handleGenericActivity function to the modal
          onInitiateListForSale={(landId, price) => 
            handleGenericActivity('list_land_for_sale', { landId, price, sellerUsername: currentCitizenUsername })
          }
        />
      )}
    </div>
  );
  
  // handleConfirmPurchase is no longer directly used as purchases go through activities.
  // If a confirmation step is needed before calling handleGenericActivity,
  // that logic would be placed before the call.
}
