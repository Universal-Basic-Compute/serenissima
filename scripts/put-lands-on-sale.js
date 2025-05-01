require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Define constants
const DATA_DIR = path.join(process.cwd(), 'data');
const SELLER = "ConsiglioDeiDieci"; // The Venetian Council of Ten
const PRICE_PER_SQUARE_METER = 200;

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
  const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
  return files;
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

// Create transaction records for all lands
async function putLandsOnSale() {
  console.log('Starting to put lands on sale...');
  
  // Get all polygon files
  const files = getAllJsonFiles();
  console.log(`Found ${files.length} polygon files`);
  
  try {
    let createdCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    // Process files in batches to avoid rate limiting
    const batchSize = 10;
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchPromises = batch.map(async (file) => {
        try {
          const id = file.replace('.json', '');
          const data = readJsonFromFile(file);
          
          if (!data) {
            console.warn(`Skipping ${file}: Could not read file`);
            return { file, skipped: true, reason: 'Could not read file' };
          }
          
          // Skip if no area information
          if (!data.areaInSquareMeters) {
            console.warn(`Skipping ${file}: No area information`);
            return { file, skipped: true, reason: 'No area information' };
          }
          
          // Calculate price based on area
          const price = Math.round(data.areaInSquareMeters * PRICE_PER_SQUARE_METER);
          
          // Check if this land already has a transaction
          const checkResponse = await axios.get(
            `http://localhost:8000/api/transaction/land/${id}`,
            { validateStatus: status => true } // Don't throw on 404
          );
          
          if (checkResponse.status === 200) {
            console.log(`Skipping ${file}: Transaction already exists`);
            return { file, skipped: true, reason: 'Transaction already exists' };
          }
          
          // Create the transaction record
          const response = await axios.post('http://localhost:8000/api/transaction', {
            type: 'land',
            asset_id: id,
            seller: SELLER,
            buyer: null, // No buyer yet
            price: price,
            historical_name: data.historicalName || null,
            english_name: data.englishName || null,
            description: data.historicalDescription || null
          });
          
          if (response.status === 200 || response.status === 201) {
            console.log(`Created transaction for ${file} with price ${price}`);
            return { file, success: true, price };
          } else {
            console.error(`Failed to create transaction for ${file}: ${response.statusText}`);
            return { file, error: response.statusText };
          }
        } catch (error) {
          console.error(`Error processing ${file}:`, error.message);
          return { file, error: error.message };
        }
      });
      
      // Wait for batch to complete
      const results = await Promise.all(batchPromises);
      
      // Count successes, errors, and skips
      results.forEach(result => {
        if (result.success) createdCount++;
        else if (result.skipped) skippedCount++;
        else if (result.error) errorCount++;
      });
      
      // Wait between batches to avoid rate limiting
      if (i + batchSize < files.length) {
        console.log(`Waiting before processing next batch...`);
        await delay(1000);
      }
    }
    
    console.log(`Land sale creation complete!`);
    console.log(`Successfully created ${createdCount} land sale transactions`);
    console.log(`Skipped ${skippedCount} lands`);
    console.log(`Encountered errors with ${errorCount} lands`);
    
  } catch (error) {
    console.error('Error creating land sales:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the script
putLandsOnSale().catch(error => {
  console.error('Script failed:', error);
});
