import { CoordinateService } from './CoordinateService';
import { buildingPointsService } from './BuildingPointsService';
import { eventBus, EventTypes } from '../utils/eventBus';
import { dataService } from './DataService';
import { fetchBuildingTypes } from '../utils/buildingTypeUtils';

export class BuildingService {
  private buildingPositionsCache: Record<string, {x: number, y: number}> = {};
  private initialPositionCalculated: boolean = false;

  /**
   * Calculate and cache building positions
   */
  public calculateBuildingPositions(buildings: any[]): void {
    if (buildings.length === 0 || this.initialPositionCalculated) return;
    
    console.log('Pre-calculating building positions for all buildings...');
    
    // Initialize the cache if it doesn't exist
    if (!this.buildingPositionsCache) {
      this.buildingPositionsCache = {};
    }
    
    // Use a more efficient approach with a single pass
    const newPositionsCache = buildings.reduce((cache, building) => {
      if (!building || !building.id || !building.position) return cache;
      
      let position;
      try {
        position = typeof building.position === 'string' 
          ? JSON.parse(building.position) 
          : building.position;
      } catch (e) {
        return cache;
      }
      
      // Convert lat/lng to world coordinates
      let x, y;
      if ('lat' in position && 'lng' in position) {
        const world = CoordinateService.latLngToWorld(position.lat, position.lng);
        x = world.x;
        y = world.y;
      } else if ('x' in position && 'z' in position) {
        x = position.x;
        y = position.z;
      } else {
        return cache;
      }
      
      // Store the calculated position in the cache
      cache[building.id] = { x, y };
      return cache;
    }, {});
    
    this.buildingPositionsCache = newPositionsCache;
    this.initialPositionCalculated = true;
    console.log(`Pre-calculated positions for ${Object.keys(newPositionsCache).length} buildings`);
  }
  
  /**
   * Ensure buildings are visible by calculating positions if needed
   */
  public ensureBuildingsVisible = (): void => {
    const buildings = dataService.getBuildings();
    
    if (buildings.length === 0) return;
    
    console.log('Ensuring buildings are visible by calculating positions...');
    
    this.calculateBuildingPositions(buildings);
    
    // Emit event to notify that building positions have been calculated
    eventBus.emit(EventTypes.BUILDING_POSITIONS_CALCULATED, {
      count: Object.keys(this.buildingPositionsCache).length
    });
  }

  /**
   * Get building position from cache or calculate it
   */
  public getBuildingPosition(building: any): {x: number, y: number} | null {
    if (!building) return null;
    
    // Check if building has an ID before trying to access the cache
    if (!building.id) {
      console.warn('Building missing ID, cannot retrieve from cache');
      return null;
    }
    
    // Use cached position if available
    // Make sure this.buildingPositionsCache exists and has the building ID as a property
    if (this.buildingPositionsCache && this.buildingPositionsCache[building.id]) {
      return this.buildingPositionsCache[building.id];
    }
    
    // Log a warning if the building ID is not in the cache
    if (this.initialPositionCalculated) {
      console.warn(`Building ID ${building.id} not found in position cache. Calculating position on-demand.`);
    }
    
    // Calculate position if not in cache
    let position;
    
    // First check if building has a position property
    if (building.position) {
      if (typeof building.position === 'string') {
        position = JSON.parse(building.position);
      } else {
        position = building.position;
      }
    } 
    // If no position property, check for Point property
    else if (building.Point) {
      // Try to extract coordinates from the Point field (format: type_lat_lng)
      const pointStr = String(building.Point);
      const parts = pointStr.split('_');
      if (parts.length >= 3) {
        const lat = parseFloat(parts[1]);
        const lng = parseFloat(parts[2]);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          position = { lat, lng };
        }
      }
    }
    
    // If we couldn't get a position, return null
    if (!position) {
      return null;
    }
    
    try {
      // Convert lat/lng to world coordinates
      let x, y;
      if ('lat' in position && 'lng' in position) {
        const world = CoordinateService.latLngToWorld(position.lat, position.lng);
        x = world.x;
        y = world.y;
      } else if ('x' in position && 'z' in position) {
        x = position.x;
        y = position.z;
      } else {
        console.warn(`Invalid position format for building ${building.id}`);
        return null;
      }
      
      // Initialize the cache if it doesn't exist
      if (!this.buildingPositionsCache) {
        this.buildingPositionsCache = {};
      }
      
      // Store in cache for future use
      this.buildingPositionsCache[building.id] = { x, y };
      
      return { x, y };
    } catch (error) {
      console.error(`Error calculating position for building ${building.id}:`, error);
      return null;
    }
  }

  /**
   * Get building size based on type
   */
  public getBuildingSize(type: string): {width: number, height: number, depth: number} {
    // First try to get size from building types API
    const cachedBuildingTypes = (typeof window !== 'undefined' && (window as any).__buildingTypes) 
      ? (window as any).__buildingTypes 
      : null;
    
    if (cachedBuildingTypes) {
      const buildingType = cachedBuildingTypes.find((bt: any) => 
        bt.type.toLowerCase() === type.toLowerCase() || 
        bt.name?.toLowerCase() === type.toLowerCase()
      );
      
      if (buildingType && buildingType.dimensions) {
        return {
          width: buildingType.dimensions.width || 20,
          height: buildingType.dimensions.height || 20,
          depth: buildingType.dimensions.depth || 20
        };
      }
    }
    
    // Fall back to hardcoded values if not found in API data
    switch(type.toLowerCase()) {
      case 'market-stall':
        return {width: 15, height: 15, depth: 15};
      case 'dock':
        return {width: 30, height: 5, depth: 30};
      case 'house':
        return {width: 20, height: 25, depth: 20};
      case 'workshop':
        return {width: 25, height: 20, depth: 25};
      case 'warehouse':
        return {width: 30, height: 20, depth: 30};
      case 'tavern':
        return {width: 25, height: 25, depth: 25};
      case 'church':
        return {width: 30, height: 50, depth: 30};
      case 'palace':
        return {width: 40, height: 40, depth: 40};
      default:
        return {width: 20, height: 20, depth: 20};
    }
  }

  /**
   * Get building color based on type
   */
  public getBuildingColor(type: string): string {
    // First try to get color from building types API
    const cachedBuildingTypes = (typeof window !== 'undefined' && (window as any).__buildingTypes) 
      ? (window as any).__buildingTypes 
      : null;
    
    if (cachedBuildingTypes) {
      const buildingType = cachedBuildingTypes.find((bt: any) => 
        bt.type.toLowerCase() === type.toLowerCase() || 
        bt.name?.toLowerCase() === type.toLowerCase()
      );
      
      if (buildingType && buildingType.appearance && buildingType.appearance.color) {
        return buildingType.appearance.color;
      }
    }
    
    // Generate a deterministic color based on the building type
    const getColorFromType = (str: string): string => {
      // Create a hash from the string
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      
      // Use the hash to generate HSL values in appropriate ranges for Venetian architecture
      // Hue: Limit to earthy/warm tones (20-50 for browns/oranges/reds, 180-220 for blues)
      let hue = Math.abs(hash) % 360;
      
      // Adjust hue to be in appropriate ranges for Venetian architecture
      if (hue > 50 && hue < 180) {
        hue = 30 + (hue % 20); // Redirect to earthy tones
      } else if (hue > 220 && hue < 350) {
        hue = 200 + (hue % 20); // Redirect to Venetian blues
      }
      
      // Saturation: Muted for period-appropriate look (30-60%)
      const saturation = 30 + (Math.abs(hash >> 8) % 30);
      
      // Lightness: Medium to light for visibility (45-75%)
      const lightness = 45 + (Math.abs(hash >> 16) % 30);
      
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    };
    
    // Special cases for common building types
    switch(type.toLowerCase()) {
      case 'market-stall':
        return '#E6C275'; // Warm gold/amber for contract stalls
      case 'house':
        return '#E8D2B5'; // Venetian terracotta/sand for houses
      case 'workshop':
        return '#A67D5D'; // Rich wood brown for workshops
      case 'warehouse':
        return '#8C7B68'; // Darker earthy brown for warehouses
      case 'tavern':
        return '#B5835A'; // Warm oak brown for taverns
      case 'church':
        return '#E6E6D9'; // Off-white/ivory for churches
      case 'palace':
        return '#D9C7A7'; // Pale stone/marble for palaces
      case 'dock':
        return '#7D6C55'; // Dark wood brown for docks
      case 'bridge':
        return '#C9B18F'; // Stone bridge color
      case 'gondola-station':
        return '#5D7A8C'; // Blue-gray for gondola stations
      case 'gondola_station':
        return '#5D7A8C'; // Blue-gray for gondola stations
      default:
        // For any other building type, generate a deterministic color
        return getColorFromType(type);
    }
  }

  /**
   * Format building type for display
   */
  public formatBuildingType(type: string): string {
    if (!type) return 'Building';
    
    // Replace underscores and hyphens with spaces
    let formatted = type.replace(/[_-]/g, ' ');
    
    // Capitalize each word
    formatted = formatted.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return formatted;
  }

  /**
   * Reset the position cache
   */
  public resetPositionCache(): void {
    this.buildingPositionsCache = {};
    this.initialPositionCalculated = false;
    console.log('Building position cache has been reset');
  }

  /**
   * Check if initial position calculation is done
   */
  public isInitialPositionCalculated(): boolean {
    return this.initialPositionCalculated;
  }
}

// Export a singleton instance
export const buildingService = new BuildingService();
