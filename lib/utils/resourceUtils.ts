export interface ResourceNode {
  id: string;
  name: string;
  category: string;
  subCategory?: string;
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
  contractDynamics?: any;
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

export function getNormalizedResourceIconPath(iconFieldName?: string, resourceTypeName?: string): string {
  const defaultPath = 'https://backend.serenissima.ai/public_assets/images/resources/default.png';
  let finalPath: string;

  let iconToProcess: string | undefined = iconFieldName?.trim();

  // Fallback to resourceTypeName if iconFieldName is not available or empty
  if (!iconToProcess && resourceTypeName) {
    let baseName = resourceTypeName.trim();
    // Sanitize and remove all .png suffixes from resourceTypeName
    while (baseName.toLowerCase().endsWith('.png')) {
      baseName = baseName.substring(0, baseName.length - 4);
    }
    // Further sanitize (lowercase, replace spaces with underscores)
    baseName = baseName.toLowerCase().replace(/\s+/g, '_');
    finalPath = `https://backend.serenissima.ai/public_assets/images/resources/${baseName}.png`;
  }
  // If no iconToProcess by this point, return default
  else if (!iconToProcess) {
    finalPath = defaultPath;
  }
  // If iconToProcess starts with '/', assume it's an absolute path.
  else if (iconToProcess.startsWith('/')) {
    const parts = iconToProcess.split('/');
    const filenameWithExt = (parts.pop() || '').trim();
    
    if (filenameWithExt === "" && iconToProcess.endsWith('/')) { // Path is a directory like https://backend.serenissima.ai/public_assets/images/
        finalPath = iconToProcess; 
    } else {
      let baseFilename = filenameWithExt;
      while (baseFilename.toLowerCase().endsWith('.png')) {
        baseFilename = baseFilename.substring(0, baseFilename.length - 4);
      }
      // Add back one .png suffix.
      const resolvedFilename = baseFilename + '.png';
      finalPath = (parts.length > 0 ? parts.join('/') + '/' : '/') + resolvedFilename;
    }
  }
  // Handle relative icon paths: "foo.png", "resources/foo.png", "Iron Ore", "foo.png.png"
  else {
    let baseIconString = iconToProcess; // iconToProcess is already trimmed
    // Strip all .png suffixes
    while (baseIconString.toLowerCase().endsWith('.png')) {
      baseIconString = baseIconString.substring(0, baseIconString.length - 4);
    }
    // Now baseIconString is like "foo", "resources/foo", "Iron Ore"

    if (baseIconString.startsWith('resources/')) {
      // icon was "resources/foo.png..." -> baseIconString is "resources/foo"
      // Prepend https://backend.serenissima.ai/public_assets/images/ if it's not already structured like https://backend.serenissima.ai/public_assets/images/resources/foo
      finalPath = `https://backend.serenissima.ai/public_assets/images/${baseIconString}.png`;
    } else if (baseIconString.includes('/')) {
      // This case is for paths like "category/foo.png..." -> baseIconString is "category/foo"
      // It implies the image is at https://backend.serenissima.ai/public_assets/images/category/foo.png
      finalPath = `https://backend.serenissima.ai/public_assets/images/${baseIconString}.png`;
    } else {
      // This case is for simple names like "foo.png..." or "Iron Ore" -> baseIconString is "foo" or "Iron Ore"
      const sanitizedBaseIcon = baseIconString.toLowerCase().replace(/\s+/g, '_');
      finalPath = `https://backend.serenissima.ai/public_assets/images/resources/${sanitizedBaseIcon}.png`;
    }
  }

  // Explicit final check to remove double .png if it somehow still occurs
  if (finalPath.toLowerCase().endsWith(".png.png")) {
    finalPath = finalPath.substring(0, finalPath.length - 4);
  }
  
  return finalPath;
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
