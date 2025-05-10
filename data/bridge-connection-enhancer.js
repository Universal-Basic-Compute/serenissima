
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
require('dotenv').config();

// Load environment variables
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Load the polygon data
async function loadPolygonData(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading polygon data:', error);
    throw error;
  }
}

// Save the updated polygon data
async function savePolygonData(filePath, data) {
  try {
    fs.writeFileSync(
      filePath,
      JSON.stringify(data, null, 2),
      'utf8'
    );
    console.log('Enhanced polygon data saved successfully to:', filePath);
  } catch (error) {
    console.error('Error saving polygon data:', error);
    throw error;
  }
}

// Get location information from Google Maps
async function getLocationInfo(lat, lng) {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    if (response.data.status === 'OK' && response.data.results.length > 0) {
      // Extract useful information from the response
      const addressComponents = response.data.results[0].address_components;
      const formattedAddress = response.data.results[0].formatted_address;
      
      // Try to find neighborhood, locality, or other relevant components
      let neighborhood = '';
      let locality = '';
      let area = '';
      
      for (const component of addressComponents) {
        if (component.types.includes('neighborhood')) {
          neighborhood = component.long_name;
        } else if (component.types.includes('locality')) {
          locality = component.long_name;
        } else if (component.types.includes('sublocality')) {
          area = component.long_name;
        }
      }
      
      return {
        formattedAddress,
        neighborhood: neighborhood || 'Unknown',
        locality: locality || 'Venice',
        area: area || 'Unknown',
        fullResponse: response.data
      };
    }
    
    return {
      formattedAddress: 'Unknown location',
      neighborhood: 'Unknown',
      locality: 'Venice',
      area: 'Unknown'
    };
  } catch (error) {
    console.error('Error getting location info from Google Maps:', error);
    return {
      formattedAddress: 'Error retrieving location',
      neighborhood: 'Unknown',
      locality: 'Venice',
      area: 'Unknown',
      error: error.message
    };
  }
}

// Function for exponential backoff retry logic
async function retryWithExponentialBackoff(fn, maxRetries = 5, initialDelay = 5000) {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      retries++;
      
      // If we've used all retries, throw
      if (retries >= maxRetries) {
        throw error;
      }
      
      // Get retry delay from header or use exponential backoff
      const retryAfter = error.response?.headers?.['retry-after'];
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : initialDelay * Math.pow(2, retries);
      
      console.log(`Rate limited or error occurred. Retry ${retries}/${maxRetries} after ${delay/1000} seconds...`);
      console.log(`Error details: ${error.message}`);
      
      if (error.response) {
        console.log(`Status: ${error.response.status}`);
        console.log(`Headers:`, error.response.headers);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
      console.log(`Retrying now...`);
    }
  }
}


// Generate a bridge name using Claude
async function generateBridgeName(locationInfo) {
  try {
    // Use more retries with longer delays
    return await retryWithExponentialBackoff(
      async () => {
        const prompt = `
You are an expert on Renaissance Venice history and geography. I need a historically accurate name for a bridge in Venice.

Location information:
- Neighborhood: ${locationInfo.neighborhood}
- Area: ${locationInfo.area}
- Address: ${locationInfo.formattedAddress}

Please generate a historically plausible name for a bridge at this location. The name should:
1. Follow Venetian naming conventions for bridges (Ponte di...)
2. Reference nearby landmarks, families, guilds, or historical events if possible
3. Be in Italian
4. Include a brief explanation of why this name would be appropriate

Respond with ONLY the bridge name in Italian, followed by the English translation in parentheses, and then a brief explanation.
Example format: "Ponte dei Sospiri (Bridge of Sighs) - Named for the sighs of prisoners being led to their cells."
`;

        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: 'claude-3-7-sonnet-latest',
            max_tokens: 300,
            messages: [
              { role: 'user', content: prompt }
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

        if (response.data && response.data.content) {
          return response.data.content[0].text.trim();
        }
        
        throw new Error('Invalid response from Claude API');
      },
      5, // Increase max retries from 3 to 5
      5000 // Increase initial delay from 2000ms to 5000ms (5 seconds)
    );
  } catch (error) {
    console.error('Error generating bridge name with Claude API after multiple retries:', error);
    // Instead of using fallback, throw the error to stop processing this bridge
    throw new Error(`Failed to generate bridge name after multiple retries: ${error.message}`);
  }
}

// Process polygon data and enhance bridge connections
async function enhanceBridgeConnections() {
  try {
    // Define the directory path - use the current directory instead of a nested 'data' folder
    const dataDir = __dirname;
    
    // Get all JSON files in the data directory
    const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
    console.log(`Found ${files.length} JSON files in the data directory.`);
    
    // Process each file
    for (const file of files) {
      const polygonFilePath = path.join(dataDir, file);
      console.log(`Processing file: ${file}`);
      
      // Load polygon data
      const polygonData = await loadPolygonData(polygonFilePath);
      console.log(`Loaded polygon data for: ${polygonData.historicalName || polygonData.englishName || file}`);
      
      // Check if the polygon has bridge points
      if (!polygonData.bridgePoints || !Array.isArray(polygonData.bridgePoints) || polygonData.bridgePoints.length === 0) {
        console.log('No bridge points found in the polygon data, skipping.');
        continue;
      }
      
      console.log(`Found ${polygonData.bridgePoints.length} bridge points to process.`);
      
      // Create a map to track connection IDs
      const connectionMap = new Map();
      
      // Process each bridge point
      for (let i = 0; i < polygonData.bridgePoints.length; i++) {
        const bridgePoint = polygonData.bridgePoints[i];
        
        // Skip if there's no connection
        if (!bridgePoint.connection) {
          console.log(`Bridge point ${i} has no connection, skipping.`);
          continue;
        }
        
        // Create a unique key for this connection pair
        const sourcePolygonId = polygonData.id || file.replace('.json', '');
        const targetPolygonId = bridgePoint.connection.targetPolygonId;
        const connectionKey = [sourcePolygonId, targetPolygonId].sort().join('_');
        
        // Check if we've already assigned an ID to this connection
        if (connectionMap.has(connectionKey)) {
          // Use the existing ID
          bridgePoint.connection.id = connectionMap.get(connectionKey);
        } else {
          // Generate a new ID
          const connectionId = uuidv4();
          bridgePoint.connection.id = connectionId;
          connectionMap.set(connectionKey, connectionId);
        }
      }
      
      // Second pass: Get location info and generate bridge names
      console.log(`Processing ${connectionMap.size} unique connections...`);
      let processedCount = 0;
      
      for (const [connectionKey, connectionId] of connectionMap.entries()) {
        processedCount++;
        console.log(`Processing connection ${processedCount}/${connectionMap.size}: ${connectionKey}`);
        
        try {
          // Find the bridge point for this connection
          const bridgePoint = polygonData.bridgePoints.find(bp => 
            bp.connection && bp.connection.id === connectionId
          );
          
          if (!bridgePoint) {
            console.warn(`Could not find bridge point for connection ${connectionKey}`);
            continue;
          }
          
          // Calculate midpoint between the edge and target point
          const edgePoint = bridgePoint.edge;
          const targetPoint = bridgePoint.connection.targetPoint;
          
          const midLat = (edgePoint.lat + targetPoint.lat) / 2;
          const midLng = (edgePoint.lng + targetPoint.lng) / 2;
          
          // Get location information for the midpoint
          console.log(`Getting location info for ${midLat}, ${midLng}...`);
          const locationInfo = await getLocationInfo(midLat, midLng);
          
          // Generate a bridge name
          console.log(`Generating bridge name for location: ${locationInfo.formattedAddress}...`);
          const bridgeName = await generateBridgeName(locationInfo);
          
          // Log the chosen bridge name
          console.log(`Generated bridge name: "${bridgeName}"`);
          
          // Update the connection with the name and location info
          bridgePoint.connection.name = bridgeName;
          bridgePoint.connection.location = {
            midpoint: { lat: midLat, lng: midLng },
            locationInfo: locationInfo
          };
          
          // Add a shorter delay between API calls
          console.log(`Waiting 2 seconds before processing next connection...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Reduced from 10s to 2s
        } catch (error) {
          console.error(`Error processing connection ${connectionKey}:`, error);
          console.log('Skipping this connection and continuing with the next one...');
          // Continue with the next connection instead of stopping the entire process
          continue;
        }
      }
      
      // Save the enhanced data
      await savePolygonData(polygonFilePath, polygonData);
      console.log(`Enhanced data saved for ${file}`);
      
      // Add a delay between files to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('Bridge connection enhancement completed successfully for all files');
    
  } catch (error) {
    console.error('Error enhancing bridge connections:', error);
  }
}

// Run the enhancement process
enhanceBridgeConnections();
