import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// In-memory cache for polygons
let polygonsCache: Record<string, any> = {};
let cacheTimestamp: number = 0;

/**
 * GET handler for fetching a specific polygon by ID
 */
export async function GET(
  request: Request,
  { params }: { params: { polygonId: string } }
) {
  try {
    const polygonId = params.polygonId;
    console.log(`Fetching polygon with ID: ${polygonId}`);

    // Check if we have the polygon in cache
    if (Object.keys(polygonsCache).length > 0 && polygonsCache[polygonId]) {
      console.log(`Returning polygon ${polygonId} from cache`);
      return NextResponse.json(polygonsCache[polygonId]);
    }

    // If not in cache, try to load from file system
    const dataDir = path.join(process.cwd(), 'data', 'polygons');
    
    // First try to load the specific polygon file if it exists
    const specificPolygonPath = path.join(dataDir, `${polygonId}.json`);
    if (fs.existsSync(specificPolygonPath)) {
      try {
        const polygonData = JSON.parse(fs.readFileSync(specificPolygonPath, 'utf8'));
        // Cache the polygon
        polygonsCache[polygonId] = polygonData;
        return NextResponse.json(polygonData);
      } catch (error) {
        console.error(`Error reading polygon file ${specificPolygonPath}:`, error);
      }
    }

    // If specific file doesn't exist, load all polygons and find the one we need
    console.log(`Polygon file not found, searching in all polygons...`);
    
    // Check if we have a polygons.json file
    const allPolygonsPath = path.join(dataDir, 'polygons.json');
    if (fs.existsSync(allPolygonsPath)) {
      try {
        const allPolygons = JSON.parse(fs.readFileSync(allPolygonsPath, 'utf8'));
        
        // If it's an array, find the polygon by ID
        if (Array.isArray(allPolygons)) {
          const polygon = allPolygons.find(p => p.id === polygonId);
          if (polygon) {
            // Cache all polygons for future requests
            allPolygons.forEach(p => {
              if (p.id) polygonsCache[p.id] = p;
            });
            return NextResponse.json(polygon);
          }
        } 
        // If it's an object with a polygons property, find the polygon by ID
        else if (allPolygons.polygons && Array.isArray(allPolygons.polygons)) {
          const polygon = allPolygons.polygons.find(p => p.id === polygonId);
          if (polygon) {
            // Cache all polygons for future requests
            allPolygons.polygons.forEach(p => {
              if (p.id) polygonsCache[p.id] = p;
            });
            return NextResponse.json(polygon);
          }
        }
      } catch (error) {
        console.error(`Error reading all polygons file:`, error);
      }
    }

    // If we still haven't found the polygon, scan the polygons directory for individual files
    console.log(`Scanning polygons directory for polygon files...`);
    const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
    
    for (const file of files) {
      try {
        const filePath = path.join(dataDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        // Check if this file contains the polygon we're looking for
        if (data.id === polygonId) {
          // Cache the polygon
          polygonsCache[polygonId] = data;
          return NextResponse.json(data);
        }
        
        // Check if the file contains an array of polygons
        if (Array.isArray(data)) {
          const polygon = data.find(p => p.id === polygonId);
          if (polygon) {
            // Cache all polygons for future requests
            data.forEach(p => {
              if (p.id) polygonsCache[p.id] = p;
            });
            return NextResponse.json(polygon);
          }
        }
        
        // Check if the file contains an object with a polygons property
        if (data.polygons && Array.isArray(data.polygons)) {
          const polygon = data.polygons.find(p => p.id === polygonId);
          if (polygon) {
            // Cache all polygons for future requests
            data.polygons.forEach(p => {
              if (p.id) polygonsCache[p.id] = p;
            });
            return NextResponse.json(polygon);
          }
        }
      } catch (error) {
        console.error(`Error processing file ${file}:`, error);
      }
    }

    // If we get here, the polygon was not found
    console.log(`Polygon ${polygonId} not found`);
    return NextResponse.json(
      { error: `Polygon ${polygonId} not found` },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error fetching polygon:', error);
    return NextResponse.json(
      { error: 'Failed to fetch polygon' },
      { status: 500 }
    );
  }
}
