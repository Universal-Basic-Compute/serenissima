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

export interface DockData extends BuildingData {
  connectionPoints: { x: number; y: number; z: number }[];
  edge?: { lat: number; lng: number };
  position: { x: number; y: number; z: number } | { lat: number; lng: number };
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
   * Create a new dock
   * @param landId ID of the land parcel
   * @param position Position of the dock
   * @param rotation Rotation of the dock in radians
   * @returns The created dock data
   */
  public async createDock(landId: string, position: THREE.Vector3, rotation: number): Promise<DockData> {
    try {
      // Calculate connection points based on position and rotation
      const connectionPoints = this.calculateDockConnectionPoints(position, rotation);
      
      // Create dock data
      const dockData: DockData = {
        type: 'dock',
        variant: 'model',
        land_id: landId,
        position: {
          x: position.x,
          y: position.y,
          z: position.z
        },
        rotation: rotation,
        created_by: 'system', // This should be the current user
        connectionPoints: connectionPoints
      };
      
      // Send to server
      const response = await fetch(`/api/docks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dockData),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create dock: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error creating dock:', error);
      // For development, return mock data if API fails
      console.log('Returning mock dock data');
      
      // Generate a unique ID
      const id = `dock_${Date.now()}`;
      
      return {
        id,
        type: 'dock',
        variant: 'model',
        land_id: landId,
        position: {
          x: position.x,
          y: position.y,
          z: position.z
        },
        rotation: rotation,
        created_by: 'system',
        connectionPoints: this.calculateDockConnectionPoints(position, rotation)
      };
    }
  }
  
  /**
   * Get all docks
   * @returns Array of dock data
   */
  public async getDocks(): Promise<DockData[]> {
    try {
      const response = await fetch(`/api/docks`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch docks: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching docks:', error);
      return [];
    }
  }
  
  /**
   * Get a dock by ID
   * @param id Dock ID
   * @returns Dock data or null if not found
   */
  public async getDockById(id: string): Promise<DockData | null> {
    try {
      const response = await fetch(`/api/docks/${id}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch dock: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error fetching dock ${id}:`, error);
      return null;
    }
  }
  
  /**
   * Calculate connection points for a dock based on position and rotation
   * @param position Dock position
   * @param rotation Dock rotation in radians
   * @returns Array of connection points
   */
  private calculateDockConnectionPoints(position: THREE.Vector3, rotation: number): { x: number; y: number; z: number }[] {
    // Create a direction vector pointing in the direction of the dock (based on rotation)
    const direction = new THREE.Vector3(Math.sin(rotation), 0, Math.cos(rotation));
    
    // Create a perpendicular vector for the width of the dock
    const perpendicular = new THREE.Vector3(Math.sin(rotation + Math.PI/2), 0, Math.cos(rotation + Math.PI/2));
    
    // Calculate connection points
    const connectionPoints = [];
    
    // Main connection point at the back of the dock (land side)
    const landConnection = new THREE.Vector3()
      .copy(position)
      .add(direction.clone().multiplyScalar(-2)); // 2 units behind the dock
    
    connectionPoints.push({
      x: landConnection.x,
      y: landConnection.y + 0.1, // Slightly above ground
      z: landConnection.z
    });
    
    // Side connection points (optional)
    const leftSide = new THREE.Vector3()
      .copy(position)
      .add(perpendicular.clone().multiplyScalar(1.5)); // 1.5 units to the left
    
    const rightSide = new THREE.Vector3()
      .copy(position)
      .add(perpendicular.clone().multiplyScalar(-1.5)); // 1.5 units to the right
    
    connectionPoints.push({
      x: leftSide.x,
      y: leftSide.y + 0.1,
      z: leftSide.z
    });
    
    connectionPoints.push({
      x: rightSide.x,
      y: rightSide.y + 0.1,
      z: rightSide.z
    });
    
    return connectionPoints;
  }
}

// Create a singleton instance
export const buildingService = BuildingService.getInstance();
