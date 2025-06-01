import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Helper to ensure the polygons directory exists (though it should)
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
    const { bounds } = await request.json();

    // Validate bounds structure
    if (!bounds || 
        typeof bounds.north !== 'number' || 
        typeof bounds.south !== 'number' || 
        typeof bounds.east !== 'number' || 
        typeof bounds.west !== 'number') {
      return NextResponse.json({ success: false, error: 'Invalid bounds data provided. Expected {north, south, east, west}.' }, { status: 400 });
    }
    // Optional: Validate north > south and east > west (though Google Maps LatLngBounds handles some inversion)
    if (bounds.north <= bounds.south) {
        return NextResponse.json({ success: false, error: 'Invalid bounds: north must be greater than south.' }, { status: 400 });
    }
    // East could be less than West if crossing the antimeridian, but for Venice this is unlikely.
    // For simplicity, we might assume east > west for local areas.

    const filePath = path.join(polygonsDir, `${polygonId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: `Polygon file ${polygonId}.json not found` }, { status: 404 });
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const polygonData = JSON.parse(fileContent);

    // Add or update the bounds
    polygonData.imageOverlayBounds = bounds;
    
    // Log the update for debugging
    console.log(`Updating image bounds for polygon ${polygonId}:`, bounds);

    // Write the updated data back to the file with pretty formatting
    fs.writeFileSync(filePath, JSON.stringify(polygonData, null, 2));

    return NextResponse.json({ 
      success: true, 
      message: `Image bounds for ${polygonId} updated successfully.`,
      bounds: bounds // Return the bounds in the response for confirmation
    });
  } catch (error: any) {
    console.error(`Error updating image bounds for ${polygonId}:`, error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to update image bounds' }, { status: 500 });
  }
}
