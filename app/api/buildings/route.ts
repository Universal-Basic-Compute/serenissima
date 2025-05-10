import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;

// Initialize Airtable base
const base = new Airtable({ apiKey }).base(baseId);

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
    
    // Create a record in Airtable
    const record = await new Promise((resolve, reject) => {
      base('Buildings').create({
        BuildingId: data.id || `building-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        Type: data.type,
        Land: data.land_id,
        Variant: data.variant || 'model',
        Position: JSON.stringify(data.position),
        Rotation: data.rotation || 0,
        User: data.owner || data.created_by || 'system',
        CreatedAt: data.created_at || new Date().toISOString()
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
    const building = {
      id: record.fields.BuildingId,
      type: record.fields.Type,
      land_id: record.fields.Land,
      variant: record.fields.Variant || 'model',
      position: JSON.parse(record.fields.Position),
      rotation: record.fields.Rotation || 0,
      owner: record.fields.User,
      created_at: record.fields.CreatedAt
    };
    
    console.log('Successfully created building in Airtable:', building);
    
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
    
    // Fetch records from Airtable
    const records = await new Promise((resolve, reject) => {
      const allRecords = [];
      
      base('Buildings')
        .select({
          // Add filters if type is specified
          filterByFormula: type ? `{Type} = '${type}'` : '',
          view: 'Grid view',
          maxRecords: 100
        })
        .eachPage(
          function page(records, fetchNextPage) {
            allRecords.push(...records);
            fetchNextPage();
          },
          function done(err) {
            if (err) {
              console.error('Error fetching from Airtable:', err);
              reject(err);
              return;
            }
            resolve(allRecords);
          }
        );
    });
    
    // Transform Airtable records to our format
    const buildings = records.map(record => {
      const fields = record.fields;
      
      // Parse position JSON if it's a string
      let position = fields.Position;
      if (typeof position === 'string') {
        try {
          position = JSON.parse(position);
        } catch (error) {
          console.error('Error parsing position JSON:', error);
          position = { x: 45, y: 5, z: 12 }; // Default position with better visibility
        }
      }
      
      // Ensure position has all required properties
      if (!position || typeof position !== 'object') {
        position = { x: 45, y: 5, z: 12 };
      } else {
        position = {
          x: position.x !== undefined ? Number(position.x) : 45,
          y: position.y !== undefined ? Number(position.y) : 5,
          z: position.z !== undefined ? Number(position.z) : 12
        };
      }
      
      return {
        id: fields.BuildingId || record.id,
        type: fields.Type,
        land_id: fields.Land,
        variant: fields.Variant || 'model',
        position: position,
        rotation: fields.Rotation || 0,
        owner: fields.User,
        created_at: fields.CreatedAt
      };
    });
    
    console.log(`Retrieved ${buildings.length} buildings from Airtable`);
    
    // Log each building for debugging
    buildings.forEach((building, index) => {
      console.log(`Building ${index + 1}:`, building);
    });
    
    // Always add debug buildings to ensure we have something visible
    console.log('Adding debug buildings regardless of Airtable data');
      
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
      connection_points: [], // Add empty connection points array to fix type error
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
      connection_points: [], // Add empty connection points array to fix type error
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
      connection_points: [], // Add empty connection points array to fix type error
      created_by: 'ConsiglioDeiDieci',
      created_at: '2025-05-10T02:07:00Z'
    };
      
    // Add a fourth building at a different position
    const debugBuilding4 = {
      id: 'building_4',
      type: 'market-stall',
      land_id: 'polygon-1746052711035',
      position: { 
        x: 25, 
        y: 10, // Higher position for better visibility
        z: 25
      },
      rotation: Math.PI, // 180 degrees rotation
      connection_points: [], // Add empty connection points array to fix type error
      created_by: 'ConsiglioDeiDieci',
      created_at: '2025-05-10T02:07:00Z'
    };
      
    console.log('Adding debug buildings');
      
    // Add the debug buildings to the beginning of the array to ensure they're processed first
    buildings.unshift(debugBuilding1);
    buildings.unshift(debugBuilding2);
    buildings.unshift(debugBuilding3);
    buildings.unshift(debugBuilding4);
    
    // Set cache headers to allow browsers to cache the response for a short time
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
    
    return new NextResponse(JSON.stringify({ buildings }), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Error fetching buildings:', error);
    console.error('Stack trace:', error.stack);
    return NextResponse.json(
      { error: 'Failed to fetch buildings', details: error.message },
      { status: 500 }
    );
  }
}
