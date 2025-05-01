import { NextResponse } from 'next/server';
import { serverUtils, calculateCentroid } from '@/lib/fileUtils';

export async function GET() {
  try {
    // Read all JSON files in the data directory
    const files = serverUtils.getAllJsonFiles();
    
    // Process files in parallel using Promise.all for better performance
    const polygonsPromises = files.map(async file => {
      const data = serverUtils.readJsonFromFile(file);
      const id = file.replace('.json', '');
      
      // Handle both old and new data formats
      if (Array.isArray(data)) {
        // Old format - just coordinates array
        return {
          id,
          coordinates: data,
          // Calculate centroid on-the-fly if not already stored
          centroid: calculateCentroid(data)
        };
      } else if (data && data.coordinates) {
        // New format with coordinates and centroid
        return {
          id,
          coordinates: data.coordinates,
          centroid: data.centroid || calculateCentroid(data.coordinates),
          // Include historical information if available
          historicalName: data.historicalName,
          englishName: data.englishName,
          historicalDescription: data.historicalDescription,
          nameConfidence: data.nameConfidence,
          areaInSquareMeters: data.areaInSquareMeters
        };
      } else {
        console.warn(`Invalid data format in ${file}`);
        return {
          id,
          coordinates: [],
          centroid: null
        };
      }
    });
    
    const polygons = await Promise.all(polygonsPromises);
    
    // Set cache headers to allow browsers to cache the response
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    
    return new NextResponse(JSON.stringify({ polygons }), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Error fetching polygons:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch polygons' },
      { status: 500 }
    );
  }
}
