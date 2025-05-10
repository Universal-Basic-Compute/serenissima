
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
        
        // Log the full response body
        console.log(`Response data:`, JSON.stringify(error.response.data, null, 2));
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
      console.log(`Retrying now...`);
    }
  }
}


// Generate multiple bridge names at once using Claude
async function generateBridgeNames(locationInfo, count) {
  try {
    // Use more retries with longer delays
    return await retryWithExponentialBackoff(
      async () => {
        const prompt = `
You are an expert on Renaissance Venice history and geography. I need historically accurate names for ${count} bridges in Venice.

Location information:
- Neighborhood: ${locationInfo.neighborhood}
- Area: ${locationInfo.area}
- Address: ${locationInfo.formattedAddress}

Please generate ${count} historically plausible names for bridges at this location. The names should:
1. Follow Venetian naming conventions for bridges (Ponte di...)
2. Reference nearby landmarks, families, guilds, or historical events if possible
3. Be in Italian
4. Include a brief explanation of why each name would be appropriate

For each bridge, provide:
1. historicalName: The Italian name
2. englishName: The English translation
3. historicalDescription: A brief explanation of the historical significance

Respond with a JSON array containing objects with these three fields for each bridge.
Example format:
[
  {
    "historicalName": "Ponte dei Sospiri",
    "englishName": "Bridge of Sighs",
    "historicalDescription": "Named for the sighs of prisoners being led to their cells in the adjacent prison."
  },
  {
    "historicalName": "Ponte dei Mercanti",
    "englishName": "Bridge of Merchants",
    "historicalDescription": "Named for the merchants who would cross this bridge to reach the market square."
  }
]
`;

        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: 'claude-3-7-sonnet-latest',
            max_tokens: 1000, // Increased token limit for multiple bridge names
            messages: [
              { role: 'user', content: prompt }
            ],
            system: "You are a helpful assistant that generates historically accurate bridge names for Renaissance Venice. Always respond with valid JSON.",
            response_format: { type: "json" } // Changed from "json_object" to "json"
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
          const content = response.data.content[0].text.trim();
          
          // Parse the JSON response
          try {
            // First, check if the content is already valid JSON
            let jsonResponse;
            try {
              jsonResponse = JSON.parse(content);
            } catch (initialParseError) {
              // If not valid JSON, try to extract JSON from the content
              const jsonMatch = content.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                jsonResponse = JSON.parse(jsonMatch[0]);
              } else {
                throw new Error('Could not extract JSON from response');
              }
            }
            
            // Check if we have a valid array
            if (Array.isArray(jsonResponse)) {
              return jsonResponse;
            } 
            // Check if we have the expected array of bridge names in a property
            else if (jsonResponse && Array.isArray(jsonResponse.bridges)) {
              return jsonResponse.bridges;
            } 
            // Try to find any array in the response
            else if (jsonResponse) {
              for (const key in jsonResponse) {
                if (Array.isArray(jsonResponse[key])) {
                  return jsonResponse[key];
                }
              }
            }
            
            // If we couldn't find a valid array, throw an error instead of returning fallback
            throw new Error('Could not find bridge names array in response');
          } catch (parseError) {
            console.error('Error parsing JSON response:', parseError);
            console.log('Raw response:', content);
            
            // Throw the error instead of returning fallback data
            throw parseError;
          }
        }
        
        // If we get here, throw an error instead of returning fallback data
        throw new Error('Invalid or missing response from Claude API');
      },
      5, // Increase max retries from 3 to 5
      5000 // Increase initial delay from 2000ms to 5000ms (5 seconds)
    );
  } catch (error) {
    console.error('Error generating bridge names with Claude API after multiple retries:', error);
    // Throw the error instead of returning fallback data
    throw error;
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
      
      const bridgePointsCount = polygonData.bridgePoints.length;
      console.log(`Found ${bridgePointsCount} bridge points to process.`);
      
      // Create a map to track connection IDs
      const connectionMap = new Map();
      
      // First pass: Assign connection IDs
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
      
      // Get location information for the polygon's center point
      const centerPoint = polygonData.center || polygonData.centroid;
      if (!centerPoint) {
        console.warn(`No center or centroid found for polygon ${polygonData.id}, skipping location info.`);
        continue;
      }
      
      console.log(`Getting location info for polygon center: ${centerPoint.lat}, ${centerPoint.lng}...`);
      const locationInfo = await getLocationInfo(centerPoint.lat, centerPoint.lng);
      
      // Generate bridge names for all bridge points at once
      console.log(`Generating ${bridgePointsCount} bridge names for location: ${locationInfo.formattedAddress}...`);
      const bridgeNames = await generateBridgeNames(locationInfo, bridgePointsCount);
      
      console.log(`Generated ${bridgeNames.length} bridge names`);
      
      // Second pass: Assign bridge names to connections
      let nameIndex = 0;
      for (let i = 0; i < polygonData.bridgePoints.length; i++) {
        const bridgePoint = polygonData.bridgePoints[i];
        
        // Skip if there's no connection
        if (!bridgePoint.connection) {
          continue;
        }
        
        // Assign the next bridge name if available
        if (nameIndex < bridgeNames.length) {
          const bridgeName = bridgeNames[nameIndex++];
          
          // Calculate midpoint between the edge and target point
          const edgePoint = bridgePoint.edge;
          const targetPoint = bridgePoint.connection.targetPoint;
          const midLat = (edgePoint.lat + targetPoint.lat) / 2;
          const midLng = (edgePoint.lng + targetPoint.lng) / 2;
          
          // Update the connection with the name and location info
          bridgePoint.connection.historicalName = bridgeName.historicalName;
          bridgePoint.connection.englishName = bridgeName.englishName;
          bridgePoint.connection.historicalDescription = bridgeName.historicalDescription;
          bridgePoint.connection.location = {
            midpoint: { lat: midLat, lng: midLng },
            locationInfo: locationInfo
          };
          
          console.log(`Assigned bridge name: "${bridgeName.historicalName}" (${bridgeName.englishName})`);
        } else {
          console.warn(`Ran out of bridge names for polygon ${polygonData.id}`);
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
