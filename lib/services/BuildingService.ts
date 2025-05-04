import { getApiBaseUrl } from '@/lib/apiUtils';
import useBuildingStore from '@/store/useBuildingStore';

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

/**
 * Service for managing building data
 * This is now a thin wrapper around the Zustand store
 */
export class BuildingService {
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
}

// Create a singleton instance
export const buildingService = new BuildingService();
