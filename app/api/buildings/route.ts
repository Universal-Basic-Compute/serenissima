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
    
    // Validate required fields
    if (!data.type || !data.land_id || !data.position) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Create building record in Airtable
    const building = await airtableUtils.createBuilding({
      type: data.type,
      land_id: data.land_id,
      position: data.position,
      rotation: data.rotation || 0,
      connection_points: data.connection_points || [],
      created_by: data.created_by || 'system'
    });
    
    return NextResponse.json({ success: true, building });
  } catch (error) {
    console.error('Error creating building:', error);
    return NextResponse.json(
      { error: 'Failed to create building' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    
    // Get buildings from Airtable
    const buildings = await airtableUtils.getBuildings(type);
    
    return NextResponse.json({ buildings });
  } catch (error) {
    console.error('Error fetching buildings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch buildings' },
      { status: 500 }
    );
  }
}
