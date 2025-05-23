import { NextResponse } from 'next/server';
// import { loadAllResources } from '@/lib/utils/serverResourceUtils'; // Not used
import Airtable from 'airtable';

// Define an interface for resource type definitions
interface ResourceTypeDefinition {
  id: string;
  name: string;
  category: string;
  subcategory?: string | null;
  tier?: number | null; // Added tier
  description?: string;
  importPrice?: number;
  lifetimeHours?: number | null;
  consumptionHours?: number | null;
  // Add any other fields that come from /api/resource-types
}

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

    // Fetch all resource type definitions for enrichment
    let resourceTypeDefinitions: Map<string, ResourceTypeDefinition> = new Map();
    try {
      const resourceTypesResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/resource-types`);
      if (resourceTypesResponse.ok) {
        const resourceTypesData = await resourceTypesResponse.json();
        if (resourceTypesData.success && resourceTypesData.resourceTypes) {
          (resourceTypesData.resourceTypes as ResourceTypeDefinition[]).forEach(def => {
            resourceTypeDefinitions.set(def.id, def);
          });
          console.log(`Successfully fetched ${resourceTypeDefinitions.size} resource type definitions for enrichment.`);
        }
      } else {
        console.warn(`Failed to fetch resource type definitions: ${resourceTypesResponse.status}`);
      }
    } catch (e) {
      console.error('Error fetching resource type definitions:', e);
    }
    
    // Build filter formula for Airtable query
    let filterFormula = '';
    if (owner) {
      // Ensure owner value is properly escaped for Airtable formula
      const escapedOwner = owner.replace(/'/g, "\\'");
      filterFormula = `{Owner} = '${escapedOwner}'`;
      console.log(`Filtering resources by owner: ${escapedOwner}`);
    }
    
    // Query Airtable directly
    const records = await new Promise((resolve, reject) => {
      const allRecords: any[] = [];
      
      base('RESOURCES')
        .select({
          filterByFormula: filterFormula, // Apply filter if owner is specified
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

      // Enrich with data from resource type definitions
      const resourceType = outputRecord.type || record.get('Type'); // type is camelCased 'Type'
      if (resourceType && resourceTypeDefinitions.has(resourceType)) {
        const definition = resourceTypeDefinitions.get(resourceType)!;
        outputRecord.name = outputRecord.name || definition.name;
        outputRecord.category = outputRecord.category || definition.category;
        outputRecord.subcategory = outputRecord.subcategory || definition.subcategory;
        outputRecord.tier = outputRecord.tier ?? definition.tier; // Added tier
        outputRecord.description = outputRecord.description || definition.description;
        outputRecord.importPrice = outputRecord.importPrice ?? definition.importPrice;
        outputRecord.lifetimeHours = outputRecord.lifetimeHours ?? definition.lifetimeHours;
        outputRecord.consumptionHours = outputRecord.consumptionHours ?? definition.consumptionHours;
      }
      
      // Initialize position
      outputRecord.position = {};
      
      // Parse position if AssetType is 'building'
      const assetType = record.get('AssetType');
      const assetValue = record.get('Asset'); // Changed from AssetId to Asset
      
      // If AssetType is 'building', the 'Asset' field should contain the BuildingId (e.g. building_lat_lng_variant)
      // The 'Position' field on the RESOURCES table itself should ideally store the parsed JSON coordinates.
      // However, if we must parse from 'Asset' field for buildings:
      if (assetType === 'building' && assetValue && typeof assetValue === 'string') {
        // Attempt to parse from the 'Position' field of the resource record first
        const resourcePositionStr = record.get('Position');
        if (resourcePositionStr && typeof resourcePositionStr === 'string') {
            try {
                const parsedPos = JSON.parse(resourcePositionStr);
                if (parsedPos && typeof parsedPos.lat === 'number' && typeof parsedPos.lng === 'number') {
                    outputRecord.position = parsedPos;
                }
            } catch (e) {
                // console.warn(`Could not parse Position JSON string: ${resourcePositionStr} for resource ${outputRecord.id}`);
            }
        }

        // Fallback to parsing from Asset field if position is still empty
        if (Object.keys(outputRecord.position).length === 0) {
            const parts = assetValue.split('_');
            if (parts.length >= 3) {
              const lat = parseFloat(parts[1]);
              const lng = parseFloat(parts[2]);
              
              if (!isNaN(lat) && !isNaN(lng)) {
                outputRecord.position = { lat, lng };
                // console.log(`Parsed position from Asset field ${assetValue} for building:`, outputRecord.position);
              } else {
                // console.warn(`Could not parse lat/lng from Asset field ${assetValue}`);
              }
            } else {
              // console.warn(`Asset field ${assetValue} does not have enough parts to parse lat/lng`);
            }
        }
      } else if (assetType === 'citizen') {
        // For citizens, try to get their position from the CITIZENS table if needed,
        // or expect the 'Position' field on the RESOURCES table to be populated.
        const resourcePositionStr = record.get('Position');
         if (resourcePositionStr && typeof resourcePositionStr === 'string') {
            try {
                const parsedPos = JSON.parse(resourcePositionStr);
                 if (parsedPos && typeof parsedPos.lat === 'number' && typeof parsedPos.lng === 'number') {
                    outputRecord.position = parsedPos;
                }
            } catch (e) {
                // console.warn(`Could not parse Position JSON string for citizen resource: ${resourcePositionStr}`);
            }
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

    // Fetch resource type definition for defaults
    let definition: ResourceTypeDefinition | undefined;
    if (data.type) {
      try {
        const resTypeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/resource-types`);
        if (resTypeResponse.ok) {
          const resTypesData = await resTypeResponse.json();
          if (resTypesData.success && resTypesData.resourceTypes) {
            definition = (resTypesData.resourceTypes as ResourceTypeDefinition[]).find(rt => rt.id === data.type);
          }
        }
      } catch (e) {
        console.warn(`Could not fetch definition for resource type ${data.type}: ${e}`);
      }
    }
    
    // Create a record in Airtable - ensure position is stored as a string
    const airtablePayload: Record<string, any> = {
      ResourceId: data.id, // Custom ID for the resource stack
      Type: data.type,
      Name: data.name || definition?.name || data.type,
      Category: data.category || definition?.category || 'unknown',
      Subcategory: data.subcategory || definition?.subcategory || null,
      Tier: data.tier ?? definition?.tier ?? null, // Added Tier for Airtable
      Description: data.description || definition?.description || '',
      Position: JSON.stringify(position), // Position of the resource itself
      Count: data.count || 1,
      Asset: data.asset || '', // BuildingId, Username, or LandId depending on AssetType
      AssetType: data.assetType || 'unknown', // 'building', 'citizen', 'land'
      Owner: data.owner || 'system',
      CreatedAt: data.createdAt || new Date().toISOString()
      // ImportPrice, LifetimeHours, ConsumptionHours could also be added here if they should be stored on instance
    };
    
    const record = await new Promise((resolve, reject) => {
      base('RESOURCES').create(airtablePayload, function(err, record) {
        if (err) {
          console.error('Error creating resource in Airtable:', err, 'Payload:', airtablePayload);
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
        Subcategory?: string | null;
        Tier?: number | null; // Added Tier
        Description?: string;
        Position: string;
        Count: number;
        Asset: string;      // Renamed from LandId, more generic
        AssetType: string;  // Added AssetType
        Owner: string;
        CreatedAt: string;
        // Potentially ImportPrice, LifetimeHours, ConsumptionHours if stored
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
    
    const resourceResponse = {
      ...processedFieldsPost, // Spread all camelCased fields
      id: typedRecord.fields.ResourceId, 
      position: JSON.parse(typedRecord.fields.Position || '{}'),
      // Ensure defaults from definition if not set by Airtable fields directly
      name: processedFieldsPost.name || definition?.name || typedRecord.fields.Type,
      category: processedFieldsPost.category || definition?.category || 'unknown',
      subcategory: processedFieldsPost.subcategory || definition?.subcategory || null,
      tier: processedFieldsPost.tier ?? definition?.tier ?? null, // Added tier
      description: processedFieldsPost.description || definition?.description || '',
      importPrice: processedFieldsPost.importPrice ?? definition?.importPrice,
      lifetimeHours: processedFieldsPost.lifetimeHours ?? definition?.lifetimeHours,
      consumptionHours: processedFieldsPost.consumptionHours ?? definition?.consumptionHours,
    };
    
    console.log('Successfully created resource in Airtable:', resourceResponse);
    
    // Return the created resource with success flag
    return NextResponse.json({ 
      success: true, 
      resource: resourceResponse,
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
