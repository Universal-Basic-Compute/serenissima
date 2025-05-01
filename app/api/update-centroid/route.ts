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
    let filename = `${id}.json`;
    // Make sure the filename has .json extension
    if (!filename.endsWith('.json')) {
      filename = `${filename}.json`;
    }
    
    // Log the filename we're trying to read
    console.log(`Updating centroid for file: ${filename}`);
    
    const data = serverUtils.readJsonFromFile(filename);
    
    if (!data) {
      console.error(`Polygon file not found: ${filename}`);
      return NextResponse.json(
        { success: false, error: 'Polygon not found' },
        { status: 404 }
      );
    }
    
    // Log the current centroid and the new one
    console.log(`Updating centroid from`, data.centroid, `to`, centroid);
    
    // Update the centroid
    data.centroid = centroid;
    
    // Save the updated data
    serverUtils.saveJsonToFile(filename, data);
    
    return NextResponse.json({ 
      success: true, 
      message: `Centroid updated for ${id}`,
      centroid: centroid
    });
  } catch (error) {
    console.error('Error updating centroid:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update centroid' },
      { status: 500 }
    );
  }
}
