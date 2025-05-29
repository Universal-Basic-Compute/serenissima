const fs = require('fs');
const path = require('path');
const util = require('util');

const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

// Define the categories for each building type
const buildingCategories = {
  "business": [
    "apothecary", "armory", "arsenal_workshop", "bakery", "blacksmith", 
    "boat_workshop", "bottega", "broker_s_office", "canal_maintenance_office", 
    "cargo_landing", "customs_house", "dye_works", "eastern_merchant_house", 
    "fondaco_dei_tedeschi", "glassblower_workshop", "glass_foundry", 
    "glass_import_house", "goldsmith_workshop", "gondola_station", "guild_hall", 
    "hidden_workshop", "luxury_showroom", "market_stall", "merceria", 
    "metal_import_warehouse", "mint", "oil_press", "paper_mill", "porter_guild_hall", 
    "printing_house", "private_dock", "public_dock", "shipyard", 
    "silk_conditioning_house", "small_warehouse", "smuggler_s_den", "soap_workshop", 
    "spice_warehouse", "textile_import_house", "timber_yard", "weapons_smith", 
    "weighing_station", "wine_cellar"
  ],
  "home": [
    "artisan_s_house", "canal_house", "fisherman_s_cottage", "grand_canal_palace", 
    "merchant_s_house", "nobili_palazzo"
  ],
  "bridge": [
    "arsenal_gate", "bridge", "rialto_bridge"
  ],
  "passive": [
    "public_well"
  ]
};

// Function to get the category for a building type
function getCategoryForBuildingType(buildingType) {
  for (const [category, buildings] of Object.entries(buildingCategories)) {
    if (buildings.includes(buildingType)) {
      return category;
    }
  }
  return null; // Return null if no category is found
}

async function updateBuildingCategories() {
  try {
    // Path to the buildings directory
    const buildingsDir = path.join(process.cwd(), 'data', 'buildings');
    
    // Check if directory exists
    if (!fs.existsSync(buildingsDir)) {
      console.error(`Directory ${buildingsDir} does not exist`);
      return;
    }
    
    // Get all JSON files in the directory
    const files = await readdir(buildingsDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    console.log(`Found ${jsonFiles.length} JSON files in ${buildingsDir}`);
    
    // Process each JSON file
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(buildingsDir, file);
        const fileContent = await readFile(filePath, 'utf8');
        const buildingData = JSON.parse(fileContent);
        
        // Extract building type from filename (remove .json extension)
        const buildingType = path.basename(file, '.json');
        
        // Get the category for this building type
        const category = getCategoryForBuildingType(buildingType);
        
        if (category) {
          // Update the category in the building data
          buildingData.category = category;
          
          // Write the updated data back to the file
          await writeFile(filePath, JSON.stringify(buildingData, null, 2), 'utf8');
          console.log(`Updated category for ${buildingType} to ${category}`);
        } else {
          console.warn(`No category found for building type: ${buildingType}`);
        }
      } catch (fileError) {
        console.error(`Error processing file ${file}:`, fileError);
      }
    }
    
    console.log('Building categories update completed');
  } catch (error) {
    console.error('Error updating building categories:', error);
  }
}

// Run the update function
updateBuildingCategories();
