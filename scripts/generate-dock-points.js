const fs = require('fs');
const path = require('path');

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

// Helper function to interpolate points along a polygon edge
function interpolatePoints(point1, point2, distance) {
  const totalDistance = calculateDistance(point1, point2);
  if (totalDistance === 0) return [];
  
  const numPoints = Math.floor(totalDistance / distance);
  if (numPoints <= 1) return [];
  
  const points = [];
  for (let i = 1; i < numPoints; i++) {
    const fraction = i / numPoints;
    points.push({
      lat: point1.lat + (point2.lat - point1.lat) * fraction,
      lng: point1.lng + (point2.lng - point1.lng) * fraction
    });
  }
  return points;
}

// Helper function to calculate polygon centroid
function calculateCentroid(coordinates) {
  let sumLat = 0;
  let sumLng = 0;
  
  for (const coord of coordinates) {
    sumLat += coord.lat;
    sumLng += coord.lng;
  }
  
  return {
    lat: sumLat / coordinates.length,
    lng: sumLng / coordinates.length
  };
}

// Helper function to extend a line from center through a point
function extendLine(center, point, extensionDistance) {
  // Calculate direction vector
  const direction = {
    lat: point.lat - center.lat,
    lng: point.lng - center.lng
  };
  
  // Calculate distance between center and point
  const distance = calculateDistance(center, point);
  
  // Normalize direction vector
  const normalizedDirection = {
    lat: direction.lat / distance,
    lng: direction.lng / distance
  };
  
  // Calculate extended point
  return {
    lat: point.lat + normalizedDirection.lat * extensionDistance,
    lng: point.lng + normalizedDirection.lng * extensionDistance
  };
}

// Helper function to check if a point is inside any polygon
function isPointInAnyPolygon(point, polygons) {
  for (const polygon of polygons) {
    if (isPointInPolygon(point, polygon.coordinates)) {
      return true;
    }
  }
  return false;
}

// Helper function to check if a point is inside a polygon
function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    
    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
        (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Main function to generate dock points
async function generateDockPoints() {
  try {
    // Read all polygon files
    const polygonsDir = path.join(__dirname, '../data/polygons');
    const files = fs.readdirSync(polygonsDir).filter(file => file.endsWith('.json'));
    
    console.log(`Found ${files.length} polygon files`);
    
    // Load all polygons first to check for water later
    const allPolygons = [];
    for (const file of files) {
      const filePath = path.join(polygonsDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      allPolygons.push(data);
    }
    
    let totalDockPoints = 0;
    
    // Process each polygon
    for (const file of files) {
      const filePath = path.join(polygonsDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      if (!data.coordinates || data.coordinates.length < 3) {
        console.log(`Skipping ${file}: Invalid polygon data`);
        continue;
      }
      
      // Calculate centroid
      const centroid = calculateCentroid(data.coordinates);
      
      // Initialize dock points array if it doesn't exist
      if (!data.dockPoints) {
        data.dockPoints = [];
      }
      
      // Sample points along the polygon perimeter at 50-meter intervals
      const perimeter = [...data.coordinates];
      const potentialDockPoints = [];
      
      for (let i = 0; i < perimeter.length; i++) {
        const point1 = perimeter[i];
        const point2 = perimeter[(i + 1) % perimeter.length];
        
        // Add the current vertex
        potentialDockPoints.push(point1);
        
        // Add interpolated points along this edge
        const interpolated = interpolatePoints(point1, point2, 50);
        potentialDockPoints.push(...interpolated);
      }
      
      console.log(`Polygon ${file}: Found ${potentialDockPoints.length} potential dock points`);
      
      // For each potential dock point, check if it can be a valid dock
      const dockPoints = [];
      
      for (const point of potentialDockPoints) {
        // Extend the line from centroid through point by 20 meters
        const extendedPoint = extendLine(centroid, point, 20);
        
        // Check if the extended point is in water (not in any polygon)
        if (!isPointInAnyPolygon(extendedPoint, allPolygons)) {
          // This is a valid dock point
          dockPoints.push({
            edge: point,
            water: extendedPoint
          });
        }
      }
      
      console.log(`Polygon ${file}: Created ${dockPoints.length} valid dock points`);
      totalDockPoints += dockPoints.length;
      
      // Update the polygon data with dock points
      data.dockPoints = dockPoints;
      
      // Write the updated data back to the file
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
    
    console.log(`Completed! Generated ${totalDockPoints} dock points across all polygons.`);
  } catch (error) {
    console.error('Error generating dock points:', error);
  }
}

// Run the function
generateDockPoints();
