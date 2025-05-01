/**
 * This script calculates the area of each polygon in square meters
 * and adds it to the polygon data file.
 */

const fs = require('fs');
const path = require('path');

// Constants
const DATA_DIR = path.join(process.cwd(), 'data');
const EARTH_RADIUS_METERS = 6371000; // Earth's radius in meters

// Ensure data directory exists
function ensureDataDirExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }
  return DATA_DIR;
}

// Get all JSON files in the data directory
function getAllJsonFiles() {
  const dataDir = ensureDataDirExists();
  return fs.readdirSync(dataDir)
    .filter(file => file.endsWith('.json'));
}

// Read JSON from file
function readJsonFromFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const fileContent = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(fileContent);
}

// Save JSON to file
function saveJsonToFile(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

// Convert degrees to radians
function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

// Calculate the area of a polygon using the Shoelace formula and Haversine formula
function calculatePolygonArea(coordinates) {
  if (!coordinates || coordinates.length < 3) {
    return 0;
  }

  // Make sure the polygon is closed
  const closed = coordinates.slice();
  if (closed[0].lat !== closed[closed.length - 1].lat || 
      closed[0].lng !== closed[closed.length - 1].lng) {
    closed.push(closed[0]);
  }

  let area = 0;
  
  // Convert to Cartesian coordinates (approximate for small areas)
  const cartesian = closed.map(coord => {
    const latRad = toRadians(coord.lat);
    const lngRad = toRadians(coord.lng);
    
    // Project to a plane using the Mercator projection
    const x = EARTH_RADIUS_METERS * lngRad * Math.cos(latRad);
    const y = EARTH_RADIUS_METERS * latRad;
    
    return { x, y };
  });
  
  // Apply the Shoelace formula
  for (let i = 0; i < cartesian.length - 1; i++) {
    area += cartesian[i].x * cartesian[i + 1].y - cartesian[i + 1].x * cartesian[i].y;
  }
  
  // Take the absolute value and divide by 2
  area = Math.abs(area) / 2;
  
  return area;
}

// Main function
async function main() {
  console.log('Calculating areas for all polygons...');
  
  const files = getAllJsonFiles();
  console.log(`Found ${files.length} JSON files`);
  
  let updatedCount = 0;
  
  for (const file of files) {
    const data = readJsonFromFile(file);
    
    // Skip if not a polygon file or already has area
    if (!data || !data.coordinates) {
      continue;
    }
    
    // Calculate area if not already present
    if (!data.areaInSquareMeters) {
      const area = calculatePolygonArea(data.coordinates);
      
      // Add area to the data
      data.areaInSquareMeters = Math.round(area * 100) / 100; // Round to 2 decimal places
      
      // Save updated data
      saveJsonToFile(file, data);
      updatedCount++;
      
      console.log(`Updated ${file} with area: ${data.areaInSquareMeters} m²`);
    }
  }
  
  console.log(`Updated ${updatedCount} files with area information`);
  console.log('Area calculation complete!');
}

// Run the main function
main().catch(error => {
  console.error('Error calculating areas:', error);
  process.exit(1);
});
