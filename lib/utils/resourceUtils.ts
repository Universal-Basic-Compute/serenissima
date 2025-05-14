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

// Add this function to fetch resource counts
export async function fetchResourceCounts(username?: string): Promise<any[]> {
  console.log(`%c[resourceUtils] Fetching resource counts for username: ${username || 'none'}`, 'color: #22c55e; font-weight: bold;');
  try {
    const url = new URL('/api/resources/counts', window.location.origin);
    if (username) {
      url.searchParams.append('username', username);
    }
    
    console.log(`%c[resourceUtils] Fetching from URL: ${url.toString()}`, 'color: #22c55e; font-weight: bold;');
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      throw new Error(`Failed to fetch resource counts: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Unknown error fetching resource counts');
    }
    
    console.log(`%c[resourceUtils] Received ${data.resourceCounts.length} resource counts`, 'color: #22c55e; font-weight: bold;');
    return data.resourceCounts;
  } catch (error) {
    console.log(`%c[resourceUtils] ERROR fetching resource counts:`, 'color: #ef4444; font-weight: bold;', error);
    return [];
  }
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
    
    // Create a set of valid resource IDs for validation
    const validResourceIds = new Set(resources.map((r: ResourceNode) => r.id));
    
    // Process resources to add inputs and outputs
    resources.forEach((resource: ResourceNode) => {
      // Extract inputs and filter out any that don't exist in our resource set
      const allInputs = extractInputResources(resource);
      resource.inputs = allInputs.filter(id => validResourceIds.has(id));
      
      // Extract outputs and filter out any that don't exist in our resource set
      const allOutputs = extractOutputResources(resource);
      resource.outputs = allOutputs.filter(id => validResourceIds.has(id));
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
