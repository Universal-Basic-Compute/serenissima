import { NextResponse } from 'next/server';
import { serverUtils, calculateCentroid, validateAndRepairCoordinates } from '@/lib/utils/fileUtils';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '0');
  const essential = url.searchParams.get('essential') === 'true';
  
  try {
    // Read all JSON files in the data directory
    const files = serverUtils.getAllJsonFiles();
    
    // Apply limit if specified
    const filesToProcess = limit > 0 ? files.slice(0, limit) : files;
    
    // Process files in smaller batches to avoid memory issues
    const batchSize = 20;
    const polygons = [];
    
    for (let i = 0; i < filesToProcess.length; i += batchSize) {
      const batch = filesToProcess.slice(i, i + batchSize);
      
      // Process this batch
      const batchPromises = batch.map(async (file: string) => {
        const data = serverUtils.readJsonFromFile(file);
        const id = file.replace('.json', '');
        
        // Handle both old and new data formats
        if (Array.isArray(data)) {
          // Old format - just coordinates array
          // Validate and repair coordinates
          const validCoordinates = validateAndRepairCoordinates(data);
          if (!validCoordinates) {
            console.warn(`Invalid coordinates in ${file}, skipping`);
            return null;
          }
          
          return {
            id,
            coordinates: validCoordinates,
            // Calculate centroid on-the-fly if not already stored
            centroid: calculateCentroid(validCoordinates)
          };
        } else if (data && data.coordinates) {
          // Validate and repair coordinates
          const validCoordinates = validateAndRepairCoordinates(data.coordinates);
          if (!validCoordinates) {
            console.warn(`Invalid coordinates in ${file}, skipping`);
            return null;
          }
          
          // If essential mode, return minimal data
          if (essential) {
            return {
              id,
              // coordinates: validCoordinates, // Removed as per request
              centroid: data.centroid || calculateCentroid(validCoordinates),
              center: data.center,
              // bridgePoints: data.bridgePoints || [], // Removed as per request
              // canalPoints: data.canalPoints || [], // Removed as per request
              // buildingPoints: data.buildingPoints || [], // Removed as per request
              // Include historical information as requested
              historicalName: data.historicalName,
              englishName: data.englishName,
              historicalDescription: data.historicalDescription,
              nameConfidence: data.nameConfidence,
              areaInSquareMeters: data.areaInSquareMeters,
              imageSettings: data.imageSettings || null
            };
          }
          
          // New format with coordinates and centroid
          return {
            id,
            coordinates: validCoordinates,
            centroid: data.centroid || calculateCentroid(validCoordinates),
            center: data.center,
            // Include bridge, dock, and building points if available
            bridgePoints: data.bridgePoints || [],
            canalPoints: data.canalPoints || [],
            buildingPoints: data.buildingPoints || [],
            // Include historical information if available
            historicalName: data.historicalName,
            englishName: data.englishName,
            historicalDescription: data.historicalDescription,
            nameConfidence: data.nameConfidence,
            areaInSquareMeters: data.areaInSquareMeters,
            imageSettings: data.imageSettings || null
          };
        } else {
          console.warn(`Invalid data format in ${file}`);
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      // Filter out null results (invalid polygons)
      polygons.push(...batchResults.filter(Boolean));
    }
    
    // Set cache headers to allow browsers to cache the response
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    
    return NextResponse.json(
      { 
        success: true, 
        version: new Date().toISOString(), // Add a version timestamp
        polygons 
      }, 
      { 
        status: 200, 
        headers // Pass existing headers object for caching
      }
    );
  } catch (error) {
    console.error('Error fetching polygons:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch polygons' },
      { status: 500 }
    );
  }
}
