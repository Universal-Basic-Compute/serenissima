require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Define constants
const DATA_DIR = path.join(process.cwd(), 'data');
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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

// Save JSON to file
function saveJsonToFile(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

// Get location information from Google Maps API
async function getLocationInfo(lat, lng) {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    if (response.data.status !== 'OK') {
      console.error(`Error from Google Maps API: ${response.data.status}`);
      return null;
    }
    
    // Extract useful information from the response
    const result = response.data.results[0];
    if (!result) {
      console.error('No results found from Google Maps API');
      return null;
    }
    
    // Get address components
    const addressComponents = {};
    result.address_components.forEach(component => {
      component.types.forEach(type => {
        addressComponents[type] = component.long_name;
      });
    });
    
    return {
      formattedAddress: result.formatted_address,
      placeId: result.place_id,
      addressComponents,
      lat,
      lng
    };
  } catch (error) {
    console.error('Error calling Google Maps API:', error.message);
    return null;
  }
}

// Get historical name from Claude API
async function getHistoricalName(locationInfo) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          {
            role: "citizen",
            content: `I have a location in Venice, Italy with the following modern information:
            
Latitude: ${locationInfo.lat}
Longitude: ${locationInfo.lng}
Modern Address: ${locationInfo.formattedAddress}
${locationInfo.addressComponents.route ? `Street: ${locationInfo.addressComponents.route}` : ''}
${locationInfo.addressComponents.neighborhood ? `Neighborhood: ${locationInfo.addressComponents.neighborhood}` : ''}
${locationInfo.addressComponents.sublocality ? `District: ${locationInfo.addressComponents.sublocality}` : ''}
${locationInfo.addressComponents.locality ? `City: ${locationInfo.addressComponents.locality}` : ''}

Based on this information, please give me a historically accurate name for this location as it would have been known in 15th century Venice (during the 1400s). 

Consider:
1. The sestiere (district) it belongs to
2. Any nearby landmarks, churches, or canals
3. Historical names for the area
4. Venetian naming conventions of the period

Respond ONLY with a JSON object in this format:
{
  "historicalName": "The historical name in Italian/Venetian",
  "englishTranslation": "English translation of the name",
  "description": "Brief description of what this area was known for in the 15th century",
  "confidence": "high/medium/low based on how confident you are in this historical name"
}

Do not include any other text in your response, just the JSON.`
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );
    
    // Extract the JSON from Claude's response
    const content = response.data.content[0].text;
    try {
      return JSON.parse(content);
    } catch (error) {
      console.error('Error parsing Claude response as JSON:', error.message);
      console.log('Raw response:', content);
      return null;
    }
  } catch (error) {
    console.error('Error calling Claude API:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    return null;
  }
}

// Process all polygons
async function namePolygons() {
  console.log('Starting to name polygons...');
  
  const files = getAllJsonFiles();
  console.log(`Found ${files.length} polygon files`);
  
  let namedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  // Process files in batches to avoid rate limiting
  const batchSize = 5;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const batchPromises = batch.map(async (file) => {
      try {
        const data = readJsonFromFile(file);
        
        // Skip if no centroid or already has a name
        if (!data || !data.centroid) {
          console.log(`Skipping ${file}: No centroid data`);
          return { file, skipped: true, reason: 'No centroid data' };
        }
        
        // Skip if already has a historical name
        if (data.historicalName) {
          console.log(`Skipping ${file}: Already has name "${data.historicalName}"`);
          return { file, skipped: true, reason: 'Already named' };
        }
        
        console.log(`Processing ${file}...`);
        
        // Get location info from Google Maps
        const locationInfo = await getLocationInfo(data.centroid.lat, data.centroid.lng);
        if (!locationInfo) {
          console.error(`Failed to get location info for ${file}`);
          return { file, error: 'Failed to get location info' };
        }
        
        // Get historical name from Claude
        const historicalInfo = await getHistoricalName(locationInfo);
        if (!historicalInfo) {
          console.error(`Failed to get historical name for ${file}`);
          return { file, error: 'Failed to get historical name' };
        }
        
        // Update the polygon data with historical information
        data.historicalName = historicalInfo.historicalName;
        data.englishName = historicalInfo.englishTranslation;
        data.historicalDescription = historicalInfo.description;
        data.nameConfidence = historicalInfo.confidence;
        
        // Save updated data back to file
        saveJsonToFile(file, data);
        console.log(`Named ${file} as "${historicalInfo.historicalName}" (${historicalInfo.englishTranslation})`);
        
        return { file, success: true, name: historicalInfo.historicalName };
      } catch (error) {
        console.error(`Error processing ${file}:`, error.message);
        return { file, error: error.message };
      }
    });
    
    // Wait for batch to complete
    const results = await Promise.all(batchPromises);
    
    // Count successes, skips, and errors
    results.forEach(result => {
      if (result.success) namedCount++;
      else if (result.skipped) skippedCount++;
      else if (result.error) errorCount++;
    });
    
    // Wait between batches to avoid rate limiting
    if (i + batchSize < files.length) {
      console.log(`Waiting before processing next batch...`);
      await delay(2000);
    }
  }
  
  console.log(`Naming complete!`);
  console.log(`Successfully named ${namedCount} polygons`);
  console.log(`Skipped ${skippedCount} polygons`);
  console.log(`Encountered errors with ${errorCount} polygons`);
}

// Check if we have the required API keys
if (!GOOGLE_MAPS_API_KEY) {
  console.error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set in environment variables');
  process.exit(1);
}

if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set in environment variables');
  process.exit(1);
}

// Run the script
namePolygons().catch(error => {
  console.error('Script failed:', error);
});
