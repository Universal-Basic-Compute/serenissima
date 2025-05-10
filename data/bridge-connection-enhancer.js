// Add command line argument parsing at the top of the script
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
require('dotenv').config();

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args[0] || 'bridges'; // Default to bridges if no argument provided

// Load environment variables
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
async function generateBridgeNames(count) {
  try {
    // Use more retries with longer delays
    return await retryWithExponentialBackoff(
      async () => {
        const prompt = `
You are an expert on Renaissance Venice history and geography. I need historically accurate names for ${count} bridges in Venice.

Please generate ${count} historically plausible names for bridges. The names should:
1. Follow Venetian naming conventions for bridges (Ponte di...)
2. Reference landmarks, families, guilds, or historical events if possible
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
            max_tokens: 64000, // Increased token limit for multiple bridge names
            messages: [
              { role: 'user', content: prompt }
            ],
            system: "You are a helpful assistant that generates historically accurate bridge names for Renaissance Venice. Always respond with valid JSON."
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

// Generate dock names using Claude API
async function generateDockNames(count) {
  try {
    return await retryWithExponentialBackoff(
      async () => {
        const prompt = `
You are an expert on Renaissance Venice history and geography. I need historically accurate names for ${count} docks or water landings in Venice.

Please generate ${count} historically plausible names for docks. The names should:
1. Follow Venetian naming conventions for docks (Riva di..., Fondamenta..., etc.)
2. Reference landmarks, families, guilds, or historical events if possible
3. Be in Italian
4. Include a brief explanation of why each name would be appropriate

For each dock, provide:
1. historicalName: The Italian name
2. englishName: The English translation
3. historicalDescription: A brief explanation of the historical significance

Respond with a JSON array containing objects with these three fields for each dock.
`;

        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: 'claude-3-7-sonnet-latest',
            max_tokens: 64000,
            messages: [
              { role: 'user', content: prompt }
            ],
            system: "You are a helpful assistant that generates historically accurate dock names for Renaissance Venice. Always respond with valid JSON."
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
            } else if (jsonResponse && Array.isArray(jsonResponse.docks)) {
              return jsonResponse.docks;
            } else if (jsonResponse) {
              for (const key in jsonResponse) {
                if (Array.isArray(jsonResponse[key])) {
                  return jsonResponse[key];
                }
              }
            }
            
            throw new Error('Could not find dock names array in response');
          } catch (parseError) {
            console.error('Error parsing JSON response:', parseError);
            console.log('Raw response:', content);
            throw parseError;
          }
        }
        
        throw new Error('Invalid or missing response from Claude API');
      },
      5,
      5000
    );
  } catch (error) {
    console.error('Error generating dock names with Claude API after multiple retries:', error);
    throw error;
  }
}

// Generate building descriptions using Claude API
async function generateBuildingDescriptions(count) {
  try {
    return await retryWithExponentialBackoff(
      async () => {
        const prompt = `
You are an expert on Renaissance Venice history and architecture. I need historically accurate descriptions for ${count} buildings in Venice.

Please generate ${count} historically plausible building descriptions. The descriptions should:
1. Include appropriate building types for Renaissance Venice (palazzo, bottega, chiesa, etc.)
2. Reference local families, guilds, or historical events if possible
3. Include names in Italian with English translations
4. Provide a brief explanation of the building's historical significance or function

For each building, provide:
1. buildingType: The type of building (palazzo, bottega, chiesa, etc.)
2. historicalName: The Italian name
3. englishName: The English translation
4. historicalDescription: A brief explanation of the historical significance or function

Respond with a JSON array containing objects with these four fields for each building.
`;

        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: 'claude-3-7-sonnet-latest',
            max_tokens: 64000,
            messages: [
              { role: 'user', content: prompt }
            ],
            system: "You are a helpful assistant that generates historically accurate building descriptions for Renaissance Venice. Always respond with valid JSON."
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
            } else if (jsonResponse && Array.isArray(jsonResponse.buildings)) {
              return jsonResponse.buildings;
            } else if (jsonResponse) {
              for (const key in jsonResponse) {
                if (Array.isArray(jsonResponse[key])) {
                  return jsonResponse[key];
                }
              }
            }
            
            throw new Error('Could not find building descriptions array in response');
          } catch (parseError) {
            console.error('Error parsing JSON response:', parseError);
            console.log('Raw response:', content);
            throw parseError;
          }
        }
        
        throw new Error('Invalid or missing response from Claude API');
      },
      5,
      5000
    );
  } catch (error) {
    console.error('Error generating building descriptions with Claude API after multiple retries:', error);
    throw error;
  }
}

// Process bridge points (existing functionality)
async function processBridgePoints(polygonData, polygonFilePath, file) {
  // Check if the polygon has bridge points
  if (!polygonData.bridgePoints || !Array.isArray(polygonData.bridgePoints) || polygonData.bridgePoints.length === 0) {
    console.log('No bridge points found in the polygon data, skipping.');
    return;
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
  
  // Generate bridge names for all bridge points at once
  console.log(`Generating ${bridgePointsCount} bridge names...`);
  const bridgeNames = await generateBridgeNames(bridgePointsCount);
  
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
        midpoint: { lat: midLat, lng: midLng }
      };
      
      console.log(`Assigned bridge name: "${bridgeName.historicalName}" (${bridgeName.englishName})`);
    } else {
      console.warn(`Ran out of bridge names for polygon ${polygonData.id}`);
    }
  }
  
  // Save the enhanced data
  await savePolygonData(polygonFilePath, polygonData);
  console.log(`Enhanced bridge data saved for ${polygonFilePath}`);
}

// New function to process dock points
async function processDockPoints(polygonData, polygonFilePath) {
  // Check if the polygon has dock points
  if (!polygonData.dockPoints || !Array.isArray(polygonData.dockPoints) || polygonData.dockPoints.length === 0) {
    console.log('No dock points found in the polygon data, skipping.');
    return;
  }
  
  const dockPointsCount = polygonData.dockPoints.length;
  console.log(`Found ${dockPointsCount} dock points to process.`);
  
  // Generate dock names for all dock points at once
  console.log(`Generating ${dockPointsCount} dock names...`);
  const dockNames = await generateDockNames(dockPointsCount);
  
  console.log(`Generated ${dockNames.length} dock names`);
  
  // Assign dock names to dock points
  for (let i = 0; i < Math.min(polygonData.dockPoints.length, dockNames.length); i++) {
    const dockPoint = polygonData.dockPoints[i];
    const dockName = dockNames[i];
    
    // Add name and description to dock point
    dockPoint.historicalName = dockName.historicalName;
    dockPoint.englishName = dockName.englishName;
    dockPoint.historicalDescription = dockName.historicalDescription;
    
    console.log(`Assigned dock name: "${dockName.historicalName}" (${dockName.englishName})`);
  }
  
  // Save the enhanced data
  await savePolygonData(polygonFilePath, polygonData);
  console.log(`Enhanced dock data saved for ${polygonFilePath}`);
}

// New function to process building points
async function processBuildingPoints(polygonData, polygonFilePath) {
  // Check if the polygon has building points
  if (!polygonData.buildingPoints || !Array.isArray(polygonData.buildingPoints) || polygonData.buildingPoints.length === 0) {
    console.log('No building points found in the polygon data, skipping.');
    return;
  }
  
  const buildingPointsCount = polygonData.buildingPoints.length;
  console.log(`Found ${buildingPointsCount} building points to process.`);
  
  // Generate building descriptions for all building points at once
  console.log(`Generating ${buildingPointsCount} building descriptions...`);
  const buildingDescriptions = await generateBuildingDescriptions(buildingPointsCount);
  
  console.log(`Generated ${buildingDescriptions.length} building descriptions`);
  
  // Assign building descriptions to building points
  for (let i = 0; i < Math.min(polygonData.buildingPoints.length, buildingDescriptions.length); i++) {
    const buildingPoint = polygonData.buildingPoints[i];
    const buildingDesc = buildingDescriptions[i];
    
    // Add name and description to building point
    buildingPoint.buildingType = buildingDesc.buildingType;
    buildingPoint.historicalName = buildingDesc.historicalName;
    buildingPoint.englishName = buildingDesc.englishName;
    buildingPoint.historicalDescription = buildingDesc.historicalDescription;
    
    console.log(`Assigned building description: "${buildingDesc.historicalName}" (${buildingDesc.englishName})`);
  }
  
  // Save the enhanced data
  await savePolygonData(polygonFilePath, polygonData);
  console.log(`Enhanced building data saved for ${polygonFilePath}`);
}

// Modify the main function to handle different modes
async function enhancePolygonData() {
  try {
    // Define the directory path - use the current directory instead of a nested 'data' folder
    const dataDir = __dirname;
    
    // Get all JSON files in the data directory
    const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
    console.log(`Found ${files.length} JSON files in the data directory.`);
    console.log(`Running in ${mode} mode.`);
    
    // Process each file
    for (const file of files) {
      const polygonFilePath = path.join(dataDir, file);
      console.log(`Processing file: ${file}`);
      
      // Load polygon data
      const polygonData = await loadPolygonData(polygonFilePath);
      console.log(`Loaded polygon data for: ${polygonData.historicalName || polygonData.englishName || file}`);
      
      // Process based on mode
      if (mode === 'bridges') {
        await processBridgePoints(polygonData, polygonFilePath, file);
      } else if (mode === 'docks') {
        await processDockPoints(polygonData, polygonFilePath);
      } else if (mode === 'buildings') {
        await processBuildingPoints(polygonData, polygonFilePath);
      } else {
        console.log(`Unknown mode: ${mode}. Valid modes are: bridges, docks, buildings`);
        return;
      }
      
      // Add a delay between files to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`${mode} enhancement completed successfully for all files`);
    
  } catch (error) {
    console.error(`Error enhancing ${mode}:`, error);
  }
}

// Run the enhancement process with the specified mode
enhancePolygonData();
