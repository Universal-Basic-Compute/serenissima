import { NextResponse } from 'next/server';
import { loadAllResources } from '@/lib/utils/serverResourceUtils';
import Airtable from 'airtable';

// Configure Airtable
const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;

// Initialize Airtable base
const base = new Airtable({ apiKey }).base(baseId);

export async function GET(request: Request) {
  try {
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get('owner');
    
    console.log(`Loading resources${owner ? ` for owner: ${owner}` : ' (all)'}`);
    
    // Build filter formula for Airtable query
    let filterFormula = '';
    if (owner) {
      filterFormula = `{Owner} = '${owner}'`;
      console.log(`Filtering resources by owner: ${owner}`);
    }
    
    // Query Airtable directly
    const records = await new Promise((resolve, reject) => {
      const allRecords: any[] = [];
      
      base('RESOURCES')
        .select({
          filterByFormula: filterFormula || '',
          view: 'Grid view' // Ensure all necessary fields like AssetType, AssetId, Position are in this view or fetched explicitly
        })
        .eachPage(
          function page(records, fetchNextPage) {
            records.forEach(record => {
              allRecords.push(record);
            });
            fetchNextPage();
          },
          function done(err) {
            if (err) {
              console.error('Error fetching resources from Airtable:', err);
              reject(err);
              return;
            }
            resolve(allRecords);
          }
        );
    });

    // --- Enhanced Position Logic ---
    const citizenAssetIds: string[] = [];
    (records as any[]).forEach(record => {
      const assetType = record.get('AssetType');
      if (assetType === 'Citizen') {
        const assetId = record.get('AssetId');
        if (assetId) {
          citizenAssetIds.push(assetId);
        }
      }
    });

    let citizenPositionsMap: Map<string, { lat: number, lng: number }> = new Map();
    if (citizenAssetIds.length > 0) {
      console.log(`Fetching positions for ${citizenAssetIds.length} citizen assets.`);
      const uniqueCitizenAssetIds = [...new Set(citizenAssetIds)]; // Ensure unique IDs
      const citizenFilterFormula = `OR(${uniqueCitizenAssetIds.map(id => `{Username} = '${id.replace(/'/g, "\\'")}'`).join(',')})`;
      
      try {
        const citizenRecords = await new Promise((resolve, reject) => {
          const allCitizenRecords: any[] = [];
          base('CITIZENS') // Assuming the table is named CITIZENS
            .select({
              filterByFormula: citizenFilterFormula,
              fields: ['Username', 'Position'] // Assuming AssetId maps to Username
            })
            .eachPage(
              function page(records, fetchNextPage) {
                records.forEach(record => {
                  allCitizenRecords.push(record);
                });
                fetchNextPage();
              },
              function done(err) {
                if (err) { reject(err); return; }
                resolve(allCitizenRecords);
              }
            );
        });

        (citizenRecords as any[]).forEach(citizenRecord => {
          const citizenId = citizenRecord.get('Username');
          const positionString = citizenRecord.get('Position');
          if (citizenId && positionString) {
            try {
              const parsedPosition = JSON.parse(positionString);
              if (parsedPosition && typeof parsedPosition.lat === 'number' && typeof parsedPosition.lng === 'number') {
                citizenPositionsMap.set(citizenId, { lat: parsedPosition.lat, lng: parsedPosition.lng });
              } else {
                console.warn(`Citizen ${citizenId} has invalid position data:`, parsedPosition);
              }
            } catch (e) {
              console.warn(`Invalid position JSON for citizen ${citizenId}: ${positionString}`, e);
            }
          }
        });
        console.log(`Fetched positions for ${citizenPositionsMap.size} citizens.`);
      } catch (citizenError) {
        console.error('Error fetching citizen positions from Airtable:', citizenError);
      }
    }
    // --- End of Enhanced Position Logic ---
    
    // Transform Airtable records to our resource format
    const resourceMap = new Map(); // Use a Map to deduplicate by ResourceId
    
    (records as any[]).forEach(record => {
      const airtableResourceId = record.get('ResourceId'); // Renamed to avoid conflict in scope
      
      // Skip if we've already processed this ResourceId
      if (resourceMap.has(airtableResourceId)) {
        console.warn(`Duplicate ResourceId found in Airtable: ${airtableResourceId}`);
        return;
      }

      // Initialize with all fields from Airtable, keys converted to camelCase
      const processedFields: Record<string, any> = {};
      if (record.fields) {
        for (const airtableKey in record.fields) {
          if (Object.prototype.hasOwnProperty.call(record.fields, airtableKey)) {
            const camelKey = airtableKey.charAt(0).toLowerCase() + airtableKey.slice(1);
            processedFields[camelKey] = record.fields[airtableKey];
          }
        }
      }
      
      let finalPosition: { lat: number, lng: number } | {} = {}; // Default to an empty object
      const assetType = record.get('AssetType'); // Original Airtable field name for logic
      const assetId = record.get('AssetId'); // Original Airtable field name for logic

      if (assetType === 'building' && assetId) {
        const parts = String(assetId).split('_');
        if (parts.length >= 3) {
          const potentialLngStr = parts[parts.length - 1];
          const potentialLatStr = parts[parts.length - 2];
          const potentialLat = parseFloat(potentialLatStr);
          const potentialLng = parseFloat(potentialLngStr);

          if (!isNaN(potentialLat) && !isNaN(potentialLng)) {
            finalPosition = { lat: potentialLat, lng: potentialLng };
            console.log(`Parsed position from AssetId ${assetId} for building:`, finalPosition);
          }
        }
        if (Object.keys(finalPosition).length === 0) {
          try {
            const posField = record.get('Position'); // Original Airtable field name
            if (posField) finalPosition = JSON.parse(posField);
          } catch (e) {
            console.warn(`Invalid Position JSON for building resource ${airtableResourceId} (AssetId: ${assetId}):`, record.get('Position'), e);
          }
        }
      } else if (assetType === 'Citizen' && assetId && citizenPositionsMap.has(assetId)) {
        finalPosition = citizenPositionsMap.get(assetId)!;
        console.log(`Using fetched position for citizen asset ${assetId}:`, finalPosition);
      } else {
        try {
          const posField = record.get('Position'); // Original Airtable field name
          if (posField) finalPosition = JSON.parse(posField);
        } catch (e) {
          console.warn(`Invalid Position JSON for resource ${airtableResourceId}:`, record.get('Position'), e);
        }
      }
      
      if (typeof finalPosition !== 'object' || finalPosition === null) {
        finalPosition = {};
      }
      
      const finalResource = {
        ...processedFields, // Spread all camelCased fields
        id: airtableResourceId, // Explicitly set/override id using ResourceId from Airtable
        position: finalPosition, // Explicitly set/override position
      };

      // Apply defaults for fields that might be missing or need specific fallbacks
      // These use the camelCased keys from finalResource (which came from processedFields)
      finalResource.name = finalResource.name || finalResource.type;
      finalResource.category = finalResource.category || 'raw_materials';
      finalResource.subcategory = finalResource.subcategory || '';
      finalResource.count = typeof finalResource.count === 'undefined' ? 1 : finalResource.count;
      finalResource.landId = finalResource.landId || '';
      finalResource.owner = finalResource.owner || 'system';
      finalResource.createdAt = finalResource.createdAt || new Date().toISOString();
      finalResource.icon = finalResource.icon || (finalResource.type ? `${String(finalResource.type).toLowerCase().replace(/\s+/g, '_')}.png` : 'default.png');
      finalResource.description = finalResource.description || '';
      finalResource.rarity = finalResource.rarity || 'common';
      
      resourceMap.set(airtableResourceId, finalResource);
    });
    
    // Convert Map to array
    const resources = Array.from(resourceMap.values());
    
    // Type assertion for records to ensure TypeScript knows it's an array
    const recordsArray = records as any[];
    console.log(`Returning ${resources.length} unique resources (from ${recordsArray.length} total records)`);
    
    return NextResponse.json(resources);
  } catch (error) {
    console.error('Error loading resources:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to load resources',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.id) {
      return NextResponse.json(
        { success: false, error: 'Resource ID is required' },
        { status: 400 }
      );
    }
    
    if (!data.type) {
      return NextResponse.json(
        { success: false, error: 'Resource type is required' },
        { status: 400 }
      );
    }
    
    if (!data.position) {
      return NextResponse.json(
        { success: false, error: 'Position is required' },
        { status: 400 }
      );
    }
    
    // Ensure position is properly formatted
    let position = data.position;
    
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
    console.log('Creating resource with data:', JSON.stringify({
      ...data,
      position: position
    }, null, 2));
    
    // Create a record in Airtable - ensure position is stored as a string
    const record = await new Promise((resolve, reject) => {
      base('RESOURCES').create({
        ResourceId: data.id,
        Type: data.type,
        Name: data.name || data.type,
        Category: data.category || 'unknown',
        Position: JSON.stringify(position),
        Count: data.count || 1,
        LandId: data.landId || '',
        Owner: data.owner || 'system',
        CreatedAt: data.createdAt || new Date().toISOString()
      }, function(err, record) {
        if (err) {
          console.error('Error creating resource in Airtable:', err);
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
        ResourceId: string;
        Type: string;
        Name: string;
        Category: string;
        Position: string;
        Count: number;
        LandId: string;
        Owner: string;
        CreatedAt: string;
      };
    }

    // Transform the Airtable record to our format
    const typedRecord = record as AirtableRecord;

    const processedFieldsPost: Record<string, any> = {};
    if (typedRecord.fields) {
      for (const airtableKey in typedRecord.fields) {
        if (Object.prototype.hasOwnProperty.call(typedRecord.fields, airtableKey)) {
          const camelKey = airtableKey.charAt(0).toLowerCase() + airtableKey.slice(1);
          processedFieldsPost[camelKey] = typedRecord.fields[airtableKey];
        }
      }
    }

    const resource = {
      ...processedFieldsPost, // Spread all camelCased fields
      // Ensure 'id' is from 'ResourceId' and 'position' is parsed JSON
      id: typedRecord.fields.ResourceId, 
      position: JSON.parse(typedRecord.fields.Position || '{}') 
    };
    
    // Apply defaults if necessary, similar to GET, though for POST, most fields should be defined by input data
    resource.name = resource.name || resource.type;
    resource.category = resource.category || 'unknown'; // Default from POST logic if not set
    // resource.count, resource.landId, resource.owner, resource.createdAt should come from POST data or Airtable

    console.log('Successfully created resource in Airtable:', resource);
    
    // Return the created resource with success flag
    return NextResponse.json({ 
      success: true, 
      resource,
      message: 'Resource created successfully'
    });
  } catch (error) {
    console.error('Error creating resource:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create resource', 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
