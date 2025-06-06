require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Define constants
const BRIDGES_DIR = path.join(process.cwd(), 'data', 'bridges');
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Ensure bridges directory exists
function ensureBridgesDirExists() {
  if (!fs.existsSync(BRIDGES_DIR)) {
    fs.mkdirSync(BRIDGES_DIR, { recursive: true });
  }
  return BRIDGES_DIR;
}

// Get all JSON files
function getAllBridgeFiles() {
  const bridgesDir = ensureBridgesDirExists();
  const files = fs.readdirSync(bridgesDir).filter(file => file.endsWith('.json'));
  return files;
}

// Read JSON from file
function readBridgeFromFile(filename) {
  const filePath = path.join(BRIDGES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const fileContent = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(fileContent);
}

// Save JSON to file
function saveBridgeToFile(filename, data) {
  const filePath = path.join(BRIDGES_DIR, filename);
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

// Get historical bridge name from Claude API
async function getHistoricalBridgeName(startLocationInfo, endLocationInfo) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          {
            role: "citizen",
            content: `I have a bridge in Venice, Italy connecting two locations:

Start Location:
Latitude: ${startLocationInfo.lat}
Longitude: ${startLocationInfo.lng}
Modern Address: ${startLocationInfo.formattedAddress}

End Location:
Latitude: ${endLocationInfo.lat}
Longitude: ${endLocationInfo.lng}
Modern Address: ${endLocationInfo.formattedAddress}

Based on this information, please give me a historically accurate name for this bridge as it would have been known in 15th century Venice (during the 1400s).

Consider:
1. The areas it connects
2. Any nearby landmarks, churches, or canals
3. Historical naming conventions for Venetian bridges
4. The purpose or significance of the connection

Respond ONLY with a JSON object in this format:
{
  "bridgeName": "The historical name in Italian/Venetian",
  "englishTranslation": "English translation of the name",
  "description": "Brief description of what this bridge connected and its significance",
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

// Process all bridges
async function nameBridges() {
  console.log('Starting to name bridges...');
  
  const files = getAllBridgeFiles();
  console.log(`Found ${files.length} bridge files`);
  
  let namedCount = 0;
  let errorCount = 0;
  
  // Process files in batches to avoid rate limiting
  const batchSize = 3;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const batchPromises = batch.map(async (file) => {
      try {
        const bridge = readBridgeFromFile(file);
        
        // Skip if no coordinates or already has a name
        if (!bridge || !bridge.startPoint || !bridge.endPoint || bridge.name) {
          return { file, skipped: true };
        }
        
        console.log(`Processing ${file}...`);
        
        // Get location info for start and end points
        const startLocationInfo = await getLocationInfo(bridge.startPoint.lat, bridge.startPoint.lng);
        if (!startLocationInfo) {
          console.error(`Failed to get start location info for ${file}`);
          return { file, error: 'Failed to get start location info' };
        }
        
        const endLocationInfo = await getLocationInfo(bridge.endPoint.lat, bridge.endPoint.lng);
        if (!endLocationInfo) {
          console.error(`Failed to get end location info for ${file}`);
          return { file, error: 'Failed to get end location info' };
        }
        
        // Get historical name from Claude
        const historicalInfo = await getHistoricalBridgeName(startLocationInfo, endLocationInfo);
        if (!historicalInfo) {
          console.error(`Failed to get historical name for ${file}`);
          return { file, error: 'Failed to get historical name' };
        }
        
        // Update the bridge data with historical information
        bridge.name = historicalInfo.bridgeName;
        bridge.englishName = historicalInfo.englishTranslation;
        bridge.description = historicalInfo.description;
        bridge.nameConfidence = historicalInfo.confidence;
        
        // Save updated data back to file
        saveBridgeToFile(file, bridge);
        console.log(`Named ${file} as "${historicalInfo.bridgeName}" (${historicalInfo.englishTranslation})`);
        
        return { file, success: true, name: historicalInfo.bridgeName };
      } catch (error) {
        console.error(`Error processing ${file}:`, error.message);
        return { file, error: error.message };
      }
    });
    
    // Wait for batch to complete
    const results = await Promise.all(batchPromises);
    
    // Count successes and errors
    results.forEach(result => {
      if (result.success) namedCount++;
      if (result.error) errorCount++;
    });
    
    // Wait between batches to avoid rate limiting
    if (i + batchSize < files.length) {
      console.log(`Waiting before processing next batch...`);
      await delay(3000);
    }
  }
  
  console.log(`Bridge naming complete!`);
  console.log(`Successfully named ${namedCount} bridges`);
  console.log(`Encountered errors with ${errorCount} bridges`);
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
nameBridges().catch(error => {
  console.error('Script failed:', error);
});
