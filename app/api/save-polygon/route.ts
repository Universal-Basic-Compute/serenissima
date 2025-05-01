import { NextResponse } from 'next/server';
import { updateOrCreatePolygonFile } from '@/lib/fileUtils';

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
    
    // Calculate centroid and update or create file
    const result = updateOrCreatePolygonFile(coordinates);
    
    return NextResponse.json({ 
      success: true, 
      filename: result.filename,
      isNew: result.isNew,
      centroid: result.centroid
    });
  } catch (error) {
    console.error('Error saving polygon:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save polygon' },
      { status: 500 }
    );
  }
}
