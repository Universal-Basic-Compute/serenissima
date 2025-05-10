const fs = require('fs');
const path = require('path');

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
  const dataDir = process.cwd();
  const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
  return files.map(file => path.join(dataDir, file));
}

// Function to assign random resources to building points
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
        
        console.log(`Processing polygon ${polygon.id || path.basename(polygonFile)} with ${polygon.buildingPoints.length} building points`);
        
        // Initialize resources array if it doesn't exist
        if (!polygon.resources) {
          polygon.resources = [];
        }
        
        // Assign a random resource to each building point
        for (let i = 0; i < polygon.buildingPoints.length; i++) {
          const buildingPoint = polygon.buildingPoints[i];
          
          // Select a random resource type
          const randomResource = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
          
          // Generate a random count between 1 and 5
          const randomCount = Math.floor(Math.random() * 5) + 1;
          
          // Create a resource node at the building point
          const resourceNode = {
            id: `resource-${polygon.id || path.basename(polygonFile, '.json')}-${i}`,
            type: randomResource.id,
            name: randomResource.name,
            category: randomResource.category,
            position: {
              lat: buildingPoint.lat,
              lng: buildingPoint.lng
            },
            count: randomCount,
            createdAt: new Date().toISOString()
          };
          
          // Add the resource to the polygon
          polygon.resources.push(resourceNode);
          
          console.log(`Added ${randomCount} ${randomResource.name} at building point ${i}`);
        }
        
        // Save the updated polygon data
        fs.writeFileSync(polygonFile, JSON.stringify(polygon, null, 2), 'utf8');
        console.log(`Updated polygon ${polygon.id || path.basename(polygonFile)} with ${polygon.resources.length} resources`);
        
      } catch (error) {
        console.error(`Error processing polygon file ${polygonFile}:`, error);
      }
    }
    
    console.log('Resource assignment complete!');
    
  } catch (error) {
    console.error('Error assigning resources:', error);
  }
}

// Run the script
assignResourcesToPolygons();
