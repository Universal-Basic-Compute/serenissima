import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Helper to ensure the polygons directory exists
const polygonsDir = path.join(process.cwd(), 'data', 'polygons');
if (!fs.existsSync(polygonsDir)) {
  fs.mkdirSync(polygonsDir, { recursive: true });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ polygonId: string }> }
): Promise<NextResponse> {
  const resolvedParams = await params;
  const polygonId = resolvedParams.polygonId;
  try {
    const { settings } = await request.json();

    // Validate settings structure for new lat/lng format
    if (!settings || 
        typeof settings.lat !== 'number' || 
        typeof settings.lng !== 'number' || 
        typeof settings.width !== 'number' || 
        typeof settings.height !== 'number') {
      // referenceScale is optional, width and height are essential.
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid settings data provided. Expected {lat, lng, width, height} and optionally {referenceScale}.' 
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
