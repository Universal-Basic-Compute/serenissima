import { Polygon, Coordinate } from '../../components/PolygonViewer/types';
import { eventBus, EventTypes } from '../eventBus';

/**
 * Service for handling polygon data
 */
export class PolygonService {
  private polygons: Polygon[] = [];
  private landOwners: Record<string, string> = {};
  private loading: boolean = false;
  private error: string | null = null;
  
  /**
   * Load polygons from the API
   */
  public async loadPolygons(): Promise<Polygon[]> {
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
      
      // Debug: Check if any polygons have coatOfArmsCenter
      const polygonsWithCoatOfArmsCenter = this.polygons.filter(p => p.coatOfArmsCenter);
      console.log(`Found ${polygonsWithCoatOfArmsCenter.length} polygons with coatOfArmsCenter`);
      if (polygonsWithCoatOfArmsCenter.length > 0) {
        console.log('Example polygon with coatOfArmsCenter:', polygonsWithCoatOfArmsCenter[0]);
      }
      
      // Notify listeners that polygons have been loaded
      eventBus.emit(EventTypes.POLYGONS_LOADED);
      
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
   * Get all polygons
   */
  public getPolygons(): Polygon[] {
    return this.polygons;
  }
  
  /**
   * Get a polygon by ID
   */
  public getPolygonById(id: string): Polygon | undefined {
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
}

// Create a singleton instance
export const polygonService = new PolygonService();
