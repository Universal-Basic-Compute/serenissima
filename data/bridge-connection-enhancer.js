
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

// Generate a bridge name using Claude
async function generateBridgeName(locationInfo) {
  try {
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
        model: 'claude-3-opus-20240229',
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
      // Extract just the bridge name and explanation
      const bridgeNameResponse = response.data.content[0].text.trim();
      return bridgeNameResponse;
    }

    return 'Ponte Sconosciuto (Unknown Bridge)';
  } catch (error) {
    console.error('Error generating bridge name with Claude:', error);
    return 'Ponte Sconosciuto (Unknown Bridge) - Error generating name';
  }
}

// Process polygon data and enhance bridge connections
async function enhanceBridgeConnections() {
  try {
    // Define the file path
    const polygonFilePath = path.join(__dirname, 'polygon-1746057327626.json');
    
    // Load polygon data
    const polygonData = await loadPolygonData(polygonFilePath);
    console.log(`Loaded polygon data for: ${polygonData.historicalName || polygonData.englishName}`);
    
    // Check if the polygon has bridge points
    if (!polygonData.bridgePoints || !Array.isArray(polygonData.bridgePoints)) {
      console.log('No bridge points found in the polygon data.');
      return;
    }
    
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
      const sourcePolygonId = polygonData.id || 'polygon-1746057327626'; // Use the current polygon ID
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
      
      // Update the connection with the name and location info
      bridgePoint.connection.name = bridgeName;
      bridgePoint.connection.location = {
        midpoint: { lat: midLat, lng: midLng },
        locationInfo: locationInfo
      };
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Save the enhanced data
    await savePolygonData(polygonFilePath, polygonData);
    console.log('Bridge connection enhancement completed successfully');
    
  } catch (error) {
    console.error('Error enhancing bridge connections:', error);
  }
}

// Run the enhancement process
enhanceBridgeConnections();
