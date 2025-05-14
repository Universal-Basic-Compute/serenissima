import { NextResponse } from 'next/server';
import { serverUtils, validateAndRepairCoordinates } from '@/lib/utils/fileUtils';

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
    
    // Validate and repair coordinates
    const validCoordinates = validateAndRepairCoordinates(coordinates);
    if (!validCoordinates) {
      return NextResponse.json(
        { success: false, error: 'Invalid polygon coordinates - contains NaN or insufficient valid points' },
        { status: 400 }
      );
    }
    
    // Calculate centroid and update or create file
    const result = serverUtils.updateOrCreatePolygonFile(validCoordinates);
    
    return NextResponse.json({ 
      success: true, 
      filename: result.filename,
      isNew: result.isNew
    });
  } catch (error) {
    console.error('Error saving polygon:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save polygon' },
      { status: 500 }
    );
  }
}
