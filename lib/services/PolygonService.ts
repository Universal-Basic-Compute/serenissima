import { eventBus, EventTypes } from '../utils/eventBus';
import { calculateCentroid, validateAndRepairCoordinates } from '../utils/fileUtils';

/**
 * Service for handling polygon data
 */
export class PolygonService {
  private polygons: any[] = [];
  private landOwners: Record<string, string> = {};
  private loading: boolean = false;
  private error: string | null = null;
  private isLoaded: boolean = false;
  
  /**
   * Load polygons from the API
   */
  public async loadPolygons(): Promise<any[]> {
    try {
      this.loading = true;
      this.error = null;
      
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiBaseUrl}/api/polygons`);
      
      if (!response.ok) {
        throw new Error(`Failed to load polygons: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data || !Array.isArray(data.polygons)) {
        throw new Error('Invalid polygon data format');
      }
      
      this.polygons = data.polygons;
      this.isLoaded = true;
      
      // Process polygons to ensure they have centroids
      this.processPolygons();
      
      // Notify listeners that polygons have been loaded
      eventBus.emit(EventTypes.POLYGONS_LOADED, this.polygons);
      
      return this.polygons;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Failed to load polygons';
      throw error;
    } finally {
      this.loading = false;
    }
  }
  
  /**
   * Load land owners from the API
   */
  public async loadLandOwners(): Promise<Record<string, string>> {
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiBaseUrl}/api/land-owners`);
      
      if (!response.ok) {
        throw new Error(`Failed to load land owners: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid land owners data format');
      }
      
      this.landOwners = data;
      
      return this.landOwners;
    } catch (error) {
      console.error('Error loading land owners:', error);
      return {};
    }
  }
  
  /**
   * Process polygons to ensure they have centroids and valid coordinates
   */
  private processPolygons(): void {
    this.polygons = this.polygons.map(polygon => {
      // Skip if polygon doesn't have coordinates
      if (!polygon.coordinates || polygon.coordinates.length < 3) {
        return polygon;
      }
      
      // Validate and repair coordinates if needed
      const validCoordinates = validateAndRepairCoordinates(polygon.coordinates);
      if (!validCoordinates) {
        console.warn(`Invalid coordinates for polygon ${polygon.id}`);
        return polygon;
      }
      
      // Calculate centroid if not already present
      if (!polygon.center) {
        const centroid = calculateCentroid(validCoordinates);
        if (centroid) {
          polygon.center = centroid;
        }
      }
      
      return polygon;
    });
  }

  /**
   * Get all polygons
   */
  public getPolygons(): any[] {
    return this.polygons;
  }
  
  /**
   * Get a polygon by ID
   */
  public getPolygonById(id: string): any | undefined {
    return this.polygons.find(p => p.id === id);
  }
  
  /**
   * Get land owners
   */
  public getLandOwners(): Record<string, string> {
    return this.landOwners;
  }
  
  /**
   * Get the owner of a land
   */
  public getLandOwner(landId: string): string | undefined {
    return this.landOwners[landId];
  }
  
  /**
   * Update the owner of a land
   */
  public updateLandOwner(landId: string, newOwner: string): void {
    // Update local data
    this.landOwners[landId] = newOwner;
    
    // Update polygon data
    const polygon = this.getPolygonById(landId);
    if (polygon) {
      polygon.owner = newOwner;
    }
    
    // Notify listeners about the change
    eventBus.emit(EventTypes.LAND_OWNERSHIP_CHANGED, {
      landId,
      newOwner
    });
  }
  
  
  /**
   * Check if polygons are loading
   */
  public isLoading(): boolean {
    return this.loading;
  }
  
  /**
   * Get error message if any
   */
  public getError(): string | null {
    return this.error;
  }
  
  /**
   * Check if polygons are loaded
   */
  public isDataLoaded(): boolean {
    return this.isLoaded;
  }
  
  /**
   * Find polygon that contains a point
   */
  public findPolygonContainingPoint(point: {lat: number, lng: number}): any | null {
    for (const polygon of this.polygons) {
      if (polygon.coordinates && polygon.coordinates.length > 2) {
        if (this.isPointInPolygon(point, polygon.coordinates)) {
          return polygon;
        }
      }
    }
    return null;
  }
  
  /**
   * Check if a point is inside a polygon
   */
  private isPointInPolygon(point: {lat: number, lng: number}, coordinates: {lat: number, lng: number}[]): boolean {
    let inside = false;
    for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
      const xi = coordinates[i].lng, yi = coordinates[i].lat;
      const xj = coordinates[j].lng, yj = coordinates[j].lat;
      
      const intersect = ((yi > point.lat) !== (yj > point.lat))
          && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  
  /**
   * Calculate distance between two points
   */
  public calculateDistance(point1: {lat: number, lng: number}, point2: {lat: number, lng: number}): number {
    const R = 6371000; // Earth radius in meters
    const lat1 = point1.lat * Math.PI / 180;
    const lat2 = point2.lat * Math.PI / 180;
    const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
    const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

// Create a singleton instance
export const polygonService = new PolygonService();
