import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Helper to escape single quotes for Airtable formulas
function escapeAirtableValue(value: string): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  return value.replace(/'/g, "\\'");
}

// Helper function to parse building coordinates from building ID
const parseBuildingCoordinates = (buildingId: string): {lat: number, lng: number} | null => {
  if (!buildingId) return null;
  
  // Check if it's in the format "building_45.430345_12.353923"
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
          sort: [{ field: 'CreatedAt', direction: 'desc' }] // Default sort, can be overridden by query params later
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
    
    // Process records to include location data
    const contractsWithLocation = await Promise.all(
      (records as any[]).map(async (record) => {
        const resourceTypeId = record.get('ResourceType') || 'unknown';
        const resourceDef = resourceTypeDefinitions.get(resourceTypeId);

        // Format the resource type for the image URL (lowercase, replace spaces with underscores)
        const formattedResourceType = resourceTypeId.toLowerCase().replace(/\s+/g, '_');
        
        const contractData: Record<string, any> = {
          id: record.id,
          contractId: record.get('ContractId'),
          type: record.get('Type'),
          buyer: record.get('Buyer'),
          seller: record.get('Seller'),
          resourceType: resourceTypeId,
          // Enrich with resource definition data
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
          price: record.get('PricePerResource'), // For bids, this is the bid amount
          amount: record.get('TargetAmount'), // For bids, TargetAmount might be 1 (for the building)
          asset: record.get('Asset'), // BuildingId for building_bid
          assetType: record.get('AssetType'), // 'building' for building_bid
          createdAt: record.get('CreatedAt'),
          endAt: record.get('EndAt'),
          status: record.get('Status') || 'active',
          notes: record.get('Notes'), // Include notes for bids
          location: null
        };
        
        // Try to get location from the seller building ID directly (for public_sell, etc.)
        // For building_bid, location might be derived from Asset (BuildingId) if needed, or not relevant for the contract marker itself.
        if (contractData.sellerBuilding) {
          // First try to parse the building ID if it's in the format "building_lat_lng"
          const coordinates = parseBuildingCoordinates(contractData.sellerBuilding);
          if (coordinates) {
            contractData.location = coordinates;
            console.log(`Parsed location from building ID: ${contractData.sellerBuilding} -> ${JSON.stringify(coordinates)}`);
          } else {
            // If direct parsing fails, try to fetch the building data from the API
            try {
              // First, ensure we have a valid base URL with proper protocol
              const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                            (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
              
              // Then construct the full URL properly
              const buildingUrl = new URL(`/api/buildings/${encodeURIComponent(contractData.sellerBuilding)}`, baseUrl);
              const buildingResponse = await fetch(buildingUrl.toString());
              
              if (buildingResponse.ok) {
                const buildingData = await buildingResponse.json();
                if (buildingData.building && buildingData.building.position) {
                  let position;
                  try {
                    position = typeof buildingData.building.position === 'string' 
                      ? JSON.parse(buildingData.building.position) 
                      : buildingData.building.position;
                      
                    if (position.lat && position.lng) {
                      contractData.location = { lat: position.lat, lng: position.lng };
                      console.log(`Fetched location for building: ${contractData.sellerBuilding} -> ${JSON.stringify(contractData.location)}`);
                    }
                  } catch (e) {
                    console.error('Error parsing building position:', e);
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
    
    // Add a summary log
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
      ContractId, // This is the key for UPSERT
      Type,
      ResourceType,
      PricePerResource, // For bids, this is the bid amount
      Seller, // For bids, this is the building owner (or system if not set on bid creation)
      SellerBuilding, // For bids, this might be null or the building itself if we model it that way
      TargetAmount, // For bids, this is likely 1 (representing the building)
      Status,
      Buyer, // For bids, this is the bidder
      Notes, // Optional
      Asset, // For bids, this is the BuildingId
      AssetType // For bids, this is 'building'
    } = body;

    // Basic validation - adjust for building_bid specifics
    if (!ContractId || !Type || PricePerResource === undefined || !Status) {
      return NextResponse.json(
        { success: false, error: 'Missing required core contract fields (ContractId, Type, PricePerResource, Status) for POST operation.' },
        { status: 400 }
      );
    }
    if (Type === 'building_bid' && (!Buyer || !Asset || !AssetType || AssetType !== 'building')) {
      return NextResponse.json(
        { success: false, error: 'For building_bid, Buyer, Asset (BuildingId), and AssetType="building" are required.' },
        { status: 400 }
      );
    }
    if (Type !== 'building_bid' && (!ResourceType || !Seller || !SellerBuilding || TargetAmount === undefined)) {
       return NextResponse.json(
        { success: false, error: 'For non-building_bid types, ResourceType, Seller, SellerBuilding, and TargetAmount are required.' },
        { status: 400 }
      );
    }


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

    // Check if contract exists
    const existingRecords = await contractsTable.select({
      filterByFormula: `{ContractId} = '${ContractId}'`,
      maxRecords: 1
    }).firstPage();

    let savedRecord;

    const fieldsToSave: Airtable.FieldSet = {
      ContractId,
      Type,
      PricePerResource,
      Status,
    };
    // Conditionally add fields based on contract type or if they are provided
    if (ResourceType) fieldsToSave.ResourceType = ResourceType;
    if (Seller) fieldsToSave.Seller = Seller;
    if (SellerBuilding) fieldsToSave.SellerBuilding = SellerBuilding;
    if (TargetAmount !== undefined) fieldsToSave.TargetAmount = TargetAmount;
    if (Buyer) fieldsToSave.Buyer = Buyer;
    if (Notes) fieldsToSave.Notes = Notes;
    if (Asset) fieldsToSave.Asset = Asset;
    if (AssetType) fieldsToSave.AssetType = AssetType;
    if (body.EndAt) fieldsToSave.EndAt = body.EndAt; // If EndAt is provided in body
    if (body.Title) fieldsToSave.Title = body.Title;
    if (body.Description) fieldsToSave.Description = body.Description;


    if (existingRecords.length > 0) {
      // Update existing contract
      const recordToUpdate = existingRecords[0];
      console.log(`Updating existing contract ${recordToUpdate.id} with ContractId ${ContractId}`);
      // Ensure CreatedAt is not overwritten
      // delete fieldsToSave.CreatedAt; // CreatedAt should not be in fieldsToSave for updates
      
      savedRecord = await contractsTable.update(recordToUpdate.id, fieldsToSave);
    } else {
      // Create new contract
      console.log(`Creating new contract with ContractId ${ContractId}`);
      fieldsToSave.CreatedAt = new Date().toISOString(); // Set CreatedAt for new records
      savedRecord = await contractsTable.create(fieldsToSave);
    }
    
    let responseContractData = { ...savedRecord.fields, id: savedRecord.id };

    // Enrich with resource definition data for the response if ResourceType is present
    if (responseContractData.ResourceType) {
      let resourceDef;
      try {
        const resourceTypesResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/resource-types?id=${encodeURIComponent(responseContractData.ResourceType as string)}`);
        if (resourceTypesResponse.ok) {
          const resourceTypesData = await resourceTypesResponse.json();
          if (resourceTypesData.success && resourceTypesData.resourceType) {
            resourceDef = resourceTypesData.resourceType;
          } else if (resourceTypesData.success && resourceTypesData.resourceTypes && Array.isArray(resourceTypesData.resourceTypes)) {
              resourceDef = resourceTypesData.resourceTypes.find((def: any) => def.id === responseContractData.ResourceType);
          }
        }
      } catch (e) {
        console.error('Error fetching resource type definition for POST response enrichment:', e);
      }

      const formattedResourceType = (responseContractData.ResourceType as string).toLowerCase().replace(/\s+/g, '_');
      responseContractData = {
        ...responseContractData,
        resourceName: resourceDef?.name || responseContractData.ResourceType,
        resourceCategory: resourceDef?.category || 'Unknown',
        resourceSubCategory: resourceDef?.subCategory || null,
        resourceTier: resourceDef?.tier ?? null,
        resourceDescription: resourceDef?.description || '',
        resourceImportPrice: resourceDef?.importPrice ?? 0,
        resourceLifetimeHours: resourceDef?.lifetimeHours ?? null,
        resourceConsumptionHours: resourceDef?.consumptionHours ?? null,
        imageUrl: resourceDef?.icon ? `/resources/${resourceDef.icon}` : `/resources/${formattedResourceType}.png`,
      };
    }
    
    // Attempt to parse location for the response (primarily for non-building_bid types)
    if (responseContractData.SellerBuilding) {
      const coordinates = parseBuildingCoordinates(responseContractData.SellerBuilding as string);
      if (coordinates) {
        responseContractData.location = coordinates;
      } else {
        try {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
          const buildingUrl = new URL(`/api/buildings/${encodeURIComponent(responseContractData.SellerBuilding as string)}`, baseUrl);
          const buildingResponse = await fetch(buildingUrl.toString());
          if (buildingResponse.ok) {
            const buildingData = await buildingResponse.json();
            if (buildingData.building && buildingData.building.position) {
              let position = typeof buildingData.building.position === 'string' 
                ? JSON.parse(buildingData.building.position) 
                : buildingData.building.position;
              if (position.lat && position.lng) {
                responseContractData.location = { lat: position.lat, lng: position.lng };
              }
            }
          }
        } catch (e) {
          console.error('Error fetching building location for POST response enrichment:', e);
        }
      }
    }


    return NextResponse.json({
      success: true,
      contract: responseContractData,
      message: existingRecords.length > 0 ? 'Contract updated successfully' : 'Contract created successfully'
    });

  } catch (error) {
    console.error('Error in POST /api/contracts:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process contract';
    return NextResponse.json(
      { success: false, error: errorMessage, details: String(error) },
      { status: 500 }
    );
  }
}
