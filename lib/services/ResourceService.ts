import { fetchResources, ResourceNode } from '../resourceUtils';

export interface Resource {
  id: string;
  name: string;
  icon: string;
  amount: number;
  category: string;
  subcategory?: string;
  description?: string;
  rarity?: string;
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
      
      // Process resources to ensure they have all required fields
      const processedResources = resources.map(resource => ({
        id: resource.id,
        name: resource.name,
        category: resource.category,
        subcategory: resource.subcategory,
        description: resource.description || resource.longDescription,
        rarity: resource.rarity || 'common',
        icon: resource.icon || `/images/resources/${resource.id}.png`,
        amount: 0 // Default amount
      }));
      
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
      if (!categoriesMap.has(resource.category)) {
        categoriesMap.set(resource.category, []);
      }
      categoriesMap.get(resource.category)?.push(resource);
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
    this.resourcesCache = null;
    this.categoriesCache = null;
  }
}
