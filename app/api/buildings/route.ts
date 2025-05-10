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
    
    // Ensure position is properly formatted
    let position = data.position;
    
    // If position is missing, return an error
    if (!position) {
      return NextResponse.json(
        { success: false, error: 'Position is required' },
        { status: 400 }
      );
    }
    
    // If position is a string, try to parse it
    if (typeof position === 'string') {
      try {
        position = JSON.parse(position);
      } catch (error) {
        return NextResponse.json(
          { success: false, error: 'Invalid position format - could not parse JSON string' },
          { status: 400 }
        );
      }
    }
    
    // Validate that position has required properties
    if (typeof position !== 'object' || 
        (position.lat === undefined && position.x === undefined) || 
        (position.lng === undefined && position.z === undefined)) {
      return NextResponse.json(
        { success: false, error: 'Position must have either lat/lng or x/y/z coordinates' },
        { status: 400 }
      );
    }
    
    // Log the received data for debugging
    console.log('Creating building with data:', JSON.stringify({
      ...data,
      position: position
    }, null, 2));
    
    // Create a record in Airtable - ensure position is stored as a string
    const record = await new Promise((resolve, reject) => {
      base('Buildings').create({
        BuildingId: data.id || `building-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        Type: data.type,
        Land: data.land_id,
        Variant: data.variant || 'model',
        Position: JSON.stringify(position), // Always stringify to ensure consistent format
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
    
    // Define the Airtable record type
    interface AirtableRecord {
      id: string;
      fields: {
        BuildingId: string;
        Type: string;
        Land: string;
        Variant?: string;
        Position: string;
        Rotation?: number;
        User: string;
        CreatedAt: string;
      };
    }

    // Transform the Airtable record to our format
    const typedRecord = record as AirtableRecord;
    const building = {
      id: typedRecord.fields.BuildingId,
      type: typedRecord.fields.Type,
      land_id: typedRecord.fields.Land,
      variant: typedRecord.fields.Variant || 'model',
      position: JSON.parse(typedRecord.fields.Position), // Parse back to object
      rotation: typedRecord.fields.Rotation || 0,
      owner: typedRecord.fields.User,
      created_at: typedRecord.fields.CreatedAt
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
    const records = await new Promise<any[]>((resolve, reject) => {
      const allRecords = [];
      
      base('Buildings')
        .select({
          // Add filters if type is specified
          filterByFormula: type ? `{Type} = '${type}'` : '',
          view: 'Grid view',
          maxRecords: 1000 // Increased from 100 to allow more buildings to be loaded
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
    
    // Define the Airtable record type
    interface AirtableRecord {
      id: string;
      fields: {
        BuildingId?: string;
        Type: string;
        Land: string;
        Variant?: string;
        Position: any;
        Rotation?: number;
        User: string;
        CreatedAt: string;
      };
    }

    // Define the Building interface for consistent typing
    interface Building {
      id: string;
      type: string;
      land_id: string;
      variant: string;
      position: any;
      rotation: number;
      owner: string;
      created_at: string;
    }

    // Transform Airtable records to our format
    const buildings = (records as AirtableRecord[]).map(record => {
      const fields = record.fields;
      
      // Parse position JSON if it's a string
      let position = fields.Position;
      if (typeof position === 'string') {
        try {
          position = JSON.parse(position);
          console.log(`[API] Building ${fields.BuildingId || record.id} parsed position:`, position);
        } catch (error) {
          console.error('[API] Error parsing position JSON:', error);
          console.error('[API] Original position string:', position);
          
          // Instead of using a default position, generate a random lat/lng position
          // This ensures each building has unique coordinates
          position = { 
            lat: 45.4371 + (Math.random() * 0.01 - 0.005), // Random lat near Venice center
            lng: 12.3358 + (Math.random() * 0.01 - 0.005)  // Random lng near Venice center
          };
          console.log(`[API] Generated random position for ${fields.BuildingId || record.id}:`, position);
        }
      }
      
      // Check if position has lat/lng format
      if (position && typeof position === 'object') {
        if (position.lat !== undefined && position.lng !== undefined) {
          console.log(`[API] Building ${fields.BuildingId || record.id} has lat/lng position:`, position);
        } else {
          console.warn(`[API] Building ${fields.BuildingId || record.id} does NOT have lat/lng position:`, position);
        }
      }
      
      // Ensure position has all required properties
      if (!position || typeof position !== 'object') {
        // Generate a random lat/lng position instead of using default x/y/z
        position = { 
          lat: 45.4371 + (Math.random() * 0.01 - 0.005), 
          lng: 12.3358 + (Math.random() * 0.01 - 0.005)
        };
      } 
      // If position has x/y/z format but not lat/lng, convert to lat/lng
      else if (position.x !== undefined && position.z !== undefined && position.lat === undefined) {
        // Convert from Three.js coordinates back to lat/lng
        const bounds = {
          centerLat: 45.4371,
          centerLng: 12.3358,
          scale: 100000,
          latCorrectionFactor: 0.7
        };
            
        // Reverse the conversion formula - this is the inverse of normalizeCoordinates
        const lat = bounds.centerLat + (-position.z / bounds.scale / bounds.latCorrectionFactor);
        const lng = bounds.centerLng + (position.x / bounds.scale);
            
        position = {
          lat: parseFloat(lat.toFixed(10)),
          lng: parseFloat(lng.toFixed(10))
        };
            
        console.log(`[API] Converted x/y/z position to lat/lng for building ${fields.BuildingId || record.id}:`, position);
      }
      // Ensure lat/lng values are parsed as floats with full precision
      else if (position.lat !== undefined && position.lng !== undefined) {
        position = {
          lat: parseFloat(position.lat.toString()),
          lng: parseFloat(position.lng.toString())
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
    const debugBuilding1: Building = {
      id: 'building_1',
      type: 'market-stall',
      land_id: 'polygon-1746052711032',
      position: { 
        lat: 45.4371, 
        lng: 12.3358
      },
      rotation: 0,
      variant: 'model',
      owner: 'ConsiglioDeiDieci',
      created_at: '2025-05-10T02:07:00Z'
    };
      
    const debugBuilding2: Building = {
      id: 'building_2',
      type: 'market-stall',
      land_id: 'polygon-1746052711033',
      position: { 
        lat: 45.4375, 
        lng: 12.3368
      },
      rotation: Math.PI / 4, // 45 degrees rotation
      variant: 'model',
      owner: 'ConsiglioDeiDieci',
      created_at: '2025-05-10T02:07:00Z'
    };
      
    const debugBuilding3: Building = {
      id: 'building_3',
      type: 'market-stall',
      land_id: 'polygon-1746052711034',
      position: { 
        lat: 45.4365, 
        lng: 12.3348
      },
      rotation: Math.PI / 2, // 90 degrees rotation
      variant: 'model',
      owner: 'ConsiglioDeiDieci',
      created_at: '2025-05-10T02:07:00Z'
    };
      
    // Add a fourth building at a different position
    const debugBuilding4: Building = {
      id: 'building_4',
      type: 'market-stall',
      land_id: 'polygon-1746052711035',
      position: { 
        lat: 45.4380, 
        lng: 12.3378
      },
      rotation: Math.PI, // 180 degrees rotation
      variant: 'model',
      owner: 'ConsiglioDeiDieci',
      created_at: '2025-05-10T02:07:00Z'
    };
      
    console.log('Adding debug buildings');
      
    // Add a fifth building with lat/lng coordinates instead of x/y/z
    const debugBuilding5: Building = {
      id: 'building_5',
      type: 'house',
      land_id: 'polygon-1746052711036',
      position: { 
        lat: 45.4368, 
        lng: 12.3362
      },
      rotation: 0,
      variant: 'model',
      owner: 'ConsiglioDeiDieci',
      created_at: '2025-05-10T02:07:00Z'
    };
    
    // Add the debug buildings to the beginning of the array to ensure they're processed first
    buildings.unshift(debugBuilding1);
    buildings.unshift(debugBuilding2);
    buildings.unshift(debugBuilding3);
    buildings.unshift(debugBuilding4);
    buildings.unshift(debugBuilding5);
    
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
