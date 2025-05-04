import { getApiBaseUrl } from '@/lib/apiUtils';

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
 */
export class BuildingService {
  private categories: BuildingCategory[] = [];
  private loading: boolean = false;
  private error: string | null = null;
  private categoryFiles = [
    'residential',
    'commercial',
    'production',
    'infrastructure',
    'public&government',
    'military&defence',
    'special'
  ];

  /**
   * Load all building categories
   */
  public async loadBuildingCategories(): Promise<BuildingCategory[]> {
    if (this.categories.length > 0) {
      return this.categories; // Return cached data if available
    }

    this.loading = true;
    this.error = null;
    const loadedCategories: BuildingCategory[] = [];
    const apiBaseUrl = getApiBaseUrl();

    try {
      for (const category of this.categoryFiles) {
        try {
          console.log(`Fetching buildings for category: ${category}`);
          
          // Try the Next.js API route first
          let response = await fetch(`/api/buildings/${category}`, {
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          
          // If that fails, try the direct backend API
          if (!response.ok) {
            console.log(`Falling back to direct API for ${category}`);
            response = await fetch(`${apiBaseUrl}/api/buildings/${category}`, {
              signal: AbortSignal.timeout(5000) // 5 second timeout
            });
          }
          
          if (response.ok) {
            const buildings = await response.json();
            console.log(`Loaded ${buildings.length} buildings for category ${category}`);
            
            loadedCategories.push({
              name: category.charAt(0).toUpperCase() + category.slice(1).replace('&', ' & '),
              buildings: buildings
            });
          } else {
            console.warn(`Failed to load buildings for ${category}: ${response.status}`);
          }
        } catch (error) {
          console.error(`Error loading ${category} buildings:`, error);
        }
      }

      console.log(`Total categories loaded: ${loadedCategories.length}`);
      this.categories = loadedCategories;
      return loadedCategories;
    } catch (error) {
      console.error('Error loading building data:', error);
      this.error = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Get building categories (returns cached data or loads if not available)
   */
  public async getBuildingCategories(): Promise<BuildingCategory[]> {
    if (this.categories.length === 0) {
      return this.loadBuildingCategories();
    }
    return this.categories;
  }

  /**
   * Get a building by name
   */
  public async getBuildingByName(name: string): Promise<Building | null> {
    if (this.categories.length === 0) {
      await this.loadBuildingCategories();
    }

    for (const category of this.categories) {
      const building = category.buildings.find(
        b => b.name.toLowerCase() === name.toLowerCase()
      );
      if (building) return building;
    }

    return null;
  }

  /**
   * Get available variants for a building
   */
  public async getBuildingVariants(buildingName: string): Promise<string[]> {
    try {
      const formattedName = buildingName.toLowerCase().replace(/\s+/g, '-');
      const response = await fetch(`/api/building-variants/${formattedName}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.variants) {
          console.log(`Loaded ${data.variants.length} variants for ${buildingName}`);
          return data.variants;
        }
      }
      
      return ['model']; // Default to just 'model' if no variants found
    } catch (error) {
      console.error('Error fetching variants:', error);
      return ['model']; // Default to just 'model' on error
    }
  }

  /**
   * Check if the service is currently loading data
   */
  public isLoading(): boolean {
    return this.loading;
  }

  /**
   * Get the last error that occurred
   */
  public getError(): string | null {
    return this.error;
  }
}

// Create a singleton instance
export const buildingService = new BuildingService();
