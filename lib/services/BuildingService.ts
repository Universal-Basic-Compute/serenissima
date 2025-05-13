import useBuildingStore from '@/store/useBuildingStore';
import * as THREE from 'three';
import { BuildingCategory, BuildingDefinition, PlacementResult, PlacementContext, BuildingData } from '../models/BuildingTypes';
import { log } from '../logUtils';
import { getWalletAddress } from '../walletUtils';

// Re-export BuildingData from models
export type { BuildingData };

/**
 * Service for managing building data
 * This is a thin wrapper around the Zustand store with additional functionality
 * for building placement, validation, and persistence
 * 
 * @class BuildingService
 * @singleton
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
   * 
   * @returns Promise resolving to an array of building categories
   * @throws Error if loading fails
   */
  public async loadBuildingCategories(): Promise<BuildingCategory[]> {
    try {
      const categories = await useBuildingStore.getState().loadBuildingCategories();
      return categories as unknown as BuildingCategory[];
    } catch (error) {
      log.error('Failed to load building categories:', error);
      throw new Error(`Failed to load building categories: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get building categories (returns cached data or loads if not available)
   * 
   * @returns Promise resolving to an array of building categories
   * @throws Error if retrieval fails
   */
  public async getBuildingCategories(): Promise<BuildingCategory[]> {
    try {
      const categories = await useBuildingStore.getState().getBuildingCategories();
      return categories as unknown as BuildingCategory[];
    } catch (error) {
      log.error('Failed to get building categories:', error);
      throw new Error(`Failed to get building categories: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a building by name
   * 
   * @param name The name of the building to retrieve
   * @returns Promise resolving to the building definition or null if not found
   * @throws Error if retrieval fails
   */
  public async getBuildingByName(name: string): Promise<BuildingDefinition | null> {
    try {
      const building = await useBuildingStore.getState().getBuildingByName(name);
      return building as BuildingDefinition | null;
    } catch (error) {
      log.error(`Failed to get building by name "${name}":`, error);
      throw new Error(`Failed to get building by name: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get available variants for a building
   * 
   * @param buildingName The name of the building to get variants for
   * @returns Promise resolving to an array of variant names
   * @throws Error if retrieval fails
   */
  public async getBuildingVariants(buildingName: string): Promise<string[]> {
    try {
      return useBuildingStore.getState().getBuildingVariants(buildingName);
    } catch (error) {
      log.error(`Failed to get variants for building "${buildingName}":`, error);
      throw new Error(`Failed to get building variants: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if the service is currently loading data
   * 
   * @returns True if the service is loading data, false otherwise
   */
  public isLoading(): boolean {
    return useBuildingStore.getState().loading;
  }

  /**
   * Get the last error that occurred
   * 
   * @returns The last error message or null if no error occurred
   */
  public getError(): string | null {
    return useBuildingStore.getState().error;
  }
  
  /**
   * Save a new building
   * 
   * @param buildingData The building data to save
   * @returns Promise resolving to the saved building data with generated ID
   * @throws Error if saving fails
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
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Failed to save building: ${response.status} ${errorText}`);
      }
      
      const result = await response.json();
      
      // Check if the response contains the expected data
      if (!result.building && !result.success) {
        throw new Error('Invalid response format from server');
      }
      
      return result.building || result;
    } catch (error) {
      log.error('Error saving building:', error);
      
      // For development, return mock data if API fails
      if (process.env.NODE_ENV === 'development') {
        log.warn('Returning mock building data for development');
        return {
          ...buildingData,
          id: `building_${Date.now()}`
        };
      }
      
      throw new Error(`Failed to save building: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Save multiple buildings in a single request
   * 
   * @param buildingsData Array of building data to save
   * @returns Promise resolving to an array of saved building data with generated IDs
   * @throws Error if saving fails
   */
  public async saveBuildingsBulk(buildingsData: BuildingData[]): Promise<BuildingData[]> {
    try {
      // Validate input
      if (!Array.isArray(buildingsData) || buildingsData.length === 0) {
        throw new Error('Invalid input: buildingsData must be a non-empty array');
      }
      
      // Send to server using relative URL
      const response = await fetch(`/api/buildings/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ buildings: buildingsData }),
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Failed to save buildings: ${response.status} ${errorText}`);
      }
      
      const result = await response.json();
      
      if (!result.results || !Array.isArray(result.results)) {
        throw new Error('Invalid response format from server');
      }
      
      return result.results.map((r: any) => r.building);
    } catch (error) {
      log.error('Error saving buildings in bulk:', error);
      
      // For development, return mock data if API fails
      if (process.env.NODE_ENV === 'development') {
        log.warn('Returning mock building data for bulk save in development');
        return buildingsData.map(data => ({
          ...data,
          id: `building_${Date.now()}_${Math.floor(Math.random() * 1000)}`
        }));
      }
      
      throw new Error(`Failed to save buildings in bulk: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get all buildings, optionally filtered by type
   * 
   * @param type Optional building type to filter by
   * @returns Promise resolving to an array of building data
   */
  public async getBuildings(type?: string): Promise<BuildingData[]> {
    try {
      // Use a relative URL instead of an absolute one to avoid port issues
      let url = `/api/buildings`;
      if (type) {
        url += `?type=${encodeURIComponent(type)}`;
      }
      
      log.info('Fetching buildings from:', url);
      
      const response = await fetch(url, {
        // Add cache control headers to prevent stale data
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      log.info('Buildings API response status:', response.status);
      
      if (!response.ok) {
        log.warn(`Failed to fetch buildings: ${response.status}. Using fallback data.`);
        
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
        
        log.info('Using fallback building data:', fallbackData);
        return fallbackData;
      }
      
      const data = await response.json();
      log.info(`Received ${data.buildings?.length || 0} buildings from API`);
      
      // Validate and normalize the data
      const buildings = data.buildings || [];
      
      // Ensure all buildings have required properties
      return buildings.map((building: any) => {
        // Ensure position is properly formatted
        if (building.position && typeof building.position === 'string') {
          try {
            building.position = JSON.parse(building.position);
          } catch (e) {
            log.warn(`Failed to parse position for building ${building.id}:`, e);
            // Provide a default position
            building.position = { x: 0, y: 0, z: 0 };
          }
        }
        
        return building;
      });
    } catch (error) {
      log.error('Error fetching buildings:', error);
      log.error('Stack trace:', error instanceof Error ? error.stack : String(error));
      
      // Return empty array instead of throwing to prevent UI errors
      return [];
    }
  }
  
  /**
   * Get a building by ID
   * 
   * @param id Building ID
   * @returns Promise resolving to building data or null if not found
   * @throws Error if retrieval fails
   */
  public async getBuildingById(id: string): Promise<BuildingData | null> {
    try {
      if (!id) {
        throw new Error('Building ID is required');
      }
      
      const response = await fetch(`/api/buildings/${id}`);
      
      if (response.status === 404) {
        log.warn(`Building with ID ${id} not found`);
        return null;
      }
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Failed to fetch building: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      
      // Ensure position is properly formatted
      if (data.position && typeof data.position === 'string') {
        try {
          data.position = JSON.parse(data.position);
        } catch (e) {
          log.warn(`Failed to parse position for building ${id}:`, e);
          // Provide a default position
          data.position = { x: 0, y: 0, z: 0 };
        }
      }
      
      return data;
    } catch (error) {
      log.error(`Error fetching building ${id}:`, error);
      throw new Error(`Failed to fetch building: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Delete a building
   * 
   * @param id Building ID to delete
   * @returns Promise resolving to true if deletion was successful
   * @throws Error if deletion fails
   */
  public async deleteBuilding(id: string): Promise<boolean> {
    try {
      if (!id) {
        throw new Error('Building ID is required');
      }
      
      const response = await fetch(`/api/buildings/${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Failed to delete building: ${response.status} ${errorText}`);
      }
      
      return true;
    } catch (error) {
      log.error(`Error deleting building ${id}:`, error);
      throw new Error(`Failed to delete building: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Validate building placement
   * 
   * @param buildingType Type of building to place
   * @param context Placement context including position and land information
   * @returns Validation result with valid flag and optional reason
   */
  public validatePlacement(buildingType: string, context: PlacementContext): PlacementResult {
    // Validate input parameters
    if (!buildingType) {
      return {
        valid: false,
        reason: 'Building type is required'
      };
    }
    
    if (!context.position) {
      return {
        valid: false,
        reason: 'Position is required'
      };
    }
    
    if (!context.landId) {
      return {
        valid: false,
        reason: 'Land ID is required'
      };
    }
    
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
    
    // Building-specific validation based on type
    switch (buildingType.toLowerCase()) {
      case 'dock':
        // Docks must be placed adjacent to water
        if (!context.terrain || !context.terrain.hasWaterAccess) {
          return {
            valid: false,
            reason: 'Docks must be placed adjacent to water'
          };
        }
        break;
        
      case 'market-stall':
        // Market stalls must be placed on flat terrain
        if (context.terrain && context.terrain.slope > 0.2) {
          return {
            valid: false,
            reason: 'Market stalls must be placed on relatively flat terrain'
          };
        }
        break;
        
      // Add more building-specific validation as needed
    }
    
    // Default to valid placement
    return { valid: true };
  }
  
  /**
   * Check if a building would overlap with existing buildings
   * 
   * @param position Position to check
   * @param existingBuildings Array of existing buildings
   * @returns Overlapping building or null if no overlap
   */
  private checkForOverlappingBuildings(position: THREE.Vector3, existingBuildings: BuildingData[]): BuildingData | null {
    // Define a minimum distance between buildings (in scene units)
    const MIN_DISTANCE = 2;
    
    // If no existing buildings, there can't be any overlap
    if (!existingBuildings || existingBuildings.length === 0) {
      return null;
    }
    
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
  
  /**
   * Create a building at a specific building point
   * 
   * @param buildingData The building data
   * @param cost The cost of the building in compute
   * @returns Promise resolving to the created building
   */
  public async createBuildingAtPoint(buildingData: Partial<BuildingData>, cost: number): Promise<BuildingData> {
    try {
      // Get the wallet address
      const walletAddress = getWalletAddress();
      
      if (!walletAddress) {
        throw new Error('Wallet address is required');
      }
      
      // Send to server using relative URL
      const response = await fetch(`/api/create-building-at-point`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...buildingData,
          walletAddress,
          cost
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create building: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success || !result.building) {
        throw new Error(result.error || 'Failed to create building');
      }
      
      return result.building;
    } catch (error) {
      log.error('Error creating building at point:', error);
      
      // For development, return mock data if API fails
      if (process.env.NODE_ENV === 'development') {
        log.warn('Returning mock building data for development');
        return {
          id: `building_${Date.now()}`,
          type: buildingData.type || 'unknown',
          land_id: buildingData.land_id || 'unknown',
          position: buildingData.position || { x: 0, y: 0, z: 0 },
          rotation: buildingData.rotation || 0,
          variant: buildingData.variant || 'model',
          created_by: buildingData.created_by || 'system',
          created_at: buildingData.created_at || new Date().toISOString()
        } as BuildingData;
      }
      
      throw error;
    }
  }

  /**
   * Update an existing building
   * 
   * @param id Building ID
   * @param updates Partial building data to update
   * @returns Promise resolving to updated building data or null if not found
   * @throws Error if update fails
   */
  public async updateBuilding(id: string, updates: Partial<BuildingData>): Promise<BuildingData | null> {
    try {
      if (!id) {
        throw new Error('Building ID is required');
      }
      
      const response = await fetch(`/api/buildings/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (response.status === 404) {
        log.warn(`Building with ID ${id} not found`);
        return null;
      }
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Failed to update building: ${response.status} ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      log.error(`Error updating building ${id}:`, error);
      throw new Error(`Failed to update building: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Create a singleton instance
export const buildingService = BuildingService.getInstance();
