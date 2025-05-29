const fs = require('fs');
const path = require('path');

// Constants
const SPACING = 50; // meters between points
const EDGE_BIAS = 0.3; // percentage of points to place near edges
const JITTER = 0.4; // randomness factor (0-1)
const EARTH_RADIUS = 6371000; // Earth radius in meters

/**
 * Calculate distance between two coordinates in meters
 */
function calculateDistance(coord1, coord2) {
  const lat1 = coord1.lat * Math.PI / 180;
  const lat2 = coord2.lat * Math.PI / 180;
  const lng1 = coord1.lng * Math.PI / 180;
  const lng2 = coord2.lng * Math.PI / 180;
  
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return EARTH_RADIUS * c;
}

/**
 * Convert meters to degrees at a specific latitude
 */
function metersToDegreesLat(meters) {
  return meters / 111320; // Approximate meters per degree latitude
}

function metersToDegreesLng(meters, lat) {
  return meters / (111320 * Math.cos(lat * Math.PI / 180));
}

/**
 * Check if a point is inside a polygon
 */
function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    
    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
        (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calculate the area of a polygon in square meters
 */
function calculatePolygonArea(coordinates) {
  if (coordinates.length < 3) return 0;
  
  let area = 0;
  const centroid = coordinates.reduce((acc, coord) => {
    return { lat: acc.lat + coord.lat / coordinates.length, lng: acc.lng + coord.lng / coordinates.length };
  }, { lat: 0, lng: 0 });
  
  for (let i = 0; i < coordinates.length; i++) {
    const j = (i + 1) % coordinates.length;
    
    // Convert to x,y coordinates (meters from centroid)
    const p1 = {
      x: calculateDistance({ lat: centroid.lat, lng: coordinates[i].lng }, centroid),
      y: calculateDistance({ lat: coordinates[i].lat, lng: centroid.lng }, centroid)
    };
    
    const p2 = {
      x: calculateDistance({ lat: centroid.lat, lng: coordinates[j].lng }, centroid),
      y: calculateDistance({ lat: coordinates[j].lat, lng: centroid.lng }, centroid)
    };
    
    // Apply sign based on point position relative to centroid
    if (coordinates[i].lng < centroid.lng) p1.x *= -1;
    if (coordinates[i].lat < centroid.lat) p1.y *= -1;
    if (coordinates[j].lng < centroid.lng) p2.x *= -1;
    if (coordinates[j].lat < centroid.lat) p2.y *= -1;
    
    area += p1.x * p2.y - p2.x * p1.y;
  }
  
  return Math.abs(area) / 2;
}

/**
 * Generate points along polygon edges
 */
function generateEdgePoints(coordinates, spacing) {
  const edgePoints = [];
  
  for (let i = 0; i < coordinates.length; i++) {
    const j = (i + 1) % coordinates.length;
    const start = coordinates[i];
    const end = coordinates[j];
    
    // Calculate distance between vertices
    const distance = calculateDistance(start, end);
    
    // Calculate number of points to place on this edge
    const numPoints = Math.floor(distance / spacing);
    
    if (numPoints > 0) {
      // Place points along the edge
      for (let k = 1; k < numPoints; k++) {
        const fraction = k / numPoints;
        
        // Add some slight jitter perpendicular to the edge
        const jitterFactor = (Math.random() - 0.5) * JITTER * spacing;
        
        // Calculate direction perpendicular to edge
        const dx = end.lng - start.lng;
        const dy = end.lat - start.lat;
        const length = Math.sqrt(dx*dx + dy*dy);
        const perpX = -dy / length;
        const perpY = dx / length;
        
        // Convert jitter to degrees
        const jitterLat = metersToDegreesLat(jitterFactor) * perpY;
        const jitterLng = metersToDegreesLng(jitterFactor, start.lat) * perpX;
        
        // Interpolate point along edge
        edgePoints.push({
          lat: start.lat + (end.lat - start.lat) * fraction + jitterLat,
          lng: start.lng + (end.lng - start.lng) * fraction + jitterLng
        });
      }
    }
  }
  
  return edgePoints;
}

/**
 * Generate interior points using a grid with jitter
 */
function generateInteriorPoints(coordinates, centroid, spacing) {
  // Find bounding box
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  
  for (const coord of coordinates) {
    minLat = Math.min(minLat, coord.lat);
    maxLat = Math.max(maxLat, coord.lat);
    minLng = Math.min(minLng, coord.lng);
    maxLng = Math.max(maxLng, coord.lng);
  }
  
  // Convert spacing to degrees
  const latSpacing = metersToDegreesLat(spacing);
  const lngSpacing = metersToDegreesLng(spacing, centroid.lat);
  
  // Create grid of points
  const points = [];
  
  for (let lat = minLat; lat <= maxLat; lat += latSpacing) {
    for (let lng = minLng; lng <= maxLng; lng += lngSpacing) {
      // Add jitter to create more natural patterns
      const jitterLat = (Math.random() - 0.5) * JITTER * latSpacing;
      const jitterLng = (Math.random() - 0.5) * JITTER * lngSpacing;
      
      const point = {
        lat: lat + jitterLat,
        lng: lng + jitterLng
      };
      
      // Check if point is inside polygon
      if (isPointInPolygon(point, coordinates)) {
        points.push(point);
      }
    }
  }
  
  return points;
}

/**
 * Generate building points for a polygon
 */
function generateBuildingPoints(polygon, spacing = SPACING) {
  const { coordinates, centroid } = polygon;
  
  if (!coordinates || coordinates.length < 3 || !centroid) {
    console.warn('Invalid polygon for building point generation');
    return polygon;
  }
  
  // Create a deep copy of the polygon
  const updatedPolygon = JSON.parse(JSON.stringify(polygon));
  
  // Generate edge-aligned points
  const edgePoints = generateEdgePoints(coordinates, spacing);
  
  // Generate interior points
  const interiorPoints = generateInteriorPoints(coordinates, centroid, spacing);
  
  // Combine points
  updatedPolygon.buildingPoints = [...edgePoints, ...interiorPoints];
  
  // Calculate approximate area to determine if we need more points
  const area = calculatePolygonArea(coordinates);
  const expectedPoints = area / (spacing * spacing);
  
  // Generate canal points along water edges if they don't already exist
  if (!updatedPolygon.canalPoints) {
    updatedPolygon.canalPoints = generateCanalPoints(coordinates, spacing);
  }
  
  // Generate bridge points if they don't already exist
  if (!updatedPolygon.bridgePoints) {
    updatedPolygon.bridgePoints = generateBridgePoints(coordinates, spacing);
  }
  
  console.log(`Polygon ${polygon.historicalName || 'Unknown'}: Generated ${updatedPolygon.buildingPoints.length} points (expected ~${Math.floor(expectedPoints)})`);
  console.log(`Canal points: ${updatedPolygon.canalPoints.length}, Bridge points: ${updatedPolygon.bridgePoints.length}`);
  
  return updatedPolygon;
}

/**
 * Generate canal points along water edges
 */
function generateCanalPoints(coordinates, spacing = SPACING) {
  const canalPoints = [];
  
  // For each edge of the polygon
  for (let i = 0; i < coordinates.length; i++) {
    const j = (i + 1) % coordinates.length;
    const start = coordinates[i];
    const end = coordinates[j];
    
    // Calculate distance between vertices
    const distance = calculateDistance(start, end);
    
    // Calculate number of points to place on this edge
    const numPoints = Math.floor(distance / spacing);
    
    if (numPoints > 0) {
      // Place points along the edge
      for (let k = 1; k < numPoints; k++) {
        const fraction = k / numPoints;
        
        // Interpolate point along edge
        const point = {
          edge: {
            lat: start.lat + (end.lat - start.lat) * fraction,
            lng: start.lng + (end.lng - start.lng) * fraction
          },
          type: 'canal'
        };
        
        canalPoints.push(point);
      }
    }
  }
  
  return canalPoints;
}

/**
 * Generate bridge points at strategic locations
 */
function generateBridgePoints(coordinates, spacing = SPACING * 2) {
  const bridgePoints = [];
  
  // For now, place bridge points at vertices with some probability
  for (let i = 0; i < coordinates.length; i++) {
    // Only place bridge points at some vertices (every 3rd vertex)
    if (i % 3 === 0) {
      const point = {
        edge: {
          lat: coordinates[i].lat,
          lng: coordinates[i].lng
        },
        type: 'bridge'
      };
      
      bridgePoints.push(point);
    }
  }
  
  return bridgePoints;
}

/**
 * Process all polygon files in a directory
 */
function processPolygonFiles(directoryPath) {
  const files = fs.readdirSync(directoryPath);
  let totalPoints = 0;
  let totalCanals = 0;
  let totalBridges = 0;
  
  for (const file of files) {
    if (file.endsWith('.json') && file.includes('polygon')) {
      const filePath = path.join(directoryPath, file);
      console.log(`Processing ${file}...`);
      
      try {
        // Read polygon data
        const polygonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Generate building points
        const updatedPolygon = generateBuildingPoints(polygonData);
        
        // Write updated data back to file
        fs.writeFileSync(filePath, JSON.stringify(updatedPolygon, null, 2));
        
        totalPoints += updatedPolygon.buildingPoints?.length || 0;
        totalCanals += updatedPolygon.canalPoints?.length || 0;
        totalBridges += updatedPolygon.bridgePoints?.length || 0;
        
        console.log(`Updated ${file} with ${updatedPolygon.buildingPoints?.length || 0} building points`);
      } catch (error) {
        console.error(`Error processing ${file}:`, error);
      }
    }
  }
  
  console.log(`Generation complete! Total: ${totalPoints} building points, ${totalCanals} canal points, ${totalBridges} bridge points`);
}

// Main execution
const dataDirectory = process.argv[2] || './data';
console.log(`Processing polygon files in ${dataDirectory}...`);
processPolygonFiles(dataDirectory);
console.log('Building points generation complete!');

// If running in a Node.js environment with process.send, send a completion message
if (typeof process !== 'undefined' && process.send) {
  process.send({ 
    status: 'complete',
    message: 'Building points generation complete!'
  });
}
