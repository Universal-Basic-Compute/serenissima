const fs = require('fs');
const path = require('path');
const Airtable = require('airtable');
require('dotenv').config();

// Configure Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

// Paths
const DATA_DIR = path.join(__dirname, '../data');
const BUILDINGS_DIR = path.join(__dirname, '../data/buildings');

// Function to get all building types and variants
async function getBuildingTypesAndVariants() {
  try {
    // Check if buildings directory exists
    if (!fs.existsSync(BUILDINGS_DIR)) {
      console.warn(`Buildings directory not found at ${BUILDINGS_DIR}`);
      // Return an error instead of creating default building types
      throw new Error('Buildings directory not found. Cannot proceed without building types.');
    }

    const buildingTypes = [];
    
    // Function to recursively search for building type files
    function searchBuildingTypes(dir) {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Recursively search subdirectories
          searchBuildingTypes(fullPath);
        } else if (item.endsWith('.json') && item !== 'index.json') {
          try {
            const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            
            // Extract building type from filename, removing the .json extension
            const type = item.replace('.json', '');
            
            // Extract variants if available
            let variants = ['model']; // Default variant
            if (data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
              variants = data.variants.map(v => v.id || v.name || 'model');
            }
            
            buildingTypes.push({ type, variants });
            console.log(`Found building type: ${type} with variants: ${variants.join(', ')}`);
          } catch (error) {
            console.warn(`Error parsing building type file ${fullPath}:`, error);
          }
        }
      }
    }
    
    // Start the recursive search
    searchBuildingTypes(BUILDINGS_DIR);
    
    // If no building types were found, throw an error
    if (buildingTypes.length === 0) {
      throw new Error('No building type files found. Cannot proceed without building types.');
    }
    
    console.log(`Found ${buildingTypes.length} building types`);
    return buildingTypes;
  } catch (error) {
    console.error('Error getting building types:', error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

// Function to get all polygons with building points
async function getPolygonsWithBuildingPoints() {
  try {
    const polygons = [];
    const files = fs.readdirSync(DATA_DIR).filter(file => file.endsWith('.json'));
    
    for (const file of files) {
      const filePath = path.join(DATA_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Check if this polygon has building points
      if (data.buildingPoints && Array.isArray(data.buildingPoints) && data.buildingPoints.length > 0) {
        // Extract polygon ID from filename
        const id = file.replace('.json', '');
        
        polygons.push({
          id,
          buildingPoints: data.buildingPoints
        });
      }
    }
    
    console.log(`Found ${polygons.length} polygons with building points`);
    return polygons;
  } catch (error) {
    console.error('Error getting polygons:', error);
    return [];
  }
}

// Function to generate a random building
function generateRandomBuilding(buildingPoint, polygonId, buildingTypes) {
  // Select a random building type
  const buildingType = buildingTypes[Math.floor(Math.random() * buildingTypes.length)];
  
  // Select a random variant for this building type
  const variant = buildingType.variants[Math.floor(Math.random() * buildingType.variants.length)];
  
  // Generate a unique ID for the building
  const buildingId = `building-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  
  // Default owner
  const owner = 'ConsiglioDeiDieci';
  
  return {
    id: buildingId,
    type: buildingType.type,
    land_id: polygonId,
    variant: variant,
    owner: owner,
    position: JSON.stringify(buildingPoint),
    created_at: new Date().toISOString()
  };
}

// Function to save buildings to Airtable
async function saveBuildingsToAirtable(buildings) {
  console.log(`Saving ${buildings.length} buildings to Airtable...`);
  
  // Process in batches to avoid Airtable API limits
  const BATCH_SIZE = 10;
  let successCount = 0;
  
  for (let i = 0; i < buildings.length; i += BATCH_SIZE) {
    const batch = buildings.slice(i, i + BATCH_SIZE);
    
    try {
      // Create records in Airtable
      const records = batch.map(building => ({
        fields: {
          BuildingId: building.id,  // Changed from "Id" to "BuildingId"
          Type: building.type,
          Land: building.land_id,
          Variant: building.variant,
          Citizen: building.owner,
          Position: building.position,
          CreatedAt: building.created_at
        }
      }));
      
      await base('Buildings').create(records);
      
      successCount += batch.length;
      console.log(`Progress: ${successCount}/${buildings.length} buildings saved`);
      
      // Add a small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < buildings.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`Error saving batch to Airtable:`, error);
    }
  }
  
  console.log(`Completed! ${successCount}/${buildings.length} buildings saved to Airtable`);
}

// Function to save buildings to a JSON file (as backup)
function saveBuildingsToJson(buildings) {
  const outputFile = path.join(__dirname, 'generated-buildings.json');
  fs.writeFileSync(outputFile, JSON.stringify({ BUILDINGS: buildings }, null, 2));
  console.log(`Saved buildings to ${outputFile} as backup`);
}

// Main function
async function main() {
  try {
    // Get building types and variants
    const buildingTypes = await getBuildingTypesAndVariants();
    // No need to check length here as getBuildingTypesAndVariants now throws an error if no types found
    
    // Get polygons with building points
    const polygons = await getPolygonsWithBuildingPoints();
    if (polygons.length === 0) {
      throw new Error('No polygons with building points found');
    }
    
    // Generate buildings
    const buildings = [];
    
    for (const polygon of polygons) {
      console.log(`Processing polygon ${polygon.id} with ${polygon.buildingPoints.length} building points`);
      
      for (const buildingPoint of polygon.buildingPoints) {
        const building = generateRandomBuilding(buildingPoint, polygon.id, buildingTypes);
        buildings.push(building);
      }
    }
    
    console.log(`Generated ${buildings.length} buildings`);
    
    // Save buildings to JSON file as backup
    saveBuildingsToJson(buildings);
    
    // Save buildings to Airtable
    await saveBuildingsToAirtable(buildings);
    
  } catch (error) {
    console.error('Error in main function:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
