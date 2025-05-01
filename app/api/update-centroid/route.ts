import { NextResponse } from 'next/server';
import { serverUtils } from '@/lib/fileUtils';

export async function POST(request: Request) {
  try {
    const { id, centroid } = await request.json();
    
    // Validate input
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Polygon ID is required' },
        { status: 400 }
      );
    }
    
    if (!centroid || typeof centroid.lat !== 'number' || typeof centroid.lng !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Valid centroid coordinates are required' },
        { status: 400 }
      );
    }
    
    // Get the polygon file
    const filename = `${id}.json`;
    const data = serverUtils.readJsonFromFile(filename);
    
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Polygon not found' },
        { status: 404 }
      );
    }
    
    // Update the centroid
    data.centroid = centroid;
    
    // Save the updated data
    serverUtils.saveJsonToFile(filename, data);
    
    return NextResponse.json({ 
      success: true, 
      message: `Centroid updated for ${id}`
    });
  } catch (error) {
    console.error('Error updating centroid:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update centroid' },
      { status: 500 }
    );
  }
}
