import { useState, useEffect, useCallback, useMemo } from 'react';
import { ResourceService } from '@/lib/services/ResourceService';
import { hoverStateService } from '@/lib/services/HoverStateService';
import { getNormalizedResourceIconPath } from '@/lib/utils/resourceUtils'; // Import the utility
import { getWalletAddress } from '@/lib/utils/walletUtils';
import { throttle } from '@/lib/utils/performanceUtils';

interface ResourceMarkersProps {
  isVisible: boolean;
  scale: number;
  offset: { x: number, y: number };
  canvasWidth: number;
  canvasHeight: number;
}

export default function ResourceMarkers({ 
  isVisible, 
  scale, 
  offset, 
  canvasWidth, 
  canvasHeight 
}: ResourceMarkersProps) {
  const [resources, setResources] = useState<any[]>([]);
  const [resourcesByLocation, setResourcesByLocation] = useState<Record<string, any[]>>({});
  const [hoveredLocation, setHoveredLocation] = useState<string | null>(null);
  
  // Function to get the current citizen's identifier
  const getCurrentCitizenIdentifier = useCallback(() => {
    try {
      // Try to get username from profile
      const profileStr = localStorage.getItem('citizenProfile');
      if (profileStr) {
        const profile = JSON.parse(profileStr);
        if (profile && profile.username) {
          return profile.username;
        }
      }
      
      // If no username in profile, fall back to wallet address
      return getWalletAddress();
    } catch (error) {
      console.error('Error getting current citizen identifier:', error);
      return null;
    }
  }, []);

  // Handle mouse enter for resource location with throttling
  const handleMouseEnter = useMemo(() => 
    throttle((locationKey: string, locationResources: any[]) => {
      setHoveredLocation(locationKey);
      
      // Use the new hover state system
      hoverStateService.setHoverState('resource', locationKey, {
        locationKey,
        resources: locationResources,
        position: {
          lat: parseFloat(locationKey.split('_')[0]),
          lng: parseFloat(locationKey.split('_')[1])
        }
      });
    }, 100), // 100ms throttle
    []
  );
  
  // Handle mouse leave for resource location with throttling
  const handleMouseLeave = useMemo(() => 
    throttle(() => {
      setHoveredLocation(null);
      hoverStateService.clearHoverState();
    }, 100), // 100ms throttle
    []
  );
  
  // Load resources when component becomes visible
  useEffect(() => {
    if (isVisible) {
      loadResources();
    }
    
    // Clean up throttled functions when component unmounts
    return () => {
      handleMouseEnter.cancel();
      handleMouseLeave.cancel();
    };
  }, [isVisible, handleMouseEnter, handleMouseLeave]);
  
  
  // Function to load resources
  const loadResources = async () => {
    try {
      const resourceService = ResourceService.getInstance();
      // Clear cache to force fresh data
      resourceService.clearCache();
      const allResources = await resourceService.getResourceCounts();
      
      // Filter resources that have location data
      const resourcesWithLocation = allResources.filter(
        resource => resource.location && resource.location.lat && resource.location.lng
      );
      
      setResources(resourcesWithLocation);
      
      // Group resources by location
      const groupedResources: Record<string, any[]> = {};
      resourcesWithLocation.forEach(resource => {
        const locationKey = `${resource.location.lat.toFixed(6)}_${resource.location.lng.toFixed(6)}`;
        if (!groupedResources[locationKey]) {
          groupedResources[locationKey] = [];
        }
        groupedResources[locationKey].push(resource);
      });
      
      setResourcesByLocation(groupedResources);
      console.log(`Loaded ${resourcesWithLocation.length} resources with location data`);
      console.log(`Grouped into ${Object.keys(groupedResources).length} unique locations`);
    } catch (error) {
      console.error('Error loading resources for map:', error);
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
  
  // If not visible, don't render anything
  if (!isVisible) return null;
  
  return (
    <div className="absolute inset-0 pointer-events-none">
      {Object.entries(resourcesByLocation).map(([locationKey, locationResources]) => {
        // Parse location from key
        const [lat, lng] = locationKey.split('_').map(parseFloat);
        const { x, y } = latLngToScreen(lat, lng);
        
        // Determine if this location is being hovered
        const isHovered = hoveredLocation === locationKey;
        
        // Calculate total resources at this location
        const totalResources = locationResources.reduce((sum, r) => sum + r.amount, 0);
        
        return (
          <div 
            key={locationKey}
            className="absolute pointer-events-auto"
            style={{ 
              left: `${x}px`, 
              top: `${y}px`, 
              transform: 'translate(-50%, -50%)',
              zIndex: isHovered ? 50 : 40
            }}
            onMouseEnter={() => handleMouseEnter(locationKey, locationResources)}
            onMouseLeave={() => handleMouseLeave()}
          >
            {isHovered ? (
              // Expanded view when hovered - show all resources
              <div className="relative">
                {(() => {
                  const numResources = locationResources.length;
                  // Calculate dynamic radius: base + increment per resource group
                  // Example: base 100px, +10px for every 5 resources beyond the first 5
                  let dynamicRadius = 100; // Base radius for up to 5 resources
                  if (numResources > 5) {
                    dynamicRadius += Math.floor((numResources - 5) / 5) * 20; // Increase radius by 20px for every 5 additional resources
                  }
                  dynamicRadius = Math.min(dynamicRadius, 200); // Cap the radius to prevent it from becoming too large

                  return locationResources.map((resource, index) => (
                    <div 
                      key={resource.id}
                      className="absolute bg-gray-900/70 border border-gray-700 rounded-lg overflow-hidden flex flex-col items-center justify-center shadow-lg"
                      style={{ 
                        width: '96px', 
                        height: '120px', 
                        left: `${Math.cos(2 * Math.PI * index / numResources) * dynamicRadius}px`, 
                        top: `${Math.sin(2 * Math.PI * index / numResources) * dynamicRadius}px`, 
                        transition: 'all 0.3s ease-out',
                        borderWidth: '1px', 
                      borderColor: resource.owner === getCurrentCitizenIdentifier() ? '#FFD700' : '#d97706' // Gold border for citizen's resources
                    }}
                  >
                    <div className="relative w-full h-full group">
                      {/* Image container with rounded corners - make 2x smaller */}
                      <div className="w-full h-[96px] flex items-center justify-center p-1">
                        <img 
                          src={getNormalizedResourceIconPath(resource.icon, resource.name)}
                          alt={resource.name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = getNormalizedResourceIconPath(undefined, 'default');
                          }}
                        />
                      </div>
                        
                      {/* Resource name below the image - adjust font size */}
                      <div className="w-full h-[24px] flex items-center justify-center bg-amber-900/80 text-white text-[12px] px-2 truncate">
                        {resource.name}
                      </div>
                        
                      {/* Count badge - make smaller */}
                      <div className="absolute -bottom-1 -right-1 bg-amber-600 text-white text-base rounded-full w-6 h-6 flex items-center justify-center">
                        {resource.amount}
                      </div>
                        
                      {/* Detailed tooltip - adjust size */}
                      <div className="absolute opacity-0 group-hover:opacity-100 bottom-full left-1/2 transform -translate-x-1/2 mb-2 p-3 bg-black/90 text-white text-xs rounded w-56 pointer-events-none transition-opacity z-50">
                        <div className="font-bold text-amber-300 text-base">{resource.name}</div>
                        {typeof resource.description === 'string' && resource.description.length > 0 && (
                          <div className="mt-1 text-xs">{resource.description.substring(0, 100)}{resource.description.length > 100 ? '...' : ''}</div>
                        )}
                        <div className="mt-1 flex justify-between">
                          <span>Quantity: {resource.amount}</span>
                          {resource.rarity && <span className="capitalize">{resource.rarity}</span>}
                        </div>
                        {resource.buildingId && (
                          <div className="mt-1 text-amber-200">Building: {resource.buildingId}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  ));
                })()}
                
                {/* Center indicator */}
                <div className="w-8 h-8 bg-gray-800/70 border border-gray-600 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ borderWidth: '1px' }}>
                  {locationResources.length}
                </div>
              </div>
            ) : (
              // Collapsed view - show stack of resources
              <div className="relative">
                {/* Stacked resources indicator */}
                <div className="relative">
                  {/* Show up to 3 stacked icons */}
                  {locationResources.slice(0, Math.min(3, locationResources.length)).map((resource, index) => (
                    <div 
                      key={resource.id}
                      className="absolute bg-gray-900/70 border border-gray-700 rounded-lg overflow-hidden"
                      style={{ 
                        width: '54px', // Decreased from 108px to 54px (2x smaller)
                        height: '54px', // Decreased from 108px to 54px (2x smaller)
                        left: `${index * 9}px`, // Adjust offset for smaller icons
                        top: `${-index * 9}px`, // Adjust offset for smaller icons
                        zIndex: 40 - index,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        borderWidth: '1px', // Make border slimmer
                        borderColor: resource.owner === getCurrentCitizenIdentifier() ? '#FFD700' : '#d97706' // Gold border for citizen's resources
                      }}
                    >
                      <img 
                        src={getNormalizedResourceIconPath(resource.icon, resource.name)}
                        alt={resource.name}
                        className="w-full h-full object-contain p-1" // Decreased padding
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = getNormalizedResourceIconPath(undefined, 'default');
                        }}
                      />
                    </div>
                  ))}
                  
                  {/* Count badge */}
                  <div className="absolute -bottom-1 -right-1 bg-amber-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {totalResources}
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