import path from 'path';

export const DATA_DIR = path.join(process.cwd(), 'data', 'polygons');

// Helper function to calculate distance between two coordinates
export function calculateDistance(coord1: any, coord2: any) {
  const latDiff = coord1.lat - coord2.lat;
  const lngDiff = coord1.lng - coord2.lng;
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
}

// Helper function to calculate centroid
export function calculateCentroid(coordinates: any[]) {
  if (!coordinates || coordinates.length < 3) {
    return null;
  }

  // Filter out invalid coordinates
  const validCoords = coordinates.filter(coord => 
    coord && 
    typeof coord.lat === 'number' && !isNaN(coord.lat) && isFinite(coord.lat) &&
    typeof coord.lng === 'number' && !isNaN(coord.lng) && isFinite(coord.lng)
  );
  
  if (validCoords.length < 3) {
    console.warn('Not enough valid coordinates to calculate centroid');
    return null;
  }

  let sumLat = 0;
  let sumLng = 0;
  const n = validCoords.length;
  
  for (let i = 0; i < n; i++) {
    sumLat += validCoords[i].lat;
    sumLng += validCoords[i].lng;
  }

  return {
    lat: sumLat / n,
    lng: sumLng / n
  };
}

// Add these functions to lib/fileUtils.ts
// Memoize the distance calculation function for better performance
const distanceCache = new Map<string, number>();

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
    const distance = calculateDistanceMemoized(point, closest);
    
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

// Memoized version of calculateDistance
export function calculateDistanceMemoized(coord1: any, coord2: any) {
  // Create a cache key from the coordinates
  const key = `${coord1.lat},${coord1.lng}-${coord2.lat},${coord2.lng}`;
  
  // Check if we have a cached result
  if (distanceCache.has(key)) {
    return distanceCache.get(key)!;
  }
  
  // Calculate the distance
  const result = calculateDistance(coord1, coord2);
  
  // Cache the result (limit cache size to prevent memory issues)
  if (distanceCache.size > 1000) {
    // Clear the cache if it gets too large
    distanceCache.clear();
  }
  distanceCache.set(key, result);
  
  return result;
}

/**
 * Validates and repairs polygon coordinates
 * @param coordinates Array of coordinates to validate
 * @returns Cleaned coordinates array or null if beyond repair
 */
export function validateAndRepairCoordinates(coordinates: any[]): any[] | null {
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
    console.warn('Invalid polygon: needs at least 3 coordinates');
    return null;
  }

  // Filter out invalid coordinates (NaN, undefined, etc.)
  const validCoordinates = coordinates.filter(coord => 
    coord && 
    typeof coord.lat === 'number' && !isNaN(coord.lat) && isFinite(coord.lat) &&
    typeof coord.lng === 'number' && !isNaN(coord.lng) && isFinite(coord.lng)
  );

  // Check if we still have enough valid coordinates
  if (validCoordinates.length < 3) {
    console.warn(`Polygon has insufficient valid coordinates: ${validCoordinates.length} (needs at least 3)`);
    return null;
  }

  return validCoordinates;
}

// Create server-only versions of these functions
// These will be used only in API routes
export const serverUtils = {
  ensureDataDirExists: null as any,
  saveJsonToFile: null as any,
  readJsonFromFile: null as any,
  getAllJsonFiles: null as any,
  updateOrCreatePolygonFile: null as any,
  cleanupDuplicatePolygons: null as any,
  fileCache: {} as Record<string, any>, // Add a cache for file contents
  fileCacheTimestamps: {} as Record<string, number> // Add timestamps for cache invalidation
};

// Only import fs and initialize server functions if we're on the server
if (typeof window === 'undefined') {
  // We're on the server
  const fs = require('fs');
  
  serverUtils.ensureDataDirExists = () => {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    return DATA_DIR;
  };
  
  serverUtils.saveJsonToFile = (filename: string, data: any) => {
    const dataDir = serverUtils.ensureDataDirExists();
    const filePath = path.join(dataDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return filePath;
  };
  
  serverUtils.readJsonFromFile = (filename: string) => {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    // Check if we have a cached version that's still valid (5 minute cache)
    const now = Date.now();
    const cacheTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    if (
      serverUtils.fileCache[filename] && 
      serverUtils.fileCacheTimestamps[filename] && 
      (now - serverUtils.fileCacheTimestamps[filename]) < cacheTime
    ) {
      // Use cached version
      return serverUtils.fileCache[filename];
    }
    
    // Read from file and cache the result
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsedContent = JSON.parse(fileContent);
    
    // Store in cache
    serverUtils.fileCache[filename] = parsedContent;
    serverUtils.fileCacheTimestamps[filename] = now;
    
    return parsedContent;
  };
  
  serverUtils.getAllJsonFiles = () => {
    const dataDir = serverUtils.ensureDataDirExists();
    
    // Use a static cache for the file list with a 5-minute expiration
    const cacheKey = 'all_json_files';
    const now = Date.now();
    const cacheTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    if (
      serverUtils.fileCache[cacheKey] && 
      serverUtils.fileCacheTimestamps[cacheKey] && 
      (now - serverUtils.fileCacheTimestamps[cacheKey]) < cacheTime
    ) {
      // Use cached file list
      return serverUtils.fileCache[cacheKey];
    }
    
    // Read directory and filter for JSON files
    const files = fs.readdirSync(dataDir).filter((file: string) => file.endsWith('.json'));
    
    // Cache the result
    serverUtils.fileCache[cacheKey] = files;
    serverUtils.fileCacheTimestamps[cacheKey] = now;
    
    return files;
  };
  
  serverUtils.updateOrCreatePolygonFile = (coordinates: any[], centroid: any = null) => {
    // Validate coordinates
    const validCoordinates = validateAndRepairCoordinates(coordinates);
    if (!validCoordinates) {
      console.error('Invalid coordinates provided to updateOrCreatePolygonFile');
      throw new Error('Invalid polygon coordinates');
    }
    
    // Calculate centroid if not provided
    if (!centroid) {
      centroid = calculateCentroid(validCoordinates);
    }
    
    // Check if a similar polygon already exists
    const existingFiles = serverUtils.getAllJsonFiles();
    for (const file of existingFiles) {
      const existingData = serverUtils.readJsonFromFile(file);
      
      // Skip if not a polygon file
      if (!existingData || !existingData.coordinates) continue;
      
      // Check if centroids are very close (within ~10 meters)
      if (existingData.centroid && centroid) {
        const distance = calculateDistance(existingData.centroid, centroid);
        if (distance < 0.0001) { // Approximately 10 meters
          // Update existing file
          const updatedData = {
            coordinates: validCoordinates,
            centroid
          };
          serverUtils.saveJsonToFile(file, updatedData);
          return { filename: file, isNew: false };
        }
      }
    }
    
    // No similar polygon found, create a new file
    const filename = `polygon-${Date.now()}.json`;
    const polygonData = {
      coordinates: validCoordinates,
      centroid
    };
    serverUtils.saveJsonToFile(filename, polygonData);
    return { filename, isNew: true };
  };
  
  serverUtils.cleanupDuplicatePolygons = () => {
    const files = serverUtils.getAllJsonFiles();
    const processedCentroids: {[key: string]: string} = {};
    const filesToDelete: string[] = [];
    
    // First pass: identify duplicates
    for (const file of files) {
      const data = serverUtils.readJsonFromFile(file);
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
  };
}
