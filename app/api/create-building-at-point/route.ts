import { NextResponse } from 'next/server';
import Airtable from 'airtable';
import { getComputeBalance, deductCompute } from '@/lib/computeUtils';

// Configure Airtable
const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;

// Initialize Airtable base if API key and base ID are available
const base = apiKey && baseId ? new Airtable({ apiKey }).base(baseId) : null;

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validate required fields
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
    
    if (!data.position) {
      return NextResponse.json(
        { success: false, error: 'Position is required' },
        { status: 400 }
      );
    }
    
    if (!data.walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    // Check if Airtable is configured
    if (!base) {
      console.warn('Airtable not configured, using mock data');
      
      // Return mock data for development
      const buildingId = `building-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const building = {
        id: buildingId,
        type: data.type,
        land_id: data.land_id,
        variant: data.variant || 'model',
        position: data.position,
        rotation: data.rotation || 0,
        owner: data.walletAddress,
        created_at: data.created_at || new Date().toISOString(),
        cost: data.cost || 0
      };
      
      return NextResponse.json({ 
        success: true, 
        building,
        message: 'Building created successfully (mock)'
      });
    }
    
    // Check if the building point is already occupied
    const existingBuildings = await new Promise<any[]>((resolve, reject) => {
      const buildings: any[] = [];
      
      base.select({
        filterByFormula: `{Land} = '${data.land_id}'`,
        view: 'Grid view'
      })
      .eachPage(
        function page(records, fetchNextPage) {
          records.forEach(record => {
            try {
              const position = JSON.parse(record.get('Position') as string);
              
              // Check if position matches (with some tolerance)
              const tolerance = 0.5; // 0.5 units tolerance
              const positionMatches = 
                Math.abs(position.x - data.position.x) < tolerance &&
                Math.abs(position.z - data.position.z) < tolerance;
              
              if (positionMatches) {
                buildings.push(record);
              }
            } catch (e) {
              console.error('Error parsing position:', e);
            }
          });
          
          fetchNextPage();
        },
        function done(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(buildings);
        }
      );
    });
    
    if (existingBuildings.length > 0) {
      return NextResponse.json(
        { success: false, error: 'This building point is already occupied' },
        { status: 400 }
      );
    }
    
    // Check compute balance
    const computeBalance = await getComputeBalance(data.walletAddress);
    
    if (computeBalance < data.cost) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Insufficient compute balance. You have ${computeBalance} but need ${data.cost}.` 
        },
        { status: 400 }
      );
    }
    
    // Deduct compute
    await deductCompute(data.walletAddress, data.cost);
    
    // Ensure position is properly formatted as a string
    const positionString = typeof data.position === 'string' 
      ? data.position 
      : JSON.stringify(data.position);
    
    // Create a record in Airtable
    const buildingId = `building-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const record = await new Promise((resolve, reject) => {
      base.create('BUILDINGS', {
        BuildingId: buildingId,
        Type: data.type,
        Land: data.land_id,
        Variant: data.variant || 'model',
        Position: positionString,
        Rotation: data.rotation || 0,
        User: data.walletAddress,
        CreatedAt: data.created_at || new Date().toISOString(),
        Cost: data.cost || 0
      }, function(err, record) {
        if (err) {
          console.error('Error creating record in Airtable:', err);
          reject(err);
          return;
        }
        resolve(record);
      });
    });
    
    // Transform the Airtable record to our format
    const typedRecord = record as any;
    const building = {
      id: buildingId,
      type: typedRecord.fields.Type,
      land_id: typedRecord.fields.Land,
      variant: typedRecord.fields.Variant || 'model',
      position: JSON.parse(typedRecord.fields.Position),
      rotation: typedRecord.fields.Rotation || 0,
      owner: typedRecord.fields.User,
      created_at: typedRecord.fields.CreatedAt,
      cost: typedRecord.fields.Cost || 0
    };
    
    return NextResponse.json({ 
      success: true, 
      building,
      message: 'Building created successfully'
    });
  } catch (error) {
    console.error('Error creating building at point:', error);
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
