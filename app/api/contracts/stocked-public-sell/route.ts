import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Helper function to parse building coordinates from building ID (copied from /api/contracts/route.ts)
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

    // Fetch all resource type definitions for enrichment (copied from /api/contracts/route.ts)
    let resourceTypeDefinitions: Map<string, any> = new Map();
    try {
      const resourceTypesResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/resource-types`);
      if (resourceTypesResponse.ok) {
        const resourceTypesData = await resourceTypesResponse.json();
        if (resourceTypesData.success && resourceTypesData.resourceTypes) {
          (resourceTypesData.resourceTypes as any[]).forEach(def => {
            resourceTypeDefinitions.set(def.id, def);
          });
          console.log(`StockedContracts: Successfully fetched ${resourceTypeDefinitions.size} resource type definitions.`);
        }
      } else {
        console.warn(`StockedContracts: Failed to fetch resource type definitions: ${resourceTypesResponse.status}`);
      }
    } catch (e) {
      console.error('StockedContracts: Error fetching resource type definitions:', e);
    }

    // Fetch 'public_sell' contracts
    const records = await new Promise<any[]>((resolve, reject) => {
      const allRecords: any[] = [];
      contractsTable
        .select({
          filterByFormula: "{Type}='public_sell'",
          sort: [{ field: 'CreatedAt', direction: 'desc' }]
        })
        .eachPage(
          (pageRecords, fetchNextPage) => {
            allRecords.push(...pageRecords);
            fetchNextPage();
          },
          (error) => {
            if (error) reject(error);
            else resolve(allRecords);
          }
        );
    });

    const stockedContracts = [];
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

    for (const record of records) {
      const sellerBuildingId = record.get('SellerBuilding');
      const resourceTypeId = record.get('ResourceType');

      if (!sellerBuildingId || !resourceTypeId) {
        console.log(`StockedContracts: Skipping contract ${record.id} due to missing sellerBuildingId or resourceTypeId.`);
        continue;
      }

      let isStocked = false;
      try {
        const buildingResourcesUrl = new URL(`/api/building-resources/${encodeURIComponent(sellerBuildingId)}`, baseUrl);
        const resourcesResponse = await fetch(buildingResourcesUrl.toString());

        if (resourcesResponse.ok) {
          const resourcesData = await resourcesResponse.json();
          if (resourcesData.success && resourcesData.resources && Array.isArray(resourcesData.resources)) {
            const resource = resourcesData.resources.find(
              (r: any) => r.id === resourceTypeId && r.quantity > 0
            );
            if (resource) {
              isStocked = true;
            } else {
              console.log(`StockedContracts: Resource ${resourceTypeId} not stocked or quantity zero in building ${sellerBuildingId} for contract ${record.id}.`);
            }
          } else {
            console.warn(`StockedContracts: Failed to get valid resources data for building ${sellerBuildingId}: ${resourcesData.error || 'No resources array'}`);
          }
        } else {
          console.warn(`StockedContracts: Failed to fetch resources for building ${sellerBuildingId}: ${resourcesResponse.status} ${resourcesResponse.statusText}`);
        }
      } catch (e) {
        console.error(`StockedContracts: Error fetching/checking stock for building ${sellerBuildingId}, contract ${record.id}:`, e);
      }

      if (isStocked) {
        const resourceDef = resourceTypeDefinitions.get(resourceTypeId) || {};
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

        // Location logic (copied from /api/contracts/route.ts)
        if (contractData.sellerBuilding) {
          const coordinates = parseBuildingCoordinates(contractData.sellerBuilding);
          if (coordinates) {
            contractData.location = coordinates;
          } else {
            try {
              const buildingDetailsUrl = new URL(`/api/buildings/${encodeURIComponent(contractData.sellerBuilding)}`, baseUrl);
              const buildingResponse = await fetch(buildingDetailsUrl.toString());
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
              console.error(`StockedContracts: Error fetching building location for ${contractData.sellerBuilding}:`, e);
            }
          }
        }
        stockedContracts.push(contractData);
      }
    }

    console.log(`StockedContracts: Processed ${records.length} 'public_sell' contracts, returning ${stockedContracts.length} stocked contracts.`);
    return NextResponse.json({
      success: true,
      contracts: stockedContracts
    });

  } catch (error) {
    console.error('StockedContracts: Error fetching stocked public sell contracts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stocked public sell contracts' },
      { status: 500 }
    );
  }
}
