import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Helper to ensure the polygons directory exists
const polygonsDir = path.join(process.cwd(), 'data', 'polygons');
if (!fs.existsSync(polygonsDir)) {
  fs.mkdirSync(polygonsDir, { recursive: true });
}

export async function POST(
  request: Request,
  { params }: { params: { polygonId: string } }
) {
  const polygonId = params.polygonId;
  try {
    const { settings } = await request.json();

    // Validate settings structure
    if (!settings || 
        typeof settings.x !== 'number' || 
        typeof settings.y !== 'number' || 
        typeof settings.width !== 'number' || 
        typeof settings.height !== 'number') {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid settings data provided. Expected {x, y, width, height}.' 
      }, { status: 400 });
    }

    const filePath = path.join(polygonsDir, `${polygonId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ 
        success: false, 
        error: `Polygon file ${polygonId}.json not found` 
      }, { status: 404 });
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const polygonData = JSON.parse(fileContent);

    // Add or update the image settings
    polygonData.imageSettings = settings;
    
    // Log the update for debugging
    console.log(`Updating image settings for polygon ${polygonId}:`, settings);

    // Write the updated data back to the file with pretty formatting
    fs.writeFileSync(filePath, JSON.stringify(polygonData, null, 2));

    return NextResponse.json({ 
      success: true, 
      message: `Image settings for ${polygonId} updated successfully.`,
      settings: settings // Return the settings in the response for confirmation
    });
  } catch (error: any) {
    console.error(`Error updating image settings for ${polygonId}:`, error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to update image settings' 
    }, { status: 500 });
  }
}
