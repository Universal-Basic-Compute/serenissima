import { useState, useEffect, useCallback } from 'react';
import { ResourceService } from '@/lib/services/ResourceService';

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
  
  // Load resources when component becomes visible
  useEffect(() => {
    if (isVisible) {
      loadResources();
    }
  }, [isVisible]);
  
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
            onMouseEnter={() => setHoveredLocation(locationKey)}
            onMouseLeave={() => setHoveredLocation(null)}
          >
            {isHovered ? (
              // Expanded view when hovered - show all resources
              <div className="relative">
                {locationResources.map((resource, index) => (
                  <div 
                    key={resource.id}
                    className="absolute bg-amber-800 border-2 border-amber-600 rounded-full overflow-hidden flex items-center justify-center shadow-lg"
                    style={{ 
                      width: '32px', 
                      height: '32px',
                      left: `${Math.cos(2 * Math.PI * index / locationResources.length) * 40}px`,
                      top: `${Math.sin(2 * Math.PI * index / locationResources.length) * 40}px`,
                      transition: 'all 0.3s ease-out'
                    }}
                  >
                    <div className="relative w-full h-full group">
                      <img 
                        src={`/images/resources/${resource.icon}`}
                        alt={resource.name}
                        className="w-full h-full object-contain p-1"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/images/resources/default.png';
                        }}
                      />
                      <div className="absolute -bottom-1 -right-1 bg-amber-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {resource.amount}
                      </div>
                      
                      {/* Detailed tooltip */}
                      <div className="absolute opacity-0 group-hover:opacity-100 bottom-full left-1/2 transform -translate-x-1/2 mb-2 p-2 bg-black/90 text-white text-xs rounded w-48 pointer-events-none transition-opacity z-50">
                        <div className="font-bold text-amber-300">{resource.name}</div>
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
                <div className="w-6 h-6 bg-amber-700 border-2 border-amber-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
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
                      className="absolute bg-amber-800 border border-amber-600 rounded-full overflow-hidden"
                      style={{ 
                        width: '24px', 
                        height: '24px',
                        left: `${index * 3}px`,
                        top: `${-index * 3}px`,
                        zIndex: 40 - index,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                      }}
                    >
                      <img 
                        src={`/images/resources/${resource.icon}`}
                        alt={resource.name}
                        className="w-full h-full object-contain p-1"
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
