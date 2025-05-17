import { useEffect, useState, useRef, useCallback } from 'react';
import { 
  BuildingImage, 
  BuildingLocation, 
  BuildingOwner, 
  BuildingOccupant, 
  BuildingMaintenance, 
  BuildingFinancials, 
  BuildingDescription,
  ResourceList,
  RecipeList,
  ContractList
} from './BuildingDetails';

// Declare the window interface extension for __polygonData
declare global {
  interface Window {
    __polygonData?: any[];
  }
}

// Ensure the global declaration is properly exported
export {};

interface BuildingDetailsPanelProps {
  selectedBuildingId: string | null;
  onClose: () => void;
  visible?: boolean;
  polygons?: any[];
}

export default function BuildingDetailsPanel({ 
  selectedBuildingId, 
  onClose, 
  visible = true,
  polygons = []
}: BuildingDetailsPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [building, setBuilding] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [landData, setLandData] = useState<any>(null);
  const [buildingDefinition, setBuildingDefinition] = useState<any>(null);
  const [pointData, setPointData] = useState<any>(null);
  const [polygonsData, setPolygonsData] = useState<any[]>(polygons);
  const [buildingContracts, setBuildingContracts] = useState<any[]>([]);
  const [buildingResources, setBuildingResources] = useState<any>(null);
  const [isLoadingResources, setIsLoadingResources] = useState<boolean>(false);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  
  // Add this useEffect to debug the building resources data
  useEffect(() => {
    if (buildingResources) {
      console.log('Building resources loaded:', buildingResources);
      console.log('Sellable resources:', buildingResources.resources?.sellable);
      console.log('Bought resources:', buildingResources.resources?.bought);
      console.log('Storable resources:', buildingResources.resources?.storable);
      console.log('Transformation recipes:', buildingResources.resources?.transformationRecipes);
    }
  }, [buildingResources]);
  
  // Get current username from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const profileStr = localStorage.getItem('citizenProfile');
        if (profileStr) {
          const profile = JSON.parse(profileStr);
          if (profile && profile.username) {
            setCurrentUsername(profile.username);
            console.log('Current username:', profile.username);
          }
        }
      } catch (error) {
        console.error('Error getting current username:', error);
      }
    }
  }, []);
  
  // Fetch building resources (comprehensive data)
  const fetchBuildingResources = async (buildingId: string) => {
    try {
      setIsLoadingResources(true);
      console.log(`Fetching resources for building ${buildingId}`);
      
      const response = await fetch(`/api/building-resources/${encodeURIComponent(buildingId)}`);
      
      if (!response.ok) {
        console.error(`Failed to fetch building resources: ${response.status} ${response.statusText}`);
        return;
      }
      
      const data = await response.json();
      if (data.success) {
        console.log(`Fetched resources for building ${buildingId}:`, data);
        
        // Ensure all resource arrays exist even if they're empty
        const resources = data.resources || {};
        resources.sellable = resources.sellable || [];
        resources.bought = resources.bought || [];
        resources.storable = resources.storable || [];
        resources.stored = resources.stored || [];
        resources.publiclySold = resources.publiclySold || [];
        resources.transformationRecipes = resources.transformationRecipes || [];
        
        // Update the data with the normalized resources
        data.resources = resources;
        
        setBuildingResources(data);
        
        // Set building contracts from the publiclySold resources
        if (data.resources && data.resources.publiclySold) {
          setBuildingContracts(data.resources.publiclySold);
        }
      } else {
        console.error(`Error fetching building resources: ${data.error}`);
      }
    } catch (error) {
      console.error('Error fetching building resources:', error);
    } finally {
      setIsLoadingResources(false);
    }
  };

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
            
            // Store the runBy information in window for access by ResourceList component
            if (data.building.occupant) {
              (window as any).__currentBuildingRunBy = data.building.occupant;
            } else {
              (window as any).__currentBuildingRunBy = data.building.owner;
            }
            
            // If we have a land_id, fetch the land data
            if (data.building.land_id) {
              fetchLandData(data.building.land_id);
            }
            
            // Fetch resources for this building (includes contracts)
            fetchBuildingResources(selectedBuildingId);
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
      setBuildingContracts([]);
      setBuildingResources(null);
      // Clear the runBy information
      (window as any).__currentBuildingRunBy = null;
    }
    
    return () => {
      isMounted = false;
    };
  }, [selectedBuildingId]);
  
  // Add this helper function to find and load the building definition file
  const loadBuildingDefinition = async (type: string, variant?: string, buildingData?: any): Promise<any> => {
    try {
      console.log(`Looking for building definition for type: ${type}, variant: ${variant || 'none'}`);
      
      // First check if we have building types data
      const cachedBuildingTypes = (typeof window !== 'undefined' && (window as any).__buildingTypes) 
        ? (window as any).__buildingTypes 
        : null;
      
      if (cachedBuildingTypes) {
        const buildingType = cachedBuildingTypes.find((bt: any) => 
          bt.type.toLowerCase() === type.toLowerCase() || 
          bt.name?.toLowerCase() === type.toLowerCase()
        );
        
        if (buildingType) {
          console.log('Found building definition in cached building types:', buildingType);
          return buildingType;
        }
      }
      
      // If not found in cache, try the building-types API directly
      try {
        const response = await fetch(`/api/building-types?type=${encodeURIComponent(type)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.buildingType) {
            console.log('Found building definition via building-types API:', data.buildingType);
            return data.buildingType;
          }
        }
      } catch (error) {
        console.log(`Error with building-types API for ${type}:`, error);
      }
      
      // If still not found, try the building-data API endpoint which searches recursively
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
    } else {
      setBuildingDefinition(null);
    }
    
    return () => {
      isMounted = false;
    };
  }, [building]);
  
  // Add this useEffect to get polygons from window if not provided as props
  useEffect(() => {
    if (polygons.length === 0 && typeof window !== 'undefined' && window.__polygonData) {
      setPolygonsData(window.__polygonData);
    } else {
      setPolygonsData(polygons);
    }
  }, [polygons]);
  
  // Add this useEffect to debug the building definition
  useEffect(() => {
    if (buildingDefinition) {
      console.log('Building definition loaded:', buildingDefinition);
      console.log('Has maintenance cost:', buildingDefinition.maintenanceCost !== undefined);
      console.log('Maintenance cost value:', buildingDefinition.maintenanceCost);
    }
  }, [buildingDefinition]);
  
  // Add this useEffect to find the point data when a building is selected
  useEffect(() => {
    if (building?.position && polygonsData.length > 0) {
      let position;
      try {
        position = typeof building.position === 'string' ? JSON.parse(building.position) : building.position;
      } catch (e) {
        console.error('Error parsing building position:', e);
        return;
      }

      // Find the polygon that contains this point
      const findPointInPolygons = () => {
        for (const polygon of polygonsData) {
          // Check building points
          if (polygon.buildingPoints) {
            const buildingPoint = polygon.buildingPoints.find((point: any) => 
              Math.abs(point.lat - position.lat) < 0.0001 && Math.abs(point.lng - position.lng) < 0.0001
            );
            if (buildingPoint) {
              console.log('Found matching building point:', buildingPoint);
              return buildingPoint;
            }
          }
          
          // Check bridge points
          if (polygon.bridgePoints) {
            const bridgePoint = polygon.bridgePoints.find((point: any) => 
              point.edge && Math.abs(point.edge.lat - position.lat) < 0.0001 && Math.abs(point.edge.lng - position.lng) < 0.0001
            );
            if (bridgePoint) {
              console.log('Found matching bridge point:', bridgePoint);
              return bridgePoint;
            }
          }
          
          // Check canal points
          if (polygon.canalPoints) {
            const canalPoint = polygon.canalPoints.find((point: any) => 
              point.edge && Math.abs(point.edge.lat - position.lat) < 0.0001 && Math.abs(point.edge.lng - position.lng) < 0.0001
            );
            if (canalPoint) {
              console.log('Found matching canal point:', canalPoint);
              return canalPoint;
            }
          }
        }
        return null;
      };

      const foundPoint = findPointInPolygons();
      setPointData(foundPoint);
    }
  }, [building, polygonsData]);
  
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
          
          // Find the point data if we have building position
          if (building?.position) {
            findPointInPolygon(polygon, building.position);
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
        
        // Find the point data if we have building position
        if (building?.position) {
          findPointInPolygon(data.polygon, building.position);
        }
      } else {
        console.error(`No polygon data returned for ID: ${landId}`);
      }
    } catch (error) {
      console.error('Error fetching land data:', error);
    }
  };
  
  // Add a new function to find the point in the polygon
  const findPointInPolygon = (polygon: any, buildingPosition: any) => {
    try {
      let position;
      if (typeof buildingPosition === 'string') {
        position = JSON.parse(buildingPosition);
      } else {
        position = buildingPosition;
      }
      
      if (!position || !position.lat || !position.lng) {
        console.warn('Invalid building position:', position);
        return;
      }
      
      // Check building points
      if (polygon.buildingPoints) {
        const buildingPoint = polygon.buildingPoints.find((point: any) => 
          Math.abs(point.lat - position.lat) < 0.0001 && Math.abs(point.lng - position.lng) < 0.0001
        );
        if (buildingPoint) {
          console.log('Found matching building point:', buildingPoint);
          setPointData(buildingPoint);
          return;
        }
      }
      
      // Check bridge points
      if (polygon.bridgePoints) {
        const bridgePoint = polygon.bridgePoints.find((point: any) => 
          point.edge && Math.abs(point.edge.lat - position.lat) < 0.0001 && Math.abs(point.edge.lng - position.lng) < 0.0001
        );
        if (bridgePoint) {
          console.log('Found matching bridge point:', bridgePoint);
          setPointData(bridgePoint);
          return;
        }
      }
      
      // Check canal points
      if (polygon.canalPoints) {
        const canalPoint = polygon.canalPoints.find((point: any) => 
          point.edge && Math.abs(point.edge.lat - position.lat) < 0.0001 && Math.abs(point.edge.lng - position.lng) < 0.0001
        );
        if (canalPoint) {
          console.log('Found matching canal point:', canalPoint);
          setPointData(canalPoint);
          return;
        }
      }
      
      console.log('No matching point found in polygon for position:', position);
    } catch (error) {
      console.error('Error finding point in polygon:', error);
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
  
  // Show panel with animation when a building is selected
  useEffect(() => {
    if (selectedBuildingId) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [selectedBuildingId]);
  
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
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4 overflow-y-auto flex-grow" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            {/* Column 1: RECIPES */}
            <div className="col-span-1 md:col-span-1 lg:col-span-1 space-y-4">
              {/* Recipes */}
              <RecipeList recipes={buildingResources?.resources?.transformationRecipes || []} />
            </div>
            
            {/* Column 2: SELLS, BUYS, STORES */}
            <div className="col-span-1 md:col-span-1 lg:col-span-1 space-y-4">
              {/* Resources Selling */}
              <ResourceList 
                title="SELLS" 
                resources={buildingResources?.resources?.sellable || []} 
                type="sell" 
              />

              {/* Resources Buying */}
              <ResourceList 
                title="BUYS" 
                resources={buildingResources?.resources?.bought || []} 
                type="buy" 
                disabledResources={
                  // Create a list of resource types that are in "bought" but not in "publiclySold"
                  buildingResources?.resources?.bought
                    ?.filter(buyResource => 
                      !(buildingResources?.resources?.publiclySold || [])
                        .some(sellResource => sellResource.resourceType === buyResource.resourceType)
                    )
                    .map(resource => resource.resourceType) || []
                }
              />

              {/* Resources Storage */}
              <ResourceList 
                title="STORES" 
                resources={buildingResources?.resources?.storable || []} 
                type="store" 
                storageCapacity={buildingResources?.storageCapacity} 
              />
              
              {/* Current Inventory */}
              <ResourceList 
                title="CURRENT INVENTORY" 
                resources={buildingResources?.resources?.stored || []} 
                type="inventory" 
              />
            </div>
            
            {/* Column 3: Name, Owner, Location, Maintenance, Detailed Info */}
            <div className="col-span-1 space-y-4">
              {/* Building Image and Name */}
              {buildingDefinition && (
                <BuildingImage 
                  buildingType={building.type}
                  buildingVariant={building.variant}
                  buildingName={buildingDefinition.name}
                  shortDescription={buildingDefinition.shortDescription}
                  flavorText={buildingDefinition.flavorText}
                />
              )}
              
              {/* Owner information */}
              <BuildingOwner owner={building.owner} />
              
              {/* Location with point visualization */}
              <BuildingLocation 
                building={building}
                landData={landData}
                pointData={pointData}
              />
              
              {/* Maintenance Cost */}
              <BuildingMaintenance maintenanceCost={buildingDefinition?.maintenanceCost} />
  
              {/* Financial Information */}
              <BuildingFinancials 
                leaseAmount={building.lease_amount} 
                rentAmount={building.rent_amount} 
              />
  
              {/* Full Description */}
              <BuildingDescription 
                fullDescription={buildingDefinition?.fullDescription}
                createdAt={building.created_at}
                createdBy={building.created_by}
              />
              
              {/* Occupant Information */}
              <BuildingOccupant occupant={building.occupant} />
              
              {/* Public Sale Contracts */}
              <ContractList contracts={buildingResources?.resources?.publiclySold || []} />
            </div>
          </div>
        ) : (
          <div className="flex-grow flex items-center justify-center">
            <p className="text-gray-500 italic">
              {error ? 'Unable to load building details' : 'No building selected'}
            </p>
          </div>
        )}
        
        {/* Simple decorative footer */}
        <div className="mt-4 text-center">
          <div className="flex justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
