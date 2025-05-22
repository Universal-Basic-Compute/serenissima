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
      const resourceId = record.get('ResourceId');
      
      // Skip if we've already processed this ResourceId
      if (resourceMap.has(resourceId)) {
        console.warn(`Duplicate ResourceId found in Airtable: ${resourceId}`);
        return;
      }
      
      let position: { lat: number, lng: number } | {} = {}; // Default to an empty object
      const assetType = record.get('AssetType');
      const assetId = record.get('AssetId');

      if (assetType === 'building' && assetId) {
        const parts = String(assetId).split('_');
        if (parts.length >= 3) {
          const potentialLngStr = parts[parts.length - 1];
          const potentialLatStr = parts[parts.length - 2];
          const potentialLat = parseFloat(potentialLatStr);
          const potentialLng = parseFloat(potentialLngStr);

          if (!isNaN(potentialLat) && !isNaN(potentialLng)) {
            position = { lat: potentialLat, lng: potentialLng };
            console.log(`Parsed position from AssetId ${assetId} for building:`, position);
          }
        }
        // If position is still empty (parsing AssetId failed), try the Position field
        if (Object.keys(position).length === 0) {
          try {
            const posField = record.get('Position');
            if (posField) position = JSON.parse(posField);
          } catch (e) {
            console.warn(`Invalid Position JSON for building resource ${resourceId} (AssetId: ${assetId}):`, record.get('Position'), e);
          }
        }
      } else if (assetType === 'Citizen' && assetId && citizenPositionsMap.has(assetId)) {
        position = citizenPositionsMap.get(assetId)!;
        console.log(`Using fetched position for citizen asset ${assetId}:`, position);
      } else {
        // Fallback for other types or if specific logic failed
        try {
          const posField = record.get('Position');
          if (posField) position = JSON.parse(posField);
        } catch (e) {
          console.warn(`Invalid Position JSON for resource ${resourceId}:`, record.get('Position'), e);
        }
      }
      
      // Ensure position is an object, even if empty
      if (typeof position !== 'object' || position === null) {
        position = {};
      }
      
      // Get icon field or use default
      const icon = record.get('Icon') || 'default.png';
      
      resourceMap.set(resourceId, {
        id: resourceId,
        type: record.get('Type'),
        name: record.get('Name') || record.get('Type'), // Use Type as fallback for Name
        category: record.get('Category') || 'raw_materials', // Default category
        subcategory: record.get('Subcategory') || '', // Add subcategory
        position: position,
        count: record.get('Count') || 1,
        landId: record.get('LandId') || '',
        owner: record.get('Owner') || 'system',
        createdAt: record.get('CreatedAt') || new Date().toISOString(),
        // Add a standardized icon field
        icon: icon, // Use the icon from Airtable or default
        description: record.get('Description') || '', // Add description field
        rarity: record.get('Rarity') || 'common' // Add rarity field
      });
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
    
    // Validate category
    if (!data.category) {
      // Try to determine category from type
      const resourceType = data.type.toLowerCase();
      
      if (resourceType.includes('wood') || resourceType.includes('stone') || 
          resourceType.includes('ore') || resourceType.includes('clay')) {
        data.category = 'raw_materials';
      } else if (resourceType.includes('food') || resourceType.includes('fish') || 
                resourceType.includes('fruit') || resourceType.includes('grain')) {
        data.category = 'food';
      } else if (resourceType.includes('cloth') || resourceType.includes('fabric') || 
                resourceType.includes('textile')) {
        data.category = 'textiles';
      } else if (resourceType.includes('spice') || resourceType.includes('pepper') || 
                resourceType.includes('salt')) {
        data.category = 'spices';
      } else if (resourceType.includes('tool') || resourceType.includes('hammer') || 
                resourceType.includes('saw')) {
        data.category = 'tools';
      } else if (resourceType.includes('brick') || resourceType.includes('timber') || 
                resourceType.includes('nail')) {
        data.category = 'building_materials';
      } else if (resourceType.includes('gold') || resourceType.includes('silver') || 
                resourceType.includes('gem') || resourceType.includes('silk')) {
        data.category = 'luxury_goods';
      } else {
        data.category = 'unknown';
      }
      
      console.log(`Assigned category ${data.category} to resource type ${data.type}`);
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
    const resource = {
      id: typedRecord.fields.ResourceId,
      type: typedRecord.fields.Type,
      name: typedRecord.fields.Name,
      category: typedRecord.fields.Category,
      position: JSON.parse(typedRecord.fields.Position),
      count: typedRecord.fields.Count,
      landId: typedRecord.fields.LandId,
      owner: typedRecord.fields.Owner,
      createdAt: typedRecord.fields.CreatedAt
    };
    
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
