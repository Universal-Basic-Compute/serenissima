export interface ResourceNode {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  description?: string;
  longDescription?: string;
  icon: string;
  baseValue?: number;
  weight?: number;
  volume?: number;
  rarity?: 'common' | 'uncommon' | 'rare' | 'exotic';
  inputs?: string[];
  outputs?: string[];
  buildings?: string[];
  varieties?: any[];
  qualityVariations?: any;
  productionProperties?: any;
  transportProperties?: any;
  storageProperties?: any;
  marketDynamics?: any;
  historicalNotes?: any;
  stackSize?: number;
  baseProperties?: Record<string, any>;
  sourceProperties?: {
    source?: string;
    harvestMethod?: string;
    availability?: string;
    seasonality?: string;
    locations?: string[];
    [key: string]: any;
  };
  perishable?: boolean;
  substitutes?: any[];
  complements?: string[];
  // Add any other properties that might be in the resource files
}

// This function can be used on the client side
export async function fetchResources(): Promise<ResourceNode[]> {
  try {
    const response = await fetch('/api/resources');
    if (!response.ok) {
      throw new Error(`Failed to fetch resources: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching resources:', error);
    return [];
  }
}

// Add a function to fetch a single resource if needed
export async function fetchResourceById(id: string): Promise<ResourceNode | null> {
  try {
    const response = await fetch(`/api/resources/${id}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch resource: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching resource ${id}:`, error);
    return null;
  }
}
