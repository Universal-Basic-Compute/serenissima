/**
 * Building and Business Assignment Script
 * 
 * This script:
 * 1. Assigns specified building types to random citizens from a predefined list
 * 2. Creates corresponding business records for commercial buildings
 * 
 * Usage: node scripts/assign-buildings-and-create-businesses.js [--dry-run]
 */

require('dotenv').config();
const Airtable = require('airtable');
const { v4: uuidv4 } = require('uuid');

// Configure Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

// Constants
const CITIZENS = ['Isabella', 'Marco', 'Sofia'];

// Building types to assign
const BUILDING_TYPES = [
  'artisan_s_house', 'bakery', 'blacksmith', 'boat_workshop', 'bottega', 
  'canal_house', 'cargo_landing', 'eastern_merchant_house', 'fisherman_s_cottage', 
  'granary', 'contract_stall', 'merceria', 'merchant_s_house', 'small_warehouse'
];

// Commercial building types that need business records
const COMMERCIAL_BUILDING_TYPES = [
  'bakery', 'blacksmith', 'boat_workshop', 'bottega', 'cargo_landing', 
  'eastern_merchant_house', 'granary', 'contract_stall', 'merceria', 'small_warehouse'
];

// Business name generators by type
const BUSINESS_NAME_GENERATORS = {
  'bakery': () => `${getRandomItem(['Golden', 'Venetian', 'Canal', 'Doge\'s', 'San Marco'])} ${getRandomItem(['Bakery', 'Bread', 'Pastry Shop', 'Focacceria'])}`,
  'blacksmith': () => `${getRandomItem(['Iron', 'Steel', 'Forge', 'Anvil', 'Hammer'])} ${getRandomItem(['Works', 'Smithy', 'Forge', 'Workshop'])}`,
  'boat_workshop': () => `${getRandomItem(['Gondola', 'Canal', 'Maritime', 'Adriatic', 'Lagoon'])} ${getRandomItem(['Boatworks', 'Shipyard', 'Boat Repair', 'Gondola Makers'])}`,
  'bottega': () => `${getRandomItem(['Artisan', 'Master', 'Venetian', 'Renaissance', 'Craftsman\'s'])} ${getRandomItem(['Bottega', 'Workshop', 'Studio', 'Atelier'])}`,
  'cargo_landing': () => `${getRandomItem(['Grand', 'Merchant\'s', 'Rialto', 'Dockside', 'Canal'])} ${getRandomItem(['Cargo Landing', 'Shipping Dock', 'Trading Port', 'Merchant Dock'])}`,
  'eastern_merchant_house': () => `${getRandomItem(['Silk Road', 'Spice', 'Oriental', 'Byzantine', 'Levantine'])} ${getRandomItem(['Trading House', 'Merchant Company', 'Import House', 'Exchange'])}`,
  'granary': () => `${getRandomItem(['Golden', 'Abundant', 'Venetian', 'Republic\'s', 'Merchant\'s'])} ${getRandomItem(['Granary', 'Grain Storage', 'Provisions', 'Storehouse'])}`,
  'contract_stall': () => `${getRandomItem(['Fresh', 'Daily', 'Rialto', 'Merchant\'s', 'Venetian'])} ${getRandomItem(['Contract Stall', 'Goods', 'Provisions', 'Wares'])}`,
  'merceria': () => `${getRandomItem(['Fine', 'Silk', 'Golden', 'Noble', 'Venetian'])} ${getRandomItem(['Merceria', 'Textiles', 'Fabrics', 'Clothier'])}`,
  'small_warehouse': () => `${getRandomItem(['Secure', 'Canal', 'Merchant\'s', 'Dockside', 'Trading'])} ${getRandomItem(['Warehouse', 'Storage', 'Depot', 'Storehouse'])}`
};

// Business description generators by type
const BUSINESS_DESCRIPTION_GENERATORS = {
  'bakery': () => `A ${getRandomItem(['bustling', 'cozy', 'renowned', 'family-owned', 'traditional'])} bakery producing ${getRandomItem(['fresh bread daily', 'pastries and sweets', 'focaccia and specialty breads', 'baked goods for local restaurants'])}.`,
  'blacksmith': () => `A ${getRandomItem(['skilled', 'reputable', 'busy', 'traditional', 'specialized'])} blacksmith creating ${getRandomItem(['tools and hardware', 'decorative ironwork', 'ship fittings', 'weapons and armor'])}.`,
  'boat_workshop': () => `A ${getRandomItem(['renowned', 'skilled', 'traditional', 'family-owned', 'busy'])} workshop ${getRandomItem(['building and repairing gondolas', 'crafting small boats', 'specializing in maritime repairs', 'serving the Venetian fleet'])}.`,
  'bottega': () => `An ${getRandomItem(['artistic', 'renowned', 'skilled', 'traditional', 'innovative'])} workshop producing ${getRandomItem(['fine art', 'sculptures', 'decorative items', 'commissioned works for noble families'])}.`,
  'cargo_landing': () => `A ${getRandomItem(['busy', 'strategic', 'well-positioned', 'efficient', 'profitable'])} cargo landing handling ${getRandomItem(['imports from the East', 'local goods distribution', 'bulk materials', 'specialty cargo'])}.`,
  'eastern_merchant_house': () => `A ${getRandomItem(['prestigious', 'well-connected', 'exotic', 'profitable', 'established'])} trading house specializing in ${getRandomItem(['silk and spices', 'Eastern luxury goods', 'rare imports', 'Byzantine trade'])}.`,
  'granary': () => `A ${getRandomItem(['large', 'secure', 'well-maintained', 'strategic', 'essential'])} granary storing ${getRandomItem(['grain for the city', 'food reserves', 'imported cereals', 'provisions for merchants'])}.`,
  'contract_stall': () => `A ${getRandomItem(['popular', 'busy', 'colorful', 'well-stocked', 'strategically located'])} contract stall selling ${getRandomItem(['fresh produce', 'imported goods', 'local crafts', 'daily necessities'])}.`,
  'merceria': () => `A ${getRandomItem(['fine', 'luxurious', 'well-stocked', 'prestigious', 'specialized'])} textile shop offering ${getRandomItem(['imported silks', 'fine fabrics', 'materials for noble garments', 'specialty textiles'])}.`,
  'small_warehouse': () => `A ${getRandomItem(['secure', 'well-positioned', 'efficient', 'dry', 'accessible'])} warehouse used for ${getRandomItem(['merchant goods', 'valuable cargo', 'imported materials', 'local production storage'])}.`
};

// Helper function to get a random item from an array
function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Helper function to get a random citizen
function getRandomCitizen() {
  return getRandomItem(CITIZENS);
}

// Helper function to generate a business name based on building type
function generateBusinessName(buildingType) {
  const generator = BUSINESS_NAME_GENERATORS[buildingType];
  return generator ? generator() : `Venetian ${buildingType.replace(/_/g, ' ')}`;
}

// Helper function to generate a business description based on building type
function generateBusinessDescription(buildingType) {
  const generator = BUSINESS_DESCRIPTION_GENERATORS[buildingType];
  return generator ? generator() : `A business operating in a ${buildingType.replace(/_/g, ' ')}.`;
}

// Main function to assign buildings and create businesses
async function assignBuildingsAndCreateBusinesses(dryRun = false) {
  console.log(`Starting building and business assignment${dryRun ? ' (DRY RUN)' : ''}...`);
  
  try {
    // Fetch all buildings of the specified types
    const buildingRecords = await base('BUILDINGS').select({
      filterByFormula: `OR(${BUILDING_TYPES.map(type => `{Type}='${type}'`).join(',')})`
    }).all();
    
    console.log(`Found ${buildingRecords.length} buildings to process`);
    
    // Track statistics
    const stats = {
      buildingsAssigned: 0,
      businessesCreated: 0,
      errors: 0
    };
    
    // Process each building
    for (const building of buildingRecords) {
      try {
        const buildingId = building.id;
        const buildingType = building.fields.Type;
        const buildingName = building.fields.Name || `Building ${buildingId}`;
        const landId = building.fields.land_id || building.fields.Land;
        
        // Skip if already has an owner
        if (building.fields.Citizen && !dryRun) {
          console.log(`Skipping ${buildingName} (${buildingType}) - already has owner: ${building.fields.Citizen}`);
          continue;
        }
        
        // Assign a random citizen
        const randomCitizen = getRandomCitizen();
        console.log(`Assigning ${buildingName} (${buildingType}) to ${randomCitizen}${dryRun ? ' (DRY RUN)' : ''}`);
        
        if (!dryRun) {
          // Update the building record
          await base('BUILDINGS').update(buildingId, {
            Citizen: randomCitizen
          });
          stats.buildingsAssigned++;
        }
        
        // Create a business record if this is a commercial building
        if (COMMERCIAL_BUILDING_TYPES.includes(buildingType)) {
          const businessName = generateBusinessName(buildingType);
          const businessDescription = generateBusinessDescription(buildingType);
          const now = new Date().toISOString();
          
          console.log(`Creating business "${businessName}" for ${buildingName}${dryRun ? ' (DRY RUN)' : ''}`);
          
          if (!dryRun) {
            // Create the business record
            await base('BUSINESSES').create({
              BusinessId: `biz_${uuidv4().replace(/-/g, '')}`,
              Name: businessName,
              Type: buildingType,
              Description: businessDescription,
              BuildingId: buildingId,
              LandId: landId,
              Owner: randomCitizen,
              CreatedAt: now,
              UpdatedAt: now,
              Status: 'active'
            });
            stats.businessesCreated++;
          }
        }
      } catch (error) {
        console.error(`Error processing building ${building.id}:`, error);
        stats.errors++;
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('\nAssignment complete!');
    console.log(`Buildings assigned: ${stats.buildingsAssigned}`);
    console.log(`Businesses created: ${stats.businessesCreated}`);
    console.log(`Errors: ${stats.errors}`);
    
  } catch (error) {
    console.error('Error in assignment process:', error);
  }
}

// Check for dry run flag
const dryRun = process.argv.includes('--dry-run');

// Run the script
assignBuildingsAndCreateBusinesses(dryRun);
