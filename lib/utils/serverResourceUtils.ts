import fs from 'fs';
import path from 'path';
import { ResourceNode } from './resourceUtils';

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
