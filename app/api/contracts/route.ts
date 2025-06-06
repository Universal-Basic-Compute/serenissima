import { NextResponse } from 'next/server';
import Airtable from 'airtable'; // No longer directly using Airtable

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
    
    // Cache for citizen details to avoid refetching for the same username within a single request
    const citizenDetailsCache: Map<string, any> = new Map();
    const serverSideFetchBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    // Helper function to fetch citizen details
    const getCitizenDetails = async (username: string | null | undefined) => {
      if (!username) return null;
      if (citizenDetailsCache.has(username)) {
        return citizenDetailsCache.get(username);
      }
      try {
        const citizenApiUrl = new URL(`/api/citizens/${encodeURIComponent(username)}`, serverSideFetchBaseUrl);
        const response = await fetch(citizenApiUrl.toString());
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.citizen) {
            citizenDetailsCache.set(username, data.citizen);
            return data.citizen;
          }
        }
      } catch (e) {
        console.error(`Error fetching details for citizen ${username}:`, e);
      }
      citizenDetailsCache.set(username, null); // Cache null if fetch fails to avoid retrying
      return null;
    };

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
    // Add username and scope to reservedParams
    const reservedParams = ['limit', 'offset', 'sortField', 'sortDirection', 'username', 'scope'];

    const usernameParam = url.searchParams.get('username');
    const scopeParam = url.searchParams.get('scope');

    if (usernameParam) {
      const escapedUsername = escapeAirtableValue(usernameParam);
      formulaParts.push(`OR({Buyer} = '${escapedUsername}', {Seller} = '${escapedUsername}')`);
      loggableFilters['username (applied to Buyer/Seller)'] = usernameParam;
    }

    if (scopeParam === 'userNonPublic') {
      // Assuming 'public_sell' is the primary type for public contracts.
      // If other types like 'public_buy' or 'public_auction' exist, they should be added here.
      formulaParts.push(`NOT({Type} = 'public_sell')`);
      loggableFilters['scope (applied to Type)'] = scopeParam;
    } else if (scopeParam) {
      // Log if a scope parameter is provided but not handled
      loggableFilters['scope (unhandled)'] = scopeParam;
      console.warn(`Unhandled scope parameter: ${scopeParam}`);
    }

    for (const [key, value] of url.searchParams.entries()) {
      if (reservedParams.includes(key.toLowerCase())) {
        continue;
      }
      let airtableField = key; // Assuming query param key IS the Airtable field name
      if (key.toLowerCase() === 'assetid') {
        airtableField = 'Asset'; // Map assetId query param to Asset Airtable field
      }
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
    } else {
      console.log('No specific filters applied, fetching all (or default sorted/limited) contracts.');
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

        const sellerUsername = record.get('Seller') as string | undefined;
        const buyerUsername = record.get('Buyer') as string | undefined;

        let sellerName = sellerUsername;
        let buyerName = buyerUsername;

        if (sellerUsername) {
          const sellerDetails = await getCitizenDetails(sellerUsername);
          if (sellerDetails) {
            sellerName = `${sellerDetails.firstName || ''} ${sellerDetails.lastName || ''}`.trim() || sellerUsername;
          }
        }
        if (buyerUsername) {
          const buyerDetails = await getCitizenDetails(buyerUsername);
          if (buyerDetails) {
            buyerName = `${buyerDetails.firstName || ''} ${buyerDetails.lastName || ''}`.trim() || buyerUsername;
          }
        }
        
        const contractData: Record<string, any> = {
          // Use Airtable record.id as 'id' for fetching activities, keep ContractId for display/logic
          id: record.id, 
          airtableRecordId: record.id, // Redundant but explicit
          contractId: record.get('ContractId'), 
          Type: record.get('Type'), 
          Buyer: buyerUsername, 
          Seller: sellerUsername, // Original Seller username
          BuyerName: buyerName, // Enriched name
          SellerName: sellerName, // Enriched name
          ResourceType: resourceTypeId,
          ResourceName: resourceDef?.name || resourceTypeId, // Enriched
          ResourceCategory: resourceDef?.category || 'Unknown', // Enriched
          ResourceSubCategory: resourceDef?.subCategory || null, // Enriched
          ResourceTier: resourceDef?.tier ?? null, // Enriched
          ResourceDescription: resourceDef?.description || '', // Enriched
          ResourceImportPrice: resourceDef?.importPrice ?? 0, // Enriched
          ResourceLifetimeHours: resourceDef?.lifetimeHours ?? null, // Enriched
          ResourceConsumptionHours: resourceDef?.consumptionHours ?? null, // Enriched
          ImageUrl: resourceDef?.icon ? `/resources/${resourceDef.icon}` : `/resources/${formattedResourceType}.png`, // Enriched
          BuyerBuilding: record.get('BuyerBuilding'),
          SellerBuilding: record.get('SellerBuilding'),
          PricePerResource: record.get('PricePerResource'), // Keep original casing
          TargetAmount: record.get('TargetAmount'), // Keep original casing
          Asset: record.get('Asset'), 
          AssetType: record.get('AssetType'), 
          CreatedAt: record.get('CreatedAt'),
          EndAt: record.get('EndAt'),
          Status: record.get('Status') || 'active',
          Notes: record.get('Notes'), 
          Title: record.get('Title'), // Added Title
          Description: record.get('Description'), // Added Description
          UpdatedAt: record.get('UpdatedAt'), // Added UpdatedAt
          ExecutedAt: record.get('ExecutedAt'), // Added ExecutedAt
          location: null // Location enrichment logic remains
        };
        
        if (contractData.SellerBuilding) { // Use SellerBuilding (original casing)
          const coordinates = parseBuildingCoordinates(contractData.SellerBuilding);
          if (coordinates) {
            contractData.location = coordinates;
          } else {
            try {
              const buildingUrl = new URL(`/api/buildings/${encodeURIComponent(contractData.SellerBuilding)}`, serverSideFetchBaseUrl);
              console.log(`[contracts GET] Fetching building details for ${contractData.SellerBuilding} from ${buildingUrl.toString()}`);
              const buildingResponse = await fetch(buildingUrl.toString(), {
                headers: {
                  'Content-Type': 'application/json',
                  'User-Agent': 'contracts-service-internal-fetch' // Identifie l'appelant
                }
              });
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
