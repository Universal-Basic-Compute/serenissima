import { useState, useEffect, useCallback, useMemo } from 'react';
import { contractService, Contract } from '@/lib/services/ContractService';
import { hoverStateService } from '@/lib/services/HoverStateService';
import { useRouter } from 'next/navigation';
import { throttle } from '@/lib/utils/performanceUtils';

// Function to determine if a contract is active/being sold
const isContractActive = (contract: Contract): boolean => {
  // A contract is considered active if it's a public sell or has a buyer
  return contract.type === 'public_sell' || (contract.buyer !== null && contract.buyer !== undefined);
};

interface ContractMarkersProps {
  isVisible: boolean;
  scale: number;
  offset: { x: number, y: number };
  canvasWidth: number;
  canvasHeight: number;
}

export default function ContractMarkers({ 
  isVisible, 
  scale, 
  offset, 
  canvasWidth, 
  canvasHeight 
}: ContractMarkersProps) {
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractsByLocation, setContractsByLocation] = useState<Record<string, Contract[]>>({});
  const [hoveredLocation, setHoveredLocation] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  
  // Function to get the current citizen's username
  const getCurrentUsername = useCallback(() => {
    return contractService.getCurrentUsername();
  }, []);

  // Create throttled versions of hover handlers to improve performance
  const handleMouseEnter = useMemo(() => 
    throttle((locationKey: string, locationContracts: Contract[]) => {
      setHoveredLocation(locationKey);
      
      // Use the new hover state system
      hoverStateService.setHoverState('contract', locationKey, {
        locationKey,
        resources: locationContracts.map(contract => ({
          id: contract.contractId,
          name: contract.resourceType,
          category: 'Contract Contract',
          description: `${contract.type === 'public_sell' ? 'Public Sell' : contract.seller === currentUsername ? 'Your Sell' : 'Your Buy'} Contract`,
          icon: 'contract.png',
          amount: contract.amount,
          owner: contract.seller,
          buildingId: contract.sellerBuilding,
          location: contract.location,
          rarity: 'common',
          contractType: contract.type,
          price: contract.price
        })),
        position: locationContracts[0].location
      });
    }, 100), // 100ms throttle
    [currentUsername]
  );
  
  // Throttled mouse leave handler
  const handleMouseLeave = useMemo(() => 
    throttle(() => {
      setHoveredLocation(null);
      hoverStateService.clearHoverState();
    }, 100), // 100ms throttle
    []
  );
  
  // Handle contract click
  const handleContractClick = useCallback((contract: Contract) => {
    if (contract.sellerBuilding) {
      // Set the selected building ID in the global state
      window.dispatchEvent(new CustomEvent('showBuildingDetailsPanel', {
        detail: { buildingId: contract.sellerBuilding }
      }));
    }
  }, []);
  
  // Load contracts when component becomes visible
  useEffect(() => {
    if (isVisible) {
      loadContracts();
      
      // Get current username
      const username = getCurrentUsername();
      setCurrentUsername(username);
    }
    
    // Set up event listener for filtering by resource type
    const handleFilterByResource = (event: CustomEvent) => {
      if (event.detail && event.detail.resourceType) {
        filterContractsByResourceType(event.detail.resourceType);
      }
    };
    
    window.addEventListener('filterContractsByResource', handleFilterByResource as EventListener);
    
    // Clean up throttled functions and event listeners when component unmounts
    return () => {
      handleMouseEnter.cancel();
      handleMouseLeave.cancel();
      window.removeEventListener('filterContractsByResource', handleFilterByResource as EventListener);
    };
  }, [isVisible, getCurrentUsername, handleMouseEnter, handleMouseLeave]);
  
  // Function to filter contracts by resource type
  const filterContractsByResourceType = async (resourceType: string) => {
    try {
      setIsLoading(true);
      
      // Use the ContractService to get contracts for this resource type
      const filteredContracts = await contractService.getContractsForResourceType(resourceType);
      
      // Filter contracts that have location data
      const contractsWithLocation = filteredContracts.filter(
        contract => contract.location && contract.location.lat && contract.location.lng
      );
      
      setContracts(contractsWithLocation);
      
      // Group contracts by location
      const groupedContracts: Record<string, Contract[]> = {};
      contractsWithLocation.forEach(contract => {
        const locationKey = `${contract.location.lat.toFixed(6)}_${contract.location.lng.toFixed(6)}`;
        if (!groupedContracts[locationKey]) {
          groupedContracts[locationKey] = [];
        }
        groupedContracts[locationKey].push(contract);
      });
      
      setContractsByLocation(groupedContracts);
      console.log(`Filtered to ${contractsWithLocation.length} contracts for resource type: ${resourceType}`);
      
      // Set category filter to null to show all filtered contracts
      setCategoryFilter(null);
    } catch (error) {
      console.error(`Error filtering contracts by resource type ${resourceType}:`, error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Function to load contracts
  const loadContracts = async () => {
    try {
      setIsLoading(true);
      
      // Get current username
      const username = getCurrentUsername();
      
      // Fetch contracts using the improved ContractService
      const allContracts = await contractService.getContracts(username);
      
      // Filter contracts that have location data
      const contractsWithLocation = allContracts.filter(
        contract => contract.location && contract.location.lat && contract.location.lng
      );
      
      setContracts(contractsWithLocation);
      
      // Get contracts already grouped by location from the service
      const contractsByLocationData = await contractService.getContractsByLocation();
      
      // Filter out locations with no coordinates
      const validContractsByLocation: Record<string, Contract[]> = {};
      Object.entries(contractsByLocationData).forEach(([locationKey, contracts]) => {
        if (contracts.length > 0 && contracts[0].location) {
          validContractsByLocation[locationKey] = contracts;
        }
      });
      
      setContractsByLocation(validContractsByLocation);
      console.log(`Loaded ${contractsWithLocation.length} contracts with location data`);
      console.log(`Grouped into ${Object.keys(validContractsByLocation).length} unique locations`);
    } catch (error) {
      console.error('Error loading contracts for map:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Convert lat/lng to screen coordinates
  const latLngToScreen = useCallback((lat: number, lng: number): { x: number, y: number } => {
    // Convert lat/lng to world coordinates
    const x = (lng - 12.3326) * 20000;
    const y = (lat - 45.4371) * 20000;
    
    // Apply isometric projection
    return {
      x: x * scale + canvasWidth / 2 + offset.x,
      y: (-y) * scale * 1.4 + canvasHeight / 2 + offset.y
    };
  }, [scale, offset, canvasWidth, canvasHeight]);
  
  // Filter contracts by category
  const filteredContractsByLocation = useCallback(() => {
    if (!categoryFilter) return contractsByLocation;
    
    const filtered: Record<string, Contract[]> = {};
    
    Object.entries(contractsByLocation).forEach(([locationKey, locationContracts]) => {
      const filteredContracts = locationContracts.filter(
        contract => {
          if (categoryFilter === 'public_sell') {
            return contract.type === 'public_sell';
          } else if (categoryFilter === 'citizen_sell') {
            return contract.seller === currentUsername;
          } else if (categoryFilter === 'citizen_buy') {
            return contract.buyer === currentUsername;
          }
          return true;
        }
      );
      
      if (filteredContracts.length > 0) {
        filtered[locationKey] = filteredContracts;
      }
    });
    
    return filtered;
  }, [contractsByLocation, categoryFilter, currentUsername]);
  
  // If not visible, don't render anything
  if (!isVisible) return null;
  
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
      {/* Filter controls - make this part pointer-events-auto */}
      <div className="absolute bottom-4 left-20 bg-black/70 rounded-lg p-2 pointer-events-auto z-10">
        <div className="flex justify-between items-center mb-2">
          <div className="text-white text-sm">Filter by Contract Type:</div>
          <button 
            className="text-amber-400 hover:text-amber-300 px-2 py-1 rounded"
            onClick={loadContracts}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Refreshing...
              </span>
            ) : (
              <span>Refresh</span>
            )}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            className={`px-2 py-1 text-xs rounded ${!categoryFilter ? 'bg-amber-600' : 'bg-gray-700'}`}
            onClick={() => setCategoryFilter(null)}
          >
            All
          </button>
          <button 
            className={`px-2 py-1 text-xs rounded ${categoryFilter === 'public_sell' ? 'bg-amber-600' : 'bg-gray-700'}`}
            onClick={() => setCategoryFilter('public_sell')}
          >
            Public Sells
          </button>
          <button 
            className={`px-2 py-1 text-xs rounded ${categoryFilter === 'citizen_sell' ? 'bg-amber-600' : 'bg-gray-700'}`}
            onClick={() => setCategoryFilter('citizen_sell')}
          >
            My Sells
          </button>
          <button 
            className={`px-2 py-1 text-xs rounded ${categoryFilter === 'citizen_buy' ? 'bg-amber-600' : 'bg-gray-700'}`}
            onClick={() => setCategoryFilter('citizen_buy')}
          >
            My Buys
          </button>
        </div>
      </div>
      
      {Object.entries(filteredContractsByLocation()).map(([locationKey, locationContracts]) => {
        // Parse location from key
        const [lat, lng] = locationKey.split('_').map(parseFloat);
        const { x, y } = latLngToScreen(lat, lng);
        
        // Determine if this location is being hovered
        const isHovered = hoveredLocation === locationKey;
        
        // Calculate total contracts at this location
        const totalContracts = locationContracts.length;
        
        // Get the first contract to determine the resource type
        const firstContract = locationContracts[0];
        const resourceType = firstContract.resourceType;
        
        return (
          <div 
            key={locationKey}
            className="absolute pointer-events-auto"
            style={{ 
              left: `${x}px`, 
              top: `${y}px`, 
              transform: 'translate(-50%, -50%)',
              zIndex: isHovered ? 15 : 10
            }}
            onMouseEnter={() => handleMouseEnter(locationKey, locationContracts)}
            onMouseLeave={() => handleMouseLeave()}
          >
            {isHovered ? (
              // Expanded view when hovered - show all contracts
              <div className="relative">
                {locationContracts.map((contract, index) => {
                  // Determine border color based on contract type
                  let borderColor = 'transparent'; // Default to transparent
                  
                  if (contract.type === 'public_sell') {
                    borderColor = '#10B981'; // Green for public sells
                  } else if (contract.seller === currentUsername) {
                    borderColor = '#3B82F6'; // Blue for citizen sells
                  } else if (contract.buyer === currentUsername) {
                    borderColor = '#EF4444'; // Red for citizen buys
                  }
                  
                  return (
                    <div 
                      key={contract.contractId}
                      className="absolute bg-gray-900/70 rounded-lg overflow-hidden flex flex-col items-center justify-center shadow-lg cursor-pointer"
                      style={{ 
                        width: '48px', // WAS 96px
                        height: '60px', // WAS 120px
                        left: `${Math.cos(2 * Math.PI * index / locationContracts.length) * 60}px`, // WAS 120px
                        top: `${Math.sin(2 * Math.PI * index / locationContracts.length) * 60}px`, // WAS 120px
                        transition: 'all 0.3s ease-out',
                        borderWidth: '1px', // WAS 2px
                        borderColor: borderColor,
                        opacity: isContractActive(contract) ? 1 : 0.5 // Apply transparency for inactive contracts
                      }}
                      onClick={() => handleContractClick(contract)}
                    >
                      <div className="relative w-full h-full group">
                        {/* Image container with rounded corners */}
                        <div className="w-full h-[48px] flex items-center justify-center p-1"> {/* WAS h-[96px], p-2 */}
                          {/* Log resource type to help with debugging */}
                          <img 
                            src={`/resources/${resourceType.toLowerCase().replace(/\s+/g, '_')}.png`}
                            alt={resourceType}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              console.log(`Failed to load image for ${resourceType}, trying fallback paths`);
                              // Try alternative paths if the first one fails
                              (e.target as HTMLImageElement).src = `/images/resources/${resourceType.toLowerCase().replace(/\s+/g, '_')}.png`;
                              (e.target as HTMLImageElement).onerror = () => {
                                (e.target as HTMLImageElement).src = '/images/resources/default.png';
                                (e.target as HTMLImageElement).onerror = () => {
                                  (e.target as HTMLImageElement).src = '/resources/default.png';
                                };
                              };
                            }}
                          />
                        </div>
                          
                        {/* Resource name below the image */}
                        <div className="w-full h-[12px] flex items-center justify-center bg-amber-900/80 text-white text-[8px] px-1 truncate"> {/* WAS h-[24px], text-[12px], px-2 */}
                          {resourceType}
                        </div>
                          
                        {/* Price badge */}
                        <div className="absolute -bottom-0.5 -right-0.5 bg-amber-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center"> {/* WAS text-base, w-6, h-6 */}
                          {contract.price}
                        </div>
                          
                        {/* Detailed tooltip */}
                        <div className="absolute opacity-0 group-hover:opacity-100 bottom-full left-1/2 transform -translate-x-1/2 mb-1 p-2 bg-black/90 text-white text-[10px] rounded w-40 pointer-events-none transition-opacity z-15"> {/* WAS mb-2, p-3, text-xs, w-56 */}
                          <div className="font-bold text-amber-300 text-sm">{resourceType}</div> {/* WAS text-base */}
                          <div className="mt-0.5 text-[9px]"> {/* WAS mt-1, text-xs */}
                            {contract.type === 'public_sell' ? 'Public Sell Contract' : 
                             contract.seller === currentUsername ? 'Your Sell Contract' : 'Your Buy Contract'}
                            {!isContractActive(contract) && (
                              <span className="ml-2 text-red-400">(Inactive)</span>
                            )}
                          </div>
                          <div className="mt-1 flex justify-between">
                            <span>Price: {contract.price} ⚜️</span>
                            <span>Amount: {contract.amount}</span>
                          </div>
                          <div className="mt-1 text-xs">
                            Seller: {contract.seller}
                          </div>
                          {contract.buyer && (
                            <div className="mt-1 text-xs">
                              Buyer: {contract.buyer}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {/* Center indicator */}
                <div 
                  className="w-5 h-5 bg-gray-800/70 border border-gray-600 rounded-full flex items-center justify-center text-white text-[10px] font-bold cursor-pointer"  /* WAS w-8, h-8, text-sm */
                  style={{ borderWidth: '1px' }}
                  onClick={() => handleContractClick(locationContracts[0])}
                  onMouseEnter={() => {
                    // Create a summary of resources at this location
                    const resourceTypes = [...new Set(locationContracts.map(c => c.resourceType))];
                    const totalAmount = locationContracts.reduce((sum, c) => sum + (c.amount || 0), 0);
                    const publicSellCount = locationContracts.filter(c => c.type === 'public_sell').length;
                    const citizenSellCount = locationContracts.filter(c => c.seller === currentUsername).length;
                    const citizenBuyCount = locationContracts.filter(c => c.buyer === currentUsername).length;
                    
                    // Use HoverStateService to set resource hover state
                    const locationKey = `${locationContracts[0].location.lat.toFixed(6)}_${locationContracts[0].location.lng.toFixed(6)}`;
                    const contractIds = locationContracts.map(c => c.contractId).join('_');
                    
                    hoverStateService.setHoverState('contract', contractIds + '_summary', {
                      locationKey,
                      resources: [
                        {
                          id: 'contract_summary',
                          name: 'Contract Summary',
                          category: 'Contracts',
                          description: `${locationContracts.length} contracts at this location`,
                          icon: 'contract.png',
                          amount: totalAmount,
                          buildingId: locationContracts[0].sellerBuilding,
                          location: locationContracts[0].location,
                          rarity: 'common',
                          contractSummary: true,
                          resourceTypes,
                          publicSellCount,
                          citizenSellCount,
                          citizenBuyCount,
                          allContracts: locationContracts // Pass all contracts for detailed analysis
                        }
                      ],
                      position: locationContracts[0].location
                    });
                  }}
                  onMouseLeave={() => {
                    hoverStateService.clearHoverState();
                  }}
                >
                  {locationContracts.length}
                </div>
              </div>
            ) : (
              // Collapsed view - show stack of contracts
              <div className="relative">
                {/* Stacked contracts indicator */}
                <div className="relative">
                  {/* Show up to 3 stacked icons */}
                  {locationContracts.slice(0, Math.min(3, locationContracts.length)).map((contract, index) => {
                    // Determine border color based on contract type
                    let borderColor = 'transparent'; // Default to transparent
                    
                    if (contract.type === 'public_sell') {
                      borderColor = '#10B981'; // Green for public sells
                    } else if (contract.seller === currentUsername) {
                      borderColor = '#3B82F6'; // Blue for citizen sells
                    } else if (contract.buyer === currentUsername) {
                      borderColor = '#EF4444'; // Red for citizen buys
                    }
                    
                    return (
                      <div 
                        key={contract.contractId}
                        className="absolute bg-gray-900/70 rounded-lg overflow-hidden cursor-pointer"
                        style={{ 
                          width: '27px', // WAS 54px
                          height: '27px', // WAS 54px
                          left: `${index * 4.5}px`, // WAS 9px
                          top: `${-index * 4.5}px`, // WAS 9px
                          zIndex: 40 - index,
                          boxShadow: '0 0.5px 1.5px rgba(0,0,0,0.3)', // Adjusted shadow
                          borderWidth: '1px', // WAS 2px
                          borderColor: borderColor,
                          opacity: isContractActive(contract) ? 1 : 0.5 // Apply transparency for inactive contracts
                        }}
                        onClick={() => handleContractClick(contract)}
                      >
                        <img 
                          src={`/resources/${resourceType.toLowerCase().replace(/\s+/g, '_')}.png`}
                          alt={resourceType}
                          className="w-full h-full object-contain p-2"
                          onError={(e) => {
                            // Try alternative paths if the first one fails
                            (e.target as HTMLImageElement).src = `/images/resources/${resourceType.toLowerCase().replace(/\s+/g, '_')}.png`;
                            (e.target as HTMLImageElement).onerror = () => {
                              (e.target as HTMLImageElement).src = '/images/resources/default.png';
                              (e.target as HTMLImageElement).onerror = () => {
                                (e.target as HTMLImageElement).src = '/resources/default.png';
                              };
                            };
                          }}
                        />
                      </div>
                    );
                  })}
                  
                  {/* Count badge */}
                  <div 
                    className="absolute -bottom-0.5 -right-0.5 bg-amber-600 text-white text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center cursor-pointer" /* WAS text-xs, w-5, h-5 */
                    onClick={() => handleContractClick(locationContracts[0])}
                    onMouseEnter={() => {
                      // Create a summary of resources at this location
                      const resourceTypes = [...new Set(locationContracts.map(c => c.resourceType))];
                      const totalAmount = locationContracts.reduce((sum, c) => sum + (c.amount || 0), 0);
                      const publicSellCount = locationContracts.filter(c => c.type === 'public_sell').length;
                      const citizenSellCount = locationContracts.filter(c => c.seller === currentUsername).length;
                      const citizenBuyCount = locationContracts.filter(c => c.buyer === currentUsername).length;
                      
                      // Use HoverStateService to set resource hover state
                      const locationKey = `${locationContracts[0].location.lat.toFixed(6)}_${locationContracts[0].location.lng.toFixed(6)}`;
                      const contractIds = locationContracts.map(c => c.contractId).join('_');
                      
                      hoverStateService.setHoverState('contract', contractIds + '_summary', {
                        locationKey,
                        resources: [
                          {
                            id: 'contract_summary',
                            name: 'Contract Summary',
                            category: 'Contracts',
                            description: `${locationContracts.length} contracts at this location`,
                            icon: 'contract.png',
                            amount: totalAmount,
                            buildingId: locationContracts[0].sellerBuilding,
                            location: locationContracts[0].location,
                            rarity: 'common',
                            contractSummary: true,
                            resourceTypes,
                            publicSellCount,
                            citizenSellCount,
                            citizenBuyCount,
                            allContracts: locationContracts // Pass all contracts for detailed analysis
                          }
                        ],
                        position: locationContracts[0].location
                      });
                    }}
                    onMouseLeave={() => {
                      hoverStateService.clearHoverState();
                    }}
                  >
                    {totalContracts}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
