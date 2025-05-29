import { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { getBackendBaseUrl } from '@/lib/utils/apiUtils';
import { useRouter } from 'next/navigation';
import ActionButton from '../UI/ActionButton';
import WalletStatus from '../UI/WalletStatus';
import PlayerProfile from '../UI/PlayerProfile';
import LandPurchaseConfirmation from '../UI/LandPurchaseConfirmation';
import ListLandForSaleModal from '../UI/ListLandForSaleModal';
import AnimatedDucats from '../UI/AnimatedDucats';
import { Polygon } from './types';
import { eventBus, EventTypes } from '../../lib/utils/eventBus';
import { getWalletAddress } from '../../lib/utils/walletUtils';

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
  const [transaction, setTransaction] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [offerAmount, setOfferAmount] = useState<number>(10000000); // Default offer of 10M COMPUTE
  const [showOfferInput, setShowOfferInput] = useState<boolean>(false);
  const [offers, setOffers] = useState<any[]>([]);
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
            const citizenResponse = await fetch(`${getBackendBaseUrl()}/api/citizens/${owner}`);
            
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

  // Add this effect to fetch transaction data when a polygon is selected
  useEffect(() => {
    if (selectedPolygonId) {
      setIsLoading(true);
      console.log(`Fetching transaction data for land ${selectedPolygonId}`);

      // Function to fetch transaction with retry logic
      const fetchTransactionWithRetry = async (retries = 3, delay = 1000) => {
        try {
          // Use the new Next.js API route
          const response = await fetch(`/api/transaction/land/${selectedPolygonId}`);

          if (!response.ok) {
            if (response.status === 404) {
              // No transaction found, that's okay
              console.log(`No transaction found for land ${selectedPolygonId}`);
              setTransaction(null);
              return null;
            }
            throw new Error(`Failed to fetch transaction: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();
          if (data) {
            console.log(`Transaction data for land ${selectedPolygonId}:`, data);
            setTransaction(data);
          } else {
            console.log(`No transaction data returned for land ${selectedPolygonId}`);
            setTransaction(null);
          }
          return data;
        } catch (error) {
          console.error(`Error fetching transaction (attempt ${4-retries}/3):`, error);
          if (retries > 1) {
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchTransactionWithRetry(retries - 1, delay * 2);
          } else {
            // Last attempt failed, continue without a transaction
            console.warn('All retry attempts failed, continuing without transaction data');
            setTransaction(null);
            return null;
          }
        }
      };

      // Start the fetch with retries
      fetchTransactionWithRetry()
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setTransaction(null);
      setIsLoading(false);
    }
  }, [selectedPolygonId, refreshKey]);
  
  // Add this useEffect to fetch offers when a polygon is selected
  useEffect(() => {
    if (selectedPolygonId) {
      console.log(`Fetching offers for land ${selectedPolygonId}`);
      
      // Function to fetch offers with retry logic
      const fetchOffersWithRetry = async (retries = 3, delay = 1000) => {
        try {
          // Use the new Next.js API route for land offers
          const response = await fetch(`/api/transactions/land-offers/${selectedPolygonId}`);
          
          if (!response.ok) {
            if (response.status === 404) {
              // No offers found, that's okay
              console.log(`No offers found for land ${selectedPolygonId}`);
              return [];
            }
            throw new Error(`Failed to fetch offers: ${response.status} ${response.statusText}`);
          }
          
          const data = await response.json();
          if (data && Array.isArray(data)) {
            console.log(`Found ${data.length} offers for land ${selectedPolygonId}:`, data);
            
            // Filter out offers from the same seller as the main transaction
            // This prevents showing the same transaction as both "For Sale" and an "Incoming offer"
            const filteredOffers = transaction ? 
              data.filter(offer => offer.id !== transaction.id) : 
              data;
              
            console.log(`After filtering, ${filteredOffers.length} offers remain`);
            return filteredOffers;
          } else {
            console.log(`Invalid offers data format for land ${selectedPolygonId}:`, data);
            return [];
          }
        } catch (error) {
          console.error(`Error fetching offers (attempt ${4-retries}/3):`, error);
          if (retries > 1) {
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchOffersWithRetry(retries - 1, delay * 2);
          } else {
            // Last attempt failed, return empty array
            console.warn('All retry attempts failed, continuing without offers data');
            return [];
          }
        }
      };
      
      // Start the fetch with retries
      fetchOffersWithRetry()
        .then(filteredOffers => {
          setOffers(filteredOffers);
        });
    } else {
      setOffers([]);
    }
  }, [selectedPolygonId, transaction, refreshKey]); // Add refreshKey as a dependency to refresh offers when an offer is created
  
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
  
  return (
    <div 
      className={`fixed top-0 right-0 h-full w-144 bg-amber-50 shadow-xl transform transition-transform duration-300 ease-in-out z-20 border-l-4 border-amber-600 ${
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
          
          {/* 4. Transaction information with enhanced styling */}
          {transaction && !transaction.buyer && (
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">For Sale</h3>
              <p className="text-2xl font-semibold text-center">
                <span style={{ color: '#d4af37' }}>
                  <AnimatedDucats 
                    value={transaction.price} 
                    suffix="⚜️ ducats" 
                    duration={1500}
                  />
                </span>
              </p>
              
              {/* Transaction data debugging - not rendered */}
              {(() => {
                // This is an immediately-invoked function expression (IIFE) that doesn't return anything
                console.log('Transaction data:', transaction);
                console.log('Transaction seller type:', typeof transaction.seller);
                return null; // Return null to avoid the TypeScript error
              })()}
              
              {/* Check if current citizen is the seller using our helper function */}
              {isCurrentCitizenTheSeller(transaction) ? (
                /* Show Remove from Sale button if citizen is the owner */
                <button
                  onClick={async () => {
                    // Get the current wallet address
                    const walletAddress = getWalletAddress();
                    
                    if (!walletAddress) {
                      alert('Please connect your wallet first');
                      return;
                    }
                    
                    console.log('Removing listing, seller:', transaction.seller, 'wallet:', walletAddress);
                    
                    try {
                      // Cancel the transaction
                      const response = await fetch(`${getBackendBaseUrl()}/api/transaction/${transaction.id}/cancel`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          seller: walletAddress
                        }),
                      });
                      
                      if (!response.ok) {
                        throw new Error('Failed to remove listing');
                      }
                      
                      alert('Your land has been removed from sale');
                      // Refresh the panel
                      setRefreshKey(prevKey => prevKey + 1);
                    } catch (error) {
                      console.error('Error removing listing:', error);
                      alert('Failed to remove listing. Please try again.');
                    }
                  }}
                  className="mt-4 w-full px-4 py-3 bg-white text-amber-600 text-base font-medium rounded-lg hover:bg-amber-50 transition-colors flex items-center justify-center border-2 border-amber-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Remove from Sale
                </button>
              ) : (
                /* Show Acquire Land button if citizen is not the owner */
                <button
                  onClick={() => {
                    // Get the current wallet address using the more reliable getWalletAddress function
                    const walletAddress = getWalletAddress();
                    
                    console.log('Attempting to acquire land, seller:', transaction.seller, 'wallet:', walletAddress);
                    
                    if (!walletAddress) {
                      alert('Please connect your wallet first');
                      return;
                    }
                    
                    // Check if this is the citizen's own listing
                    if (isCurrentCitizenTheSeller(transaction)) {
                      console.log('Citizen tried to purchase their own listing');
                      alert('You cannot purchase your own listing');
                      return;
                    }
                    
                    console.log('Dispatching showLandPurchaseModal event');
                    // Dispatch a global event to show the purchase modal
                    window.dispatchEvent(new CustomEvent('showLandPurchaseModal', {
                      detail: { 
                        landId: selectedPolygonId,
                        landName: selectedPolygon?.historicalName || selectedPolygon?.englishName,
                        transaction: transaction,
                        onComplete: () => {
                          // This will be called after the purchase is complete
                          console.log('Purchase completed, refreshing panel');
                          setRefreshKey(prevKey => prevKey + 1);
                          setJustCompletedTransaction(true);
                        }
                      }
                    }));
                  }}
                  className="mt-4 w-full px-4 py-3 bg-amber-600 text-white text-base font-medium rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Acquire Land
                </button>
              )}
            </div>
          )}
          
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

          
          {/* Offers section with enhanced styling */}
          {offers.length > 0 && (
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-3">Offers</h3>
              <div className="space-y-3">
                {offers.map((offer, index) => (
                  <div key={index} className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-green-600">
                        {offer.price.toLocaleString()} <span className="text-xs">⚜️ ducats</span>
                      </span>
                      <span className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                        {new Date(offer.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs mt-1">
                      {offer.seller === (sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress')) ? (
                        <span className="text-blue-600 font-medium">Your outgoing offer</span>
                      ) : (
                        <span className="text-purple-600 font-medium">Incoming offer from {offer.seller.slice(0, 6)}...{offer.seller.slice(-4)}</span>
                      )}
                    </div>
                    {/* Add accept button for incoming offers with improved styling */}
                    {offer.seller !== owner && (
                      <button
                        onClick={async () => {
                          // Get the current wallet address
                          const walletAddress = getWalletAddress();
                        
                          if (!walletAddress) {
                            alert('Please connect your wallet first');
                            return;
                          }
                        
                          // Only the owner can accept offers
                          if (owner !== walletAddress) {
                            alert('Only the current owner can accept offers');
                            return;
                          }
                          
                          try {
                            // Execute the transaction
                            const response = await fetch(`${getBackendBaseUrl()}/api/transaction/${offer.id}/execute`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                buyer: offer.seller
                              }),
                            });
                            
                            if (!response.ok) {
                              throw new Error('Failed to accept offer');
                            }
                            
                            const data = await response.json();
                            alert(`Offer accepted! Land transferred to ${offer.seller}`);
                            // Refresh the page to update the UI
                            window.location.reload();
                          } catch (error) {
                            console.error('Error accepting offer:', error);
                            alert('Failed to accept offer. Please try again.');
                          }
                        }}
                        className="mt-2 w-full px-3 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Accept Offer
                      </button>
                    )}
                    {/* Add cancel button for outgoing offers with improved styling */}
                    {offer.seller === owner && (
                      <button
                        onClick={async () => {
                          // Get the current wallet address
                          const walletAddress = getWalletAddress();
                          
                          if (!walletAddress) {
                            alert('Please connect your wallet first');
                            return;
                          }
                          
                          // Only the seller can cancel their own offers
                          if (owner !== walletAddress) {
                            alert('Only the offer creator can cancel it');
                            return;
                          }
                          
                          try {
                            // Cancel the transaction
                            const response = await fetch(`${getBackendBaseUrl()}/api/transaction/${offer.id}/cancel`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                seller: walletAddress
                              }),
                            });
                            
                            if (!response.ok) {
                              throw new Error('Failed to cancel offer');
                            }
                            
                            const data = await response.json();
                            alert('Offer cancelled successfully');
                            // Refresh offers
                            setOffers(offers.filter(o => o.id !== offer.id));
                          } catch (error) {
                            console.error('Error cancelling offer:', error);
                            alert('Failed to cancel offer. Please try again.');
                          }
                        }}
                        className="mt-2 w-full px-3 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Cancel Offer
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons at the bottom with improved styling */}
        <div className="pt-4 mt-auto border-t-2 border-amber-300">
          {owner && !isCurrentCitizenTheOwner(owner) && (
            // Only show "Make an Offer" button if the land is owned by someone else (not the current citizen)
            showOfferInput ? (
              <div className="flex flex-col w-full space-y-3">
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
                    onClick={async () => {
                      // Get the current wallet address
                      const walletAddress = getWalletAddress();
                      
                      if (!walletAddress) {
                        alert('Please connect your wallet first');
                        return;
                      }
                      
                      if (offerAmount <= 0) {
                        alert('Please enter a valid offer amount');
                        return;
                      }
                      
                      try {
                        // Use the TransactionService to create the transaction
                        const { getTransactionService } = require('../../lib/services/TransactionService');
                        const transactionService = getTransactionService();
                        
                        // Create a transaction for the land
                        const transaction = await transactionService.createOffer(
                          selectedPolygonId!, // The land ID
                          'land', // Explicitly set type to 'land'
                          owner!, // Current owner as seller
                          offerAmount, // The offer amount
                          {
                            historicalName: selectedPolygon?.historicalName,
                            englishName: selectedPolygon?.englishName,
                            description: selectedPolygon?.historicalDescription
                          }
                        );
                        
                        alert(`Offer of ${offerAmount.toLocaleString()} ⚜️ ducats created successfully!`);
                        setShowOfferInput(false);
                        
                        // Refresh the offers list
                        setRefreshKey(prevKey => prevKey + 1);
                      } catch (error) {
                        console.error('Error creating offer:', error);
                        alert('Failed to create offer. Please try again.');
                      }
                    }}
                    variant="primary"
                  >
                    Submit Offer
                  </ActionButton>
                </div>
                <ActionButton
                  onClick={() => setShowOfferInput(false)}
                  variant="secondary"
                >
                  Cancel
                </ActionButton>
              </div>
            ) : (
              <ActionButton
                onClick={() => setShowOfferInput(true)}
                variant="primary"
                className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-lg shadow-md border border-amber-700 transition-all flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-serif">Make an Offer to Purchase</span>
              </ActionButton>
            )
          )}
          
          {/* Show a message if the citizen owns this property */}
          {owner && owner === (sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress')) && (
            <div className="bg-amber-100 p-4 rounded-lg text-center border border-amber-300">
              <p className="text-amber-800 font-medium">This property belongs to your noble house</p>
              <p className="text-sm text-amber-600 mt-1 italic">
                "May your family prosper under the wings of the Lion of Saint Mark"
              </p>
              
              {/* Add List for Sale button */}
              <button
                onClick={() => setShowListForSaleModal(true)}
                className="mt-4 w-full bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-lg shadow-md border border-amber-700 transition-all flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-serif">List Land For Sale</span>
              </button>
            </div>
          )}
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
          onComplete={() => {
            // Refresh the panel to show the new listing
            setRefreshKey(prevKey => prevKey + 1);
          }}
        />
      )}
    </div>
  );
  
  // Land purchase confirmation is disabled to prevent land modification
  function handleConfirmPurchase(): React.ReactNode {
    console.log('Land purchase is disabled to prevent land modification');
    alert('Land purchase is not allowed in this version');
    setIsPurchasing(false);
    setShowPurchaseConfirmation(false);
    return null; // Return null to satisfy ReactNode type requirement
  }
}
