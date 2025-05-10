import { NextResponse } from 'next/server';
import { serverUtils } from '@/lib/fileUtils';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.id) {
      return NextResponse.json(
        { success: false, error: 'Polygon ID is required' },
        { status: 400 }
      );
    }
    
    // Get the existing polygon data
    const filePath = `${data.id}.json`;
    const existingData = serverUtils.readJsonFromFile(filePath);
    
    if (!existingData) {
      return NextResponse.json(
        { success: false, error: 'Polygon not found' },
        { status: 404 }
      );
    }
    
    // Update the bridge and dock points
    if (data.bridgePoints !== undefined) {
      existingData.bridgePoints = data.bridgePoints;
    }
    
    if (data.dockPoints !== undefined) {
      existingData.dockPoints = data.dockPoints;
    }
    
    // Save the updated data
    serverUtils.writeJsonToFile(filePath, existingData);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating polygon:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update polygon' },
      { status: 500 }
    );
  }
}
