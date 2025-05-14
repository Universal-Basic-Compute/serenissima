import { eventBus, EventTypes } from '../utils/eventBus';

// Extend EventTypes to include building points events
declare module '../utils/eventBus' {
  interface EventTypes {
    BUILDING_POINTS_LOADED: string;
  }
}

// Define the event type
EventTypes.BUILDING_POINTS_LOADED = 'BUILDING_POINTS_LOADED';

export class BuildingPointsService {
  private static instance: BuildingPointsService;
  private buildingPoints: Record<string, { lat: number, lng: number }> = {};
  private canalPoints: Record<string, { lat: number, lng: number }> = {};
  private bridgePoints: Record<string, { lat: number, lng: number }> = {};
  private isLoaded: boolean = false;
  private isLoading: boolean = false;
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): BuildingPointsService {
    if (!BuildingPointsService.instance) {
      BuildingPointsService.instance = new BuildingPointsService();
    }
    return BuildingPointsService.instance;
  }
  
  /**
   * Load all building points from the API
   */
  public async loadBuildingPoints(): Promise<void> {
    if (this.isLoaded || this.isLoading) return;
    
    this.isLoading = true;
    
    try {
      console.log('Loading building points from API...');
      
      // Use an absolute URL for server-side fetching
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiBaseUrl}/api/building-points`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch building points: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        this.buildingPoints = data.buildingPoints || {};
        this.canalPoints = data.canalPoints || {};
        this.bridgePoints = data.bridgePoints || {};
        this.isLoaded = true;
        
        console.log(`Loaded ${Object.keys(this.buildingPoints).length} building points, ${Object.keys(this.canalPoints).length} canal points, and ${Object.keys(this.bridgePoints).length} bridge points`);
        
        // Emit event to notify other components
        eventBus.emit(EventTypes.BUILDING_POINTS_LOADED, {
          buildingPointsCount: Object.keys(this.buildingPoints).length,
          canalPointsCount: Object.keys(this.canalPoints).length,
          bridgePointsCount: Object.keys(this.bridgePoints).length
        });
      } else {
        throw new Error(data.error || 'Unknown error loading building points');
      }
    } catch (error) {
      console.error('Error loading building points:', error);
      
      // Remove browser-only confirm dialog
      console.warn('Failed to load building points. Continuing without them.');
      // Don't try to regenerate automatically on the server
    } finally {
      this.isLoading = false;
    }
  }
  
  /**
   * Regenerate building points by calling the API
   */
  public async regenerateBuildingPoints(): Promise<boolean> {
    try {
      console.log('Requesting building points regeneration...');
      
      // Use an absolute URL for server-side fetching
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiBaseUrl}/api/building-points`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ regenerate: true }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to regenerate building points: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log('Building points regenerated successfully');
        
        // Update our local cache with the new points
        this.buildingPoints = data.buildingPoints || {};
        this.canalPoints = data.canalPoints || {};
        this.bridgePoints = data.bridgePoints || {};
        this.isLoaded = true;
        
        // Emit event to notify other components
        eventBus.emit(EventTypes.BUILDING_POINTS_LOADED, {
          buildingPointsCount: Object.keys(this.buildingPoints).length,
          canalPointsCount: Object.keys(this.canalPoints).length,
          bridgePointsCount: Object.keys(this.bridgePoints).length,
          regenerated: true
        });
        
        return true;
      } else {
        throw new Error(data.error || 'Unknown error regenerating building points');
      }
    } catch (error) {
      console.error('Error regenerating building points:', error);
      return false;
    }
  }
  
  /**
   * Get position for a point ID
   */
  public getPositionForPoint(pointId: string): { lat: number, lng: number } | null {
    if (!pointId) return null;
    
    console.log(`Attempting to resolve position for point ID: ${pointId}`);
    
    // Check all point collections
    if (this.buildingPoints[pointId]) {
      console.log(`Found point in buildingPoints: ${pointId}`);
      return this.buildingPoints[pointId];
    }
    
    if (this.canalPoints[pointId]) {
      console.log(`Found point in canalPoints: ${pointId}`);
      return this.canalPoints[pointId];
    }
    
    if (this.bridgePoints[pointId]) {
      console.log(`Found point in bridgePoints: ${pointId}`);
      return this.bridgePoints[pointId];
    }
    
    // If point ID not found, try to parse it as a type_lat_lng format
    // Examples: building_45.440864_12.335067, bridge_45.428839_12.316503
    const parts = pointId.split('_');
    if (parts.length >= 3) {
      // The format should be: [type, lat, lng]
      const lat = parseFloat(parts[1]);
      const lng = parseFloat(parts[2]);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        console.log(`Extracted coordinates from point ID ${pointId}: lat=${lat}, lng=${lng}`);
        return { lat, lng };
      }
    }
    
    // If point ID not found, try to parse it as a point-{lat}-{lng} format
    if (pointId.startsWith('point-')) {
      const parts = pointId.split('-');
      if (parts.length >= 3) {
        const lat = parseFloat(parts[1]);
        const lng = parseFloat(parts[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
          console.log(`Extracted coordinates from point-lat-lng format: ${pointId}`);
          return { lat, lng };
        }
      }
    }
    
    // If point ID not found, try to parse it as a canal-{lat}-{lng} format
    if (pointId.startsWith('canal-')) {
      const parts = pointId.split('-');
      if (parts.length >= 3) {
        const lat = parseFloat(parts[1]);
        const lng = parseFloat(parts[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
          console.log(`Extracted coordinates from canal-lat-lng format: ${pointId}`);
          return { lat, lng };
        }
      }
    }
    
    // If point ID not found, try to parse it as a bridge-{lat}-{lng} format
    if (pointId.startsWith('bridge-')) {
      const parts = pointId.split('-');
      if (parts.length >= 3) {
        const lat = parseFloat(parts[1]);
        const lng = parseFloat(parts[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
          console.log(`Extracted coordinates from bridge-lat-lng format: ${pointId}`);
          return { lat, lng };
        }
      }
    }
    
    console.warn(`Could not resolve position for point ID: ${pointId}`);
    return null;
  }
  
  /**
   * Check if building points are loaded
   */
  public isPointsLoaded(): boolean {
    return this.isLoaded;
  }
  
  /**
   * Debug function to help diagnose issues with building points
   */
  public debugPointsStatus(): void {
    console.log('BuildingPointsService Debug Info:');
    console.log(`- Is Loaded: ${this.isLoaded}`);
    console.log(`- Is Loading: ${this.isLoading}`);
    console.log(`- Building Points Count: ${Object.keys(this.buildingPoints).length}`);
    console.log(`- Canal Points Count: ${Object.keys(this.canalPoints).length}`);
    console.log(`- Bridge Points Count: ${Object.keys(this.bridgePoints).length}`);
    
    // Log a few sample points for debugging
    const buildingPointKeys = Object.keys(this.buildingPoints);
    if (buildingPointKeys.length > 0) {
      console.log('Sample building point:');
      console.log(`- Key: ${buildingPointKeys[0]}`);
      console.log(`- Value: ${JSON.stringify(this.buildingPoints[buildingPointKeys[0]])}`);
    }
  }
}

// Export singleton instance
export const buildingPointsService = BuildingPointsService.getInstance();
