import { NextResponse } from 'next/server';
import Airtable from 'airtable';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    const sellerBuilding = searchParams.get('sellerBuilding');
    
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
    
    // Build the filter formula based on parameters
    let formula = '';
    
    if (sellerBuilding) {
      // Filter by seller building
      formula = `{SellerBuilding}='${sellerBuilding}'`;
    } else if (username) {
      // Get public_sell contracts AND contracts where the user is buyer or seller
      formula = `OR({Type}='public_sell', {Buyer}='${username}', {Seller}='${username}')`;
    } else {
      // Just get public_sell contracts if no username provided
      formula = `{Type}='public_sell'`;
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
        const contractData = {
          id: record.id,
          contractId: record.get('ContractId'),
          type: record.get('Type'),
          buyer: record.get('Buyer'),
          seller: record.get('Seller'),
          resourceType: record.get('ResourceType'),
          buyerBuilding: record.get('BuyerBuilding'),
          sellerBuilding: record.get('SellerBuilding'),
          price: record.get('PricePerResource'),
          amount: record.get('Amount'),
          createdAt: record.get('CreatedAt'),
          endAt: record.get('EndAt'),
          status: record.get('Status') || 'active',
          location: null
        };
        
        // Try to get location from the seller building
        if (contractData.sellerBuilding) {
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
        
        return contractData;
      })
    );
    
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
