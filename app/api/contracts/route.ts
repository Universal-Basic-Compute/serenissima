import { NextResponse } from 'next/server';
import Airtable from 'airtable';

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
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    const sellerBuilding = searchParams.get('sellerBuilding');
    const scope = searchParams.get('scope'); // New parameter for contract scope
    
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
    let formula = '';
    
    if (sellerBuilding) {
      // Filter by seller building (highest priority)
      formula = `{SellerBuilding}='${sellerBuilding}'`;
    } else if (username && scope === 'userNonPublic') {
      // User-specific contracts, excluding public_sell type
      formula = `AND(OR({Buyer}='${username}', {Seller}='${username}'), {Type}!='public_sell')`;
      console.log(`Contracts API: Fetching userNonPublic for ${username}`);
    } else if (username) {
      // Default for user: their contracts AND all public_sell contracts
      formula = `OR({Type}='public_sell', {Buyer}='${username}', {Seller}='${username}')`;
      console.log(`Contracts API: Fetching all relevant for ${username} (includes public_sell)`);
    } else {
      // Default public: all public_sell contracts (unfiltered by stock here)
      formula = `{Type}='public_sell'`;
      console.log(`Contracts API: Fetching all public_sell (unfiltered by stock)`);
    }
    
    // Query Airtable
    const records = await new Promise((resolve, reject) => {
      const allRecords: any[] = [];
      
      contractsTable
        .select({
          filterByFormula: formula,
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
          resourceSubcategory: resourceDef?.subcategory || null,
          resourceTier: resourceDef?.tier ?? null,
          resourceDescription: resourceDef?.description || '',
          resourceImportPrice: resourceDef?.importPrice ?? 0,
          resourceLifetimeHours: resourceDef?.lifetimeHours ?? null,
          resourceConsumptionHours: resourceDef?.consumptionHours ?? null,
          imageUrl: resourceDef?.icon ? `/resources/${resourceDef.icon}` : `/resources/${formattedResourceType}.png`,
          buyerBuilding: record.get('BuyerBuilding'),
          sellerBuilding: record.get('SellerBuilding'),
          price: record.get('PricePerResource'),
          amount: record.get('Amount'),
          createdAt: record.get('CreatedAt'),
          endAt: record.get('EndAt'),
          status: record.get('Status') || 'active',
          location: null
        };
        
        // Try to get location from the seller building ID directly
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
