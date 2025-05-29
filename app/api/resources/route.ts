import { NextResponse } from 'next/server';
// import { loadAllResources } from '@/lib/utils/serverResourceUtils'; // Not used
import Airtable from 'airtable';

// Define an interface for resource type definitions
interface ResourceTypeDefinition {
  id: string;
  name: string;
  category: string;
  subCategory?: string | null;
  tier?: number | null; // Added tier
  description?: string;
  importPrice?: number;
  lifetimeHours?: number | null;
  consumptionHours?: number | null;
  icon?: string | null; // Added icon property
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
          view: 'Grid view' // Ensure all necessary fields like AssetType, Asset are in this view
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
            if (camelKey === 'description') {
              outputRecord[camelKey] = String(record.fields[airtableKey] || ''); // Ensure description is a string
            } else {
              outputRecord[camelKey] = record.fields[airtableKey];
            }
          }
        }
      }
      
      // Set the primary ID
      outputRecord.id = record.get('ResourceId') || record.id;

      // Enrich with data from resource type definitions
      const resourceType = outputRecord.type || record.get('Type'); // type is camelCased 'Type'
      if (resourceType && resourceTypeDefinitions.has(resourceType)) {
        const definition = resourceTypeDefinitions.get(resourceType)!;
        outputRecord.name = String(outputRecord.name || definition.name || resourceType);
        outputRecord.category = String(outputRecord.category || definition.category || 'Unknown');
        outputRecord.subCategory = String(outputRecord.subCategory || definition.subCategory || '');
        outputRecord.tier = outputRecord.tier ?? definition.tier ?? null;
        outputRecord.description = String(outputRecord.description || definition.description || '');
        outputRecord.importPrice = outputRecord.importPrice ?? definition.importPrice ?? 0;
        outputRecord.lifetimeHours = outputRecord.lifetimeHours ?? definition.lifetimeHours ?? null;
        outputRecord.consumptionHours = outputRecord.consumptionHours ?? definition.consumptionHours ?? null;
        outputRecord.icon = definition.icon || record.get('Icon') || `${String(resourceType || 'default').toLowerCase().replace(/\s+/g, '_')}.png`; // Prioritize definition.icon
      } else {
        // Ensure essential fields have default string values if no definition found
        outputRecord.name = String(outputRecord.name || resourceType || 'Unknown Resource');
        outputRecord.category = String(outputRecord.category || 'Unknown');
        outputRecord.description = String(outputRecord.description || '');
      }
      
      // Initialize position
      // Initialize location (renamed from position for clarity with service expectation)
      outputRecord.location = null; 
      
      const assetType = record.get('AssetType');
      const assetValue = record.get('Asset');
      const resourcePositionStr = record.get('Position') as string | undefined;

      // 1. Try to use the explicit 'Position' field from the RESOURCES table
      if (resourcePositionStr && typeof resourcePositionStr === 'string') {
          try {
              const parsedPos = JSON.parse(resourcePositionStr);
              if (parsedPos && typeof parsedPos.lat === 'number' && typeof parsedPos.lng === 'number') {
                  outputRecord.location = parsedPos;
                  // console.log(`Resource ${outputRecord.id}: Used explicit Position field: ${JSON.stringify(outputRecord.location)}`);
              }
          } catch (e) {
              // console.warn(`Resource ${outputRecord.id}: Could not parse Position JSON string: ${resourcePositionStr}`);
          }
      }

      // 2. If location is still not set, and AssetType is 'building', try to derive from Asset (BuildingId)
      if (!outputRecord.location && assetType === 'building' && assetValue && typeof assetValue === 'string') {
          const parts = assetValue.split('_'); // e.g., "building_45.123_12.456" or "building_45.123_12.456_idx"
          if (parts.length >= 3) {
            const lat = parseFloat(parts[1]);
            const lng = parseFloat(parts[2]);
            if (!isNaN(lat) && !isNaN(lng)) {
              outputRecord.location = { lat, lng };
              // console.log(`Resource ${outputRecord.id}: Derived location from Asset (BuildingId) ${assetValue}: ${JSON.stringify(outputRecord.location)}`);
            } else {
              // console.warn(`Resource ${outputRecord.id}: Could not parse lat/lng from Asset (BuildingId) ${assetValue}`);
            }
          } else {
            // console.warn(`Resource ${outputRecord.id}: Asset (BuildingId) ${assetValue} does not have enough parts to parse lat/lng.`);
          }
      }
      
      // 3. If location is still not set, and AssetType is 'citizen' (TODO: fetch citizen's current position)
      // For now, if it's a citizen and no explicit position, location remains null.
      // A more robust solution would be to fetch the citizen's current position from the CITIZENS table.
      // This is deferred due to the complexity of adding another async call here per resource.
      // Ensure `RESOURCES.Position` is populated for citizen-held items for best results.
      if (!outputRecord.location && assetType === 'citizen') {
        // console.warn(`Resource ${outputRecord.id}: AssetType is citizen, but no explicit Position. Location will be null. Consider populating RESOURCES.Position or enhancing API to fetch citizen location.`);
      }
      
      // Remove the old 'position' field if it exists, to avoid confusion
      delete outputRecord.position;

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
      // Category: data.category || definition?.category || 'unknown', // Removed Category
      // SubCategory: data.subCategory || definition?.subCategory || null, // Removed SubCategory
      // Tier: data.tier ?? definition?.tier ?? null, // Removed Tier
      Description: data.description || definition?.description || '',
      // Position: JSON.stringify(position), // Position of the resource itself - REMOVED
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
        SubCategory?: string | null;
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
      subCategory: processedFieldsPost.subCategory || definition?.subCategory || null,
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
