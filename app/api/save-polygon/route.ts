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
    
    // Generate a filename with timestamp
    const filename = `polygon-${Date.now()}.json`;
    
    // Save the polygon data
    saveJsonToFile(filename, coordinates);
    
    return NextResponse.json({ success: true, filename });
  } catch (error) {
    console.error('Error saving polygon:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save polygon' },
      { status: 500 }
    );
  }
}
