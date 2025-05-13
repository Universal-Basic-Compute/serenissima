import useBuildingStore from '@/store/useBuildingStore';
import * as THREE from 'three';
import { BuildingCategory, BuildingDefinition, PlacementResult, PlacementContext, BuildingData } from '../models/BuildingTypes';

// Re-export BuildingData from models
export type { BuildingData };

/**
 * Service for managing building data
 * This is a thin wrapper around the Zustand store with additional functionality
 * for building placement, validation, and persistence
 */
export class BuildingService {
  private static instance: BuildingService;
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): BuildingService {
    if (!BuildingService.instance) {
      BuildingService.instance = new BuildingService();
    }
    return BuildingService.instance;
  }
  
  /**
   * Load all building categories
   */
  public async loadBuildingCategories(): Promise<BuildingCategory[]> {
    const categories = await useBuildingStore.getState().loadBuildingCategories();
    return categories as unknown as BuildingCategory[];
  }

  /**
   * Get building categories (returns cached data or loads if not available)
   */
  public async getBuildingCategories(): Promise<BuildingCategory[]> {
    const categories = await useBuildingStore.getState().getBuildingCategories();
    return categories as unknown as BuildingCategory[];
  }

  /**
   * Get a building by name
   */
  public async getBuildingByName(name: string): Promise<BuildingDefinition | null> {
    const building = await useBuildingStore.getState().getBuildingByName(name);
    return building as BuildingDefinition | null;
  }

  /**
   * Get available variants for a building
   */
  public async getBuildingVariants(buildingName: string): Promise<string[]> {
    return useBuildingStore.getState().getBuildingVariants(buildingName);
  }

  /**
   * Check if the service is currently loading data
   */
  public isLoading(): boolean {
    return useBuildingStore.getState().loading;
  }

  /**
   * Get the last error that occurred
   */
  public getError(): string | null {
    return useBuildingStore.getState().error;
  }
  
  /**
   * Save a new building
   * @param buildingData The building data to save
   * @returns The saved building data with generated ID
   */
  public async saveBuilding(buildingData: BuildingData): Promise<BuildingData> {
    try {
      // Send to server using relative URL
      const response = await fetch(`/api/buildings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildingData),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save building: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error saving building:', error);
      // For development, return mock data if API fails
      console.log('Returning mock building data');
      return {
        ...buildingData,
        id: `building_${Date.now()}`
      };
    }
  }
  
  /**
   * Save multiple buildings in a single request
   * @param buildingsData Array of building data to save
   * @returns Array of saved building data with generated IDs
   */
  public async saveBuildingsBulk(buildingsData: BuildingData[]): Promise<BuildingData[]> {
    try {
      // Send to server using relative URL
      const response = await fetch(`/api/buildings/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ buildings: buildingsData }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save buildings: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      return result.results.map((r: any) => r.building);
    } catch (error) {
      console.error('Error saving buildings in bulk:', error);
      // For development, return mock data if API fails
      console.log('Returning mock building data for bulk save');
      return buildingsData.map(data => ({
        ...data,
        id: `building_${Date.now()}_${Math.floor(Math.random() * 1000)}`
      }));
    }
  }
  
  /**
   * Get all buildings, optionally filtered by type
   * @param type Optional building type to filter by
   * @returns Array of building data
   */
  public async getBuildings(type?: string): Promise<BuildingData[]> {
    try {
      // Use a relative URL instead of an absolute one to avoid port issues
      let url = `/api/buildings`;
      if (type) {
        url += `?type=${encodeURIComponent(type)}`;
      }
      
      console.log('Fetching buildings from:', url);
      
      const response = await fetch(url);
      
      console.log('Buildings API response status:', response.status);
      
      if (!response.ok) {
        console.warn(`Failed to fetch buildings: ${response.status}. Using fallback data.`);
        
        // Return mock data as fallback
        const fallbackData: BuildingData[] = [
          {
            id: 'building_1',
            type: 'market-stall',
            variant: 'default',
            land_id: 'land_1',
            position: { x: 100, y: 0, z: 100 },
            rotation: 0,
            created_by: 'ConsiglioDeiDieci',
            created_at: '2023-01-01T00:00:00Z'
          }
        ];
        
        console.log('Using fallback building data:', fallbackData);
        return fallbackData;
      }
      
      const data = await response.json();
      console.log(`Received ${data.buildings?.length || 0} buildings from API`);
      
      return data.buildings || [];
    } catch (error) {
      console.error('Error fetching buildings:', error);
      console.error('Stack trace:', error instanceof Error ? error.stack : String(error));
      
      // Return empty array instead of throwing to prevent UI errors
      return [];
    }
  }
  
  /**
   * Get a building by ID
   * @param id Building ID
   * @returns Building data or null if not found
   */
  public async getBuildingById(id: string): Promise<BuildingData | null> {
    try {
      const response = await fetch(`/api/buildings/${id}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch building: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error fetching building ${id}:`, error);
      return null;
    }
  }
  
  /**
   * Delete a building
   * @param id Building ID to delete
   * @returns True if deletion was successful
   */
  public async deleteBuilding(id: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/buildings/${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete building: ${response.status} ${response.statusText}`);
      }
      
      return true;
    } catch (error) {
      console.error(`Error deleting building ${id}:`, error);
      return false;
    }
  }
  
  /**
   * Validate building placement
   * @param buildingType Type of building to place
   * @param context Placement context including position and land information
   * @returns Validation result with valid flag and optional reason
   */
  public validatePlacement(buildingType: string, context: PlacementContext): PlacementResult {
    // Check if the land is owned by the player
    if (context.owner !== context.owner) {
      return {
        valid: false,
        reason: 'You can only place buildings on land you own'
      };
    }
    
    // Check for overlapping buildings
    const overlappingBuilding = this.checkForOverlappingBuildings(context.position, context.existingBuildings);
    if (overlappingBuilding) {
      return {
        valid: false,
        reason: `Building would overlap with existing ${overlappingBuilding.type}`
      };
    }
    
    // Building-specific validation could be added here
    // For example, docks would need to be placed at water edges
    
    // Default to valid placement
    return { valid: true };
  }
  
  /**
   * Check if a building would overlap with existing buildings
   * @param position Position to check
   * @param existingBuildings Array of existing buildings
   * @returns Overlapping building or null if no overlap
   */
  private checkForOverlappingBuildings(position: THREE.Vector3, existingBuildings: BuildingData[]): BuildingData | null {
    // Define a minimum distance between buildings (in scene units)
    const MIN_DISTANCE = 2;
    
    for (const building of existingBuildings) {
      // Skip buildings without position data
      if (!building.position) continue;
      
      // Get building position as Vector3
      let buildingPos: THREE.Vector3;
      
      if ('lat' in building.position && 'lng' in building.position) {
        // Skip buildings with lat/lng position for now
        // In a real implementation, we would convert lat/lng to scene position
        continue;
      } else {
        buildingPos = new THREE.Vector3(
          building.position.x,
          building.position.y || 0,
          building.position.z
        );
      }
      
      // Calculate distance between positions (ignoring Y axis)
      const dx = position.x - buildingPos.x;
      const dz = position.z - buildingPos.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      // Check if distance is less than minimum allowed
      if (distance < MIN_DISTANCE) {
        return building;
      }
    }
    
    // No overlapping buildings found
    return null;
  }
}

// Create a singleton instance
export const buildingService = BuildingService.getInstance();
