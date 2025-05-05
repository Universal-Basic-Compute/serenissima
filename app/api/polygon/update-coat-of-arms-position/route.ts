import { NextResponse } from 'next/server';
import { serverUtils } from '@/lib/fileUtils';
import path from 'path';
import fs from 'fs';

export async function POST(request: Request) {
  try {
    const { polygonId, position } = await request.json();
    
    if (!polygonId || !position || typeof position.lat !== 'number' || typeof position.lng !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid polygon ID or position' },
        { status: 400 }
      );
    }
    
    // Get the polygon data
    const dataDir = serverUtils.ensureDataDirExists();
    const filePath = path.join(dataDir, `${polygonId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: 'Polygon not found' },
        { status: 404 }
      );
    }
    
    // Read the polygon data
    const polygonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Update the coat of arms center
    polygonData.coatOfArmsCenter = position;
    
    // Log the update for debugging
    console.log(`Updating coat of arms position for polygon ${polygonId}:`, position);
    console.log('Updated polygon data:', polygonData);
    
    // Write the updated data back to the file
    fs.writeFileSync(filePath, JSON.stringify(polygonData, null, 2));
    
    // Verify the file was written correctly
    const verifiedData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`Verification - polygon ${polygonId} coatOfArmsCenter:`, verifiedData.coatOfArmsCenter);
    
    // Also update in Airtable if needed
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      await fetch(`${apiBaseUrl}/api/land/${polygonId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coat_of_arms_center_lat: position.lat,
          coat_of_arms_center_lng: position.lng
        }),
      });
    } catch (error) {
      console.error('Error updating Airtable:', error);
      // Continue even if Airtable update fails
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Coat of arms position updated for polygon ${polygonId}`,
      data: { polygonId, position }
    });
  } catch (error) {
    console.error('Error updating coat of arms position:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update coat of arms position' },
      { status: 500 }
    );
  }
}
