import { NextResponse } from 'next/server';

// Mock implementation since we don't have the actual Airtable utils
const airtableUtils = {
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

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    
    // Get dock from Airtable
    const dock = await airtableUtils.getDockById(id);
    
    if (!dock) {
      return NextResponse.json(
        { error: `Dock with ID '${id}' not found` },
        { status: 404 }
      );
    }
    
    return NextResponse.json(dock);
  } catch (error) {
    console.error('Error fetching dock:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dock' },
      { status: 500 }
    );
  }
}
