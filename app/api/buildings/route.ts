import { NextResponse } from 'next/server';
import Airtable from 'airtable';
import { buildingPointsService } from '@/lib/services/BuildingPointsService';

// Helper function to extract coordinates from point IDs with the format type_lat_lng
const extractCoordinatesFromPointId = (pointId: string): { lat: number, lng: number } | null => {
  if (!pointId) return null;
  
  // Check for the pattern: type_lat_lng (building_45.440864_12.335067, dock_45.428839_12.316503, etc.)
  const parts = pointId.split('_');
  if (parts.length >= 3) {
    // The format should be: [type, lat, lng]
    const lat = parseFloat(parts[1]);
    const lng = parseFloat(parts[2]);
    
    if (!isNaN(lat) && !isNaN(lng)) {
      console.log(`Extracted coordinates from point ID ${pointId}: lat=${lat}, lng=${lng}`);
      return { lat, lng };
    }
  }
  
  return null;
};

// Helper function to extract coordinates from point IDs with the format type_lat_lng
const extractCoordinatesFromPointId = (pointId: string): { lat: number, lng: number } | null => {
  if (!pointId) return null;
  
  // Check for the pattern: type_lat_lng (building_45.440864_12.335067, dock_45.428839_12.316503, etc.)
  const parts = pointId.split('_');
  if (parts.length >= 3) {
    // The format should be: [type, lat, lng]
    const lat = parseFloat(parts[1]);
    const lng = parseFloat(parts[2]);
    
    if (!isNaN(lat) && !isNaN(lng)) {
      console.log(`Extracted coordinates from point ID ${pointId}: lat=${lat}, lng=${lng}`);
      return { lat, lng };
    }
  }
  
  return null;
};

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
    
    // Check if point_id is provided
    const pointId = data.point_id;
    
    // Ensure position is properly formatted if provided
    let position = data.position;
    
    // If neither position nor point_id is provided, return an error
    if (!position && !pointId) {
      return NextResponse.json(
        { success: false, error: 'Either position or point_id is required' },
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
    
    // Normalize the building type
    const normalizedType = data.type.toLowerCase()
      .replace(/'/g, '-') // Replace apostrophes with hyphens
      .replace(/\s+/g, '-'); // Replace spaces with hyphens
    
    // Create a record in Airtable
    const buildingData: any = {
      BuildingId: data.id || `building-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      Type: normalizedType,
      Land: data.land_id,
      Variant: data.variant || 'model',
      Rotation: data.rotation || 0,
      User: data.owner || data.created_by || 'system',
      CreatedAt: data.created_at || new Date().toISOString(),
      LeaseAmount: data.lease_amount || 0,
      RentAmount: data.rent_amount || 0,
      Occupant: data.occupant || ''
    };
    
    // If point_id is provided, store it in the Point field
    if (pointId) {
      buildingData.Point = pointId;
      
      // Store position in Notes as JSON if available
      if (position) {
        buildingData.Notes = JSON.stringify({ position });
      }
    } else {
      // If no point_id, store position in Position field (legacy format)
      buildingData.Position = JSON.stringify(position);
    }
    
    const record = await new Promise((resolve, reject) => {
      base('BUILDINGS').create(buildingData, function(err, record) {
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
        Position?: string;
        Point?: string;
        Notes?: string;
        Rotation?: number;
        User: string;
        CreatedAt: string;
        LeaseAmount?: number;
        RentAmount?: number;
        Occupant?: string;
      };
    }

    // Transform the Airtable record to our format
    const typedRecord = record as AirtableRecord;
    
    // Try to get position from Notes field first (new format)
    let recordPosition = null;
    if (typedRecord.fields.Notes) {
      try {
        const notes = JSON.parse(typedRecord.fields.Notes);
        if (notes.position) {
          recordPosition = notes.position;
        }
      } catch (e) {
        // If Notes isn't valid JSON, continue to next method
      }
    }
    
    // If position not found in Notes, try Position field (old format)
    if (!recordPosition && typedRecord.fields.Position) {
      try {
        recordPosition = JSON.parse(typedRecord.fields.Position);
      } catch (e) {
        console.error('Error parsing Position JSON:', e);
      }
    }
    
    const building = {
      id: typedRecord.fields.BuildingId,
      type: typedRecord.fields.Type,
      land_id: typedRecord.fields.Land,
      variant: typedRecord.fields.Variant || 'model',
      position: recordPosition,
      point_id: typedRecord.fields.Point || null, // Include point_id in response
      rotation: typedRecord.fields.Rotation || 0,
      owner: typedRecord.fields.User,
      created_at: typedRecord.fields.CreatedAt,
      lease_amount: typedRecord.fields.LeaseAmount,
      rent_amount: typedRecord.fields.RentAmount,
      occupant: typedRecord.fields.Occupant
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
    // Ensure building points are loaded
    if (!buildingPointsService.isPointsLoaded()) {
      console.log('Loading building points service from API...');
      await buildingPointsService.loadBuildingPoints();
      console.log('Building points service loaded successfully');
    }
    
    // Debug the building points status
    buildingPointsService.debugPointsStatus();
    
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')) : 1000; // Increased from 100 to 1000 buildings
    const offsetParam = url.searchParams.get('offset');
    const offset = offsetParam ? parseInt(offsetParam) : 0;
    
    console.log('%c GET /api/buildings request received', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    console.log('Query parameters:', { type, limit, offset: offsetParam });
    
    // Check if Airtable configuration is available
    if (!apiKey || !baseId) {
      console.warn('%c Airtable configuration missing, returning debug buildings only', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
      return NextResponse.json({ 
        buildings: getDebugBuildings(),
        message: 'Using debug buildings (Airtable configuration missing)'
      });
    }
    
    let records;
    
    try {
      // Fetch records from Airtable with pagination
      records = await new Promise<Airtable.Records<Airtable.FieldSet>>((resolve, reject) => {
        const allRecords = [];
        
        // For Airtable, offset should be a string token, not a number
        // If it's a number, we'll treat it as a page number and fetch all records up to that point
        const isNumericOffset = offset !== undefined && !isNaN(offset);
        const pageSize = limit;
        
        // Create the select parameters
        const selectParams: any = {
          // Add filters if type is specified
          filterByFormula: type ? `{Type} = '${type}'` : '',
          view: 'Grid view',
          maxRecords: isNumericOffset ? offset + limit : limit
        };
        
        // Only add offset if it's a string token from Airtable
        if (offset !== undefined && !isNumericOffset) {
          selectParams.offset = offset;
        }
        
        base('BUILDINGS')
          .select(selectParams)
          .eachPage(
            function page(records, fetchNextPage) {
              allRecords.push(...records);
              
              // If we're using numeric offset, we need to check if we've fetched enough records
              if (isNumericOffset && allRecords.length >= offset + limit) {
                // We have enough records, don't fetch more
                resolve(allRecords.slice(offset, offset + limit));
              } else if (!isNumericOffset) {
                // We're using Airtable's offset token, just return what we got
                resolve(records);
              } else {
                // We need more records
                fetchNextPage();
              }
            },
            function done(err) {
              if (err) {
                console.error('Error fetching from Airtable:', err);
                reject(err);
                return;
              }
              
              // If we get here with numeric offset, we didn't get enough records
              if (isNumericOffset) {
                // Return what we have, sliced appropriately
                const startIndex = Math.min(offset, allRecords.length);
                const endIndex = Math.min(startIndex + limit, allRecords.length);
                resolve(allRecords.slice(startIndex, endIndex));
              } else {
                // We're using Airtable's offset token and reached the end
                resolve(allRecords);
              }
            }
          );
      });
    } catch (airtableError) {
      // Log the specific Airtable error
      console.error('Error fetching from Airtable:', airtableError);
      console.warn('Falling back to debug buildings due to Airtable error');
      
      // Return debug buildings as fallback
      return NextResponse.json({ 
        buildings: getDebugBuildings(),
        message: 'Using debug buildings (Airtable error)'
      });
    }
    
    // Define the Airtable record type with all the required fields
    interface AirtableRecord {
      id: string;
      fields: {
        BuildingId?: string;
        Type: string;
        Land: string;
        LeaseAmount?: number;
        Variant?: string;
        User: string;
        Position: string | {
          lat?: number;
          lng?: number;
          x?: number;
          y?: number;
          z?: number;
        };
        Rotation?: number;
        CreatedAt: string;
        RentAmount?: number;
        Occupant?: string;
        [key: string]: any; // Allow for other fields
      };
    }
    
    // Ensure records is properly typed
    const typedRecords = records as unknown as Airtable.Record<Airtable.FieldSet>[];

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
      lease_amount?: number;
      rent_amount?: number;
      occupant?: string;
    }

    // Transform Airtable records to our format
    const buildings = typedRecords.map(record => {
      const fields = record.fields;
      
      // Try to get position from Notes field first (new format)
      let position: { lat?: number; lng?: number; x?: number; y?: number; z?: number; } = {};
      
      if (fields.Notes) {
        try {
          const notes = JSON.parse(fields.Notes);
          if (notes.position) {
            position = notes.position;
            console.log(`[API] Building ${fields.BuildingId || record.id} has position in Notes:`, position);
          }
        } catch (e) {
          // If Notes isn't valid JSON, continue to next method
        }
      }
      
      // If position not found in Notes, try Position field (old format)
      if ((!position || Object.keys(position).length === 0) && fields.Position) {
        if (typeof fields.Position === 'string') {
          try {
            position = JSON.parse(fields.Position);
            console.log(`[API] Building ${fields.BuildingId || record.id} parsed position:`, position);
          } catch (error) {
            console.error('[API] Error parsing position JSON:', error);
            console.error('[API] Original position string:', fields.Position);
            
            // Instead of using a default position, generate a random lat/lng position
            // This ensures each building has unique coordinates
            position = { 
              lat: 45.4371 + (Math.random() * 0.01 - 0.005), // Random lat near Venice center
              lng: 12.3358 + (Math.random() * 0.01 - 0.005)  // Random lng near Venice center
            };
            console.log(`[API] Generated random position for ${fields.BuildingId || record.id}:`, position);
          }
        } else if (typeof fields.Position === 'object') {
          position = fields.Position as { lat?: number; lng?: number; x?: number; y?: number; z?: number; };
        }
      }
      
      // If we still don't have a position but we have a Point field, try to resolve it
      if ((!position || Object.keys(position).length === 0) && fields.Point) {
        const pointId = String(fields.Point);
        console.log(`[API] Building ${fields.BuildingId || record.id} has Point ID: ${pointId}, attempting to resolve position`);
            
        // First try to resolve using the buildingPointsService
        const resolvedPosition = buildingPointsService.getPositionForPoint(String(pointId));
            
        if (resolvedPosition) {
          position = resolvedPosition;
          console.log(`[API] Resolved position for Point ID ${pointId} using service:`, position);
        } else {
          // If service couldn't resolve, try to extract coordinates from the point ID directly
          const extractedPosition = extractCoordinatesFromPointId(String(pointId));
              
          if (extractedPosition) {
            position = extractedPosition;
            console.log(`[API] Extracted position from Point ID ${pointId}:`, position);
          } else {
            console.warn(`[API] Could not resolve position for Point ID ${pointId}, generating random position`);
            position = { 
              lat: 45.4371 + (Math.random() * 0.01 - 0.005),
              lng: 12.3358 + (Math.random() * 0.01 - 0.005)
            };
          }
        }
      }
      
      // Check if position has lat/lng format
      if (position && typeof position === 'object') {
        if ('lat' in position && 'lng' in position) {
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
        } as { lat: number; lng: number };
      } 
      // If position has x/y/z format but not lat/lng, convert to lat/lng
      else if ('x' in position && 'z' in position && !('lat' in position)) {
        // Convert from Three.js coordinates back to lat/lng
        const bounds = {
          centerLat: 45.4371,
          centerLng: 12.3358,
          scale: 100000,
          latCorrectionFactor: 0.7
        };
            
        // Reverse the conversion formula - this is the inverse of normalizeCoordinates
        const positionZ = position.z as number;
        const positionX = position.x as number;
        const lat = bounds.centerLat + (-(positionZ) / bounds.scale / bounds.latCorrectionFactor);
        const lng = bounds.centerLng + ((positionX) / bounds.scale);
            
        position = {
          lat: parseFloat(lat.toFixed(10)),
          lng: parseFloat(lng.toFixed(10))
        } as { lat: number; lng: number };
            
        console.log(`[API] Converted x/y/z position to lat/lng for building ${fields.BuildingId || record.id}:`, position);
      }
      // Ensure lat/lng values are parsed as floats with full precision
      else if ('lat' in position && 'lng' in position) {
        position = {
          lat: parseFloat(position.lat.toString()),
          lng: parseFloat(position.lng.toString())
        } as { lat: number; lng: number };
      }
      
      // Include all the required fields from the BUILDINGS table
      return {
        id: fields.BuildingId || record.id,
        type: fields.Type,
        land_id: fields.Land,
        variant: fields.Variant || 'model',
        position: position,
        point_id: fields.Point || null, // Include point_id in response
        rotation: fields.Rotation || 0,
        owner: fields.User,
        created_at: fields.CreatedAt,
        lease_amount: fields.LeaseAmount,
        rent_amount: fields.RentAmount,
        occupant: fields.Occupant
      };
    });
    
    console.log(`%c Retrieved ${buildings.length} buildings from Airtable`, 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    
    // Log each building for debugging
    buildings.forEach((building, index) => {
      console.log(`%c Building ${index + 1}:`, 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;', building);
    });
    
    // Always add debug buildings to ensure we have something visible
    console.log('%c Adding debug buildings regardless of Airtable data', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
      
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
      type: 'market-stall',
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
    
    // Only add debug buildings in development mode if there are no buildings from Airtable
    if (process.env.NODE_ENV === 'development' && buildings.length === 0) {
      console.log('%c No buildings found from Airtable, adding debug buildings for development', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
      buildings.push(debugBuilding1 as any);
    }
    
    // Set cache headers to allow browsers to cache the response for a short time
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
    
    return new NextResponse(JSON.stringify({ buildings }), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Error fetching buildings:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    
    // Return debug buildings as fallback even for general errors with yellow highlighting
    console.log('%c Using debug buildings (API error fallback)', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    return NextResponse.json({ 
      buildings: getDebugBuildings(),
      message: 'Using debug buildings (API error fallback)'
    }, { status: 200 }); // Return 200 instead of 500 to prevent client errors
  }
}

// Helper function to provide debug buildings
function getDebugBuildings() {
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
    
  // Add a fifth building with lat/lng coordinates
  const debugBuilding5: Building = {
    id: 'building_5',
    type: 'market-stall',
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
  
  return [debugBuilding1];
}
