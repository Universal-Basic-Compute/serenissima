require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Define constants
const DATA_DIR = path.join(process.cwd(), 'data');
const DEFAULT_OWNER = "ConsiglioDeiDieci"; // The Venetian Council of Ten

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

// Create Airtable records for all polygons
async function createLandRecords() {
  console.log('Starting to create land records in Airtable...');
  
  // Get all polygon files
  const files = getAllJsonFiles();
  console.log(`Found ${files.length} polygon files`);
  
  try {
    // We'll use the backend API to create records
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
          
          // Check if this land record already exists in Airtable
          const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
          const checkResponse = await axios.get(
            `${apiBaseUrl}/api/land/${id}`,
            { validateStatus: status => true } // Don't throw on 404
          );
          
          if (checkResponse.status === 200) {
            console.log(`Skipping ${file}: Land record already exists`);
            return { file, skipped: true, reason: 'Record already exists' };
          }
          
          // Create the land record
          const response = await axios.post(`${apiBaseUrl}/api/land`, {
            land_id: id,
            user: DEFAULT_OWNER,
            historical_name: data.historicalName || null,
            english_name: data.englishName || null,
            description: data.historicalDescription || null
          });
          
          if (response.status === 200 || response.status === 201) {
            console.log(`Created land record for ${file}`);
            return { file, success: true };
          } else {
            console.error(`Failed to create land record for ${file}: ${response.statusText}`);
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
    
    console.log(`Land record creation complete!`);
    console.log(`Successfully created ${createdCount} land records`);
    console.log(`Skipped ${skippedCount} existing records`);
    console.log(`Encountered errors with ${errorCount} records`);
    
  } catch (error) {
    console.error('Error creating land records:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the script
createLandRecords().catch(error => {
  console.error('Script failed:', error);
});
