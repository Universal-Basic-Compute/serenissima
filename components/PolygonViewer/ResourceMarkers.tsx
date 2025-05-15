import { useState, useEffect, useCallback } from 'react';
import { ResourceService } from '@/lib/services/ResourceService';
import { hoverStateService } from '@/lib/services/HoverStateService';

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
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Handle mouse enter for resource location
  const handleMouseEnter = useCallback((locationKey: string, resources: any[]) => {
    setHoveredLocation(locationKey);
    hoverStateService.setHoveredResources(resources);
  }, []);
  
  // Handle mouse leave for resource location
  const handleMouseLeave = useCallback(() => {
    setHoveredLocation(null);
    hoverStateService.clearHoveredResources();
  }, []);
  
  // Load resources when component becomes visible
  useEffect(() => {
    if (isVisible) {
      loadResources();
    }
  }, [isVisible]);
  
  // Handle mouse enter for a resource location
  const handleMouseEnter = (locationKey: string, locationResources: any[]) => {
    setHoveredLocation(locationKey);
    
    // Use HoverStateService to set resource hover state
    // Create a unique ID for this resource group
    const resourceIds = locationResources.map(r => r.id).join('_');
    hoverStateService.setHoveredResource(resourceIds, {
      locationKey,
      resources: locationResources,
      position: {
        lat: parseFloat(locationKey.split('_')[0]),
        lng: parseFloat(locationKey.split('_')[1])
      }
    });
  };
  
  // Handle mouse leave for a resource location
  const handleMouseLeave = () => {
    setHoveredLocation(null);
    
    // Clear resource hover state
    hoverStateService.clearHoveredResource();
  };
  
  // Function to load resources
  const loadResources = async () => {
    try {
      setIsLoading(true);
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
  
  // Filter resources by category
  const filteredResourcesByLocation = useCallback(() => {
    if (!categoryFilter) return resourcesByLocation;
    
    const filtered: Record<string, any[]> = {};
    
    Object.entries(resourcesByLocation).forEach(([locationKey, locationResources]) => {
      const filteredResources = locationResources.filter(
        resource => resource.category === categoryFilter
      );
      
      if (filteredResources.length > 0) {
        filtered[locationKey] = filteredResources;
      }
    });
    
    return filtered;
  }, [resourcesByLocation, categoryFilter]);
  
  // If not visible, don't render anything
  if (!isVisible) return null;
  
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Filter controls - make this part pointer-events-auto */}
      <div className="absolute top-4 left-20 bg-black/70 rounded-lg p-2 pointer-events-auto z-50">
        <div className="flex justify-between items-center mb-2">
          <div className="text-white text-sm">Filter by Category:</div>
          <button 
            className="text-amber-400 hover:text-amber-300 px-2 py-1 rounded"
            onClick={loadResources}
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
          {Array.from(new Set(resources.map(r => r.category))).map(category => (
            <button 
              key={category}
              className={`px-2 py-1 text-xs rounded ${categoryFilter === category ? 'bg-amber-600' : 'bg-gray-700'}`}
              onClick={() => setCategoryFilter(category)}
            >
              {category.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
            </button>
          ))}
        </div>
      </div>
      
      {Object.entries(filteredResourcesByLocation()).map(([locationKey, locationResources]) => {
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
                {locationResources.map((resource, index) => (
                  <div 
                    key={resource.id}
                    className="absolute bg-amber-800 border-2 border-amber-600 rounded-lg overflow-hidden flex flex-col items-center justify-center shadow-lg"
                    style={{ 
                      width: '96px', // Decreased from 192px to 96px (2x smaller)
                      height: '120px', // Decreased from 240px to 120px (2x smaller)
                      left: `${Math.cos(2 * Math.PI * index / locationResources.length) * 120}px`, // Decreased radius to accommodate smaller icons
                      top: `${Math.sin(2 * Math.PI * index / locationResources.length) * 120}px`, // Decreased radius to accommodate smaller icons
                      transition: 'all 0.3s ease-out'
                    }}
                  >
                    <div className="relative w-full h-full group">
                      {/* Image container with rounded corners - make 2x smaller */}
                      <div className="w-full h-[96px] flex items-center justify-center p-2">
                        <img 
                          src={`/images/resources/${resource.icon}`}
                          alt={resource.name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/images/resources/default.png';
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
                        {resource.description && (
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
                ))}
                
                {/* Center indicator */}
                <div className="w-8 h-8 bg-amber-700 border-2 border-amber-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  {locationResources.length}
                </div>
              </div>
            ) : (
              // Collapsed view - show stack of resources
              <div className="relative animate-pulse-subtle">
                {/* Stacked resources indicator */}
                <div className="relative">
                  {/* Show up to 3 stacked icons */}
                  {locationResources.slice(0, Math.min(3, locationResources.length)).map((resource, index) => (
                    <div 
                      key={resource.id}
                      className="absolute bg-amber-800 border border-amber-600 rounded-lg overflow-hidden"
                      style={{ 
                        width: '54px', // Decreased from 108px to 54px (2x smaller)
                        height: '54px', // Decreased from 108px to 54px (2x smaller)
                        left: `${index * 9}px`, // Adjust offset for smaller icons
                        top: `${-index * 9}px`, // Adjust offset for smaller icons
                        zIndex: 40 - index,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                      }}
                    >
                      <img 
                        src={`/images/resources/${resource.icon}`}
                        alt={resource.name}
                        className="w-full h-full object-contain p-2" // Decreased padding
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/images/resources/default.png';
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
