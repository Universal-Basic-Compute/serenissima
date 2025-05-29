const fs = require('fs');
const path = require('path');
const axios = require('axios'); // You'll need to install axios: npm install axios

// Function to recursively read all resource files
async function getAllResourceTypes() {
  const resourcesDir = path.join(process.cwd(), 'data/resources');
  const resourceTypes = [];

  // Function to recursively read directories
  async function readDir(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively read subdirectories
        await readDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        // Read the resource file
        try {
          const data = fs.readFileSync(fullPath, 'utf8');
          const resource = JSON.parse(data);
          
          // Add the resource type to our list
          if (resource.id && resource.name) {
            resourceTypes.push({
              id: resource.id,
              name: resource.name,
              category: resource.category || 'unknown',
              filePath: fullPath
            });
          }
        } catch (error) {
          console.error(`Error reading resource file ${fullPath}:`, error);
        }
      }
    }
  }

  // Start reading from the resources directory
  await readDir(resourcesDir);
  console.log(`Found ${resourceTypes.length} resource types`);
  return resourceTypes;
}

// Function to get all polygon files
function getPolygonFiles() {
  // Look directly in the data directory where polygon data is stored
  const polygonsDir = path.join(process.cwd(), 'data');
  
  // Check if directory exists
  if (!fs.existsSync(polygonsDir)) {
    console.error(`Data directory not found: ${polygonsDir}`);
    return [];
  }
  
  const files = fs.readdirSync(polygonsDir)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(polygonsDir, file));
  
  console.log(`Found ${files.length} polygon files in ${polygonsDir}`);
  return files;
}

// Function to add a resource to the API
async function addResourceToAPI(resource) {
  try {
    // Get the API base URL from environment or use default
    const apiBaseUrl = process.env.BACKEND_BASE_URL || 'http://localhost:3000';
    
    // Make the API call to add the resource
    const response = await axios.post(`${apiBaseUrl}/api/resources`, resource);
    
    if (response.status === 200) {
      console.log(`Successfully added resource ${resource.id} to API`);
      return response.data;
    } else {
      throw new Error(`API returned status ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error adding resource to API:`, error.message);
    if (error.response) {
      console.error(`Response data:`, error.response.data);
    }
    throw error;
  }
}

// Function to assign random resources to building points via API
async function assignResourcesToPolygons() {
  try {
    // Get all resource types
    const resourceTypes = await getAllResourceTypes();
    if (resourceTypes.length === 0) {
      console.error('No resource types found. Make sure the data/resources directory exists and contains resource files.');
      return;
    }
    
    // Get all polygon files
    const polygonFiles = getPolygonFiles();
    console.log(`Found ${polygonFiles.length} polygon files`);
    
    // Track statistics
    let totalResourcesAdded = 0;
    let totalBuildingPoints = 0;
    let failedAdditions = 0;
    
    // Process each polygon
    for (const polygonFile of polygonFiles) {
      try {
        // Read the polygon data
        const data = fs.readFileSync(polygonFile, 'utf8');
        const polygon = JSON.parse(data);
        
        // Skip if no building points
        if (!polygon.buildingPoints || !Array.isArray(polygon.buildingPoints) || polygon.buildingPoints.length === 0) {
          console.log(`Polygon ${polygon.id || path.basename(polygonFile)} has no building points, skipping.`);
          continue;
        }
        
        const polygonId = polygon.id || path.basename(polygonFile, '.json');
        console.log(`Processing polygon ${polygonId} with ${polygon.buildingPoints.length} building points`);
        totalBuildingPoints += polygon.buildingPoints.length;
        
        // Assign a random resource to each building point
        for (let i = 0; i < polygon.buildingPoints.length; i++) {
          const buildingPoint = polygon.buildingPoints[i];
          
          // Select a random resource type
          const randomResource = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
          
          // Generate a random count between 1 and 5
          const randomCount = Math.floor(Math.random() * 5) + 1;
          
          // Create a resource object to send to the API
          const resourceData = {
            id: `resource-${polygonId}-${i}`,
            type: randomResource.id,
            name: randomResource.name,
            category: randomResource.category || determineCategory(randomResource.id),
            position: {
              lat: buildingPoint.lat,
              lng: buildingPoint.lng
            },
            count: randomCount,
            landId: polygonId,
            owner: 'ConsiglioDeiDieci',
            createdAt: new Date().toISOString()
          };
          
          // Helper function to determine category based on resource type
          function determineCategory(type) {
            const typeStr = type.toLowerCase();
            
            if (typeStr.includes('wood') || typeStr.includes('stone') || 
                typeStr.includes('ore') || typeStr.includes('clay')) {
              return 'raw_materials';
            } else if (typeStr.includes('food') || typeStr.includes('fish') || 
                      typeStr.includes('fruit') || typeStr.includes('grain')) {
              return 'food';
            } else if (typeStr.includes('cloth') || typeStr.includes('fabric') || 
                      typeStr.includes('textile')) {
              return 'textiles';
            } else if (typeStr.includes('spice') || typeStr.includes('pepper') || 
                      typeStr.includes('salt')) {
              return 'spices';
            } else if (typeStr.includes('tool') || typeStr.includes('hammer') || 
                      typeStr.includes('saw')) {
              return 'tools';
            } else if (typeStr.includes('brick') || typeStr.includes('timber') || 
                      typeStr.includes('nail')) {
              return 'building_materials';
            } else if (typeStr.includes('gold') || typeStr.includes('silver') || 
                      typeStr.includes('gem') || typeStr.includes('silk')) {
              return 'luxury_goods';
            } else {
              return 'unknown';
            }
          }
          
          try {
            // Add the resource to the API
            await addResourceToAPI(resourceData);
            totalResourcesAdded++;
            console.log(`Added ${randomCount} ${randomResource.name} at building point ${i} via API`);
          } catch (error) {
            failedAdditions++;
            console.error(`Failed to add resource at building point ${i}:`, error.message);
            
            // Add a small delay before continuing to avoid overwhelming the API
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        console.log(`Completed processing polygon ${polygonId}`);
        
        // Add a delay between polygons to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`Error processing polygon file ${polygonFile}:`, error);
      }
    }
    
    console.log('Resource assignment complete!');
    console.log(`Statistics:
- Total building points processed: ${totalBuildingPoints}
- Total resources added: ${totalResourcesAdded}
- Failed additions: ${failedAdditions}
- Success rate: ${((totalResourcesAdded / totalBuildingPoints) * 100).toFixed(2)}%`);
    
  } catch (error) {
    console.error('Error assigning resources:', error);
  }
}

// Run the script
assignResourcesToPolygons();
