const fs = require('fs');
const path = require('path');

// Define the directories
const buildingsDir = path.join(process.cwd(), 'data', 'buildings');
const resourcesDir = path.join(process.cwd(), 'data', 'resources');

// Function to load all resource IDs
function loadResourceIds() {
  console.log('Loading resource IDs...');
  const resourceIds = new Set();
  
  try {
    // Ensure the resources directory exists
    if (!fs.existsSync(resourcesDir)) {
      console.error(`Resources directory ${resourcesDir} does not exist`);
      return resourceIds;
    }
    
    // Get all JSON files in the resources directory
    const files = fs.readdirSync(resourcesDir)
      .filter(file => file.endsWith('.json'));
    
    // Load each resource file and extract the ID
    for (const file of files) {
      try {
        const data = fs.readFileSync(path.join(resourcesDir, file), 'utf8');
        const resource = JSON.parse(data);
        
        if (resource.id) {
          resourceIds.add(resource.id);
        } else {
          console.warn(`Resource file ${file} does not have an ID`);
        }
      } catch (error) {
        console.error(`Error reading resource file ${file}:`, error.message);
      }
    }
    
    console.log(`Loaded ${resourceIds.size} resource IDs`);
    return resourceIds;
  } catch (error) {
    console.error('Error loading resource IDs:', error.message);
    return resourceIds;
  }
}

// Function to clean up a building's production information
function cleanBuildingProductionInfo(buildingPath, resourceIds) {
  try {
    // Read the building file
    const data = fs.readFileSync(buildingPath, 'utf8');
    const building = JSON.parse(data);
    
    // Check if the building has production information
    if (!building.productionInformation) {
      console.log(`Building ${path.basename(buildingPath)} does not have productionInformation`);
      return false;
    }
    
    let modified = false;
    const productionInfo = building.productionInformation;
    
    // Clean up inputResources
    if (productionInfo.inputResources) {
      const validInputs = {};
      for (const [resource, amount] of Object.entries(productionInfo.inputResources)) {
        if (resourceIds.has(resource)) {
          validInputs[resource] = amount;
        } else {
          console.log(`Removing invalid input resource "${resource}" from ${path.basename(buildingPath)}`);
          modified = true;
        }
      }
      productionInfo.inputResources = validInputs;
    }
    
    // Clean up outputResources
    if (productionInfo.outputResources) {
      const validOutputs = {};
      for (const [resource, amount] of Object.entries(productionInfo.outputResources)) {
        if (resourceIds.has(resource)) {
          validOutputs[resource] = amount;
        } else {
          console.log(`Removing invalid output resource "${resource}" from ${path.basename(buildingPath)}`);
          modified = true;
        }
      }
      productionInfo.outputResources = validOutputs;
    }
    
    // Clean up stores array
    if (Array.isArray(productionInfo.stores)) {
      const validStores = productionInfo.stores.filter(resource => {
        const isValid = resourceIds.has(resource);
        if (!isValid) {
          console.log(`Removing invalid stored resource "${resource}" from ${path.basename(buildingPath)}`);
          modified = true;
        }
        return isValid;
      });
      productionInfo.stores = validStores;
    }
    
    // Clean up sells array
    if (Array.isArray(productionInfo.sells)) {
      const validSells = productionInfo.sells.filter(resource => {
        const isValid = resourceIds.has(resource);
        if (!isValid) {
          console.log(`Removing invalid sellable resource "${resource}" from ${path.basename(buildingPath)}`);
          modified = true;
        }
        return isValid;
      });
      productionInfo.sells = validSells;
    }
    
    // If any changes were made, write the updated building back to the file
    if (modified) {
      fs.writeFileSync(buildingPath, JSON.stringify(building, null, 2), 'utf8');
      console.log(`Updated ${path.basename(buildingPath)}`);
      return true;
    } else {
      console.log(`No changes needed for ${path.basename(buildingPath)}`);
      return false;
    }
  } catch (error) {
    console.error(`Error processing building file ${buildingPath}:`, error.message);
    return false;
  }
}

// Main function to process all buildings
function cleanAllBuildings() {
  console.log('Starting building production information cleanup...');
  
  try {
    // Load all valid resource IDs
    const resourceIds = loadResourceIds();
    if (resourceIds.size === 0) {
      console.error('No resources found. Aborting.');
      return;
    }
    
    // Ensure the buildings directory exists
    if (!fs.existsSync(buildingsDir)) {
      console.error(`Buildings directory ${buildingsDir} does not exist`);
      return;
    }
    
    // Get all JSON files in the buildings directory
    const files = fs.readdirSync(buildingsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(buildingsDir, file));
    
    console.log(`Found ${files.length} building files to process`);
    
    // Process each building file
    let modifiedCount = 0;
    for (const file of files) {
      console.log(`Processing ${path.basename(file)}...`);
      if (cleanBuildingProductionInfo(file, resourceIds)) {
        modifiedCount++;
      }
    }
    
    console.log(`Cleanup complete. Modified ${modifiedCount} out of ${files.length} building files.`);
  } catch (error) {
    console.error('Error during building cleanup:', error.message);
  }
}

// Run the script
cleanAllBuildings();
