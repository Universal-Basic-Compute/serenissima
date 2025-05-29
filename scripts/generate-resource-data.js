const fs = require('fs');
const path = require('path');

// Function to recursively read directories
function readDir(dirPath, resources = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      readDir(fullPath, resources);
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
                pred => pred.resource
              );
            }
            
            if (resource.productionChainPosition.successors) {
              resource.outputs = resource.productionChainPosition.successors.map(
                succ => succ.resource
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
  
  return resources;
}

// Main function
function generateResourceData() {
  const resourcesDir = path.join(__dirname, '../data/resources');
  const outputFile = path.join(__dirname, '../public/data/resources.json');
  
  console.log('Reading resource files...');
  const resources = readDir(resourcesDir);
  
  console.log(`Found ${resources.length} resources`);
  
  // Create output directory if it doesn't exist
  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write the data to a JSON file
  fs.writeFileSync(outputFile, JSON.stringify(resources, null, 2));
  console.log(`Resource data written to ${outputFile}`);
}

generateResourceData();
