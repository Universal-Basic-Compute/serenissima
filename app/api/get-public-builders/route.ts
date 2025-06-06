import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Airtable config
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const CONTRACTS_TABLE_NAME = process.env.AIRTABLE_CONTRACTS_TABLE || 'CONTRACTS';
const CITIZENS_TABLE_NAME = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("CRITICAL: Missing Airtable API Key or Base ID for get-public-builders route.");
}

const airtable = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID!);

// Helper function to fetch citizen details by username
async function getCitizenDetails(username: string): Promise<any | null> {
  if (!username) return null;
  try {
    const records = await airtable(CITIZENS_TABLE_NAME)
      .select({
        filterByFormula: `{Username} = '${username}'`,
        maxRecords: 1,
        fields: ["Username", "FirstName", "LastName", "SocialClass", "Color", "FamilyMotto"] // Specify needed fields
      })
      .firstPage();

    if (records.length > 0) {
      const citizen = records[0].fields;
      // Ensure camelCase for consistency if needed, though Airtable typically returns PascalCase
      // For this specific endpoint, we'll return as is from Airtable or ensure specific fields.
      return {
        username: citizen.Username,
        citizenId: citizen.Username, // Add citizenId, as it's equal to Username per schema
        firstName: citizen.FirstName,
        lastName: citizen.LastName,
        socialClass: citizen.SocialClass,
        color: citizen.Color,
        familyMotto: citizen.FamilyMotto,
      };
    }
    return null;
  } catch (error) {
    console.error(`Error fetching citizen details for ${username}:`, error);
    return null;
  }
}

export async function GET(request: Request) {
  try {
    console.log('GET /api/get-public-builders received');

    // Fetch all resource type definitions for enrichment (similar to /api/contracts)
    let resourceTypeDefinitions: Map<string, any> = new Map();
    try {
      const resourceTypesResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/resource-types`);
      if (resourceTypesResponse.ok) {
        const resourceTypesData = await resourceTypesResponse.json();
        if (resourceTypesData.success && resourceTypesData.resourceTypes) {
          (resourceTypesData.resourceTypes as any[]).forEach(def => {
            resourceTypeDefinitions.set(def.id, def);
          });
        }
      }
    } catch (e) {
      console.error('Error fetching resource type definitions for public builders:', e);
    }

    const contractsRecords = await airtable(CONTRACTS_TABLE_NAME)
      .select({
        filterByFormula: `{Type} = 'public_construction'`,
        sort: [{ field: 'CreatedAt', direction: 'desc' }]
      })
      .all();

    const publicBuilders = await Promise.all(
      contractsRecords.map(async (record) => {
        const contractFields = record.fields;
        const sellerUsername = contractFields.Seller as string;
        const sellerDetails = await getCitizenDetails(sellerUsername);

        const resourceTypeId = contractFields.ResourceType as string || 'unknown';
        const resourceDef = resourceTypeDefinitions.get(resourceTypeId);
        const formattedResourceType = resourceTypeId.toLowerCase().replace(/\s+/g, '_');

        return {
          id: record.id,
          contractId: contractFields.ContractId,
          type: contractFields.Type,
          seller: sellerUsername,
          sellerDetails: sellerDetails, // Enriched citizen data
          resourceType: resourceTypeId,
          resourceName: resourceDef?.name || resourceTypeId,
          resourceCategory: resourceDef?.category || 'Unknown',
          resourceSubCategory: resourceDef?.subCategory || null,
          imageUrl: resourceDef?.icon ? `/images/resources/${resourceDef.icon}` : `/images/resources/${formattedResourceType}.png`,
          sellerBuilding: contractFields.SellerBuilding,
          pricePerResource: contractFields.PricePerResource,
          price: contractFields.PricePerResource, // Alias for consistency
          amount: contractFields.TargetAmount,
          targetAmount: contractFields.TargetAmount, // Alias
          status: contractFields.Status || 'active',
          notes: contractFields.Notes,
          title: contractFields.Title, // Include Title
          description: contractFields.Description, // Include Description
          createdAt: contractFields.CreatedAt,
          updatedAt: contractFields.UpdatedAt,
        };
      })
    );

    // Filter out any entries where sellerDetails might be null (if citizen fetch failed)
    const validPublicBuilders = publicBuilders.filter(pb => pb.sellerDetails !== null);

    console.log(`Returning ${validPublicBuilders.length} public builders.`);
    return NextResponse.json({
      success: true,
      builders: validPublicBuilders,
    });

  } catch (error) {
    console.error('Error in GET /api/get-public-builders:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch public builders';
    return NextResponse.json(
      { success: false, error: errorMessage, details: String(error) },
      { status: 500 }
    );
  }
}
