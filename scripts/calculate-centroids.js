const fs = require('fs');
const path = require('path');

// Path to the data directory
const DATA_DIR = path.join(process.cwd(), 'data');

// Function to ensure the data directory exists
function ensureDataDirExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }
  return DATA_DIR;
}

// Function to get all JSON files
function getAllJsonFiles() {
  const dataDir = ensureDataDirExists();
  const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
  return files;
}

// Function to read JSON from file
function readJsonFromFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const fileContent = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(fileContent);
}

// Function to save JSON to file
function saveJsonToFile(filename, data) {
  const dataDir = ensureDataDirExists();
  const filePath = path.join(dataDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

// Function to calculate the centroid of a polygon
function calculateCentroid(coordinates) {
  if (!coordinates || coordinates.length < 3) {
    console.warn('Invalid polygon: needs at least 3 coordinates');
    return null;
  }

  let sumLat = 0;
  let sumLng = 0;
  let area = 0;
  const n = coordinates.length;

  // For simple polygons, we can use the arithmetic mean
  // For more complex polygons, we should use a weighted centroid calculation
  // based on the polygon's area
  
  // Simple arithmetic mean approach
  for (let i = 0; i < n; i++) {
    sumLat += coordinates[i].lat;
    sumLng += coordinates[i].lng;
  }

  return {
    lat: sumLat / n,
    lng: sumLng / n
  };
}

// Main function to process all polygon files
function processCentroids() {
  console.log('Calculating centroids for all polygons...');
  
  const files = getAllJsonFiles();
  console.log(`Found ${files.length} polygon files`);
  
  let updatedCount = 0;
  
  files.forEach(file => {
    const coordinates = readJsonFromFile(file);
    
    if (Array.isArray(coordinates)) {
      // Calculate centroid
      const centroid = calculateCentroid(coordinates);
      
      if (centroid) {
        // Create new data structure with centroid
        const updatedData = {
          coordinates: coordinates,
          centroid: centroid,
          // Store the original centroid as center
          center: centroid
        };
        
        // Save updated data back to file
        saveJsonToFile(file, updatedData);
        updatedCount++;
        console.log(`Updated ${file} with centroid: ${JSON.stringify(centroid)}`);
      } else {
        console.warn(`Could not calculate centroid for ${file}`);
      }
    } else if (coordinates && coordinates.coordinates) {
      // File already has the new structure, just update the centroid
      const centroid = calculateCentroid(coordinates.coordinates);
      
      if (centroid) {
        // Store the current centroid as center if it doesn't exist yet
        if (!coordinates.center) {
          coordinates.center = coordinates.centroid;
        }
        
        // Update the centroid
        coordinates.centroid = centroid;
        saveJsonToFile(file, coordinates);
        updatedCount++;
        console.log(`Updated ${file} with centroid: ${JSON.stringify(centroid)}`);
      }
    } else {
      console.warn(`Invalid data format in ${file}`);
    }
  });
  
  console.log(`Updated ${updatedCount} of ${files.length} polygon files`);
}

// Run the script
processCentroids();
