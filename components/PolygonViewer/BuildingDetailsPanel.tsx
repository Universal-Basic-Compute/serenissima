import { useEffect, useState, useRef } from 'react';
import { FaWarehouse, FaStore, FaBox } from 'react-icons/fa';
import Image from 'next/image';

// Declare the window interface extension for __polygonData
declare global {
  interface Window {
    __polygonData?: any[];
  }
}

// Ensure the global declaration is properly exported
export {};

// Access the global variable through window
import { getBackendBaseUrl } from '@/lib/utils/apiUtils';
import PlayerProfile from '../UI/PlayerProfile';

// Add a cache for resource icons to prevent refetching
const resourceIconCache = new Map<string, string>();

// Helper function to get resource icon path
const getResourceIconPath = (resourceId: string): string => {
  // Check if we already have this path in the cache
  if (resourceIconCache.has(resourceId)) {
    return resourceIconCache.get(resourceId)!;
  }
  
  // Convert the resource name to lowercase, replace spaces with underscores
  const formattedName = resourceId.toLowerCase().replace(/\s+/g, '_');
  
  // Create the path
  const iconPath = `/images/resources/${formattedName}.png`;
  
  // Store in cache
  resourceIconCache.set(resourceId, iconPath);
  
  // Return the formatted name with .png extension
  return iconPath;
};

// Add this function to dynamically find the building image path
const getBuildingImagePath = async (type: string, variant?: string): Promise<string> => {
  try {
    console.log(`Looking for image for building type: ${type}, variant: ${variant || 'none'}`);
    
    // Try the direct flat path first
    const flatImagePath = `/images/buildings/${type}.jpg`;
    console.log(`Trying flat path: ${flatImagePath}`);
    
    try {
      const response = await fetch(flatImagePath, { method: 'HEAD' });
      if (response.ok) {
        console.log(`Found image at flat path: ${flatImagePath}`);
        return flatImagePath;
      }
    } catch (error) {
      console.log(`Image not found at ${flatImagePath}`);
    }
    
    // If all else fails, use a default image
    console.log(`No image found for building type: ${type}, using default market_stall.jpg`);
    return '/images/buildings/market_stall.jpg';
  } catch (error) {
    console.error('Error getting building image path:', error);
    return '/images/buildings/market_stall.jpg';
  }
};

// Add this helper function to find and load the building definition file
const loadBuildingDefinition = async (type: string, variant?: string, buildingData?: any): Promise<any> => {
  try {
    console.log(`Looking for building definition for type: ${type}, variant: ${variant || 'none'}`);
    
    // First try the building-data API endpoint which searches recursively
    try {
      const response = await fetch(`/api/building-data/${encodeURIComponent(type)}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Found building definition via building-data API:', data);
        return data;
      } else {
        console.log(`building-data API returned ${response.status} for ${type}`);
      }
    } catch (error) {
      console.log(`Error with building-data API for ${type}:`, error);
    }
    
    // Then try the general data API with various paths
    const pathsToTry = [
      // Try with category/subcategory structure if we know them
      ...(buildingData?.category && buildingData?.subcategory 
        ? [`/api/data/buildings/${buildingData.category}/${buildingData.subcategory}/${type}.json`] 
        : []),
      // Try direct path
      `/api/data/buildings/${type}.json`,
      // Try lowercase
      `/api/data/buildings/${type.toLowerCase()}.json`,
      // Try with underscores instead of spaces
      `/api/data/buildings/${type.replace(/\s+/g, '_').toLowerCase()}.json`,
      // Try with hyphens instead of spaces
      `/api/data/buildings/${type.replace(/\s+/g, '-').toLowerCase()}.json`
    ];
    
    // Try each path in sequence
    for (const path of pathsToTry) {
      try {
        console.log(`Trying path: ${path}`);
        const response = await fetch(path);
        if (response.ok) {
          const data = await response.json();
          console.log(`Found building definition at ${path}:`, data);
          return data;
        }
      } catch (error) {
        console.log(`Error fetching from ${path}:`, error);
      }
    }
    
    // If we still haven't found it, try the building-definition API
    try {
      const response = await fetch(`/api/building-definition?type=${encodeURIComponent(type)}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Found building definition via building-definition API:', data);
        return data;
      }
    } catch (error) {
      console.log(`Error with building-definition API for ${type}:`, error);
    }
    
    console.log(`No building definition found for ${type} after trying all methods`);
    return null;
  } catch (error) {
    console.error('Error loading building definition:', error);
    return null;
  }
};

interface BuildingDetailsPanelProps {
  selectedBuildingId: string | null;
  onClose: () => void;
  visible?: boolean;
}

export default function BuildingDetailsPanel({ selectedBuildingId, onClose, visible = true }: BuildingDetailsPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [building, setBuilding] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [landData, setLandData] = useState<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [landRendered, setLandRendered] = useState<boolean>(false);
  const [buildingDefinition, setBuildingDefinition] = useState<any>(null);
  const [showFullDescription, setShowFullDescription] = useState<boolean>(false);
  const [buildingImagePath, setBuildingImagePath] = useState<string>('/images/buildings/market_stall.jpg');
  
  // Fetch building details when a building is selected
  useEffect(() => {
    let isMounted = true;
    
    if (selectedBuildingId) {
      setIsLoading(true);
      setError(null);
      
      fetch(`/api/buildings/${selectedBuildingId}`)
        .then(response => {
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error(`Building not found (ID: ${selectedBuildingId})`);
            }
            throw new Error(`Failed to fetch building: ${response.status} ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          if (!isMounted) return;
          
          console.log('Building data:', data);
          if (data && data.building) {
            setBuilding(data.building);
            
            // If we have a land_id, fetch the land data
            if (data.building.land_id) {
              fetchLandData(data.building.land_id);
            }
          } else {
            throw new Error('Invalid building data format');
          }
        })
        .catch(error => {
          if (!isMounted) return;
          
          console.error('Error fetching building details:', error);
          setError(error.message || 'Failed to load building details');
          setBuilding(null);
        })
        .finally(() => {
          if (isMounted) {
            setIsLoading(false);
          }
        });
    } else {
      setBuilding(null);
      setError(null);
    }
    
    return () => {
      isMounted = false;
    };
  }, [selectedBuildingId]);
  
  // Add this effect to load the building definition when a building is selected
  useEffect(() => {
    let isMounted = true;
    
    if (building?.type) {
      loadBuildingDefinition(building.type, building.variant, building)
        .then(definition => {
          if (isMounted) {
            console.log('Loaded building definition:', definition);
            setBuildingDefinition(definition);
          }
        })
        .catch(error => {
          if (isMounted) {
            console.error('Error loading building definition:', error);
            setBuildingDefinition(null);
          }
        });
      
      // Resolve the image path
      getBuildingImagePath(building.type, building.variant)
        .then(path => {
          if (isMounted) {
            setBuildingImagePath(path);
          }
        })
        .catch(error => {
          if (isMounted) {
            console.error('Error resolving building image path:', error);
            setBuildingImagePath('/images/buildings/market_stall.jpg');
          }
        });
    } else {
      setBuildingDefinition(null);
    }
    
    return () => {
      isMounted = false;
    };
  }, [building]);
  
  // Add refs to track current state without causing re-renders
  const hoveredPolygonIdRef = useRef<string | null>(null);
  const hoveredBuildingIdRef = useRef<string | null>(null);
  const hoveredCanalPointRef = useRef<{lat: number, lng: number} | null>(null);
  const hoveredBridgePointRef = useRef<{lat: number, lng: number} | null>(null);
  const hoveredCitizenBuildingRef = useRef<string | null>(null);
  const hoveredCitizenTypeRef = useRef<'home' | 'work' | null>(null);
  
  // Add this useEffect to debug the building definition
  useEffect(() => {
    if (buildingDefinition) {
      console.log('Building definition loaded:', buildingDefinition);
      console.log('Has maintenance cost:', buildingDefinition.maintenanceCost !== undefined);
      console.log('Maintenance cost value:', buildingDefinition.maintenanceCost);
    }
  }, [buildingDefinition]);
  
  // Function to fetch land data
  const fetchLandData = async (landId: string) => {
    try {
      console.log(`Fetching land data for ID: ${landId}`);
      
      // First try to get land data from window.__polygonData if available
      if (typeof window !== 'undefined' && '__polygonData' in window && window.__polygonData) {
        const polygon = window.__polygonData.find((p: any) => p.id === landId);
        if (polygon) {
          console.log(`Found land data in window.__polygonData for ID: ${landId}`, polygon);
          setLandData(polygon);
          
          // Also fetch owner information if not already included
          if (!polygon.owner) {
            fetchLandOwner(landId);
          }
          return;
        }
      }
      
      // Otherwise fetch from API
      const response = await fetch(`/api/get-polygon/${landId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch land data: ${response.status}`);
      }
      
      const data = await response.json();
      if (data && data.polygon) {
        console.log(`Fetched land data from API for ID: ${landId}`, data.polygon);
        setLandData(data.polygon);
        
        // Also fetch owner information if not already included
        if (!data.polygon.owner) {
          fetchLandOwner(landId);
        }
      } else {
        console.error(`No polygon data returned for ID: ${landId}`);
      }
    } catch (error) {
      console.error('Error fetching land data:', error);
    }
  };
  
  // Add a new function to fetch land owner information
  const fetchLandOwner = async (landId: string) => {
    try {
      console.log(`Fetching owner for land ID: ${landId}`);
      const response = await fetch(`/api/get-land-owner/${landId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch land owner: ${response.status}`);
      }
      
      const data = await response.json();
      if (data && data.owner) {
        console.log(`Fetched owner for land ID: ${landId}:`, data.owner);
        // Update the land data with the owner information
        setLandData(prevData => ({
          ...prevData,
          owner: data.owner
        }));
      }
    } catch (error) {
      console.error('Error fetching land owner:', error);
    }
  };
  
  // Function to render a top-down view of the land
  const renderLandTopView = (polygon: any, canvas: HTMLCanvasElement): void => {
    if (!polygon.coordinates || polygon.coordinates.length < 3) return;
    
    // Set canvas size
    canvas.width = 300;
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
    
    coords.forEach((coord: any) => {
      if (coord) {
        minLat = Math.min(minLat, coord.lat);
        maxLat = Math.max(maxLat, coord.lat);
        minLng = Math.min(minLng, coord.lng);
        maxLng = Math.max(maxLng, coord.lng);
      }
    });
    
    // Add padding
    const padding = 20;
    const scaleX = (canvas.width - padding * 2) / (maxLng - minLng);
    const scaleY = (canvas.height - padding * 2) / (maxLat - minLat);
    
    // Use the smaller scale to maintain aspect ratio
    const scale = Math.min(scaleX, scaleY);
    
    // Center the polygon
    const centerX = (canvas.width / 2) - ((minLng + maxLng) / 2) * scale;
    const centerY = (canvas.height / 2) + ((minLat + maxLat) / 2) * scale;
    
    // Draw the polygon
    ctx.beginPath();
    coords.forEach((coord: any, index: number) => {
      const x = (coord.lng * scale) + centerX;
      const y = centerY - (coord.lat * scale);
        
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
    
    // Mark the building position if available
    if (building && building.position) {
      try {
        let position;
        if (typeof building.position === 'string') {
          position = JSON.parse(building.position);
        } else {
          position = building.position;
        }
        
        if (position && position.lat && position.lng) {
          const x = (position.lng * scale) + centerX;
          const y = centerY - (position.lat * scale);
          
          // Draw a marker for the building
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#FF5500';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      } catch (error) {
        console.error('Error parsing building position:', error);
      }
    }
  };
  
  // Render land when data is available
  useEffect(() => {
    if (landData && canvasRef.current && !landRendered) {
      renderLandTopView(landData, canvasRef.current);
      setLandRendered(true);
    }
  }, [landData, landRendered, building]);
  
  // Reset landRendered when selectedBuildingId changes
  useEffect(() => {
    if (selectedBuildingId) {
      setLandRendered(false);
    }
  }, [selectedBuildingId]);
  
  // Show panel with animation when a building is selected
  useEffect(() => {
    if (selectedBuildingId) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [selectedBuildingId]);
  
  // Function to adjust date by subtracting 500 years
  const adjustDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      date.setFullYear(date.getFullYear() - 500);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error adjusting date:', error);
      return 'Unknown date';
    }
  };
  
  // Helper function to format building types for display
  const formatBuildingType = (type: string): string => {
    if (!type) return 'Building';
    
    // Replace underscores and hyphens with spaces
    let formatted = type.replace(/[_-]/g, ' ');
    
    // Capitalize each word
    formatted = formatted.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return formatted;
  };
  
  // Early return if not visible or no selected building
  if (!visible || !selectedBuildingId) return null;
  
  return (
    <div 
      className={`fixed top-0 right-0 h-full w-3/4 max-w-5xl bg-amber-50 shadow-xl transform transition-transform duration-300 ease-in-out z-20 border-l-4 border-amber-600 ${
        isVisible ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="p-6 h-full flex flex-col">
        {/* Header with improved styling */}
        <div className="flex justify-between items-center mb-6 border-b-2 border-amber-300 pb-3">
          <h2 className="text-2xl font-serif font-semibold text-amber-800">
            {!isLoading && !error && building ? `${building.type} Details` : 'Building Details'}
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
        
        {/* Error message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded-lg mb-4">
            <h3 className="font-bold mb-1">Error</h3>
            <p>{String(error)}</p>
            <button 
              onClick={onClose}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Close
            </button>
          </div>
        )}
        
        {isLoading ? (
          <div className="flex-grow flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-600"></div>
          </div>
        ) : !error && building ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto flex-grow">
            {/* Column 1: BUYS, SELLS */}
            <div className="col-span-1 space-y-4">
              {/* Resources Buying */}
              {buildingDefinition?.productionInformation?.inputResources && Object.keys(buildingDefinition.productionInformation.inputResources).length > 0 && (
                <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                  <h3 className="text-sm uppercase font-medium text-amber-600 mb-2 flex items-center">
                    <FaBox className="mr-2 transform rotate-180" /> BUYS
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(buildingDefinition.productionInformation.inputResources).map(([resource, amount]) => (
                      <div key={`input-${resource}`} className="flex flex-col items-center bg-blue-50 p-2 rounded-md" title={resource.replace(/_/g, ' ')}>
                        <div className="relative w-8 h-8 mb-1">
                          <Image 
                            src={getResourceIconPath(resource)}
                            alt={resource}
                            width={32}
                            height={32}
                            className="object-contain"
                            loading="lazy"
                            unoptimized={true}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/images/resources/default.png';
                              resourceIconCache.set(resource, '/images/resources/default.png');
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-700 capitalize">{resource.replace(/_/g, ' ')}</span>
                        {amount && <span className="text-xs text-gray-500">{amount}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resources Selling */}
              {buildingDefinition?.productionInformation?.sells && buildingDefinition.productionInformation.sells.length > 0 && (
                <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                  <h3 className="text-sm uppercase font-medium text-amber-600 mb-2 flex items-center">
                    <FaStore className="mr-2" /> SELLS
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {buildingDefinition.productionInformation.sells.map((resource: string) => (
                      <div key={`sell-${resource}`} className="flex flex-col items-center bg-green-50 p-2 rounded-md" title={resource.replace(/_/g, ' ')}>
                        <div className="relative w-8 h-8 mb-1">
                          <Image 
                            src={getResourceIconPath(resource)}
                            alt={resource}
                            width={32}
                            height={32}
                            className="object-contain"
                            onError={(e) => {
                              // Fallback to a default icon if the image fails to load
                              (e.target as HTMLImageElement).src = '/images/resources/default.png';
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-700 capitalize">{resource.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Column 2: STORES, PRODUCES */}
            <div className="col-span-1 space-y-4">
              {/* Resources Storage */}
              {buildingDefinition?.productionInformation?.stores && buildingDefinition.productionInformation.stores.length > 0 && (
                <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                  <h3 className="text-sm uppercase font-medium text-amber-600 mb-2 flex items-center">
                    <FaWarehouse className="mr-2" /> STORES
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {buildingDefinition.productionInformation.stores.map((resource: string) => (
                      <div key={`store-${resource}`} className="flex flex-col items-center bg-amber-50 p-2 rounded-md" title={resource.replace(/_/g, ' ')}>
                        <div className="relative w-8 h-8 mb-1">
                          <Image 
                            src={getResourceIconPath(resource)}
                            alt={resource}
                            width={32}
                            height={32}
                            className="object-contain"
                            loading="lazy" // Add lazy loading
                            unoptimized={true} // Disable Next.js image optimization for these small icons
                            onError={(e) => {
                              // Fallback to a default icon if the image fails to load
                              (e.target as HTMLImageElement).src = '/images/resources/default.png';
                              // Also update the cache to prevent future attempts
                              resourceIconCache.set(resource, '/images/resources/default.png');
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-700 capitalize">{resource.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </div>
                  {buildingDefinition.productionInformation.storageCapacity && (
                    <div className="mt-2 text-sm text-gray-700">
                      <span className="font-medium">Total Capacity:</span> {buildingDefinition.productionInformation.storageCapacity} units
                    </div>
                  )}
                </div>
              )}
              
              {/* Resources Production */}
              {buildingDefinition?.productionInformation?.produces && Object.keys(buildingDefinition.productionInformation.produces).length > 0 && (
                <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                  <h3 className="text-sm uppercase font-medium text-amber-600 mb-2 flex items-center">
                    <FaBox className="mr-2" /> PRODUCES
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(buildingDefinition.productionInformation.produces).map(([output, inputs]: [string, any]) => (
                      <div key={`production-${output}`} className="bg-amber-50 p-3 rounded-md">
                        {/* Output resource */}
                        <div className="flex items-center mb-2">
                          <div className="relative w-8 h-8 mr-2">
                            <Image 
                              src={getResourceIconPath(output)}
                              alt={output}
                              width={32}
                              height={32}
                              className="object-contain"
                              loading="lazy"
                              unoptimized={true}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/images/resources/default.png';
                                resourceIconCache.set(output, '/images/resources/default.png');
                              }}
                            />
                          </div>
                          <span className="font-medium capitalize">{output.replace(/_/g, ' ')}</span>
                        </div>
                        
                        {/* Input resources */}
                        {Array.isArray(inputs) && inputs.length > 0 && (
                          <div className="ml-4">
                            <div className="text-xs text-gray-500 mb-1">From:</div>
                            <div className="flex flex-wrap gap-2">
                              {inputs.map((input: string) => (
                                <div key={`input-${input}`} className="flex items-center bg-white p-1 rounded border border-amber-100">
                                  <div className="relative w-6 h-6 mr-1">
                                    <Image 
                                      src={getResourceIconPath(input)}
                                      alt={input}
                                      width={24}
                                      height={24}
                                      className="object-contain"
                                      loading="lazy"
                                      unoptimized={true}
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src = '/images/resources/default.png';
                                        resourceIconCache.set(input, '/images/resources/default.png');
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs capitalize">{input.replace(/_/g, ' ')}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Production rate if available */}
                        {buildingDefinition.productionInformation.productionRate && (
                          <div className="text-xs text-gray-600 mt-1">
                            Rate: {buildingDefinition.productionInformation.productionRate} units/day
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Output Resources */}
              {buildingDefinition?.productionInformation?.outputResources && 
                Object.keys(buildingDefinition.productionInformation.outputResources).length > 0 && (
                <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                  <h3 className="text-sm uppercase font-medium text-amber-600 mb-2 flex items-center">
                    <FaBox className="mr-2" /> PRODUCES
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(buildingDefinition.productionInformation.outputResources).map(([resource, amount]) => (
                      <div key={`output-${resource}`} className="flex flex-col items-center bg-green-50 p-2 rounded-md" title={resource.replace(/_/g, ' ')}>
                        <div className="relative w-8 h-8 mb-1">
                          <Image 
                            src={getResourceIconPath(resource)}
                            alt={resource}
                            width={32}
                            height={32}
                            className="object-contain"
                            loading="lazy"
                            unoptimized={true}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/images/resources/default.png';
                              resourceIconCache.set(resource, '/images/resources/default.png');
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-700 capitalize">{resource.replace(/_/g, ' ')}</span>
                        {amount && <span className="text-xs text-gray-500">{amount}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Column 3: Name, Owner, Location, Maintenance, Detailed Info */}
            <div className="col-span-1 space-y-4">
              {/* Building Image and Name */}
              {buildingDefinition && (
                <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                  <div className="relative w-full aspect-square overflow-hidden rounded-lg mb-3">
                    <img 
                      src={buildingImagePath}
                      alt={buildingDefinition.name || formatBuildingType(building.type)}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        console.error('Error loading building image:', e);
                        e.currentTarget.src = '/images/buildings/commercial/retail_shops/market_stall.jpg';
                      }}
                    />
                  </div>
                  
                  <h3 className="text-xl font-serif font-semibold text-amber-800 mb-2">
                    {buildingDefinition.name || formatBuildingType(building.type)}
                  </h3>
                  
                  {buildingDefinition.shortDescription && (
                    <p className="text-gray-700 mb-3">{buildingDefinition.shortDescription}</p>
                  )}
                  
                  {buildingDefinition.flavorText && (
                    <p className="italic text-gray-600 border-l-4 border-amber-200 pl-3 py-1">
                      "{buildingDefinition.flavorText}"
                    </p>
                  )}
                </div>
              )}
              
              {/* Owner information */}
              <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Owner</h3>
                {building.owner ? (
                  <div className="flex items-center justify-center">
                    <PlayerProfile 
                      username={building.owner}
                      walletAddress={building.owner}
                      size="medium"
                      className="mx-auto"
                    />
                  </div>
                ) : (
                  <p className="text-center text-gray-500 italic">No owner information</p>
                )}
              </div>
              
              {/* Location with land visualization */}
              <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Location</h3>
                
                {landData ? (
                  <div className="flex flex-col items-center">
                    {/* Land name */}
                    <p className="font-serif text-lg font-semibold text-amber-800 mb-2">
                      {landData.historicalName || landData.englishName || 'Land Plot'}
                    </p>
                    
                    {/* Land owner */}
                    {landData.owner && (
                      <p className="text-gray-700 mb-2">
                        <span className="font-medium">Owner:</span> {landData.owner}
                      </p>
                    )}
                    
                    {/* Land coordinates */}
                    {building?.position && (
                      <p className="text-xs text-gray-500 mb-2">
                        {typeof building.position === 'string' 
                          ? String(building.position) 
                          : `Lat: ${String(building.position.lat?.toFixed(6) || '')}, Lng: ${String(building.position.lng?.toFixed(6) || '')}`
                        }
                      </p>
                    )}
                    
                    {/* Canvas for land visualization */}
                    <canvas 
                      ref={canvasRef} 
                      className="w-full h-[200px] border border-amber-100 rounded-lg mb-2"
                      style={{ maxWidth: '300px' }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[200px]">
                    <p className="text-gray-500 italic">Loading land details...</p>
                  </div>
                )}
              </div>
              
              {/* Maintenance Cost */}
              {buildingDefinition?.maintenanceCost !== undefined && (
                <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                  <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Maintenance</h3>
                  <div className="flex justify-between items-center bg-amber-50 p-2 rounded-lg">
                    <span className="text-gray-700 font-medium">Daily Cost:</span>
                    <span className="font-semibold text-amber-800">
                      {String(buildingDefinition.maintenanceCost.toLocaleString())} ⚜️ ducats
                    </span>
                  </div>
                </div>
              )}
              
              {/* Full Description (Collapsible) */}
              {buildingDefinition?.fullDescription && (
                <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                  <button 
                    onClick={() => setShowFullDescription(!showFullDescription)}
                    className="w-full flex justify-between items-center text-left"
                  >
                    <h3 className="text-sm uppercase font-medium text-amber-600">Detailed Information</h3>
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className={`h-5 w-5 transition-transform ${showFullDescription ? 'transform rotate-180' : ''}`} 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {showFullDescription && (
                    <div className="mt-3 text-gray-700 border-t border-amber-200 pt-3">
                      <p className="whitespace-pre-line">{buildingDefinition.fullDescription}</p>
                    
                      {/* Creation details added here */}
                      <div className="mt-4 pt-3 border-t border-amber-100">
                        <h4 className="font-medium text-amber-700 mb-2">Creation Details</h4>
                        <div className="text-sm">
                          <p className="text-gray-700">
                            Created: <span className="font-medium">
                              {adjustDate(building.created_at)}
                            </span>
                          </p>
                          {building.created_by && (
                            <p className="text-gray-700 mt-1">
                              Created by: <span className="font-medium">{building.created_by}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Occupant Information */}
              {building.occupant && (
                <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                  <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Occupant</h3>
                  <div className="flex items-center justify-center">
                    <PlayerProfile 
                      username={building.occupant}
                      walletAddress={building.occupant}
                      size="medium"
                      className="mx-auto"
                    />
                  </div>
                </div>
              )}
              
              {/* Financial Information */}
              {(building.lease_amount || building.rent_amount) && (
                <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                  <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Financial Details</h3>
                  
                  {building.lease_amount !== undefined && (
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-700">Lease Amount:</span>
                      <span className="font-semibold text-amber-800">
                        {String(building.lease_amount.toLocaleString())} ⚜️ ducats
                      </span>
                    </div>
                  )}
                  
                  {building.rent_amount !== undefined && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Rent Amount:</span>
                      <span className="font-semibold text-amber-800">
                        {String(building.rent_amount.toLocaleString())} ⚜️ ducats
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-grow flex items-center justify-center">
            <p className="text-gray-500 italic">
              {error ? 'Unable to load building details' : 'No building selected'}
            </p>
          </div>
        )}
        
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
    </div>
  );
}
