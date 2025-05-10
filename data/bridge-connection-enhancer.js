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

// Add state tracking mechanism
const stateFilePath = path.join(__dirname, 'bridge-connection-state.json');

// Function to load state
async function loadState() {
  try {
    if (fs.existsSync(stateFilePath)) {
      const data = fs.readFileSync(stateFilePath, 'utf8');
      const loadedState = JSON.parse(data);
      
      // Check if we need to migrate from old format
      if (Array.isArray(loadedState.processedPolygons)) {
        console.log('Migrating state from old format to new format...');
        // Create new state structure
        return {
          processedPolygons: {
            bridges: loadedState.processedPolygons,
            docks: [],
            buildings: []
          },
          generatedNames: loadedState.generatedNames || {
            bridges: [],
            docks: [],
            buildings: []
          }
        };
      }
      
      return loadedState;
    }
    
    // Return default state
    return {
      processedPolygons: {
        bridges: [],
        docks: [],
        buildings: []
      },
      generatedNames: {
        bridges: [],
        docks: [],
        buildings: []
      }
    };
  } catch (error) {
    console.error('Error loading state:', error);
    // Return default state
    return {
      processedPolygons: {
        bridges: [],
        docks: [],
        buildings: []
      },
      generatedNames: {
        bridges: [],
        docks: [],
        buildings: []
      }
    };
  }
}

// Function to save state
async function saveState(state) {
  try {
    fs.writeFileSync(
      stateFilePath,
      JSON.stringify(state, null, 2),
      'utf8'
    );
    console.log('State saved successfully to:', stateFilePath);
  } catch (error) {
    console.error('Error saving state:', error);
    throw error;
  }
}

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
async function generateBridgeNames(count, existingNames = [], landHistoricalName = '') {
  try {
    // Use more retries with longer delays
    return await retryWithExponentialBackoff(
      async () => {
        const prompt = `
You are an expert on Renaissance Venice history and geography. I need historically accurate names for ${count} bridges in Venice.

${landHistoricalName ? `These bridges are located in or near "${landHistoricalName}", a historical area in Venice.` : ''}

Please generate ${count} historically plausible names for bridges. The names should:
1. Follow Venetian naming conventions for bridges (Ponte di...)
2. Reference landmarks, families, guilds, or historical events if possible
3. Be in Italian
4. Include a brief explanation of why each name would be appropriate
${landHistoricalName ? `5. When appropriate, reference the location in "${landHistoricalName}"` : ''}

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

        const systemPrompt = `You are a helpful assistant that generates historically accurate bridge names for Renaissance Venice. Always respond with valid JSON. IMPORTANT: Do not duplicate any of these existing bridge names: ${JSON.stringify(existingNames)}`;

        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: 'claude-3-7-sonnet-latest',
            max_tokens: 64000, // Increased token limit for multiple bridge names
            messages: [
              { role: 'user', content: prompt }
            ],
            system: systemPrompt
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
async function generateDockNames(count, existingNames = [], landHistoricalName = '') {
  try {
    return await retryWithExponentialBackoff(
      async () => {
        const prompt = `
You are an expert on Renaissance Venice history and geography. I need historically accurate names for ${count} docks or water landings in Venice.

${landHistoricalName ? `These docks are located in or near "${landHistoricalName}", a historical area in Venice.` : ''}

Please generate ${count} historically plausible names for docks. The names should:
1. Follow Venetian naming conventions for docks (Riva di..., Fondamenta..., etc.)
2. Reference landmarks, families, guilds, or historical events if possible
3. Be in Italian
4. Include a brief explanation of why each name would be appropriate
${landHistoricalName ? `5. When appropriate, reference the location in "${landHistoricalName}"` : ''}

For each dock, provide:
1. historicalName: The Italian name
2. englishName: The English translation
3. historicalDescription: A brief explanation of the historical significance

Respond with a JSON array containing objects with these three fields for each dock.
`;

        const systemPrompt = `You are a helpful assistant that generates historically accurate dock names for Renaissance Venice. Always respond with valid JSON. IMPORTANT: Do not duplicate any of these existing dock names: ${JSON.stringify(existingNames)}`;

        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: 'claude-3-7-sonnet-latest',
            max_tokens: 64000,
            messages: [
              { role: 'user', content: prompt }
            ],
            system: systemPrompt
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
async function generateBuildingDescriptions(count, existingNames = [], landHistoricalName = '') {
  try {
    return await retryWithExponentialBackoff(
      async () => {
        const prompt = `
You are an expert on Renaissance Venice history and architecture. I need historically accurate descriptions for ${count} buildings in Venice.

${landHistoricalName ? `These buildings are located in or near "${landHistoricalName}", a historical area in Venice.` : ''}

Please generate ${count} historically plausible building descriptions. The descriptions should:
1. Include appropriate building types for Renaissance Venice (palazzo, bottega, chiesa, etc.)
2. Reference local families, guilds, or historical events if possible
3. Include names in Italian with English translations
4. Provide a brief explanation of the building's historical significance or function
${landHistoricalName ? `5. When appropriate, reference the location in "${landHistoricalName}"` : ''}

For each building, provide:
1. buildingType: The type of building (palazzo, bottega, chiesa, etc.)
2. historicalName: The Italian name
3. englishName: The English translation
4. historicalDescription: A brief explanation of the historical significance or function

Respond with a JSON array containing objects with these four fields for each building.
`;

        const systemPrompt = `You are a helpful assistant that generates historically accurate building descriptions for Renaissance Venice. Always respond with valid JSON. IMPORTANT: Do not duplicate any of these existing building names: ${JSON.stringify(existingNames)}`;

        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: 'claude-3-7-sonnet-latest',
            max_tokens: 64000,
            messages: [
              { role: 'user', content: prompt }
            ],
            system: systemPrompt
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

// The individual processing functions have been removed as their functionality
// is now integrated into the main enhancePolygonData function

// Modify the main function to handle different modes and process all polygons
async function enhancePolygonData() {
  try {
    // Load state
    const state = await loadState();
    
    // Define the directory path - use the current directory instead of a nested 'data' folder
    const dataDir = __dirname;
    
    // Get all JSON files in the data directory
    const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
    console.log(`Found ${files.length} JSON files in the data directory.`);
    console.log(`Running in ${mode} mode.`);
    
    // Process all polygons
    for (let polygonIndex = 0; polygonIndex < files.length; polygonIndex++) {
      const file = files[polygonIndex];
      const polygonFilePath = path.join(dataDir, file);
      
      // Check if this polygon has already been processed for the current mode
      if (state.processedPolygons[mode] && state.processedPolygons[mode].includes(polygonFilePath)) {
        console.log(`Polygon ${file} has already been processed for ${mode} mode. Skipping.`);
        continue;
      }
      
      // Load polygon data
      const polygonData = await loadPolygonData(polygonFilePath);
      const landHistoricalName = polygonData.historicalName || polygonData.englishName || '';
      console.log(`Processing polygon ${polygonIndex + 1}/${files.length}: ${landHistoricalName || file}`);
      
      // Count items based on mode
      let itemsCount = 0;
      if (mode === 'bridges' && polygonData.bridgePoints && Array.isArray(polygonData.bridgePoints)) {
        itemsCount = polygonData.bridgePoints.filter(point => point.connection).length;
      } else if (mode === 'docks' && polygonData.dockPoints && Array.isArray(polygonData.dockPoints)) {
        itemsCount = polygonData.dockPoints.length;
      } else if (mode === 'buildings' && polygonData.buildingPoints && Array.isArray(polygonData.buildingPoints)) {
        itemsCount = polygonData.buildingPoints.length;
      }
      
      console.log(`Found ${itemsCount} ${mode} in polygon ${file}`);
      
      if (itemsCount === 0) {
        console.log(`No ${mode} found in polygon ${file}. Marking as processed and skipping.`);
        if (!state.processedPolygons[mode]) {
          state.processedPolygons[mode] = [];
        }
        state.processedPolygons[mode].push(polygonFilePath);
        await saveState(state);
        continue;
      }
      
      // Generate names/descriptions for this polygon
      let generatedItems = [];
      
      if (mode === 'bridges') {
        console.log(`Generating ${itemsCount} bridge names for ${landHistoricalName}...`);
        generatedItems = await generateBridgeNames(itemsCount, state.generatedNames.bridges, landHistoricalName);
      } else if (mode === 'docks') {
        console.log(`Generating ${itemsCount} dock names for ${landHistoricalName}...`);
        generatedItems = await generateDockNames(itemsCount, state.generatedNames.docks, landHistoricalName);
      } else if (mode === 'buildings') {
        console.log(`Generating ${itemsCount} building descriptions for ${landHistoricalName}...`);
        generatedItems = await generateBuildingDescriptions(itemsCount, state.generatedNames.buildings, landHistoricalName);
      } else {
        console.log(`Unknown mode: ${mode}. Valid modes are: bridges, docks, buildings`);
        return;
      }
      
      console.log(`Generated ${generatedItems.length} items successfully`);
      
      // Add the generated items to the state
      if (mode === 'bridges') {
        state.generatedNames.bridges = [...state.generatedNames.bridges, ...generatedItems.map(item => item.historicalName)];
      } else if (mode === 'docks') {
        state.generatedNames.docks = [...state.generatedNames.docks, ...generatedItems.map(item => item.historicalName)];
      } else if (mode === 'buildings') {
        state.generatedNames.buildings = [...state.generatedNames.buildings, ...generatedItems.map(item => item.historicalName)];
      }
      
      // Apply the generated items to the polygon
      let itemIndex = 0;
      
      if (mode === 'bridges' && polygonData.bridgePoints && polygonData.bridgePoints.length > 0) {
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
          const sourcePolygonId = polygonData.id || path.basename(polygonFilePath, '.json');
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
          
          // Assign the next bridge name if available
          if (itemIndex < generatedItems.length) {
            const bridgeName = generatedItems[itemIndex++];
            
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
      } else if (mode === 'docks' && polygonData.dockPoints && polygonData.dockPoints.length > 0) {
        // Assign dock names to dock points
        for (let i = 0; i < polygonData.dockPoints.length; i++) {
          const dockPoint = polygonData.dockPoints[i];
          
          if (itemIndex < generatedItems.length) {
            const dockName = generatedItems[itemIndex++];
            
            // Add name and description to dock point
            dockPoint.historicalName = dockName.historicalName;
            dockPoint.englishName = dockName.englishName;
            dockPoint.historicalDescription = dockName.historicalDescription;
            
            console.log(`Assigned dock name: "${dockName.historicalName}" (${dockName.englishName})`);
          } else {
            console.warn(`Ran out of dock names for polygon ${polygonData.id}`);
          }
        }
      } else if (mode === 'buildings' && polygonData.buildingPoints && polygonData.buildingPoints.length > 0) {
        // Assign building descriptions to building points
        for (let i = 0; i < polygonData.buildingPoints.length; i++) {
          const buildingPoint = polygonData.buildingPoints[i];
          
          if (itemIndex < generatedItems.length) {
            const buildingDesc = generatedItems[itemIndex++];
            
            // Add name and description to building point
            buildingPoint.buildingType = buildingDesc.buildingType;
            buildingPoint.historicalName = buildingDesc.historicalName;
            buildingPoint.englishName = buildingDesc.englishName;
            buildingPoint.historicalDescription = buildingDesc.historicalDescription;
            
            console.log(`Assigned building description: "${buildingDesc.historicalName}" (${buildingDesc.englishName})`);
          } else {
            console.warn(`Ran out of building descriptions for polygon ${polygonData.id}`);
          }
        }
      }
      
      // Save the enhanced data
      await savePolygonData(polygonFilePath, polygonData);
      console.log(`Enhanced ${mode} data saved for ${polygonFilePath}`);
      
      // Mark this polygon as processed for the current mode
      if (!state.processedPolygons[mode]) {
        state.processedPolygons[mode] = [];
      }
      state.processedPolygons[mode].push(polygonFilePath);
      await saveState(state);
      
      console.log(`Polygon ${file} processed successfully`);
      
      // Add a delay between processing polygons to avoid rate limiting
      if (polygonIndex < files.length - 1) {
        console.log('Waiting 5 seconds before processing next polygon...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    console.log(`All polygons processed successfully for ${mode} mode.`);
    
  } catch (error) {
    console.error(`Error enhancing ${mode}:`, error);
  }
}

// Run the enhancement process with the specified mode
enhancePolygonData();
