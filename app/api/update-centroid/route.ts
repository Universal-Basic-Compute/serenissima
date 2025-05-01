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
    // Handle both formats: with or without 'polygon-' prefix
    let possibleFilenames = [
      `${id}.json`,
      `polygon-${id}.json`,
      id.startsWith('polygon-') ? `${id}.json` : `polygon-${id}.json`
    ];
    
    // Log the filenames we're trying
    console.log(`Trying to update centroid for files:`, possibleFilenames);
    
    let data = null;
    let foundFilename = null;
    
    // Try each possible filename
    for (const filename of possibleFilenames) {
      data = serverUtils.readJsonFromFile(filename);
      if (data) {
        foundFilename = filename;
        break;
      }
    }
    
    if (!data || !foundFilename) {
      console.error(`Polygon file not found for ID: ${id}`);
      return NextResponse.json(
        { success: false, error: `Polygon not found for ID: ${id}` },
        { status: 404 }
      );
    }
    
    // Log the current centroid and the new one
    console.log(`Found polygon file: ${foundFilename}`);
    console.log(`Updating centroid from`, data.centroid, `to`, centroid);
    
    // Update the centroid
    data.centroid = centroid;
    
    // Save the updated data
    serverUtils.saveJsonToFile(foundFilename, data);
    
    return NextResponse.json({ 
      success: true, 
      message: `Centroid updated for ${id}`,
      centroid: centroid,
      filename: foundFilename
    });
  } catch (error) {
    console.error('Error updating centroid:', error);
    return NextResponse.json(
      { success: false, error: `Failed to update centroid: ${error.message}` },
      { status: 500 }
    );
  }
}
