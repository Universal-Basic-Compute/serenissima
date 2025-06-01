import { NextResponse } from 'next/server';
import Airtable from 'airtable';
import { buildingPointsService } from '@/lib/services/BuildingPointsService';

// Helper to escape single quotes for Airtable formulas
function escapeAirtableValue(value: string): string {
  if (typeof value !== 'string') {
    return String(value); // Should ideally be string, but safeguard
  }
  return value.replace(/'/g, "\\'");
}

// Helper to convert a string to PascalCase
// Handles snake_case, camelCase, and kebab-case
const stringToPascalCase = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/([-_][a-z])/ig, ($1) => $1.toUpperCase().replace('-', '').replace('_', ''))
    .replace(/^(.)/, ($1) => $1.toUpperCase());
};

// Helper function to convert all keys of an object to PascalCase (shallow)
const keysToPascalCase = (obj: Record<string, any>): Record<string, any> => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [stringToPascalCase(key), value])
  );
};

// Utility function to convert field names to camelCase
function toCamelCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      // Convert first character to lowercase for the new key
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      result[camelKey] = obj[key];
    }
  }
  
  return result;
}

// Helper function to format building name
function formatBuildingName(type: string | null | undefined): string {
  if (!type) {
    return 'Unnamed Building'; // Default name if type is not provided
  }
  return type
    .replace(/_/g, ' ') // Replace underscores with spaces
    .toLowerCase() // Convert whole string to lowercase first to handle mixed cases like "WOOD_mill"
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize first letter of each word
    .join(' ');
}

// Configure Airtable
const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;

// Initialize Airtable base
const base = new Airtable({ apiKey, requestTimeout: 30000 }).base(baseId);

export async function POST(request: Request) {
  try {
    const rawData = await request.json();
    const pascalData = keysToPascalCase(rawData); // Convert incoming keys to PascalCase
    
    // Enhanced validation with more detailed error messages
    // Use rawData for type normalization as it's expected to be lowercase
    if (!rawData.type) {
      return NextResponse.json(
        { success: false, error: 'Building type is required' },
        { status: 400 }
      );
    }
    
    if (!pascalData.LandId) {
      return NextResponse.json(
        { success: false, error: 'Land ID (landId) is required' },
        { status: 400 }
      );
    }
    
    // Check if pointId is provided (original key: pointId, now pascalData.PointId)
    const pointId = pascalData.PointId;
    
    // Ensure position is properly formatted if provided (original key: position, now pascalData.Position)
    let position = pascalData.Position;
    
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
    
    // Log the received data for debugging (using pascalData to show what's being processed)
    console.log('Creating building with processed (PascalCase keys) data:', JSON.stringify({
      ...pascalData, // Spread pascalData
      Position: position // Use the potentially parsed position
    }, null, 2));
    
    // Normalize the building type from rawData.type to snake_case
    const normalizedType = rawData.type.toLowerCase()
      .replace(/[\s'-]+/g, '_') // Replace spaces, apostrophes, hyphens with a single underscore
      .replace(/_+/g, '_');    // Collapse multiple underscores to one
    
    // Create a record in Airtable using keys from pascalData
    const buildingData: any = {
      BuildingId: pascalData.Id || `building-${Date.now()}-${Math.floor(Math.random() * 10000)}`, // from data.id
      Type: normalizedType, // from rawData.type
      LandId: pascalData.LandId, // from data.landId
      Variant: pascalData.Variant || 'model', // from data.variant
      Rotation: pascalData.Rotation || 0, // from data.rotation
      Owner: pascalData.Owner || pascalData.CreatedBy || 'system', // from data.owner or data.createdBy
      CreatedAt: pascalData.CreatedAt || new Date().toISOString(), // from data.createdAt
      LeasePrice: pascalData.LeasePrice || 0, // from data.leasePrice
      RentPrice: pascalData.RentPrice || 0, // from data.rentPrice
      Occupant: pascalData.Occupant || '' // from data.occupant
    };
    
    // If pointId (derived from pascalData.PointId) is provided, store it in the Point field
    if (pointId) {
      buildingData.Point = pointId;
    }
    
    // Always store position in Position field
    if (position) {
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
        LandId: string; // Changed from Land to LandId
        Variant?: string;
        Position?: string;
        Point?: string;
        Notes?: string;
        Rotation?: number;
        Owner: string; // Changed from Citizen to Owner
        CreatedAt: string;
        LeasePrice?: number;
        RentPrice?: number;
        Occupant?: string;
      };
    }

    // Transform the Airtable record to our format
    const typedRecord = record as AirtableRecord;
    
    // Get position from Position field
    let recordPosition = null;
    if (typedRecord.fields.Position) {
      try {
        recordPosition = JSON.parse(typedRecord.fields.Position);
      } catch (e) {
        console.error('Error parsing Position JSON:', e);
      }
    }
    
    const building = {
      id: typedRecord.fields.BuildingId,
      type: typedRecord.fields.Type,
      landId: typedRecord.fields.LandId, // Changed from land_id
      variant: typedRecord.fields.Variant || 'model',
      position: recordPosition,
      pointId: typedRecord.fields.Point || null, // Changed from point_id
      rotation: typedRecord.fields.Rotation || 0,
      owner: typedRecord.fields.Owner,
      createdAt: typedRecord.fields.CreatedAt, // Changed from created_at
      leasePrice: typedRecord.fields.LeasePrice, // Changed from lease_price
      rentPrice: typedRecord.fields.RentPrice, // Changed from rent_price
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
      console.log('[API Buildings GET] Loading building points service from API...');
      await buildingPointsService.loadBuildingPoints();
      console.log('[API Buildings GET] Building points service loaded successfully');
    }
    
    // Debug the building points status
    // buildingPointsService.debugPointsStatus(); // Optional: can be noisy
    
    const url = new URL(request.url);
    // Client-requested limit and offset for the API response
    const clientLimitParam = url.searchParams.get('limit');
    const clientOffsetParam = url.searchParams.get('offset');

    // Parse client limit and offset. clientLimit is undefined if not provided by client.
    const clientLimit = clientLimitParam ? parseInt(clientLimitParam) : undefined;
    const clientOffset = clientOffsetParam ? parseInt(clientOffsetParam) : 0;
    
    const loggableFilters: Record<string, string> = {};
    const formulaParts: string[] = [];
    const reservedParams = ['limit', 'offset']; // Parameters handled by pagination logic, not for filtering

    for (const [key, value] of url.searchParams.entries()) {
      if (reservedParams.includes(key.toLowerCase())) {
        continue;
      }

      const airtableField = stringToPascalCase(key); // Convert query key to PascalCase
      loggableFilters[airtableField] = value;

      let processedValue = value;
      // Normalize the 'Type' field value to match snake_case storage format
      if (airtableField === 'Type') {
        processedValue = value.toLowerCase()
          .replace(/[\s'-]+/g, '_') // Replace spaces, apostrophes, hyphens with a single underscore
          .replace(/_+/g, '_');    // Collapse multiple underscores to one
        
        if (value !== processedValue) {
          console.log(`Normalized 'Type' query value from '${value}' to '${processedValue}' (snake_case)`);
        }
      }

      // Attempt to parse as number
      const numValue = parseFloat(processedValue);
      if (!isNaN(numValue) && isFinite(numValue) && numValue.toString() === processedValue) {
        formulaParts.push(`{${airtableField}} = ${processedValue}`);
      } else if (processedValue.toLowerCase() === 'true') {
        formulaParts.push(`{${airtableField}} = TRUE()`);
      } else if (processedValue.toLowerCase() === 'false') {
        formulaParts.push(`{${airtableField}} = FALSE()`);
      } else {
        // Default to string if not clearly numeric or boolean
        formulaParts.push(`{${airtableField}} = '${escapeAirtableValue(processedValue)}'`);
      }
    }
    
    console.log('%c GET /api/buildings request received', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    console.log('Query parameters:', { filters: loggableFilters, limit: clientLimit, offset: clientOffset });
    
    // Check if Airtable configuration is available
    if (!apiKey || !baseId) {
      console.warn('%c Airtable configuration missing, returning debug buildings only', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
      return NextResponse.json({ 
        buildings: [], // Return empty array as fallback
        message: 'Using debug buildings (Airtable configuration missing)'
      });
    }
    
    let records;
    
    try {
      // Fetch ALL records from Airtable matching the filter
      const allAirtableRecords = await new Promise<Airtable.Record<Airtable.FieldSet>[]>((resolve, reject) => {
        const accumulatedRecords: Airtable.Record<Airtable.FieldSet>[] = [];
        
        const selectParams: Airtable.SelectOptions<Airtable.FieldSet> = {
          fields: [
            'BuildingId', 'Type', 'LandId', 'LeasePrice', 'Variant', 
            'Owner', 'Position', 'Point', 'Rotation', 'CreatedAt', 
            'RentPrice', 'Occupant', 'IsConstructed', 'Category', 'RunBy',
            'Wages', 'Name' // Added Name here
          ],
          // filterByFormula is now constructed dynamically
          view: 'Grid view',
          // DO NOT set maxRecords or offset here; eachPage handles fetching all pages.
        };

        if (formulaParts.length > 0) {
          selectParams.filterByFormula = `AND(${formulaParts.join(', ')})`;
          console.log('Applying Airtable filter formula:', selectParams.filterByFormula);
        }
        
        base('BUILDINGS')
          .select(selectParams)
          .eachPage(
            function page(pageRecords, fetchNextPage) {
              accumulatedRecords.push(...pageRecords);
              fetchNextPage(); // Fetch the next page
            },
            function done(err) {
              if (err) {
                console.error('Error fetching all pages from Airtable:', err);
                reject(err);
                return;
              }
              resolve(accumulatedRecords); // Resolve with all accumulated records
            }
          );
      });

      // Apply client-side pagination (limit/offset) to the full list of records fetched from Airtable
      let paginatedAirtableRecords = allAirtableRecords;
      if (clientOffset > 0) {
        paginatedAirtableRecords = paginatedAirtableRecords.slice(clientOffset);
      }
      if (clientLimit !== undefined) { // clientLimit can be 0
        paginatedAirtableRecords = paginatedAirtableRecords.slice(0, clientLimit);
      }
      
      records = paginatedAirtableRecords; // Use the paginated list for further processing

    } catch (airtableError) {
      // Log the specific Airtable error
      console.error('Error fetching from Airtable:', airtableError);
      console.warn('Falling back to debug buildings due to Airtable error');
      
      // Return debug buildings as fallback
      return NextResponse.json({ 
        buildings: [], // Return empty array as fallback
        message: 'Using debug buildings (Airtable error)'
      });
    }
    
    // Define the Airtable record type with all the required fields
    interface AirtableRecord {
      id: string;
      fields: {
        BuildingId?: string;
        Type: string;
        LandId: string; // Changed from Land to LandId
        LeasePrice?: number;
        Variant?: string;
        Owner: string; // Changed from Citizen to Owner
        Position?: string | {
          lat?: number;
          lng?: number;
          x?: number;
          y?: number;
          z?: number;
        };
        Point?: string;
        Rotation?: number;
        CreatedAt: string;
        RentPrice?: number;
        Occupant?: string;
        IsConstructed?: boolean | number; // Added
        [key: string]: any; // Allow for other fields
      };
    }
    
    // Create a type-safe wrapper for Airtable records
    interface TypedAirtableRecord {
      id: string;
      fields: Record<string, any>; // Use 'any' to avoid index type errors
      get(columnName: string): any;
    }
    
    // Ensure records is properly typed
    const typedRecords = records as unknown as TypedAirtableRecord[];

    // Define the Building interface for consistent typing
    // This interface is defined above now.

    // Transform Airtable records to our format
    const extractStringFromArrayField = (fieldValue: any): string | null => {
      let potentialString: any = null;
      if (Array.isArray(fieldValue) && fieldValue.length > 0) {
        potentialString = fieldValue[0];
      } else if (typeof fieldValue === 'string') {
        potentialString = fieldValue;
      }

      if (typeof potentialString === 'string') {
        const trimmed = potentialString.trim();
        return trimmed === '' ? null : trimmed; // Return null if string is empty after trim
      }
      return null; // Default to null if not a non-empty string
    };

    const buildings = typedRecords.map(record => {
      const airtableFields = record.fields; // Original fields from Airtable
      // Get all fields and convert keys to camelCase
      const fields = toCamelCase(airtableFields);

      // Helper function to resolve point ID to coordinates
      function resolvePointIdToCoords(pointId: string): { lat: number, lng: number } | null {
        let p = buildingPointsService.getPositionForPoint(pointId);
        if (p && typeof p.lat === 'number' && typeof p.lng === 'number') {
          return p;
        }

        const parts = pointId.split('_');
        let latNum: number | undefined, lngNum: number | undefined;

        if (parts.length === 3) { // "prefix_lat_lng"
          latNum = parseFloat(parts[1]);
          lngNum = parseFloat(parts[2]);
        } else if (parts.length === 2) { // "lat_lng"
          latNum = parseFloat(parts[0]);
          lngNum = parseFloat(parts[1]);
        }

        if (latNum !== undefined && lngNum !== undefined && !isNaN(latNum) && !isNaN(lngNum)) {
          return { lat: latNum, lng: lngNum };
        }
        
        // console.warn(`[API Buildings GET] Record ID ${record.id} - Could not resolve point ID '${pointId}' to coordinates.`);
        return null;
      }
      
      // Initialize position object
      let position = null;
      // 1. Determine position from fields.position (Airtable 'Position' field)
      if (fields.position) {
        if (typeof fields.position === 'string') {
          try {
            const parsed = JSON.parse(fields.position);
            if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
              position = parsed;
            }
          } catch (e) { console.warn(`[API Buildings GET] Record ID ${record.id} - Failed to parse Position string: ${fields.position}`); }
        } else if (fields.position && typeof (fields.position as any).lat === 'number' && typeof (fields.position as any).lng === 'number') {
          position = fields.position as { lat: number, lng: number }; // Already a valid object
        }
      }

      // 2. Process pointFieldValue to outputPointValue (for the 'point' field in response)
      // This does NOT influence the 'position' variable.
      const pointFieldValue = fields.point;
      let outputPointValue: any = pointFieldValue; // Default to original value (can be string, array, null, etc.)

      if (typeof pointFieldValue === 'string') {
        if (pointFieldValue.startsWith('[') && pointFieldValue.endsWith(']')) {
          try {
            const parsedJson = JSON.parse(pointFieldValue);
            // If parsing is successful and results in an array, use the parsed array.
            // Otherwise, outputPointValue remains the original string.
            if (Array.isArray(parsedJson)) { 
              outputPointValue = parsedJson;
              // console.log(`[API Buildings GET] Record ID ${record.id} - Successfully parsed Point string as JSON array.`);
            } else {
              // console.warn(`[API Buildings GET] Record ID ${record.id} - Point string '${pointFieldValue}' parsed to non-array. Keeping original string.`);
            }
          } catch (e) {
            // console.error(`[API Buildings GET] Record ID ${record.id} - JSON.parse failed for Point string '${pointFieldValue}'. Keeping original string. Error: ${(e as Error).message}`);
            // If parsing fails, outputPointValue remains the original string.
          }
        }
        // If pointFieldValue is a string but not array-like (e.g. "point_123"), outputPointValue remains pointFieldValue.
      } 
      // If pointFieldValue is already an array (from Airtable lookup), null, or undefined, 
      // outputPointValue is already correctly set to pointFieldValue.

      // Calculate building size based on the final outputPointValue
      const buildingSize = Array.isArray(outputPointValue) ? outputPointValue.length : 1;

      // 3. If outputPointValue (from Airtable 'Point' field) is an array of 2-4 point IDs, 
      //    try to calculate centroid for position. This will override position from 'fields.position'.
      if (Array.isArray(outputPointValue) && 
          outputPointValue.length >= 2 && 
          outputPointValue.length <= 4 &&
          outputPointValue.every(item => typeof item === 'string')) {
        
        const resolvedCoords = (outputPointValue as string[])
          .map(id => resolvePointIdToCoords(id))
          .filter(coord => coord !== null) as { lat: number, lng: number }[];

        if (resolvedCoords.length === outputPointValue.length) { // All points in the array were resolved
          let sumLat = 0;
          let sumLng = 0;
          resolvedCoords.forEach(coord => {
            sumLat += coord.lat;
            sumLng += coord.lng;
          });
          position = { 
            lat: sumLat / resolvedCoords.length, 
            lng: sumLng / resolvedCoords.length 
          };
          // console.log(`[API Buildings GET] Record ID ${record.id} - Position updated to centroid of ${resolvedCoords.length} points from 'point' field.`);
        } else {
          // console.warn(`[API Buildings GET] Record ID ${record.id} - Not all point IDs in 'point' field could be resolved. Count: ${resolvedCoords.length}/${outputPointValue.length}. Position not updated from 'point' field.`);
        }
      }
      
      // 4. Ultimate fallback if no position could be determined from either 'fields.position' or 'fields.point'
      if (!position) {
        position = { lat: 45.4371, lng: 12.3358 }; // Default Venice center
      }
      
      // Ensure position is in lat/lng format (already handled by above logic, this is a safeguard)
      if (position && 'x' in position && 'z' in position && !('lat' in position)) {
        // Convert from Three.js coordinates to lat/lng
        const bounds = {
          centerLat: 45.4371,
          centerLng: 12.3358,
          scale: 100000,
          latCorrectionFactor: 0.7
        };
            
        const positionZ = position.z as number;
        const positionX = position.x as number;
        position = {
          lat: bounds.centerLat + (-(positionZ) / bounds.scale / bounds.latCorrectionFactor),
          lng: bounds.centerLng + ((positionX) / bounds.scale)
        };
      }

      const isConstructedValue = airtableFields.IsConstructed;
      
      // Return all fields from the record in camelCase, with position properly handled
      return {
        ...fields,
        // Override specific fields that need special handling
        id: fields.buildingId || record.id, // This is the custom BuildingId or Airtable record ID
        type: fields.type,
        landId: fields.landId,
        owner: extractStringFromArrayField(fields.owner),
        occupant: extractStringFromArrayField(fields.occupant),
        category: fields.category, // Assuming category is a direct string or already handled if it's a lookup
        runBy: extractStringFromArrayField(fields.runBy),
        position: position,
        point: outputPointValue, // Use the potentially parsed point value
        size: buildingSize, 
        // Include other important fields that might be directly accessed by services
        name: fields.name || formatBuildingName(fields.type), // Prioritize Airtable's 'Name' field (fields.name), then format 'type'
        rentPrice: fields.rentPrice, // Assuming numeric or null
        leasePrice: fields.leasePrice, // Assuming numeric or null
        variant: fields.variant, // Assuming string or null
        rotation: fields.rotation, // Assuming numeric or null
        createdAt: fields.createdAt, // Assuming string (date)
        isConstructed: isConstructedValue === 1 || isConstructedValue === true, // Defaults to false if undefined, 0, or false
      };
    });
    
    console.log(`%c Retrieved ${buildings.length} buildings from Airtable`, 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    
    // Log each building for debugging
    buildings.forEach((building, index) => {
      //console.log(`%c Building ${index + 1}:`, 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;', building);
    });
    
    // Add more detailed logging about the buildings being returned
    console.log(`%c BUILDINGS API: Returning ${buildings.length} total buildings to client`, 'background: #FF5500; color: white; padding: 4px 8px; font-weight: bold; border-radius: 4px;');

    // Log a breakdown of building types
    const buildingTypeCount = buildings.reduce((acc, building: any) => {
      // Add type checking to handle buildings that might not have a type property
      const buildingType = building.type || 'unknown';
      acc[buildingType] = (acc[buildingType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log('%c BUILDINGS API: Building types breakdown:', 'background: #FF5500; color: white; padding: 4px 8px; font-weight: bold; border-radius: 4px;');
    console.table(buildingTypeCount);

    // Log position format statistics
    const positionStats = {
      total: buildings.length,
      withPosition: 0,
      withLatLng: 0,
      withXYZ: 0,
      withoutPosition: 0
    };

    buildings.forEach(building => {
      if (!building.position) {
        positionStats.withoutPosition++;
        return;
      }
      
      positionStats.withPosition++;
      
      if (typeof building.position === 'object') {
        if ('lat' in building.position && 'lng' in building.position) {
          positionStats.withLatLng++;
        } else if ('x' in building.position) {
          positionStats.withXYZ++;
        }
      }
    });

    console.log('%c BUILDINGS API: Position format statistics:', 'background: #FF5500; color: white; padding: 4px 8px; font-weight: bold; border-radius: 4px;');
    console.table(positionStats);
      
    // Only add debug buildings in development mode if there are no buildings from Airtable
    // if (process.env.NODE_ENV === 'development' && buildings.length === 0) {
    //   console.log('%c No buildings found from Airtable, adding debug buildings for development', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    //   buildings.push(getDebugBuildings()[0] as any); // Example: add one debug building
    // }
    
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
    
    return NextResponse.json({ 
      success: false,
      error: 'Failed to fetch buildings',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// Helper function to provide debug buildings - REMOVED
// function getDebugBuildings() { ... }
