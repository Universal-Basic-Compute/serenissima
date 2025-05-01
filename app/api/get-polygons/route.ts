import { NextResponse } from 'next/server';
import { getAllJsonFiles, readJsonFromFile } from '@/lib/fileUtils';

export async function GET() {
  try {
    // Read all JSON files in the data directory
    const files = getAllJsonFiles();
    
    const polygons = files.map(file => {
      const data = readJsonFromFile(file);
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
          nameConfidence: data.nameConfidence
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
    
    return NextResponse.json({ polygons });
  } catch (error) {
    console.error('Error fetching polygons:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch polygons' },
      { status: 500 }
    );
  }
}

// Helper function to calculate centroid
function calculateCentroid(coordinates) {
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
