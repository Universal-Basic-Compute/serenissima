import { NextResponse } from 'next/server';
import { saveJsonToFile } from '@/lib/fileUtils';

export async function POST(request: Request) {
  try {
    const { coordinates } = await request.json();
    
    // Validate input
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
      return NextResponse.json(
        { success: false, error: 'Invalid polygon coordinates' },
        { status: 400 }
      );
    }
    
    // Calculate centroid
    const centroid = calculateCentroid(coordinates);
    
    // Generate a filename with timestamp
    const filename = `polygon-${Date.now()}.json`;
    
    // Save the polygon data with centroid
    const polygonData = {
      coordinates,
      centroid
    };
    
    saveJsonToFile(filename, polygonData);
    
    return NextResponse.json({ 
      success: true, 
      filename,
      centroid
    });
  } catch (error) {
    console.error('Error saving polygon:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save polygon' },
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
