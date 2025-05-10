import { NextResponse } from 'next/server';

// Mock implementation since we don't have the actual Airtable utils
const airtableUtils = {
  createBuilding: async (buildingData: any) => {
    // In a real implementation, this would create a record in Airtable
    console.log('Creating building in Airtable:', buildingData);
    
    // Return a mock response
    return {
      id: `building_${Date.now()}`,
      type: buildingData.type,
      land_id: buildingData.land_id,
      position: buildingData.position,
      rotation: buildingData.rotation || 0,
      connection_points: buildingData.connection_points || [],
      created_by: buildingData.created_by,
      created_at: new Date().toISOString()
    };
  },
  
  getBuildings: async (type?: string | null) => {
    // In a real implementation, this would fetch records from Airtable
    console.log('Fetching buildings from Airtable, type filter:', type);
    
    // Return mock data
    const buildings = [
      {
        id: 'building_1',
        type: 'public-dock',
        land_id: 'land_1',
        position: { x: 100, y: 0, z: 100 },
        rotation: 0,
        connection_points: [
          { x: 90, y: 0, z: 100 },
          { x: 105, y: 0, z: 95 },
          { x: 105, y: 0, z: 105 }
        ],
        created_by: 'ConsiglioDeiDieci',
        created_at: '2023-01-01T00:00:00Z'
      }
    ];
    
    // Filter by type if specified
    if (type) {
      return buildings.filter(b => b.type === type);
    }
    
    return buildings;
  }
};

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Enhanced validation with more detailed error messages
    if (!data.type) {
      return NextResponse.json(
        { success: false, error: 'Building type is required' },
        { status: 400 }
      );
    }
    
    if (!data.land_id) {
      return NextResponse.json(
        { success: false, error: 'Land ID is required' },
        { status: 400 }
      );
    }
    
    if (!data.position || typeof data.position !== 'object' || 
        typeof data.position.x !== 'number' || 
        typeof data.position.z !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Valid position with x and z coordinates is required' },
        { status: 400 }
      );
    }
    
    // Log the received data for debugging
    console.log('Creating building with data:', JSON.stringify(data, null, 2));
    
    // Create a unique ID for the building
    const buildingId = `building_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Normalize the building type (remove apostrophes, replace spaces with hyphens)
    const normalizedType = data.type.toLowerCase().replace(/'/g, '').replace(/\s+/g, '-');
    
    // Create the building object
    const building = {
      id: buildingId,
      type: normalizedType,
      variant: data.variant || 'model',
      land_id: data.land_id,
      position: {
        x: data.position.x,
        y: data.position.y || 0,
        z: data.position.z
      },
      rotation: data.rotation || 0,
      connection_points: data.connection_points || [],
      created_by: data.created_by || 'system',
      created_at: new Date().toISOString()
    };
    
    // In a real implementation, this would save to Airtable or another database
    // For now, we'll just log it and return success
    console.log('Successfully created building:', JSON.stringify(building, null, 2));
    
    // Return the created building with success flag
    return NextResponse.json({ 
      success: true, 
      building,
      message: 'Building created successfully'
    });
  } catch (error) {
    console.error('Error creating building:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create building', 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    
    console.log('GET /api/buildings request received');
    console.log('Query parameters:', { type });
    
    // Get buildings from Airtable
    const buildings = await airtableUtils.getBuildings(type);
    console.log(`Retrieved ${buildings.length} buildings from database`);
    
    // Log each building for debugging
    buildings.forEach((building, index) => {
      console.log(`Building ${index + 1}:`, building);
    });
    
    // Add your specific building for debugging - add multiple copies at different positions
    const debugBuilding1 = {
      id: 'building_1',
      type: 'market-stall',
      land_id: 'polygon-1746052711032',
      position: { 
        x: 45, 
        y: 10, // Higher position for better visibility
        z: 12 
      },
      rotation: 0,
      created_by: 'ConsiglioDeiDieci',
      created_at: '2025-05-10T02:07:00Z'
    };
    
    const debugBuilding2 = {
      id: 'building_2',
      type: 'market-stall',
      land_id: 'polygon-1746052711033',
      position: { 
        x: 55, 
        y: 10, // Higher position for better visibility
        z: 22
      },
      rotation: Math.PI / 4, // 45 degrees rotation
      created_by: 'ConsiglioDeiDieci',
      created_at: '2025-05-10T02:07:00Z'
    };
    
    const debugBuilding3 = {
      id: 'building_3',
      type: 'market-stall',
      land_id: 'polygon-1746052711034',
      position: { 
        x: 35, 
        y: 10, // Higher position for better visibility
        z: 2
      },
      rotation: Math.PI / 2, // 90 degrees rotation
      created_by: 'ConsiglioDeiDieci',
      created_at: '2025-05-10T02:07:00Z'
    };
    
    console.log('Adding debug buildings');
    buildings.push(debugBuilding1);
    buildings.push(debugBuilding2);
    buildings.push(debugBuilding3);
    
    return NextResponse.json({ buildings });
  } catch (error) {
    console.error('Error fetching buildings:', error);
    console.error('Stack trace:', error.stack);
    return NextResponse.json(
      { error: 'Failed to fetch buildings', details: error.message },
      { status: 500 }
    );
  }
}
