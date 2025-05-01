import fs from 'fs';
import path from 'path';

export const DATA_DIR = path.join(process.cwd(), 'data');

export function ensureDataDirExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }
  return DATA_DIR;
}

export function saveJsonToFile(filename: string, data: any) {
  const dataDir = ensureDataDirExists();
  const filePath = path.join(dataDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

export function updateOrCreatePolygonFile(coordinates: any[], centroid: any = null) {
  // Calculate centroid if not provided
  if (!centroid) {
    centroid = calculateCentroid(coordinates);
  }
  
  // Check if a similar polygon already exists
  const existingFiles = getAllJsonFiles();
  for (const file of existingFiles) {
    const existingData = readJsonFromFile(file);
    
    // Skip if not a polygon file
    if (!existingData || !existingData.coordinates) continue;
    
    // Check if centroids are very close (within ~10 meters)
    if (existingData.centroid && centroid) {
      const distance = calculateDistance(existingData.centroid, centroid);
      if (distance < 0.0001) { // Approximately 10 meters
        // Update existing file
        const updatedData = {
          coordinates,
          centroid
        };
        saveJsonToFile(file, updatedData);
        return { filename: file, isNew: false };
      }
    }
  }
  
  // No similar polygon found, create a new file
  const filename = `polygon-${Date.now()}.json`;
  const polygonData = {
    coordinates,
    centroid
  };
  saveJsonToFile(filename, polygonData);
  return { filename, isNew: true };
}

// Helper function to calculate distance between two coordinates
function calculateDistance(coord1: any, coord2: any) {
  const latDiff = coord1.lat - coord2.lat;
  const lngDiff = coord1.lng - coord2.lng;
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
}

// Add these functions to lib/fileUtils.ts
export function findClosestPointOnPolygonEdge(point: {lat: number, lng: number}, polygon: {lat: number, lng: number}[]) {
  let closestPoint = null;
  let minDistance = Infinity;
  
  // Check each edge of the polygon
  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length]; // Wrap around to the first point
    
    // Find the closest point on this edge
    const closest = findClosestPointOnLineSegment(point, start, end);
    const distance = calculateDistance(point, closest);
    
    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = closest;
    }
  }
  
  return closestPoint;
}

// Helper function to find closest point on a line segment
export function findClosestPointOnLineSegment(point: {lat: number, lng: number}, start: {lat: number, lng: number}, end: {lat: number, lng: number}) {
  const dx = end.lng - start.lng;
  const dy = end.lat - start.lat;
  
  // If the line segment is just a point, return it
  if (dx === 0 && dy === 0) return start;
  
  // Calculate the projection of the point onto the line
  const t = ((point.lng - start.lng) * dx + (point.lat - start.lat) * dy) / (dx * dx + dy * dy);
  
  // Constrain t to the line segment
  const tConstrained = Math.max(0, Math.min(1, t));
  
  // Calculate the closest point on the line segment
  return {
    lat: start.lat + tConstrained * dy,
    lng: start.lng + tConstrained * dx
  };
}

// Helper function to calculate centroid
function calculateCentroid(coordinates: any[]) {
  if (!coordinates || coordinates.length < 3) {
    return null;
  }

  let sumLat = 0;
  let sumLng = 0;
  const n = coordinates.length;
  
  for (let i = 0; i < n; i++) {
    sumLat += coordinates[i].lat;
    sumLng += coordinates[i].lng;
  }

  return {
    lat: sumLat / n,
    lng: sumLng / n
  };
}

export function readJsonFromFile(filename: string) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const fileContent = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(fileContent);
}

export function getAllJsonFiles() {
  const dataDir = ensureDataDirExists();
  const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
  return files;
}

export function cleanupDuplicatePolygons() {
  const files = getAllJsonFiles();
  const processedCentroids: {[key: string]: string} = {};
  const filesToDelete: string[] = [];
  
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
