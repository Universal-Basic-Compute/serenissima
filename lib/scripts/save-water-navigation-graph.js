const fs = require('fs');
const path = require('path');

// Directory containing polygon data files
const POLYGONS_DIR = path.join(process.cwd(), 'data');

// Output file for the baked water navigation graph
const OUTPUT_FILE = path.join(process.cwd(), 'data', 'water-navigation-graph.json');

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
 * Calculate distance between two points in meters
 */
function calculateDistance(point1, point2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLon = (point2.lng - point1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Builds the water navigation graph from all polygon files
 */
function buildWaterNavigationGraph() {
  console.log('Building water navigation graph...');
  
  // Get all polygon files
  const polygonFiles = getAllPolygonFiles();
  console.log(`Found ${polygonFiles.length} polygon files`);
  
  // Initialize the navigation graph
  const navigationGraph = {};
  
  // First pass: Load all polygons and collect dock points
  const polygons = [];
  const allDocks = [];
  
  polygonFiles.forEach(file => {
    const polygon = readPolygonFromFile(file);
    if (polygon && polygon.id) {
      polygons.push(polygon);
      
      // Extract dock points
      if (polygon.dockPoints && Array.isArray(polygon.dockPoints) && polygon.dockPoints.length > 0) {
        polygon.dockPoints.forEach((dockPoint, index) => {
          if (dockPoint.water && dockPoint.edge) {
            allDocks.push({
              id: `dock-${polygon.id}-${index}`,
              polygonId: polygon.id,
              position: dockPoint.water, // Use water point for navigation
              edge: dockPoint.edge,      // Store edge point for reference
              index,
              // Store the polygon centroid for distance calculations
              polygonCentroid: polygon.centroid
            });
          }
        });
      }
    }
  });
  
  console.log(`Loaded ${polygons.length} valid polygons`);
  console.log(`Found ${allDocks.length} dock points`);
  
  // Initialize the graph with all docks
  allDocks.forEach(dock => {
    navigationGraph[dock.id] = [];
  });
  
  // Second pass: Connect docks to each other with distances, but only if they're less than 2 km apart
  const MAX_DISTANCE_KM = 2; // Maximum distance in kilometers
  let totalConnections = 0;
  let skippedConnections = 0;
  
  for (let i = 0; i < allDocks.length; i++) {
    const dock1 = allDocks[i];
    
    for (let j = 0; j < allDocks.length; j++) {
      // Don't connect a dock to itself
      if (i === j) continue;
      
      const dock2 = allDocks[j];
      
      // Calculate distance between docks
      const dockDistance = calculateDistance(dock1.position, dock2.position);
      
      // Calculate distance between polygon centroids (if available)
      let centroidDistance = Infinity;
      if (dock1.polygonCentroid && dock2.polygonCentroid) {
        centroidDistance = calculateDistance(dock1.polygonCentroid, dock2.polygonCentroid);
      }
      
      // Only add connection if the centroids are less than MAX_DISTANCE_KM apart
      if (centroidDistance < MAX_DISTANCE_KM * 1000) { // Convert km to meters
        // Add connection with distance
        navigationGraph[dock1.id].push({
          targetId: dock2.id,
          distance: dockDistance,
          targetPosition: dock2.position,
          centroidDistance: centroidDistance
        });
        
        totalConnections++;
      } else {
        skippedConnections++;
      }
    }
  }
  
  console.log(`Created water navigation graph with ${Object.keys(navigationGraph).length} nodes`);
  console.log(`Total connections in graph: ${totalConnections}`);
  console.log(`Skipped ${skippedConnections} connections due to distance limit (${MAX_DISTANCE_KM} km)`);
  
  // Create enhanced graph with dock details
  const enhancedGraph = {};
  
  allDocks.forEach(dock => {
    enhancedGraph[dock.id] = {
      polygonId: dock.polygonId,
      position: dock.position,
      edge: dock.edge,
      polygonCentroid: dock.polygonCentroid,
      connections: navigationGraph[dock.id].map(conn => ({
        targetId: conn.targetId,
        distance: conn.distance,
        targetPosition: conn.targetPosition,
        centroidDistance: conn.centroidDistance
      }))
    };
  });
  
  // Create a lookup from polygon ID to dock IDs
  const polygonToDocks = {};
  allDocks.forEach(dock => {
    if (!polygonToDocks[dock.polygonId]) {
      polygonToDocks[dock.polygonId] = [];
    }
    polygonToDocks[dock.polygonId].push(dock.id);
  });
  
  // Save both simple and enhanced graphs
  const outputData = {
    simple: navigationGraph,
    enhanced: enhancedGraph,
    polygonToDocks: polygonToDocks,
    metadata: {
      totalPolygons: polygons.length,
      totalDocks: allDocks.length,
      totalConnections,
      skippedConnections,
      maxDistanceKm: MAX_DISTANCE_KM,
      generatedAt: new Date().toISOString()
    }
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
  console.log(`Water navigation graph saved to ${OUTPUT_FILE}`);
  
  return outputData;
}

// Execute the function
buildWaterNavigationGraph();
