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
  producedFrom?: any[];
  usedIn?: any[];
  // Add any other properties that might be in the resource files
}

// Extract input resources from a resource's production data
export function extractInputResources(resource: ResourceNode): string[] {
  const inputs: string[] = [];
  
  // Check producedFrom data
  if (resource.producedFrom) {
    resource.producedFrom.forEach(production => {
      if (production.inputs) {
        production.inputs.forEach(input => {
          if (input.resource) {
            inputs.push(input.resource);
          }
        });
      }
    });
  }
  
  // Check productionProperties data
  if (resource.productionProperties?.inputs) {
    resource.productionProperties.inputs.forEach(input => {
      if (input.resource) {
        inputs.push(input.resource);
      }
    });
  }
  
  return [...new Set(inputs)]; // Remove duplicates
}

// Extract output resources from a resource's production data
export function extractOutputResources(resource: ResourceNode): string[] {
  const outputs: string[] = [];
  
  // Check usedIn data
  if (resource.usedIn) {
    resource.usedIn.forEach(usage => {
      if (usage.outputs) {
        usage.outputs.forEach(output => {
          if (output.resource) {
            outputs.push(output.resource);
          }
        });
      }
    });
  }
  
  // Check productionProperties data
  if (resource.productionProperties?.outputs) {
    resource.productionProperties.outputs.forEach(output => {
      if (output.resource) {
        outputs.push(output.resource);
      }
    });
  }
  
  return [...new Set(outputs)]; // Remove duplicates
}

// This function can be used on the client side
export async function fetchResources(): Promise<ResourceNode[]> {
  try {
    const response = await fetch('/api/resources');
    if (!response.ok) {
      throw new Error(`Failed to fetch resources: ${response.status}`);
    }
    
    const resources = await response.json();
    
    // Process resources to add inputs and outputs
    resources.forEach((resource: ResourceNode) => {
      resource.inputs = extractInputResources(resource);
      resource.outputs = extractOutputResources(resource);
    });
    
    return resources;
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
