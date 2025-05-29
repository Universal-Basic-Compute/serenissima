require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Airtable = require('airtable');

// Configure paths
const DATA_DIR = path.join(process.cwd(), 'data');

// Venice center coordinates
const VENICE_CENTER = {
  lat: 45.438324,
  lng: 12.331768
};

// Maximum distance factor (in km) - beyond this distance, the multiplier is 1x
const MAX_DISTANCE = 2.5; // ~2.5km covers most of Venice

// Contract stall reference values from the game economy
const MARKET_STALL_DAILY_INCOME = 8000; // ducats
const MARKET_STALL_SIZE = 20; // approximate size in square meters

// Target economic values
const AVERAGE_LAND_PRICE = 1000000; // 1M ducats average land price
const TARGET_ANNUAL_YIELD = 0.05; // 5% annual yield (reasonable real estate return)
const DAYS_PER_YEAR = 365;

// Calculate target daily rent based on land value
// If land is worth 1M ducats and we want 5% annual yield, daily rent should be:
// 1,000,000 * 0.05 / 365 = ~137 ducats per day
const TARGET_DAILY_RENT_PER_MILLION = (AVERAGE_LAND_PRICE * TARGET_ANNUAL_YIELD) / DAYS_PER_YEAR;

// Ensure data directory exists
function ensureDataDirExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }
  return DATA_DIR;
}

// Get all JSON files
function getAllJsonFiles() {
  const dataDir = ensureDataDirExists();
  return fs.readdirSync(dataDir)
    .filter(file => file.endsWith('.json'));
}

// Read JSON from file
function readJsonFromFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const fileContent = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(fileContent);
}

// Calculate centroid of coordinates
function calculateCentroid(coordinates) {
  if (!coordinates || coordinates.length < 3) {
    return null;
  }

  // Filter out invalid coordinates
  const validCoords = coordinates.filter(coord => 
    coord && 
    typeof coord.lat === 'number' && !isNaN(coord.lat) && isFinite(coord.lat) &&
    typeof coord.lng === 'number' && !isNaN(coord.lng) && isFinite(coord.lng)
  );

  if (validCoords.length < 3) {
    return null;
  }

  let sumLat = 0;
  let sumLng = 0;
  const n = validCoords.length;
  
  for (let i = 0; i < n; i++) {
    sumLat += validCoords[i].lat;
    sumLng += validCoords[i].lng;
  }
  
  return {
    lat: sumLat / n,
    lng: sumLng / n
  };
}

// Calculate distance between two coordinates in kilometers using Haversine formula
function calculateDistance(coord1, coord2) {
  const R = 6371; // Earth's radius in km
  const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const dLon = (coord2.lng - coord1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Calculate location multiplier based on distance from center
function calculateLocationMultiplier(distance) {
  // Linear scaling from 5x at center to 1x at MAX_DISTANCE or beyond
  const multiplier = 5 - (4 * Math.min(distance, MAX_DISTANCE) / MAX_DISTANCE);
  return Math.max(1, multiplier);
}

// Calculate base rent based on area - recalibrated to match target economy with greatly reduced area importance
function calculateBaseRent(areaInSquareMeters) {
  // Base value calculation - using a reference size of 100 sq meters
  const REFERENCE_SIZE = 100; // sq meters
  const REFERENCE_RENT = TARGET_DAILY_RENT_PER_MILLION; // ~137 ducats per day for 1M value
  
  // Calculate size factor with diminishing returns for larger areas
  // Reduce the exponent from 0.10 to 0.05 (making area even less important)
  const sizeFactor = Math.pow(areaInSquareMeters / REFERENCE_SIZE, 0.05);
  
  // Calculate base rent and multiply by 100
  return REFERENCE_RENT * sizeFactor * 100;
}

// Update Airtable with the calculated rent values
async function updateAirtableWithRents(landRents) {
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
    throw new Error('Airtable API key or Base ID not configured. Please set AIRTABLE_API_KEY and AIRTABLE_BASE_ID in your .env file.');
  }

  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
  const table = base('LANDS');
  
  // Process in batches to avoid Airtable API limits
  const BATCH_SIZE = 10;
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  console.log(`Updating ${landRents.length} land records in Airtable...`);
  
  for (let i = 0; i < landRents.length; i += BATCH_SIZE) {
    const batch = landRents.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(landRents.length/BATCH_SIZE)}...`);
    
    try {
      // Create update operations for this batch
      const updatePromises = batch.map(land => {
        return new Promise((resolve, reject) => {
          // Find the record by LandID and update it
          table.select({
            filterByFormula: `{LandID} = "${land.id}"`,
            maxRecords: 1
          }).firstPage((err, records) => {
            if (err) {
              reject(err);
              return;
            }
            
            if (records && records.length > 0) {
              const record = records[0];
              table.update(record.id, {
                "LastIncome": land.dailyRent
              }, (updateErr) => {
                if (updateErr) {
                  reject(updateErr);
                } else {
                  resolve({ id: land.id, success: true });
                }
              });
            } else {
              // Record not found
              resolve({ id: land.id, success: false, error: `Record not found for LandID: ${land.id}` });
            }
          });
        });
      });
      
      // Wait for all updates in this batch to complete
      const batchResults = await Promise.allSettled(updatePromises);
      
      // Count successes and failures
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            results.success++;
          } else {
            results.failed++;
            results.errors.push(result.value.error);
          }
        } else {
          results.failed++;
          results.errors.push(result.reason);
        }
      });
      
      // Add a small delay between batches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error updating batch:', error);
      results.failed += batch.length;
      results.errors.push(error.message);
    }
  }
  
  return results;
}

// Main function to calculate land rents and update Airtable
async function calculateLandRents() {
  try {
    console.log('Starting land rent calculation...');
    console.log(`Target daily rent for 1M ducat land: ${TARGET_DAILY_RENT_PER_MILLION.toFixed(2)} ducats`);
    
    // Read all polygon files
    const files = getAllJsonFiles();
    console.log(`Found ${files.length} polygon files`);
    
    const landRents = [];
    
    // Process each polygon
    for (const file of files) {
      const data = readJsonFromFile(file);
      const id = file.replace('.json', '');
      
      // Skip invalid data
      if (!data || (!data.coordinates && !Array.isArray(data))) {
        console.warn(`Skipping ${file}: Invalid data format`);
        continue;
      }
      
      // Extract coordinates and area
      const coordinates = data.coordinates || data;
      const areaInSquareMeters = data.areaInSquareMeters || 0;
      
      // If no area is stored, skip this polygon
      if (!areaInSquareMeters) {
        console.warn(`Skipping ${file}: No area information`);
        continue;
      }
      
      // Get centroid
      const centroid = data.centroid || calculateCentroid(coordinates);
      if (!centroid) {
        console.warn(`Skipping ${file}: Could not determine centroid`);
        continue;
      }
      
      // Calculate distance from Venice center
      const distanceFromCenter = calculateDistance(centroid, VENICE_CENTER);
      
      // Calculate location multiplier (1x to 5x)
      const locationMultiplier = calculateLocationMultiplier(distanceFromCenter);
      
      // Calculate base rent from area
      const baseRent = calculateBaseRent(areaInSquareMeters);
      
      // Apply location multiplier
      const dailyRent = Math.round(baseRent * locationMultiplier);
      
      // Add some randomness (±10%) to make it more natural
      const randomFactor = 0.9 + (Math.random() * 0.2);
      // Divide the final rent by 4 to bring values into a more reasonable range
      const finalRent = Math.round((dailyRent * randomFactor) / 4);
      
      // Calculate estimated land value based on rent (for verification)
      const estimatedLandValue = Math.round((finalRent * DAYS_PER_YEAR) / TARGET_ANNUAL_YIELD);
      
      landRents.push({
        id,
        centroid,
        areaInSquareMeters,
        distanceFromCenter,
        locationMultiplier: parseFloat(locationMultiplier.toFixed(2)),
        dailyRent: finalRent,
        estimatedLandValue,
        historicalName: data.historicalName || null
      });
    }
    
    console.log(`Calculated rent for ${landRents.length} land parcels`);
    
    const averageRent = Math.round(landRents.reduce((sum, land) => sum + land.dailyRent, 0) / landRents.length);
    const minRent = Math.min(...landRents.map(land => land.dailyRent));
    const maxRent = Math.max(...landRents.map(land => land.dailyRent));
    const averageLandValue = Math.round(landRents.reduce((sum, land) => sum + land.estimatedLandValue, 0) / landRents.length);
    
    console.log(`Average rent: ${averageRent} ducats per day`);
    console.log(`Min rent: ${minRent} ducats per day`);
    console.log(`Max rent: ${maxRent} ducats per day`);
    console.log(`Average estimated land value: ${averageLandValue} ducats`);
    
    // Update Airtable with the calculated rents
    const updateResults = await updateAirtableWithRents(landRents);
    
    console.log('\nAirtable Update Results:');
    console.log(`Successfully updated: ${updateResults.success} records`);
    console.log(`Failed to update: ${updateResults.failed} records`);
    
    if (updateResults.errors.length > 0) {
      console.log('\nErrors:');
      console.log(updateResults.errors.slice(0, 5).join('\n'));
      if (updateResults.errors.length > 5) {
        console.log(`...and ${updateResults.errors.length - 5} more errors`);
      }
    }
    
    console.log('\nLand rent calculation and Airtable update completed!');
  } catch (error) {
    console.error('Error in land rent calculation process:', error);
    process.exit(1);
  }
}

// Run the script
calculateLandRents();
