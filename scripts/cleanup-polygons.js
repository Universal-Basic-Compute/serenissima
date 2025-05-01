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

// Clean up duplicate polygons
function cleanupDuplicatePolygons() {
  const files = getAllJsonFiles();
  const processedCentroids = {};
  const filesToDelete = [];
  
  // First pass: identify duplicates
  for (const file of files) {
    const data = readJsonFromFile(file);
    if (!data || !data.centroid) continue;
    
    // Create a key based on centroid coordinates (rounded to 5 decimal places)
    const centroidKey = `${data.centroid.lat.toFixed(5)},${data.centroid.lng.toFixed(5)}`;
    
    if (processedCentroids[centroidKey]) {
      // This is a duplicate, mark for deletion
      filesToDelete.push(file);
    } else {
      // This is the first occurrence, keep it
      processedCentroids[centroidKey] = file;
    }
  }
  
  // Second pass: delete duplicates
  for (const file of filesToDelete) {
    const filePath = path.join(DATA_DIR, file);
    try {
      fs.unlinkSync(filePath);
      console.log(`Deleted duplicate polygon: ${file}`);
    } catch (error) {
      console.error(`Failed to delete ${file}:`, error);
    }
  }
  
  return {
    total: files.length,
    deleted: filesToDelete.length,
    remaining: files.length - filesToDelete.length
  };
}

// Run the cleanup
console.log('Starting polygon cleanup...');
const result = cleanupDuplicatePolygons();
console.log(`Cleanup complete!`);
console.log(`Total files: ${result.total}`);
console.log(`Deleted duplicates: ${result.deleted}`);
console.log(`Remaining files: ${result.remaining}`);
