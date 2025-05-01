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

// Calculate similarity between two polygons
function calculatePolygonSimilarity(poly1, poly2) {
  // If centroids are far apart, polygons are definitely different
  if (!poly1.centroid || !poly2.centroid) return 0;
  
  const centroidDistance = calculateDistance(poly1.centroid, poly2.centroid);
  
  // If centroids are more than 0.001 degrees apart (roughly 100 meters), 
  // consider them different polygons
  if (centroidDistance > 0.001) return 0;
  
  // If centroids are very close, check area similarity
  const area1 = calculatePolygonArea(poly1.coordinates);
  const area2 = calculatePolygonArea(poly2.coordinates);
  
  // Compare areas - if they differ by more than 20%, consider them different
  const areaRatio = Math.min(area1, area2) / Math.max(area1, area2);
  if (areaRatio < 0.8) return 0;
  
  // Calculate similarity score (0-1) based on centroid distance and area similarity
  const distanceScore = 1 - (centroidDistance / 0.001);
  const areaScore = areaRatio;
  
  return (distanceScore * 0.7) + (areaScore * 0.3); // Weight distance more than area
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

// Clean up duplicate polygons with more aggressive similarity detection
function cleanupDuplicatePolygons() {
  const files = getAllJsonFiles();
  const polygons = [];
  const filesToDelete = [];
  
  // First pass: load all polygons
  for (const file of files) {
    const data = readJsonFromFile(file);
    if (!data || !data.coordinates || !data.centroid) continue;
    
    polygons.push({
      file,
      data,
      // Extract timestamp from filename for age comparison
      timestamp: parseInt(file.replace('polygon-', '').replace('.json', '')) || 0
    });
  }
  
  // Sort polygons by timestamp (oldest first)
  polygons.sort((a, b) => a.timestamp - b.timestamp);
  
  // Second pass: identify duplicates using similarity
  const processedPolygons = [];
  
  for (const polygon of polygons) {
    let isDuplicate = false;
    
    // Compare with all processed polygons
    for (const processedPolygon of processedPolygons) {
      const similarity = calculatePolygonSimilarity(polygon.data, processedPolygon.data);
      
      // If similarity is above threshold (0.7), consider it a duplicate
      if (similarity > 0.7) {
        isDuplicate = true;
        filesToDelete.push(polygon.file);
        break;
      }
    }
    
    // If not a duplicate, add to processed list
    if (!isDuplicate) {
      processedPolygons.push(polygon);
    }
  }
  
  // Third pass: delete duplicates
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
console.log('Starting aggressive polygon cleanup...');
const result = cleanupDuplicatePolygons();
console.log(`Cleanup complete!`);
console.log(`Total files: ${result.total}`);
console.log(`Deleted duplicates: ${result.deleted}`);
console.log(`Remaining files: ${result.remaining}`);
