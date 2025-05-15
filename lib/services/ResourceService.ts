import { fetchResources, fetchResourceCounts } from '../utils/resourceUtils';
import type { ResourceNode } from '../utils/resourceUtils';

// Extend the ResourceNode type to include the properties we need
interface ExtendedResourceNode extends ResourceNode {
  amount?: number;
  productionProperties?: any;
  productionChainPosition?: any;
  longDescription?: string;
  baseProperties?: any;
}

export interface Resource {
  id: string;
  name: string;
  icon: string;
  amount: number;
  category: string;
  subcategory?: string;
  description?: string;
  rarity?: string;
  buildingId?: string;
  location?: {
    lat: number;
    lng: number;
  };
  productionProperties?: {
    producerBuilding?: string;
    processorBuilding?: string;
    productionComplexity?: number;
    processingComplexity?: number;
    requiredSkill?: string;
    productionTime?: number;
    processingTime?: number;
    batchSize?: number;
    inputs?: Array<{
      resource: string;
      amount: number;
      qualityImpact?: number;
    }>;
    outputs?: Array<{
      resource: string;
      amount: number;
    }>;
  };
  productionChainPosition?: {
    predecessors?: Array<{
      resource: string;
      facility?: string;
    }>;
    successors?: Array<{
      resource: string;
      facility?: string;
    }>;
  };
  baseProperties?: {
    baseValue?: number;
    weight?: number;
    volume?: number;
    stackSize?: number;
    perishable?: boolean;
    perishTime?: number;
    nutritionValue?: number;
  };
}

export interface ResourceCategory {
  id: string;
  name: string;
  resources: Resource[];
}

export class ResourceService {
  private static instance: ResourceService;
  private resourcesCache: Resource[] | null = null;
  private categoriesCache: ResourceCategory[] | null = null;
  private globalResources: Resource[] | null = null;
  private playerResources: Resource[] | null = null;
  
  public static getInstance(): ResourceService {
    if (!ResourceService.instance) {
      ResourceService.instance = new ResourceService();
    }
    return ResourceService.instance;
  }
  
  /**
   * Load all resources from the API
   */
  private async loadAllResources(): Promise<Resource[]> {
    // If we already have cached resources, return them
    if (this.resourcesCache) {
      return this.resourcesCache;
    }
    
    try {
      const resources = await fetchResources();
      console.log(`Fetched ${resources.length} resources from API`);
      
      // Create a Map to deduplicate resources by ID
      const resourceMap = new Map<string, Resource>();
      
      // Process resources to ensure they have all required fields
      resources.forEach((resource: ExtendedResourceNode) => {
        // Skip if we already have this resource ID
        if (resourceMap.has(resource.id)) {
          console.warn(`Duplicate resource ID found: ${resource.id} - ${resource.name}`);
          return;
        }
        
        // Ensure we have a valid resource ID
        if (!resource.id) {
          console.warn(`Resource without ID found, skipping:`, resource);
          return;
        }
        
        // Ensure we have a valid resource name
        const name = resource.name || resource.id;
        
        resourceMap.set(resource.id, {
          id: resource.id,
          name: name,
          category: resource.category || 'raw_materials', // Default category
          subcategory: resource.subcategory || '',
          description: resource.description || resource.longDescription || '',
          rarity: resource.rarity || 'common',
          icon: resource.icon || 'default.png',
          amount: resource.amount || 0, // Use provided amount or default to 0
          // Copy over any additional properties that might be useful
          productionProperties: resource.productionProperties,
          productionChainPosition: resource.productionChainPosition,
          baseProperties: resource.baseProperties
        });
      });
      
      // Convert Map to array
      const processedResources = Array.from(resourceMap.values());
      console.log(`Processed ${processedResources.length} unique resources from ${resources.length} total`);
      
      // Cache the resources
      this.resourcesCache = processedResources;
      return processedResources;
    } catch (error) {
      console.error('Error loading resources:', error);
      return [];
    }
  }
  
  /**
   * Get all resource categories with their resources
   */
  public async getResourceCategories(): Promise<ResourceCategory[]> {
    // If we already have cached categories, return them
    if (this.categoriesCache) {
      return this.categoriesCache;
    }
    
    // Load all resources
    const resources = await this.loadAllResources();
    
    // Group resources by category
    const categoriesMap = new Map<string, Resource[]>();
    
    resources.forEach(resource => {
      // Ensure resource has a valid category
      const category = resource.category || 'raw_materials';
      
      if (!categoriesMap.has(category)) {
        categoriesMap.set(category, []);
      }
      
      // Add resource to its category
      const categoryResources = categoriesMap.get(category);
      
      // Check if this resource is already in the category (by ID)
      const existingResourceIndex = categoryResources.findIndex(r => r.id === resource.id);
      
      if (existingResourceIndex === -1) {
        // Resource not in category yet, add it
        categoryResources.push(resource);
      } else {
        console.warn(`Duplicate resource ID ${resource.id} in category ${category}`);
      }
    });
    
    // Convert map to array of categories
    const categories: ResourceCategory[] = Array.from(categoriesMap.entries()).map(([categoryId, categoryResources]) => {
      // Format category name for display
      const categoryName = categoryId
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      return {
        id: categoryId,
        name: categoryName,
        resources: categoryResources.sort((a, b) => a.name.localeCompare(b.name)) // Sort resources alphabetically
      };
    });
    
    // Sort categories alphabetically
    categories.sort((a, b) => a.name.localeCompare(b.name));
    
    // Log category statistics
    categories.forEach(category => {
      console.log(`Category ${category.id} has ${category.resources.length} resources`);
    });
    
    // Cache the categories
    this.categoriesCache = categories;
    return categories;
  }
  
  /**
   * Get the amount of a specific resource
   */
  public async getResourceAmount(resourceId: string): Promise<number> {
    // This would fetch the current amount of a specific resource from the server
    // For now, return 0
    return 0;
  }
  
  /**
   * Update the amount of a resource
   */
  public async updateResourceAmount(resourceId: string, amount: number): Promise<void> {
    // This would update the amount of a resource on the server
    console.log(`Updating resource ${resourceId} to amount ${amount}`);
  }
  
  /**
   * Clear the cache to force a reload of resources
   */
  public clearCache(): void {
    console.log('Clearing ResourceService cache');
    this.resourcesCache = null;
    this.categoriesCache = null;
    this.globalResources = null;
    this.playerResources = null;
  }
  
  /**
   * Get resource counts for a specific owner
   */
  public async getResourceCounts(owner?: string): Promise<Resource[]> {
    console.log(`%c[ResourceService] Getting resource counts for owner: ${owner || 'none'}`, 'color: #22c55e; font-weight: bold;');
    try {
      const url = owner 
        ? `/api/resources/counts?owner=${encodeURIComponent(owner)}`
        : '/api/resources/counts';
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch resource counts: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Unknown error fetching resource counts');
      }
      
      // Store both global and player resources
      this.globalResources = (data.globalResourceCounts || []).map(resource => ({
        id: resource.id,
        name: resource.name,
        category: resource.category,
        subcategory: resource.subcategory,
        description: resource.description,
        rarity: resource.rarity,
        icon: resource.icon || 'default.png',
        amount: resource.count,
        buildingId: resource.buildingId,
        location: resource.location // Ensure location is included
      }));
      
      this.playerResources = (data.playerResourceCounts || []).map(resource => ({
        id: resource.id,
        name: resource.name,
        category: resource.category,
        subcategory: resource.subcategory,
        description: resource.description,
        rarity: resource.rarity,
        icon: resource.icon || 'default.png',
        amount: resource.count,
        buildingId: resource.buildingId,
        location: resource.location // Ensure location is included
      }));
      
      console.log(`%c[ResourceService] Received ${this.globalResources.length} global resources and ${this.playerResources.length} player resources`, 'color: #22c55e; font-weight: bold;');
      
      // Return player resources if available, otherwise global resources
      return this.playerResources.length > 0 ? this.playerResources : this.globalResources;
    } catch (error) {
      console.log(`%c[ResourceService] ERROR getting resource counts:`, 'color: #ef4444; font-weight: bold;', error);
      return [];
    }
  }
  
  /**
   * Get global resources
   */
  public getGlobalResources(): Resource[] {
    return this.globalResources || [];
  }
  
  /**
   * Get player resources
   */
  public getPlayerResources(): Resource[] {
    return this.playerResources || [];
  }
}
