import { getApiBaseUrl } from '@/lib/apiUtils';
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

export interface BuildingCategory {
  name: string;
  buildings: Building[];
}

export interface DockData {
  id: string;
  landId: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  connectionPoints: { x: number; y: number; z: number }[];
  createdBy: string;
  createdAt: string;
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
   * Create a new dock
   * @param landId The ID of the land parcel the dock is connected to
   * @param position The position of the dock
   * @param rotation The rotation of the dock in radians
   * @returns The created dock data
   */
  public async createDock(
    landId: string, 
    position: THREE.Vector3, 
    rotation: number
  ): Promise<DockData> {
    try {
      // Generate connection points based on position and rotation
      const connectionPoints = this.generateDockConnectionPoints(position, rotation);
      
      // Prepare dock data
      const dockData = {
        landId,
        position: {
          x: position.x,
          y: position.y,
          z: position.z
        },
        rotation,
        connectionPoints,
        createdBy: 'admin' // This should be the actual user ID in a real implementation
      };
      
      // Send to server
      const response = await fetch(`${getApiBaseUrl()}/api/docks`, {
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
      throw error;
    }
  }
  
  /**
   * Get all docks
   * @returns Array of dock data
   */
  public async getDocks(): Promise<DockData[]> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/docks`);
      
      if (!response.ok) {
        throw new Error(`Failed to get docks: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error getting docks:', error);
      throw error;
    }
  }
  
  /**
   * Get a dock by ID
   * @param id The dock ID
   * @returns The dock data or null if not found
   */
  public async getDockById(id: string): Promise<DockData | null> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/docks/${id}`);
      
      if (response.status === 404) {
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`Failed to get dock: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error getting dock:', error);
      throw error;
    }
  }
  
  /**
   * Generate connection points for a dock
   * @param position The position of the dock
   * @param rotation The rotation of the dock in radians
   * @returns Array of connection point positions
   */
  private generateDockConnectionPoints(
    position: THREE.Vector3, 
    rotation: number
  ): { x: number; y: number; z: number }[] {
    const points = [];
    
    // Front connection point (for roads connecting to the dock)
    // Adjust distance to account for smaller size
    points.push({
      x: position.x + Math.sin(rotation) * 1.25, // Half of original 2.5
      y: position.y + 0.2,
      z: position.z + Math.cos(rotation) * 1.25
    });
    
    // Side connection points (for roads running alongside the dock)
    // Adjust distance to account for smaller size
    points.push({
      x: position.x + Math.sin(rotation + Math.PI/2) * 0.5, // Half of original 1
      y: position.y + 0.2,
      z: position.z + Math.cos(rotation + Math.PI/2) * 0.5
    });
    
    points.push({
      x: position.x + Math.sin(rotation - Math.PI/2) * 0.5, // Half of original 1
      y: position.y + 0.2,
      z: position.z + Math.cos(rotation - Math.PI/2) * 0.5
    });
    
    return points;
  }
}

// Create a singleton instance
export const buildingService = BuildingService.getInstance();
