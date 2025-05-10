const fs = require('fs');
const path = require('path');

// Helper function to ensure directories exist
function ensureDirectoriesExist() {
  const dataDir = path.join(__dirname, '../data');
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
    console.log('Created data directory');
  }
  
  return dataDir;
}

// Helper function to calculate distance between two points in meters
function calculateDistance(point1, point2) {
  const R = 6371000; // Earth's radius in meters
  const lat1 = point1.lat * Math.PI / 180;
  const lat2 = point2.lat * Math.PI / 180;
  const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
  const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;

  const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
          Math.cos(lat1) * Math.cos(lat2) *
          Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Main function to connect bridge points
async function connectBridgePoints() {
  try {
    // Ensure directories exist before proceeding
    const dataDir = ensureDirectoriesExist();
    
    // Read all polygon files
    const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
    
    console.log(`Found ${files.length} polygon files`);
    
    // Load all polygons first to have complete data
    const polygons = [];
    for (const file of files) {
      const filePath = path.join(dataDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        // Add file name as id if not present
        if (!data.id) {
          data.id = file.replace('.json', '');
        }
        polygons.push(data);
      } catch (error) {
        console.error(`Error reading ${file}:`, error.message);
      }
    }
    
    console.log(`Successfully loaded ${polygons.length} polygons`);
    
    // Count polygons with bridge points
    const polygonsWithBridgePoints = polygons.filter(
      p => p.bridgePoints && Array.isArray(p.bridgePoints) && p.bridgePoints.length > 0
    );
    
    console.log(`Found ${polygonsWithBridgePoints.length} polygons with bridge points`);
    
    // Create a flat list of all bridge points with their polygon information
    const allBridgePoints = [];
    polygons.forEach(polygon => {
      if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
        polygon.bridgePoints.forEach((point, index) => {
          allBridgePoints.push({
            polygonId: polygon.id,
            pointIndex: index,
            point: point.edge || point, // Handle both formats
            originalPoint: point // Keep the original point object
          });
        });
      }
    });
    
    console.log(`Found ${allBridgePoints.length} total bridge points`);
    
    // Process each polygon to find connections
    let connectionsFound = 0;
    let polygonsUpdated = 0;
    
    for (const polygon of polygons) {
      let polygonUpdated = false;
      
      // Skip if no bridge points
      if (!polygon.bridgePoints || !Array.isArray(polygon.bridgePoints) || polygon.bridgePoints.length === 0) {
        continue;
      }
      
      // Process each bridge point
      for (let i = 0; i < polygon.bridgePoints.length; i++) {
        const bridgePoint = polygon.bridgePoints[i];
        const pointData = bridgePoint.edge || bridgePoint; // Handle both formats
        
        // Skip if already has connection
        if (bridgePoint.connection) {
          continue;
        }
        
        // Find closest bridge point from a different polygon
        let closestPoint = null;
        let closestDistance = Infinity;
        let closestPointData = null;
        
        for (const otherPoint of allBridgePoints) {
          // Skip points from the same polygon
          if (otherPoint.polygonId === polygon.id) {
            continue;
          }
          
          // Calculate distance
          const distance = calculateDistance(pointData, otherPoint.point);
          
          // Check if within 25 meters and closer than current closest
          if (distance <= 25 && distance < closestDistance) {
            closestDistance = distance;
            closestPoint = otherPoint;
            closestPointData = otherPoint.point;
          }
        }
        
        // If found a close point, add connection
        if (closestPoint) {
          // Create connection object
          const connection = {
            targetPolygonId: closestPoint.polygonId,
            targetPointIndex: closestPoint.pointIndex,
            targetPoint: closestPointData,
            distance: closestDistance
          };
          
          // Add connection to bridge point
          if (typeof bridgePoint === 'object') {
            bridgePoint.connection = connection;
          } else {
            // If bridge point is not an object (unlikely), convert it
            polygon.bridgePoints[i] = {
              edge: pointData,
              connection: connection
            };
          }
          
          connectionsFound++;
          polygonUpdated = true;
          
          console.log(`Connected bridge point in polygon ${polygon.id} to polygon ${closestPoint.polygonId} (distance: ${closestDistance.toFixed(2)}m)`);
        }
      }
      
      // Save updated polygon if changes were made
      if (polygonUpdated) {
        const filePath = path.join(dataDir, `${polygon.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(polygon, null, 2));
        polygonsUpdated++;
      }
    }
    
    console.log(`Completed! Found ${connectionsFound} bridge connections across ${polygonsUpdated} polygons.`);
    
  } catch (error) {
    console.error('Error connecting bridge points:', error);
  }
}

// Run the function
connectBridgePoints();
