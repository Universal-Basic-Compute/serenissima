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
    // const { searchParams } = new URL(request.url); // Owner filter removed
    
    console.log(`Loading all resources`);
    
    // Query Airtable directly
    const records = await new Promise((resolve, reject) => {
      const allRecords: any[] = [];
      
      base('RESOURCES')
        .select({
          // filterByFormula: filterFormula || '', // Owner filter removed
          view: 'Grid view' // Ensure all necessary fields like AssetType, AssetId are in this view
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
    
    // Transform Airtable records
    const outputResources = (records as any[]).map(record => {
      const outputRecord: Record<string, any> = {};
      
      // Populate with camelCased fields from Airtable
      if (record.fields) {
        for (const airtableKey in record.fields) {
          if (Object.prototype.hasOwnProperty.call(record.fields, airtableKey)) {
            const camelKey = airtableKey.charAt(0).toLowerCase() + airtableKey.slice(1);
            outputRecord[camelKey] = record.fields[airtableKey];
          }
        }
      }
      
      // Set the primary ID
      outputRecord.id = record.get('ResourceId') || record.id;
      
      // Initialize position
      outputRecord.position = {};
      
      // Parse position if AssetType is 'building'
      const assetType = record.get('AssetType');
      const assetId = record.get('AssetId');
      
      if (assetType === 'building' && assetId && typeof assetId === 'string') {
        const parts = assetId.split('_');
        // Expecting format like "building_LAT_LNG" or "prefix_LAT_LNG"
        // Using parts[1] for lat and parts[2] for lng based on parseBuildingId example
        if (parts.length >= 3) {
          const lat = parseFloat(parts[1]);
          const lng = parseFloat(parts[2]);
          
          if (!isNaN(lat) && !isNaN(lng)) {
            outputRecord.position = { lat, lng };
            // console.log(`Parsed position from AssetId ${assetId} for building:`, outputRecord.position);
          } else {
            // console.warn(`Could not parse lat/lng from AssetId ${assetId}`);
          }
        } else {
          // console.warn(`AssetId ${assetId} does not have enough parts to parse lat/lng`);
        }
      }
      
      return outputRecord;
    });
    
    console.log(`Returning ${outputResources.length} resources.`);
    
    return NextResponse.json(outputResources);
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
