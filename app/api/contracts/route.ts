import { NextResponse } from 'next/server';
// import Airtable from 'airtable'; // No longer directly using Airtable

// Helper to escape single quotes for Airtable formulas (still needed if constructing formulas for try-create, but less likely)
function escapeAirtableValue(value: string): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  return value.replace(/'/g, "\\'");
}

// Helper function to parse building coordinates from building ID (can be kept if needed for client-side display, but not for direct Airtable interaction here)
const parseBuildingCoordinates = (buildingId: string): {lat: number, lng: number} | null => {
  if (!buildingId) return null;
  const parts = buildingId.split('_');
  if (parts.length >= 3 && parts[0] === 'building') {
    const lat = parseFloat(parts[1]);
    const lng = parseFloat(parts[2]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }
  return null;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    
    // Initialize Airtable
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const CONTRACTS_TABLE = process.env.AIRTABLE_CONTRACTS_TABLE || 'CONTRACTS';
    
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { success: false, error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }
    
    const airtable = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    const contractsTable = airtable(CONTRACTS_TABLE);

    // Fetch all resource type definitions for enrichment
    let resourceTypeDefinitions: Map<string, any> = new Map();
    try {
      const resourceTypesResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/resource-types`);
      if (resourceTypesResponse.ok) {
        const resourceTypesData = await resourceTypesResponse.json();
        if (resourceTypesData.success && resourceTypesData.resourceTypes) {
          (resourceTypesData.resourceTypes as any[]).forEach(def => {
            resourceTypeDefinitions.set(def.id, def);
          });
          console.log(`Successfully fetched ${resourceTypeDefinitions.size} resource type definitions for contract enrichment.`);
        }
      } else {
        console.warn(`Failed to fetch resource type definitions for contracts: ${resourceTypesResponse.status}`);
      }
    } catch (e) {
      console.error('Error fetching resource type definitions for contracts:', e);
    }
    
    // Build the filter formula based on parameters
    const formulaParts: string[] = [];
    const loggableFilters: Record<string, string> = {};
    const reservedParams = ['limit', 'offset', 'sortField', 'sortDirection']; // Parameters handled by pagination/sorting logic

    for (const [key, value] of url.searchParams.entries()) {
      if (reservedParams.includes(key.toLowerCase())) {
        continue;
      }
      const airtableField = key; // Assuming query param key IS the Airtable field name
      loggableFilters[airtableField] = value;

      const numValue = parseFloat(value);
      if (!isNaN(numValue) && isFinite(numValue) && numValue.toString() === value) {
        formulaParts.push(`{${airtableField}} = ${value}`);
      } else if (value.toLowerCase() === 'true') {
        formulaParts.push(`{${airtableField}} = TRUE()`);
      } else if (value.toLowerCase() === 'false') {
        formulaParts.push(`{${airtableField}} = FALSE()`);
      } else {
        formulaParts.push(`{${airtableField}} = '${escapeAirtableValue(value)}'`);
      }
    }
    
    const filterByFormula = formulaParts.length > 0 ? `AND(${formulaParts.join(', ')})` : '';
    console.log('%c GET /api/contracts request received', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    console.log('Query parameters (filters):', loggableFilters);
    if (filterByFormula) {
      console.log('Applying Airtable filter formula:', filterByFormula);
    }
    
    // Query Airtable
    const records = await new Promise((resolve, reject) => {
      const allRecords: any[] = [];
      
      contractsTable
        .select({
          filterByFormula: filterByFormula,
          sort: [{ field: 'CreatedAt', direction: 'desc' }] 
        })
        .eachPage(
          (records, fetchNextPage) => {
            allRecords.push(...records);
            fetchNextPage();
          },
          (error) => {
            if (error) {
              reject(error);
            } else {
              resolve(allRecords);
            }
          }
        );
    });
    
    const contractsWithLocation = await Promise.all(
      (records as any[]).map(async (record) => {
        const resourceTypeId = record.get('ResourceType') || 'unknown';
        const resourceDef = resourceTypeDefinitions.get(resourceTypeId);
        const formattedResourceType = resourceTypeId.toLowerCase().replace(/\s+/g, '_');
        
        const contractData: Record<string, any> = {
          id: record.id,
          contractId: record.get('ContractId'),
          type: record.get('Type'),
          buyer: record.get('Buyer'),
          seller: record.get('Seller'),
          resourceType: resourceTypeId,
          resourceName: resourceDef?.name || resourceTypeId,
          resourceCategory: resourceDef?.category || 'Unknown',
          resourceSubCategory: resourceDef?.subCategory || null,
          resourceTier: resourceDef?.tier ?? null,
          resourceDescription: resourceDef?.description || '',
          resourceImportPrice: resourceDef?.importPrice ?? 0,
          resourceLifetimeHours: resourceDef?.lifetimeHours ?? null,
          resourceConsumptionHours: resourceDef?.consumptionHours ?? null,
          imageUrl: resourceDef?.icon ? `/resources/${resourceDef.icon}` : `/resources/${formattedResourceType}.png`,
          buyerBuilding: record.get('BuyerBuilding'),
          sellerBuilding: record.get('SellerBuilding'),
          price: record.get('PricePerResource'), 
          amount: record.get('TargetAmount'), 
          asset: record.get('Asset'), 
          assetType: record.get('AssetType'), 
          createdAt: record.get('CreatedAt'),
          endAt: record.get('EndAt'),
          status: record.get('Status') || 'active',
          notes: record.get('Notes'), 
          location: null
        };
        
        if (contractData.sellerBuilding) {
          const coordinates = parseBuildingCoordinates(contractData.sellerBuilding);
          if (coordinates) {
            contractData.location = coordinates;
          } else {
            try {
              const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
              const buildingUrl = new URL(`/api/buildings/${encodeURIComponent(contractData.sellerBuilding)}`, baseUrl);
              const buildingResponse = await fetch(buildingUrl.toString());
              if (buildingResponse.ok) {
                const buildingData = await buildingResponse.json();
                if (buildingData.building && buildingData.building.position) {
                  let position = typeof buildingData.building.position === 'string' 
                    ? JSON.parse(buildingData.building.position) 
                    : buildingData.building.position;
                  if (position.lat && position.lng) {
                    contractData.location = { lat: position.lat, lng: position.lng };
                  }
                }
              }
            } catch (e) {
              console.error('Error fetching building location:', e);
            }
          }
        }
        return contractData;
      })
    );
    
    console.log(`Processed ${contractsWithLocation.length} contracts, ${contractsWithLocation.filter(c => c.location).length} with location data`);
    
    return NextResponse.json({
      success: true,
      contracts: contractsWithLocation
    });
    
  } catch (error) {
    console.error('Error fetching contracts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch contracts' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('POST /api/contracts received body:', body);

    const {
      ContractId, 
      Type, 
      ResourceType,
      PricePerResource,
      Seller,
      SellerBuilding,
      TargetAmount,
      Status,
      Buyer,
      Notes,
      Asset, 
      AssetType, 
      targetMarketBuildingId, // Expect this for certain types if needed by Python
      targetOfficeBuildingId, // Expect this for certain types if needed by Python
      // ... other potential fields from body that might be activityParameters
    } = body;

    let activityType: string;
    let citizenUsername: string | undefined; 
    let activityParameters: Record<string, any> = { ...body }; // Start with all body params

    // --- Determine activityType and citizenUsername based on Contract Type ---
    // The Python engine will handle the detailed logic for each activityType.
    // This Next.js route primarily dispatches the request.
    switch (Type) {
      case 'public_sell':
        activityType = 'manage_public_sell_contract';
        citizenUsername = Seller;
        // activityParameters should include: contractId (optional), resourceType, pricePerResource,
        // targetAmount, sellerBuildingId, targetMarketBuildingId.
        // Ensure targetMarketBuildingId is passed if available in body.
        break;
      
      case 'building_bid':
        activityType = 'bid_on_building';
        citizenUsername = Buyer;
        // activityParameters should include: buildingIdToBidOn (from Asset), bidAmount (from PricePerResource),
        // targetOwnerUsername (optional, from Seller), targetOfficeBuildingId (optional).
        activityParameters.buildingIdToBidOn = Asset;
        activityParameters.bidAmount = PricePerResource;
        if (Seller) activityParameters.targetOwnerUsername = Seller;
        break;

      case 'import_order': // This type might need to map to 'manage_import_contract'
        activityType = 'manage_import_contract';
        citizenUsername = Buyer; // Buyer initiates an import contract
        // activityParameters: contractId (optional), resourceType, targetAmount, pricePerResource, 
        // buyerBuildingId (from BuyerBuilding), targetOfficeBuildingId.
        break;
      
      case 'public_import_order': // This type might need to map to 'manage_public_import_contract'
        activityType = 'manage_public_import_contract';
        citizenUsername = Buyer; // Buyer initiates a public import offer
        // activityParameters: contractId (optional), resourceType, targetAmount, pricePerResource, targetOfficeBuildingId.
        break;
      
      // TODO: Add more cases for other contract types defined in activities.md
      // e.g., 'respond_to_building_bid', 'withdraw_building_bid', 'manage_public_storage_offer', etc.
      // Each case will set activityType, citizenUsername, and adjust activityParameters as needed.
      // For example, for 'respond_to_building_bid':
      // case 'building_bid_response': // Assuming a Type for this
      //   activityType = 'respond_to_building_bid';
      //   citizenUsername = Seller; // The owner of the building responds
      //   activityParameters.buildingBidContractId = ContractId; // The ID of the bid contract
      //   activityParameters.response = Status; // e.g., "accepted" or "refused"
      //   break;

      default:
        return NextResponse.json(
          { success: false, error: `Contract Type '${Type}' is not supported for activity-based processing or is invalid.` },
          { status: 400 }
        );
    }

    if (!citizenUsername) {
        return NextResponse.json(
            { success: false, error: `Could not determine the responsible citizen (e.g., Seller or Buyer) for contract type ${Type}.`},
            { status: 400 }
        );
    }

    // Basic validation of core fields still useful before sending to try-create
    if (!ContractId || !Type || PricePerResource === undefined || !Status) {
      return NextResponse.json(
        { success: false, error: 'Missing required core contract fields (ContractId, Type, PricePerResource, Status).' },
        { status: 400 }
      );
    }
    // Type-specific validation can also be kept light here, relying on Python engine for deeper validation.
    if (Type === 'building_bid' && (!Buyer || !Asset || !AssetType || AssetType !== 'building')) {
      return NextResponse.json(
        { success: false, error: 'For building_bid, Buyer, Asset (BuildingId), and AssetType="building" are required.' },
        { status: 400 }
      );
    }
    // For other types, ensure essential fields are present if not a building_bid
    if (Type !== 'building_bid' && (!ResourceType || !Seller || !SellerBuilding || TargetAmount === undefined)) {
       return NextResponse.json(
        { success: false, error: 'For non-building_bid types, ResourceType, Seller, SellerBuilding, and TargetAmount are required.' },
        { status: 400 }
      );
    }

    // Clean up activityParameters: remove fields that are part of the top-level try-create payload
    // or those that were remapped.
    const fieldsToClean = ['Type', 'Citizen', /* any other top-level fields in try-create */];
    if (activityType === 'bid_on_building') {
        fieldsToClean.push('Asset', 'PricePerResource'); // These were mapped to specific activityParameters
    }
    for (const field of fieldsToClean) {
        delete activityParameters[field];
    }
    // Ensure ContractId is passed as contractId if that's what the Python activity expects
    if (activityParameters.ContractId && !activityParameters.contractId) {
        activityParameters.contractId = activityParameters.ContractId;
    }
    // delete activityParameters.ContractId; // remove original if it was PascalCase and now have camelCase

    const tryCreatePayload = {
      citizenUsername: citizenUsername,
      activityType: activityType,
      activityParameters: activityParameters
    };

    const tryCreateUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/activities/try-create`;
    
    console.log(`[contracts POST] Calling /api/activities/try-create for ${citizenUsername} (Type: ${Type} -> Activity: ${activityType}). Payload:`, JSON.stringify(tryCreatePayload, null, 2));

    const response = await fetch(tryCreateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tryCreatePayload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`[contracts POST] Error from /api/activities/try-create (${response.status}) for ${Type}:`, responseData);
      return NextResponse.json(
        { 
          success: false, 
          error: `Failed to process contract (Type: ${Type}) via activities service: ${responseData.error || response.statusText}`,
          details: responseData.details 
        },
        { status: response.status }
      );
    }
    
    console.log(`[contracts POST] Success response from /api/activities/try-create for ${Type}:`, responseData);
    // The response from try-create will be different from the original direct Airtable upsert.
    // Client consuming this endpoint will need to adapt.
    return NextResponse.json(
      responseData, // Proxy the full response from try-create
      { status: response.status }
    );

  } catch (error) {
    console.error('Error in POST /api/contracts:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process contract';
    return NextResponse.json(
      { success: false, error: errorMessage, details: String(error) },
      { status: 500 }
    );
  }
}
