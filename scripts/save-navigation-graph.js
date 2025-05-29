
const fs = require('fs');
const path = require('path');

// Directory containing polygon data files
const POLYGONS_DIR = path.join(process.cwd(), 'data');

// Output file for the baked navigation graph
const OUTPUT_FILE = path.join(process.cwd(), 'data', 'navigation-graph.json');

/**
 * Ensures the data directory exists
 */
function ensureDataDirExists() {
  if (!fs.existsSync(POLYGONS_DIR)) {
    fs.mkdirSync(POLYGONS_DIR, { recursive: true });
  }
  return POLYGONS_DIR;
}

/**
 * Gets all polygon JSON files
 */
function getAllPolygonFiles() {
  const dataDir = ensureDataDirExists();
  return fs.readdirSync(dataDir)
    .filter(file => file.endsWith('.json') && file.startsWith('polygon-'));
}

/**
 * Reads a polygon from its file
 */
function readPolygonFromFile(filename) {
  const filePath = path.join(POLYGONS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error reading polygon file ${filename}:`, error);
    return null;
  }
}

/**
 * Builds the navigation graph from all polygon files
 */
function buildNavigationGraph() {
  console.log('Building navigation graph...');
  
  // Get all polygon files
  const polygonFiles = getAllPolygonFiles();
  console.log(`Found ${polygonFiles.length} polygon files`);
  
  // Initialize the navigation graph
  const navigationGraph = {};
  
  // First pass: Load all polygons and initialize their entries in the graph
  const polygons = [];
  polygonFiles.forEach(file => {
    const polygon = readPolygonFromFile(file);
    if (polygon && polygon.id) {
      polygons.push(polygon);
      navigationGraph[polygon.id] = [];
    }
  });
  
  console.log(`Loaded ${polygons.length} valid polygons`);
  
  // Second pass: Process bridge connections
  let totalConnections = 0;
  let polygonsWithBridges = 0;
  
  polygons.forEach(polygon => {
    if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
      let hasValidBridge = false;
      
      polygon.bridgePoints.forEach(bridgePoint => {
        if (bridgePoint.connection && bridgePoint.connection.targetPolygonId) {
          const targetPolygonId = bridgePoint.connection.targetPolygonId;
          
          // Verify that the target polygon exists in our data
          if (navigationGraph[targetPolygonId]) {
            // Add connection if not already present
            if (!navigationGraph[polygon.id].includes(targetPolygonId)) {
              navigationGraph[polygon.id].push(targetPolygonId);
              totalConnections++;
              hasValidBridge = true;
            }
            
            // Add reverse connection if not already present
            if (!navigationGraph[targetPolygonId].includes(polygon.id)) {
              navigationGraph[targetPolygonId].push(polygon.id);
              totalConnections++;
            }
          } else {
            console.warn(`Warning: Bridge in ${polygon.id} points to non-existent polygon ${targetPolygonId}`);
          }
        }
      });
      
      if (hasValidBridge) {
        polygonsWithBridges++;
      }
    }
  });
  
  console.log(`Created navigation graph with ${Object.keys(navigationGraph).length} nodes`);
  console.log(`Found ${polygonsWithBridges} polygons with valid bridges`);
  console.log(`Total connections in graph: ${totalConnections}`);
  
  // Create enhanced navigation graph with bridge details
  const enhancedGraph = {};
  
  polygons.forEach(polygon => {
    enhancedGraph[polygon.id] = {
      connections: [],
      centroid: polygon.centroid || null
    };
    
    if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
      polygon.bridgePoints.forEach(bridgePoint => {
        if (bridgePoint.connection && bridgePoint.connection.targetPolygonId) {
          const targetPolygonId = bridgePoint.connection.targetPolygonId;
          
          // Only add if target polygon exists
          if (navigationGraph[targetPolygonId]) {
            enhancedGraph[polygon.id].connections.push({
              targetId: targetPolygonId,
              sourcePoint: bridgePoint.edge,
              targetPoint: bridgePoint.connection.targetPoint,
              distance: bridgePoint.connection.distance || 0
            });
          }
        }
      });
    }
  });
  
  // Save both simple and enhanced graphs
  const outputData = {
    simple: navigationGraph,
    enhanced: enhancedGraph,
    metadata: {
      totalPolygons: polygons.length,
      polygonsWithBridges,
      totalConnections,
      generatedAt: new Date().toISOString()
    }
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
  console.log(`Navigation graph saved to ${OUTPUT_FILE}`);
  
  return outputData;
}

// Execute the function
buildNavigationGraph();
