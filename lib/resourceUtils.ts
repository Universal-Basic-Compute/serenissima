import fs from 'fs';
import path from 'path';

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
  // Add any other properties that might be in the resource files
}

export async function loadAllResources(): Promise<ResourceNode[]> {
  const resourcesDir = path.join(process.cwd(), 'data/resources');
  const resources: ResourceNode[] = [];
  
  // Function to recursively read directories
  async function readDir(dirPath: string) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        await readDir(fullPath);
      } else if (entry.name.endsWith('.json')) {
        try {
          const fileContent = fs.readFileSync(fullPath, 'utf8');
          const resource = JSON.parse(fileContent);
          
          // Process the resource data
          if (resource.id) {
            // Extract inputs and outputs from productionChainPosition if available
            if (resource.productionChainPosition) {
              if (resource.productionChainPosition.predecessors) {
                resource.inputs = resource.productionChainPosition.predecessors.map(
                  (pred: any) => pred.resource
                );
              }
              
              if (resource.productionChainPosition.successors) {
                resource.outputs = resource.productionChainPosition.successors.map(
                  (succ: any) => succ.resource
                );
              }
            }
            
            // Extract buildings from productionProperties if available
            if (resource.productionProperties && resource.productionProperties.processorBuilding) {
              resource.buildings = [resource.productionProperties.processorBuilding];
            }
            
            // Use longDescription as description if available
            if (resource.longDescription && !resource.description) {
              resource.description = resource.longDescription;
            }
            
            // If there's a description object, use it
            if (typeof resource.description === 'object') {
              resource.description = resource.description.full || resource.description.short;
            }
            
            resources.push(resource);
          }
        } catch (error) {
          console.error(`Error loading resource from ${fullPath}:`, error);
        }
      }
    }
  }
  
  await readDir(resourcesDir);
  return resources;
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
