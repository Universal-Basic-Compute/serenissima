import useBuildingStore from '@/store/useBuildingStore';
import * as THREE from 'three';

export interface Building {
  name: string;
  category: string;
  subcategory: string;
  tier: number;
  size: string;
  unlockCondition: string;
  shortDescription: string;
  fullDescription: string;
  flavorText: string;
  constructionCosts: {
    ducats: number;
    [key: string]: number;
  };
  maintenanceCost: number;
  constructionTime: number;
  assets?: {
    models?: string;
    variants?: string[];
    thumbnail?: string;
  };
  incomeGeneration?: number;
  locationRequirements?: {
    districtRestrictions: string;
    [key: string]: any;
  };
  gameplayInformation?: {
    unlocks?: string[];
    specialAbilities?: string[];
    [key: string]: any;
  };
  [key: string]: any;
}

export interface BuildingData {
  id?: string;
  type: string;
  variant?: string;
  land_id: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: number;
  created_by: string;
  connection_points?: { x: number; y: number; z: number }[];
}

export interface BuildingCategory {
  name: string;
  buildings: Building[];
}


/**
 * Service for managing building data
 * This is now a thin wrapper around the Zustand store
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
    return useBuildingStore.getState().loadBuildingCategories();
  }

  /**
   * Get building categories (returns cached data or loads if not available)
   */
  public async getBuildingCategories(): Promise<BuildingCategory[]> {
    return useBuildingStore.getState().getBuildingCategories();
  }

  /**
   * Get a building by name
   */
  public async getBuildingByName(name: string): Promise<Building | null> {
    return useBuildingStore.getState().getBuildingByName(name);
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
   * Get all buildings, optionally filtered by type
   * @param type Optional building type to filter by
   * @returns Array of building data
   */
  public async getBuildings(type?: string): Promise<any[]> {
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
        
        // Return mock data as fallback - using market-stall instead of public-dock
        const fallbackData = [
          {
            id: 'building_1',
            type: 'market-stall',
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
      console.log('Buildings API response data:', data);
      console.log(`Received ${data.buildings?.length || 0} buildings from API`);
      
      if (data.buildings && data.buildings.length > 0) {
        // Log each building for debugging
        data.buildings.forEach((building: any, index: number) => {
          console.log(`Building ${index + 1}:`, building);
        });
      } else {
        console.warn('No buildings returned from API');
      }
      
      return data.buildings || [];
    } catch (error) {
      console.error('Error fetching buildings:', error);
      console.error('Stack trace:', error.stack);
      
      // Return empty array instead of throwing to prevent UI errors
      return [];
    }
  }
  
}

// Create a singleton instance
export const buildingService = BuildingService.getInstance();
