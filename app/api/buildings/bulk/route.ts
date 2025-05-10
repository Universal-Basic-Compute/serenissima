import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { buildings } = await request.json();
    
    if (!Array.isArray(buildings)) {
      return NextResponse.json(
        { success: false, error: 'Buildings must be an array' },
        { status: 400 }
      );
    }
    
    // Process each building
    const results = [];
    for (const buildingData of buildings) {
      // Validate building data
      if (!buildingData.type || !buildingData.land_id || !buildingData.position) {
        results.push({
          success: false,
          error: 'Invalid building data',
          data: buildingData
        });
        continue;
      }
      
      // Create a unique ID for the building
      const buildingId = `building_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      // Normalize the building type
      const normalizedType = buildingData.type.toLowerCase().replace(/\s+/g, '-');
      // Don't remove apostrophes from the type name
      
      // Create the building object
      const building = {
        id: buildingId,
        type: normalizedType,
        variant: buildingData.variant || 'model',
        land_id: buildingData.land_id,
        position: {
          x: buildingData.position.x,
          y: buildingData.position.y || 0,
          z: buildingData.position.z
        },
        rotation: buildingData.rotation || 0,
        connection_points: buildingData.connection_points || [],
        created_by: buildingData.created_by || 'system',
        created_at: new Date().toISOString()
      };
      
      // In a real implementation, this would save to Airtable or another database
      results.push({
        success: true,
        building
      });
    }
    
    return NextResponse.json({ 
      success: true, 
      results,
      message: `Processed ${results.length} buildings`
    });
  } catch (error) {
    console.error('Error processing buildings:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process buildings', 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
