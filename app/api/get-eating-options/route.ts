import { NextResponse } from 'next/server';
import Airtable, { FieldSet, Record as AirtableRecord } from 'airtable';

// Airtable Configuration (Assurez-vous que ces variables d'environnement sont définies)
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  throw new Error('Airtable API key or Base ID is not configured in environment variables for get-eating-options.');
}

const airtable = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// Helper to escape single quotes for Airtable formulas
function escapeAirtableValue(value: string | number | boolean): string {
  if (typeof value === 'string') {
    return value.replace(/'/g, "\\'");
  }
  return String(value);
}

const FOOD_RESOURCE_TYPES = ["bread", "fish", "wine", "fruit", "vegetables", "cheese", "olive_oil", "ale", "cider", "mead", "spirits", "cooked_meal", "water_skin_potable"]; // Liste étendue

interface EatingOption {
  source: 'inventory' | 'home' | 'tavern';
  details: string; 
  resourceType?: string;
  buildingId?: string; 
  buildingName?: string;
  price?: number; 
  quantity?: number;
}

interface FormattedAirtableRecord {
  id: string;
  fields: Record<string, any>;
}

async function fetchCitizenByName(username: string): Promise<FormattedAirtableRecord | null> {
  try {
    const records = await airtable('CITIZENS').select({
      filterByFormula: `{Username} = '${escapeAirtableValue(username)}'`,
      maxRecords: 1,
    }).firstPage();
    if (records.length > 0) {
      return { id: records[0].id, fields: records[0].fields };
    }
    return null;
  } catch (error) {
    console.error(`Error fetching citizen ${username}:`, error);
    return null;
  }
}

async function fetchCitizenHome(username: string): Promise<FormattedAirtableRecord | null> {
  try {
    const records = await airtable('BUILDINGS').select({
      filterByFormula: `AND({Occupant} = '${escapeAirtableValue(username)}', {Category} = 'home')`,
      maxRecords: 1,
    }).firstPage();
    if (records.length > 0) {
      return { id: records[0].id, fields: records[0].fields };
    }
    return null;
  } catch (error) {
    console.error(`Error fetching home for citizen ${username}:`, error);
    return null;
  }
}

async function fetchResources(
  assetType: 'citizen' | 'building',
  assetId: string, // Username for citizen, BuildingId (custom) for building
  ownerUsername: string,
  resourceTypes: string[]
): Promise<FormattedAirtableRecord[]> {
  if (resourceTypes.length === 0) return [];
  const resourceTypeFilters = resourceTypes.map(rt => `{Type} = '${escapeAirtableValue(rt)}'`);
  const orFilter = `OR(${resourceTypeFilters.join(', ')})`;
  
  try {
    const formula = `AND({AssetType} = '${escapeAirtableValue(assetType)}', {Asset} = '${escapeAirtableValue(assetId)}', {Owner} = '${escapeAirtableValue(ownerUsername)}', ${orFilter})`;
    const records = await airtable('RESOURCES').select({
      filterByFormula: formula,
    }).all();
    return records.map(r => ({ id: r.id, fields: r.fields }));
  } catch (error) {
    console.error(`Error fetching resources for ${assetType} ${assetId}, owner ${ownerUsername}:`, error);
    return [];
  }
}

async function fetchTavernsWithFood(resourceTypes: string[]): Promise<any[]> {
  if (resourceTypes.length === 0) return [];
  const resourceTypeFilters = resourceTypes.map(rt => `{ResourceType} = '${escapeAirtableValue(rt)}'`);
  const orResourceTypeFilter = `OR(${resourceTypeFilters.join(', ')})`;

  try {
    // 1. Fetch all taverns/inns
    const tavernRecords = await airtable('BUILDINGS').select({
      filterByFormula: "AND(OR({Type}='tavern', {Type}='inn'), {IsConstructed}=TRUE())",
      fields: ["BuildingId", "Name", "Type"] // Only fetch necessary fields
    }).all();

    if (tavernRecords.length === 0) return [];

    const tavernFoodOffers = [];

    // 2. For each tavern, fetch its active food contracts
    for (const tavern of tavernRecords) {
      const tavernBuildingId = tavern.fields.BuildingId as string;
      const tavernName = tavern.fields.Name as string || tavernBuildingId;
      if (!tavernBuildingId) continue;

      const contractFormula = `AND({SellerBuilding} = '${escapeAirtableValue(tavernBuildingId)}', {Type} = 'public_sell', {Status} = 'active', ${orResourceTypeFilter})`;
      const foodContracts = await airtable('CONTRACTS').select({
        filterByFormula: contractFormula,
        fields: ["ResourceType", "PricePerResource", "TargetAmount", "ContractId"]
      }).all();

      for (const contract of foodContracts) {
        tavernFoodOffers.push({
          tavernId: tavernBuildingId,
          tavernName: tavernName,
          resourceType: contract.fields.ResourceType,
          price: contract.fields.PricePerResource,
          quantityAvailable: contract.fields.TargetAmount,
          contractId: contract.fields.ContractId || contract.id,
        });
      }
    }
    return tavernFoodOffers;
  } catch (error) {
    console.error(`Error fetching taverns with food:`, error);
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const citizenUsername = searchParams.get('citizenUsername');

  if (!citizenUsername) {
    return NextResponse.json({ success: false, error: 'citizenUsername parameter is required' }, { status: 400 });
  }

  const options: EatingOption[] = [];
  const debugInfo: Record<string, any> = {
    queries: {},
    results: {},
    foodResourceTypesUsed: FOOD_RESOURCE_TYPES,
  };

  try {
    const citizen = await fetchCitizenByName(citizenUsername);
    if (!citizen) {
      return NextResponse.json({ success: false, error: `Citizen ${citizenUsername} not found`, debug: debugInfo }, { status: 404 });
    }
    debugInfo.citizenRecord = citizen;
    const citizenDucats = (citizen.fields.Ducats as number) || 0;
    debugInfo.citizenDucats = citizenDucats;

    // 1. Check Inventory
    const inventoryResourceTypesFilter = FOOD_RESOURCE_TYPES.map(rt => `{Type} = '${escapeAirtableValue(rt)}'`);
    const inventoryOrFilter = `OR(${inventoryResourceTypesFilter.join(', ')})`;
    const inventoryFormula = `AND({AssetType} = 'citizen', {Asset} = '${escapeAirtableValue(citizenUsername)}', {Owner} = '${escapeAirtableValue(citizenUsername)}', ${inventoryOrFilter})`;
    debugInfo.queries.inventory = inventoryFormula;
    const inventoryResources = await airtable('RESOURCES').select({ filterByFormula: inventoryFormula }).all();
    const formattedInventoryResources = inventoryResources.map(r => ({ id: r.id, fields: r.fields }));
    debugInfo.results.inventory = formattedInventoryResources;

    formattedInventoryResources.forEach(res => {
      const quantity = (res.fields.Count as number) || 0;
      if (quantity > 0) {
        options.push({
          source: 'inventory',
          details: `${res.fields.Type} (Quantité: ${quantity.toFixed(1)})`,
          resourceType: res.fields.Type as string,
          quantity: quantity,
        });
      }
    });

    // 2. Check Home
    const homeBuilding = await fetchCitizenHome(citizenUsername);
    debugInfo.homeBuildingRecord = homeBuilding;
    if (homeBuilding && homeBuilding.fields.BuildingId) {
      const homeBuildingId = homeBuilding.fields.BuildingId as string;
      const homeBuildingName = homeBuilding.fields.Name as string || homeBuildingId;

      const homeResourceTypesFilter = FOOD_RESOURCE_TYPES.map(rt => `{Type} = '${escapeAirtableValue(rt)}'`);
      const homeOrFilter = `OR(${homeResourceTypesFilter.join(', ')})`;
      const homeResourcesFormula = `AND({AssetType} = 'building', {Asset} = '${escapeAirtableValue(homeBuildingId)}', {Owner} = '${escapeAirtableValue(citizenUsername)}', ${homeOrFilter})`;
      debugInfo.queries.homeResources = homeResourcesFormula;
      const homeResources = await airtable('RESOURCES').select({ filterByFormula: homeResourcesFormula }).all();
      const formattedHomeResources = homeResources.map(r => ({ id: r.id, fields: r.fields }));
      debugInfo.results.homeResources = formattedHomeResources;
      
      formattedHomeResources.forEach(res => {
        const quantity = (res.fields.Count as number) || 0;
        if (quantity > 0) {
          options.push({
            source: 'home',
            details: `${res.fields.Type} à ${homeBuildingName} (Quantité: ${quantity.toFixed(1)})`,
            resourceType: res.fields.Type as string,
            buildingId: homeBuildingId,
            buildingName: homeBuildingName,
            quantity: quantity,
          });
        }
      });
    }

    // 3. Check Taverns
    const tavernFoodOffersDebug: any[] = [];
    const tavernResourceTypeFilters = FOOD_RESOURCE_TYPES.map(rt => `{ResourceType} = '${escapeAirtableValue(rt)}'`);
    const tavernOrResourceTypeFilter = `OR(${tavernResourceTypeFilters.join(', ')})`;
    const tavernBuildingFormula = "AND(OR({Type}='tavern', {Type}='inn'), {IsConstructed}=TRUE())";
    debugInfo.queries.tavernBuildings = tavernBuildingFormula;
    const tavernRecords = await airtable('BUILDINGS').select({
      filterByFormula: tavernBuildingFormula,
      fields: ["BuildingId", "Name", "Type"]
    }).all();
    const formattedTavernRecords = tavernRecords.map(r => ({ id: r.id, fields: r.fields }));
    debugInfo.results.tavernBuildings = formattedTavernRecords;

    for (const tavern of tavernRecords) {
      const tavernBuildingId = tavern.fields.BuildingId as string;
      const tavernName = tavern.fields.Name as string || tavernBuildingId;
      if (!tavernBuildingId) continue;

      const contractFormula = `AND({SellerBuilding} = '${escapeAirtableValue(tavernBuildingId)}', {Type} = 'public_sell', {Status} = 'active', ${tavernOrResourceTypeFilter})`;
      const foodContracts = await airtable('CONTRACTS').select({
        filterByFormula: contractFormula,
        fields: ["ResourceType", "PricePerResource", "TargetAmount", "ContractId"]
      }).all();
      const formattedFoodContracts = foodContracts.map(r => ({ id: r.id, fields: r.fields }));
      
      tavernFoodOffersDebug.push({
        tavernId: tavernBuildingId,
        tavernName: tavernName,
        query: contractFormula,
        results: formattedFoodContracts,
      });

      for (const contract of foodContracts) {
        const offer = {
          tavernId: tavernBuildingId,
          tavernName: tavernName,
          resourceType: contract.fields.ResourceType as string,
          price: contract.fields.PricePerResource as number,
          quantityAvailable: contract.fields.TargetAmount as number,
          contractId: (contract.fields.ContractId || contract.id) as string,
        };
        if (citizenDucats >= (offer.price || 0)) {
          options.push({
            source: 'tavern',
            details: `${offer.resourceType} à ${offer.tavernName} (Prix: ${offer.price || 0} Ducats, Disponible: ${(offer.quantityAvailable || 0).toFixed(1)})`,
            resourceType: offer.resourceType,
            buildingId: offer.tavernId,
            buildingName: offer.tavernName,
            price: offer.price,
            quantity: offer.quantityAvailable,
          });
        } else {
           options.push({
            source: 'tavern',
            details: `${offer.resourceType} à ${offer.tavernName} (Prix: ${offer.price || 0} Ducats, Disponible: ${(offer.quantityAvailable || 0).toFixed(1)}) - Fonds insuffisants`,
            resourceType: offer.resourceType,
            buildingId: offer.tavernId,
            buildingName: offer.tavernName,
            price: offer.price,
            quantity: offer.quantityAvailable,
          });
        }
      }
    }
    debugInfo.tavernFoodChecks = tavernFoodOffersDebug;

    return NextResponse.json({ success: true, citizenUsername, options, debug: debugInfo });

  } catch (error: any) {
    console.error(`[API get-eating-options] Error for ${citizenUsername}:`, error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch eating options', debug: debugInfo }, { status: 500 });
  }
}
