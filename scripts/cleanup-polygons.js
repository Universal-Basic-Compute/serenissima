// This script cleans up duplicate polygon files
const fs = require('fs');
const path = require('path');

// Define constants
const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure data directory exists
function ensureDataDirExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }
  return DATA_DIR;
}

// Get all JSON files
function getAllJsonFiles() {
  const dataDir = ensureDataDirExists();
  const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
  return files;
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

// Calculate distance between two points
function calculateDistance(point1, point2) {
  const latDiff = point1.lat - point2.lat;
  const lngDiff = point1.lng - point2.lng;
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
}

// Calculate polygon area using Shoelace formula
function calculatePolygonArea(coordinates) {
  let area = 0;
  const n = coordinates.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coordinates[i].lat * coordinates[j].lng;
    area -= coordinates[j].lat * coordinates[i].lng;
  }
  
  return Math.abs(area) / 2;
}

// Clean up duplicate polygons, keeping only the newest one for each location
function cleanupDuplicatePolygons() {
  const files = getAllJsonFiles();
  const polygons = [];
  const filesToDelete = [];
  
  // First pass: load all polygons
  for (const file of files) {
    const data = readJsonFromFile(file);
    if (!data || !data.coordinates || !data.centroid) continue;
    
    // Extract timestamp from filename
    const timestamp = parseInt(file.replace('polygon-', '').replace('.json', '')) || 0;
    
    polygons.push({
      file,
      data,
      timestamp
    });
  }
  
  // Sort polygons by timestamp (newest first)
  polygons.sort((a, b) => b.timestamp - a.timestamp);
  
  // Group polygons by similar location
  const locationGroups = {};
  
  for (const polygon of polygons) {
    let foundGroup = false;
    
    // Check if this polygon belongs to an existing group
    for (const groupId in locationGroups) {
      const group = locationGroups[groupId];
      const distance = calculateDistance(polygon.data.centroid, group.centroid);
      
      // If centroids are close (within ~50 meters), add to this group
      if (distance < 0.0005) {
        group.polygons.push(polygon);
        foundGroup = true;
        break;
      }
    }
    
    // If not found in any group, create a new group
    if (!foundGroup) {
      const groupId = `group-${Object.keys(locationGroups).length}`;
      locationGroups[groupId] = {
        centroid: polygon.data.centroid,
        polygons: [polygon]
      };
    }
  }
  
  // For each group, keep only the newest polygon
  for (const groupId in locationGroups) {
    const group = locationGroups[groupId];
    
    // Sort by timestamp (newest first)
    group.polygons.sort((a, b) => b.timestamp - a.timestamp);
    
    // Keep the first one (newest), mark the rest for deletion
    for (let i = 1; i < group.polygons.length; i++) {
      filesToDelete.push(group.polygons[i].file);
    }
  }
  
  // Delete the marked files
  for (const file of filesToDelete) {
    const filePath = path.join(DATA_DIR, file);
    try {
      fs.unlinkSync(filePath);
      console.log(`Deleted older duplicate polygon: ${file}`);
    } catch (error) {
      console.error(`Failed to delete ${file}:`, error);
    }
  }
  
  return {
    total: files.length,
    deleted: filesToDelete.length,
    remaining: files.length - filesToDelete.length,
    groups: Object.keys(locationGroups).length
  };
}

// Run the cleanup
console.log('Starting newest-only polygon cleanup...');
const result = cleanupDuplicatePolygons();
console.log(`Cleanup complete!`);
console.log(`Total files: ${result.total}`);
console.log(`Deleted duplicates: ${result.deleted}`);
console.log(`Remaining files: ${result.remaining}`);
console.log(`Unique locations: ${result.groups}`);
