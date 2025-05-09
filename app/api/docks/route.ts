import { NextResponse } from 'next/server';

// Mock implementation since we don't have the actual Airtable utils
const airtableUtils = {
  createDock: async (dockData: any) => {
    // In a real implementation, this would create a record in Airtable
    console.log('Creating dock in Airtable:', dockData);
    
    // Return a mock response
    return {
      id: `dock_${Date.now()}`,
      landId: dockData.landId,
      position: dockData.position,
      rotation: dockData.rotation || 0,
      connectionPoints: dockData.connectionPoints || [],
      createdBy: dockData.createdBy,
      createdAt: new Date().toISOString()
    };
  },
  
  getDocks: async () => {
    // In a real implementation, this would fetch records from Airtable
    console.log('Fetching docks from Airtable');
    
    // Return mock data
    return [
      {
        id: 'dock_1',
        landId: 'land_1',
        position: { x: 100, y: 0, z: 100 },
        rotation: 0,
        connectionPoints: [
          { x: 90, y: 0, z: 100 },
          { x: 105, y: 0, z: 95 },
          { x: 105, y: 0, z: 105 }
        ],
        createdBy: 'ConsiglioDeiDieci',
        createdAt: '2023-01-01T00:00:00Z'
      }
    ];
  },
  
  getDockById: async (id: string) => {
    // In a real implementation, this would fetch a specific record from Airtable
    console.log('Fetching dock from Airtable, id:', id);
    
    // Return mock data
    if (id === 'dock_1') {
      return {
        id: 'dock_1',
        landId: 'land_1',
        position: { x: 100, y: 0, z: 100 },
        rotation: 0,
        connectionPoints: [
          { x: 90, y: 0, z: 100 },
          { x: 105, y: 0, z: 95 },
          { x: 105, y: 0, z: 105 }
        ],
        createdBy: 'ConsiglioDeiDieci',
        createdAt: '2023-01-01T00:00:00Z'
      };
    }
    
    // If the ID starts with 'dock_', it's probably a dynamically created one
    if (id.startsWith('dock_')) {
      return {
        id: id,
        landId: 'land_2',
        position: { x: 150, y: 0, z: 150 },
        rotation: Math.PI / 4,
        connectionPoints: [
          { x: 140, y: 0, z: 150 },
          { x: 155, y: 0, z: 145 },
          { x: 155, y: 0, z: 155 }
        ],
        createdBy: 'ConsiglioDeiDieci',
        createdAt: new Date().toISOString()
      };
    }
    
    return null;
  }
};

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.landId || !data.position) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Create dock record in Airtable
    const dock = await airtableUtils.createDock({
      landId: data.landId,
      position: data.position,
      rotation: data.rotation || 0,
      connectionPoints: data.connectionPoints || [],
      createdBy: data.createdBy || 'system'
    });
    
    return NextResponse.json(dock);
  } catch (error) {
    console.error('Error creating dock:', error);
    return NextResponse.json(
      { error: 'Failed to create dock' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    // Get docks from Airtable
    const docks = await airtableUtils.getDocks();
    
    return NextResponse.json(docks);
  } catch (error) {
    console.error('Error fetching docks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch docks' },
      { status: 500 }
    );
  }
}
