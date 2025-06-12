import { NextResponse } from 'next/server';
import Airtable, { FieldSet, Record as AirtableRecord } from 'airtable';
import fs from 'fs/promises';
import path from 'path';

// Airtable Configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  throw new Error('Airtable API key or Base ID is not configured in environment variables.');
}

const airtable = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// Helper to convert a string to camelCase
const toCamelCase = (s: string) => {
  if (!s) return s;
  return s.replace(/([-_][a-z])/ig, ($1) => {
    return $1.toUpperCase()
      .replace('-', '')
      .replace('_', '');
  }).replace(/^([A-Z])/, (firstChar) => firstChar.toLowerCase());
};

// Helper function to convert all keys of an object to camelCase (shallow)
const normalizeKeysCamelCaseShallow = (obj: Record<string, any>): Record<string, any> => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  const newObj: Record<string, any> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      newObj[toCamelCase(key)] = obj[key];
    }
  }
  return newObj;
};

// Helper to escape single quotes for Airtable formulas
function escapeAirtableValue(value: string): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  return value.replace(/'/g, "\\'");
}

interface BuildingPoint {
  id: string;
  lat: number;
  lng: number;
}

// Define more specific types for canal and bridge points if their structure differs significantly
// For now, assuming they also have at least id, lat, lng.
interface CanalPoint {
  id: string;
  lat: number;
  lng: number;
  // edge?: { lat: number; lng: number }; // Example from API ref
}

interface BridgePoint {
  id: string;
  lat: number;
  lng: number;
  // edge?: { lat: number; lng: number }; // Example from API ref
  // connection?: any; // Example from API ref
}

interface PolygonData {
  id: string; // LandId
  buildingPoints?: BuildingPoint[];
  canalPoints?: CanalPoint[];
  bridgePoints?: BridgePoint[];
  // Add other polygon fields if needed, e.g., coordinates, center
}

async function fetchCitizenDetails(username: string): Promise<AirtableRecord<FieldSet> | null> {
  try {
    const records = await airtable('CITIZENS').select({
      filterByFormula: `{Username} = '${escapeAirtableValue(username)}'`,
      maxRecords: 1,
    }).firstPage();
    return records.length > 0 ? records[0] : null;
  } catch (error) {
    console.error(`Error fetching citizen details for ${username}:`, error);
    return null;
  }
}

async function fetchLastActivity(username: string): Promise<AirtableRecord<FieldSet> | null> {
  try {
    const records = await airtable('ACTIVITIES').select({
      filterByFormula: `{Citizen} = '${escapeAirtableValue(username)}'`,
      sort: [{ field: 'EndDate', direction: 'desc' }], // Get the most recently ended or current
      maxRecords: 1,
    }).firstPage();
    return records.length > 0 ? records[0] : null;
  } catch (error) {
    console.error(`Error fetching last activity for ${username}:`, error);
    return null;
  }
}

async function fetchOwnedLands(username: string): Promise<AirtableRecord<FieldSet>[]> {
  try {
    const records = await airtable('LANDS').select({
      filterByFormula: `{Owner} = '${escapeAirtableValue(username)}'`,
    }).all();
    return [...records]; // Convert ReadonlyArray to Array
  } catch (error) {
    console.error(`Error fetching lands for ${username}:`, error);
    return [];
  }
}

async function fetchBuildingsOnLand(landId: string): Promise<AirtableRecord<FieldSet>[]> {
  try {
    const records = await airtable('BUILDINGS').select({
      filterByFormula: `{LandId} = '${escapeAirtableValue(landId)}'`,
    }).all();
    return [...records]; // Convert ReadonlyArray to Array
  } catch (error) {
    console.error(`Error fetching buildings on land ${landId}:`, error);
    return [];
  }
}

async function fetchPolygonDataForLand(landId: string): Promise<PolygonData | null> {
  try {
    // Use the existing /api/lands endpoint as it merges polygon data
    // Or directly call /api/get-polygons if more suitable
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/lands?LandId=${encodeURIComponent(landId)}`);
    if (!response.ok) {
      console.error(`Failed to fetch polygon data for land ${landId} from /api/lands: ${response.status}`);
      return null;
    }
    const data = await response.json();
    if (data.success && data.lands && data.lands.length > 0) {
      // Assuming /api/lands returns buildingPoints in the desired format
      const landData = data.lands[0];
      return {
        id: landData.landId, // or landData.id
        buildingPoints: landData.buildingPoints || [],
        canalPoints: landData.canalPoints || [], // Add canalPoints
        bridgePoints: landData.bridgePoints || [], // Add bridgePoints
      };
    }
    console.warn(`No land data found for ${landId} via /api/lands`);
    return null;
  } catch (error) {
    console.error(`Error fetching polygon data for land ${landId}:`, error);
    return null;
  }
}

async function fetchOwnedBuildings(username: string): Promise<AirtableRecord<FieldSet>[]> {
  try {
    const records = await airtable('BUILDINGS').select({
      filterByFormula: `{Owner} = '${escapeAirtableValue(username)}'`,
    }).all();
    return [...records]; // Convert ReadonlyArray to Array
  } catch (error) {
    console.error(`Error fetching buildings for ${username}:`, error);
    return [];
  }
}

async function fetchManagedBuildings(username: string): Promise<AirtableRecord<FieldSet>[]> {
  try {
    const records = await airtable('BUILDINGS').select({
      filterByFormula: `{RunBy} = '${escapeAirtableValue(username)}'`,
    }).all();
    return [...records];
  } catch (error) {
    console.error(`Error fetching managed buildings for ${username}:`, error);
    return [];
  }
}

async function fetchWorkplaceBuilding(username: string): Promise<AirtableRecord<FieldSet> | null> {
  try {
    // A citizen typically has one primary workplace (Occupant) which is a business
    // If multiple are possible, logic might need adjustment (e.g., sort by UpdatedAt or specific type)
    const records = await airtable('BUILDINGS').select({
      filterByFormula: `AND({Occupant} = '${escapeAirtableValue(username)}', {Category} = 'business')`,
      maxRecords: 1, // Assuming one primary workplace as Occupant
    }).firstPage();
    return records.length > 0 ? records[0] : null;
  } catch (error) {
    console.error(`Error fetching workplace building for ${username}:`, error);
    return null;
  }
}

async function fetchHomeBuilding(username: string): Promise<AirtableRecord<FieldSet> | null> {
  try {
    // A citizen typically has one primary home (Occupant, Category=home)
    const records = await airtable('BUILDINGS').select({
      filterByFormula: `AND({Occupant} = '${escapeAirtableValue(username)}', {Category} = 'home')`,
      maxRecords: 1, 
    }).firstPage();
    return records.length > 0 ? records[0] : null;
  } catch (error) {
    console.error(`Error fetching home building for ${username}:`, error);
    return null;
  }
}

interface BuildingResourceDetails {
  // Define structure based on /api/building-resources/:buildingId response
  // This is a simplified version, expand as needed
  success: boolean;
  buildingId?: string;
  buildingType?: string;
  buildingName?: string;
  owner?: string;
  category?: string | null;
  subCategory?: string | null;
  canImport?: boolean;
  resources?: {
    stored?: any[];
    publiclySold?: any[];
    bought?: any[];
    sellable?: any[];
    storable?: any[];
    transformationRecipes?: any[];
  };
  storage?: {
    used?: number;
    capacity?: number;
  };
  error?: string;
}

async function fetchBuildingResourceDetails(buildingId: string): Promise<BuildingResourceDetails | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/building-resources/${encodeURIComponent(buildingId)}`);
    if (!response.ok) {
      console.error(`Failed to fetch resource details for building ${buildingId}: ${response.status}`);
      return { success: false, error: `Failed to fetch resource details: ${response.status}` };
    }
    const data = await response.json();
    return data as BuildingResourceDetails; // Assuming data matches the interface
  } catch (error) {
    console.error(`Error fetching resource details for building ${buildingId}:`, error);
    return null;
  }
}

async function fetchCitizenContracts(username: string): Promise<AirtableRecord<FieldSet>[]> {
  try {
    const escapedUsername = escapeAirtableValue(username);
    const records = await airtable('CONTRACTS').select({
      filterByFormula: `AND(OR({Buyer} = '${escapedUsername}', {Seller} = '${escapedUsername}'), {Status} = 'active')`,
    }).all();
    return [...records]; // Convert ReadonlyArray to Array
  } catch (error) {
    console.error(`Error fetching contracts for ${username}:`, error);
    return [];
  }
}

async function fetchGuildDetails(guildId: string): Promise<AirtableRecord<FieldSet> | null> {
  if (!guildId) return null;
  try {
    const records = await airtable('GUILDS').select({
      filterByFormula: `{GuildId} = '${escapeAirtableValue(guildId)}'`,
      maxRecords: 1,
    }).firstPage();
    return records.length > 0 ? records[0] : null;
  } catch (error) {
    console.error(`Error fetching guild details for GuildId ${guildId}:`, error);
    return null;
  }
}

async function fetchCitizenLoans(username: string): Promise<AirtableRecord<FieldSet>[]> {
  try {
    const escapedUsername = escapeAirtableValue(username);
    const records = await airtable('LOANS').select({
      filterByFormula: `OR({Lender} = '${escapedUsername}', {Borrower} = '${escapedUsername}')`,
      sort: [{ field: 'CreatedAt', direction: 'desc' }], // Optional: sort by creation date
    }).all();
    return [...records]; // Convert ReadonlyArray to Array
  } catch (error) {
    console.error(`Error fetching loans for ${username}:`, error);
    return [];
  }
}

async function fetchCitizenRelationships(username: string): Promise<AirtableRecord<FieldSet>[]> {
  try {
    const escapedUsername = escapeAirtableValue(username);
    // Fetch all relationships involving the citizen
    const records = await airtable('RELATIONSHIPS').select({
      filterByFormula: `OR({Citizen1} = '${escapedUsername}', {Citizen2} = '${escapedUsername}')`,
    }).all();

    // Calculate combined score and sort
    const scoredRecords = records.map(record => {
      const strengthScore = Number(record.fields.StrengthScore) || 0;
      const trustScore = Number(record.fields.TrustScore) || 0;
      return { ...record, combinedScore: strengthScore + trustScore };
    });

    scoredRecords.sort((a, b) => b.combinedScore - a.combinedScore);
    
    // Map back to original AirtableRecord structure if combinedScore was only for sorting
    // and ensure it's a mutable array.
    return scoredRecords.slice(0, 20).map(r => {
      const { combinedScore, ...originalRecord } = r;
      return originalRecord as AirtableRecord<FieldSet>;
    });
  } catch (error) {
    console.error(`Error fetching relationships for ${username}:`, error);
    return [];
  }
}

async function fetchCitizenProblems(username: string): Promise<AirtableRecord<FieldSet>[]> {
  try {
    const escapedUsername = escapeAirtableValue(username);
    const records = await airtable('PROBLEMS').select({
      filterByFormula: `{Citizen} = '${escapedUsername}'`,
      sort: [{ field: 'CreatedAt', direction: 'desc' }],
      maxRecords: 20,
    }).all();
    return [...records]; // Convert ReadonlyArray to Array
  } catch (error) {
    console.error(`Error fetching problems for ${username}:`, error);
    return [];
  }
}

async function fetchCitizenMessages(username: string): Promise<AirtableRecord<FieldSet>[]> {
  try {
    const escapedUsername = escapeAirtableValue(username);
    const records = await airtable('MESSAGES').select({
      filterByFormula: `OR({Sender} = '${escapedUsername}', {Receiver} = '${escapedUsername}')`,
      sort: [{ field: 'CreatedAt', direction: 'desc' }],
      maxRecords: 10,
    }).all();
    return [...records]; // Convert ReadonlyArray to Array
  } catch (error) {
    console.error(`Error fetching messages for ${username}:`, error);
    return [];
  }
}

async function fetchLastDailyUpdate(): Promise<AirtableRecord<FieldSet> | null> {
  try {
    const records = await airtable('MESSAGES').select({
      filterByFormula: `AND({Type} = 'daily_update', {Sender} = 'ConsiglioDeiDieci')`,
      sort: [{ field: 'CreatedAt', direction: 'desc' }],
      maxRecords: 1,
    }).firstPage();
    return records.length > 0 ? records[0] : null;
  } catch (error) {
    console.error(`Error fetching last daily update:`, error);
    return null;
  }
}

interface ActiveStratagemsResult {
  executedBy: AirtableRecord<FieldSet>[];
  targetedAt: AirtableRecord<FieldSet>[];
}

async function fetchCitizenActiveStratagems(username: string): Promise<ActiveStratagemsResult> {
  const result: ActiveStratagemsResult = { executedBy: [], targetedAt: [] };
  try {
    const escapedUsername = escapeAirtableValue(username);
    const nowFilter = `OR({ExpiresAt} = BLANK(), IS_AFTER({ExpiresAt}, NOW()))`;

    // Stratagems executed by the citizen
    const executedByFormula = `
      AND(
        {ExecutedBy} = '${escapedUsername}',
        {Status} = 'active',
        ${nowFilter}
      )
    `.replace(/\s+/g, ' ');

    const executedByRecords = await airtable('STRATAGEMS').select({
      filterByFormula: executedByFormula,
      sort: [{ field: 'CreatedAt', direction: 'desc' }],
    }).all();
    result.executedBy = [...executedByRecords];

    // Stratagems targeting the citizen (and not executed by them, to avoid duplicates)
    const targetedAtFormula = `
      AND(
        {TargetCitizen} = '${escapedUsername}',
        NOT({ExecutedBy} = '${escapedUsername}'),
        {Status} = 'active',
        ${nowFilter}
      )
    `.replace(/\s+/g, ' ');

    const targetedAtRecords = await airtable('STRATAGEMS').select({
      filterByFormula: targetedAtFormula,
      sort: [{ field: 'CreatedAt', direction: 'desc' }],
    }).all();
    result.targetedAt = [...targetedAtRecords];

  } catch (error) {
    console.error(`Error fetching active stratagems for citizen ${username}:`, error);
  }
  return result;
}

interface StratagemParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface StratagemDefinition {
  name: string;
  type: string;
  purpose: string;
  category: string | null;
  // parameters: StratagemParameter[]; // Removed
  // description: string; // "How it Works" // Removed
  status: 'Implemented' | 'Coming Soon' | 'Partially Implemented';
  // rawMarkdown: string; // For debugging or more detailed display // Removed
}

// Interface for the object structure after removing fields
interface ShortStratagemDefinition {
  name: string;
  type: string;
  purpose: string;
  category: string | null;
  nature?: 'benevolent' | 'neutral' | 'aggressive' | 'illegal'; // Added nature
  status: 'Implemented' | 'Coming Soon' | 'Partially Implemented';
}


async function fetchStratagemDefinitions(): Promise<Record<string, Record<string, ShortStratagemDefinition[]>>> {
  const definitions = [ // No longer explicitly typed as StratagemDefinition[] here
    {
      name: 'Undercut',
      type: 'undercut',
      purpose: "To strategically lower the selling prices of a citizen's goods to be cheaper than their competition for a specific resource type.",
      category: 'commerce',
      nature: 'aggressive',
      status: 'Implemented',
    },
    {
      name: 'Coordinate Pricing',
      type: 'coordinate_pricing',
      purpose: "To align the selling prices of a citizen's goods with a target's prices (specific citizen or building) or with the general market average for a specific resource type.",
      category: 'commerce',
      nature: 'neutral',
      status: 'Implemented',
    },
    {
      name: 'Hoard Resource',
      type: 'hoard_resource',
      purpose: "To systematically accumulate a specific resource type in a designated storage building.",
      category: 'commerce',
      nature: 'neutral',
      status: 'Implemented',
    },
    {
      name: 'Supplier Lockout',
      type: 'supplier_lockout',
      purpose: "To establish exclusive or priority supply agreements with specific resource suppliers.",
      category: 'commerce',
      nature: 'aggressive',
      status: 'Coming Soon',
    },
    {
      name: 'Political Campaign',
      type: 'political_campaign',
      purpose: "To influence governance by lobbying for or against a specific decree or policy change.",
      category: 'political',
      nature: 'neutral',
      status: 'Coming Soon',
    },
    {
      name: 'Reputation Assault',
      type: 'reputation_assault',
      purpose: "To damage a competitor's business relationships and trustworthiness by spreading negative information.",
      category: 'personal',
      nature: 'aggressive',
      status: 'Implemented',
    },
    {
      name: 'Emergency Liquidation',
      type: 'emergency_liquidation',
      purpose: "To quickly convert a citizen's owned inventory into cash, albeit at potentially below-market rates.",
      category: 'commerce',
      nature: 'neutral',
      status: 'Implemented',
    },
    {
        name: 'Cultural Patronage',
        type: 'cultural_patronage',
        purpose: 'To build social capital and enhance reputation by sponsoring artists, performances, or cultural institutions.',
        category: 'social',
        nature: 'benevolent',
        status: 'Coming Soon',
    },
    {
        name: 'Information Network',
        type: 'information_network',
        purpose: 'To establish intelligence gathering operations targeting specific citizens or market sectors.',
        category: 'security',
        nature: 'neutral',
        status: 'Coming Soon',
    },
    {
        name: 'Maritime Blockade',
        type: 'maritime_blockade',
        purpose: "To control water access to cripple a competitor's trade and waterfront operations.",
        category: 'warfare',
        nature: 'aggressive',
        status: 'Coming Soon',
    },
    {
        name: 'Theater Conspiracy',
        type: 'theater_conspiracy',
        purpose: 'To manipulate public opinion and political narratives by commissioning and staging theatrical performances with specific themes.',
        category: 'social',
        nature: 'neutral',
        status: 'Coming Soon',
    },
    {
        name: 'Printing Propaganda',
        type: 'printing_propaganda',
        purpose: 'To conduct information warfare against competitors by mass-producing and distributing pamphlets and rumors.',
        category: 'political',
        nature: 'aggressive',
        status: 'Coming Soon',
    },
    {
        name: 'Cargo "Mishap"',
        type: 'cargo_mishap',
        purpose: 'To sabotage a competitor\'s shipment by arranging for their goods to "disappear" while in transit.',
        category: 'warfare',
        nature: 'illegal',
        status: 'Coming Soon',
    },
    {
        name: 'Marketplace Gossip',
        type: 'marketplace_gossip',
        purpose: "To subtly damage a competitor's reputation by spreading rumors through social networks.",
        category: 'personal',
        nature: 'aggressive',
        status: 'Coming Soon',
    },
    {
        name: 'Employee Poaching',
        type: 'employee_poaching',
        purpose: 'To recruit a skilled employee from a competitor by making them a better offer.',
        category: 'personal',
        nature: 'aggressive',
        status: 'Coming Soon',
    },
    {
        name: 'Joint Venture',
        type: 'joint_venture',
        purpose: 'To propose a formal business partnership with another citizen, defining contributions and profit-sharing.',
        category: 'commerce',
        nature: 'benevolent',
        status: 'Coming Soon',
    },
    {
        name: 'Financial Patronage',
        type: 'financial_patronage',
        purpose: 'To provide comprehensive financial support to promising individuals or loyal allies, creating deep personal bonds.',
        category: 'personal',
        nature: 'benevolent',
        status: 'Coming Soon',
    },
    {
        name: 'Neighborhood Watch',
        type: 'neighborhood_watch',
        purpose: 'To enhance security and reduce crime in a specific district through collective citizen vigilance.',
        category: 'security',
        nature: 'benevolent',
        status: 'Coming Soon',
    },
    {
        name: 'Monopoly Pricing',
        type: 'monopoly_pricing',
        purpose: 'To leverage dominant market position to significantly increase prices for a specific resource.',
        category: 'commerce',
        nature: 'aggressive',
        status: 'Coming Soon',
    },
    {
        name: 'Reputation Boost',
        type: 'reputation_boost',
        purpose: "To actively improve a target citizen's public image and trustworthiness through positive messaging.",
        category: 'personal',
        nature: 'benevolent',
        status: 'Coming Soon',
    },
    {
        name: 'Canal Mugging',
        type: 'canal_mugging',
        purpose: 'To rob a specific citizen while they are traveling by gondola, stealing Ducats and potentially resources.',
        category: 'warfare',
        nature: 'illegal',
        status: 'Coming Soon',
    },
    {
        name: 'Burglary',
        type: 'burglary',
        purpose: "To steal tools, materials, or finished goods from a competitor's production building.",
        category: 'warfare',
        nature: 'illegal',
        status: 'Coming Soon',
    },
    {
        name: 'Employee Corruption',
        type: 'employee_corruption',
        purpose: 'To bribe employees of businesses to reduce productivity and/or steal resources for the executor.',
        category: 'warfare',
        nature: 'illegal',
        status: 'Coming Soon',
    },
    {
        name: 'Arson',
        type: 'arson',
        purpose: 'To destroy a target building or business operation by setting it on fire.',
        category: 'warfare',
        nature: 'illegal',
        status: 'Coming Soon',
    },
    {
        name: 'Charity Distribution',
        type: 'charity_distribution',
        purpose: 'To anonymously distribute Ducats to poor citizens in a specific district, improving general sentiment.',
        category: 'social',
        nature: 'benevolent',
        status: 'Coming Soon',
    },
    {
        name: 'Festival Organisation',
        type: 'festival_organisation',
        purpose: "To organize and sponsor a public festival, boosting community morale and the organizer's reputation.",
        category: 'social',
        nature: 'benevolent',
        status: 'Coming Soon',
    }
  ];
  // Ensure each object conforms to ShortStratagemDefinition and remove any extraneous properties
  const shortDefinitions: ShortStratagemDefinition[] = definitions.map(def => ({
    name: def.name,
    type: def.type,
    purpose: def.purpose,
    category: def.category,
    nature: def.nature, // Added nature
    status: def.status,
  }));

  const categorizedStratagems: Record<string, Record<string, ShortStratagemDefinition[]>> = {};

  for (const stratagem of shortDefinitions) {
    const categoryKey = stratagem.category || 'Uncategorized'; // Default key for null category
    const natureKey = stratagem.nature || 'Unspecified';   // Default key for undefined nature

    if (!categorizedStratagems[categoryKey]) {
      categorizedStratagems[categoryKey] = {};
    }
    if (!categorizedStratagems[categoryKey][natureKey]) {
      categorizedStratagems[categoryKey][natureKey] = [];
    }
    categorizedStratagems[categoryKey][natureKey].push(stratagem);
  }

  return Promise.resolve(categorizedStratagems);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const citizenUsername = searchParams.get('citizenUsername');

  if (!citizenUsername) {
    return NextResponse.json({ success: false, error: 'citizenUsername parameter is required' }, { status: 400 });
  }

  try {
    const citizenRecord = await fetchCitizenDetails(citizenUsername);
    if (!citizenRecord) {
      return NextResponse.json({ success: false, error: `Citizen ${citizenUsername} not found` }, { status: 404 });
    }

    const lastActivityRecord = await fetchLastActivity(citizenUsername);
    const ownedLandsRecords = await fetchOwnedLands(citizenUsername);
    const ownedBuildingsRecords = await fetchOwnedBuildings(citizenUsername);
    const managedBuildingsRecords = await fetchManagedBuildings(citizenUsername);
    const workplaceBuildingRecord = await fetchWorkplaceBuilding(citizenUsername);
    const homeBuildingRecord = await fetchHomeBuilding(citizenUsername);

    const ownedLandsData = [];
    for (const landRecord of ownedLandsRecords) {
      const landId = landRecord.fields.LandId as string;
      if (!landId) continue;

      const buildingsOnLandRecords = await fetchBuildingsOnLand(landId);
      const polygonData = await fetchPolygonDataForLand(landId);

      let unoccupiedBuildingPoints: BuildingPoint[] = [];
      let unoccupiedCanalPoints: CanalPoint[] = [];
      let unoccupiedBridgePoints: BridgePoint[] = [];

      const occupiedBuildingPointIds = new Set<string>();
      const occupiedCanalPointIds = new Set<string>();
      const occupiedBridgePointIds = new Set<string>();

      buildingsOnLandRecords.forEach(bldg => {
        const pointField = bldg.fields.Point;
        const buildingType = (bldg.fields.Type as string || '').toLowerCase();

        const addPointsToSet = (points: unknown, set: Set<string>) => {
          if (typeof points === 'string') {
            set.add(points);
          } else if (Array.isArray(points)) {
            points.forEach(p => {
              if (typeof p === 'string') {
                set.add(p);
              } else {
                // console.warn(`Non-string element in point array: ${p}`);
              }
            });
          } else {
            // console.warn(`Unexpected pointField type: ${typeof points}`, points);
          }
        };

        if (buildingType === 'dock') {
          addPointsToSet(pointField, occupiedCanalPointIds);
        } else if (buildingType === 'bridge' || buildingType === 'rialto_bridge') {
          addPointsToSet(pointField, occupiedBridgePointIds);
        } else {
          // Assume other buildings occupy buildingPoints
          addPointsToSet(pointField, occupiedBuildingPointIds);
        }
      });

      if (polygonData) {
        if (polygonData.buildingPoints) {
          unoccupiedBuildingPoints = polygonData.buildingPoints.filter(bp => !occupiedBuildingPointIds.has(bp.id));
        }
        if (polygonData.canalPoints) {
          unoccupiedCanalPoints = polygonData.canalPoints.filter(cp => !occupiedCanalPointIds.has(cp.id));
        }
        if (polygonData.bridgePoints) {
          unoccupiedBridgePoints = polygonData.bridgePoints.filter(bp => !occupiedBridgePointIds.has(bp.id));
        }
      }
      
      ownedLandsData.push({
        ...normalizeKeysCamelCaseShallow(landRecord.fields),
        airtableId: landRecord.id,
        buildings: buildingsOnLandRecords.map(b => ({...normalizeKeysCamelCaseShallow(b.fields), airtableId: b.id})),
        unoccupiedBuildingPoints: unoccupiedBuildingPoints,
        totalBuildingPoints: polygonData?.buildingPoints?.length || 0,
        unoccupiedCanalPoints: unoccupiedCanalPoints,
        totalCanalPoints: polygonData?.canalPoints?.length || 0,
        unoccupiedBridgePoints: unoccupiedBridgePoints,
        totalBridgePoints: polygonData?.bridgePoints?.length || 0,
      });
    }

    const dataPackage = {
      citizen: {...normalizeKeysCamelCaseShallow(citizenRecord.fields), airtableId: citizenRecord.id},
      lastActivity: lastActivityRecord ? {...normalizeKeysCamelCaseShallow(lastActivityRecord.fields), airtableId: lastActivityRecord.id} : null,
      ownedLands: ownedLandsData,
      ownedBuildings: [] as any[],
      managedBuildings: [] as any[],
      workplaceBuilding: null as any | null,
      homeBuilding: null as any | null, // Initialize homeBuilding
      activeContracts: [] as any[],
      guildDetails: null as any | null,
      citizenLoans: [] as any[],
      strongestRelationships: [] as any[], // Initialize strongestRelationships array
      recentProblems: [] as any[], // Initialize recentProblems array
      recentMessages: [] as any[], // Initialize recentMessages array
      latestDailyUpdate: null as any | null, // Initialize latestDailyUpdate
      availableStratagems: {} as Record<string, Record<string, ShortStratagemDefinition[]>>, // Initialize availableStratagems
      stratagemsExecutedByCitizen: [] as any[], // Stratagems executed by the citizen
      stratagemsTargetingCitizen: [] as any[], // Stratagems targeting the citizen
    };

    // Fetch and add available stratagems (definitions)
    dataPackage.availableStratagems = await fetchStratagemDefinitions(); // Assigns the new categorized structure

    // Fetch and add active stratagems involving the citizen
    const activeStratagemsResult = await fetchCitizenActiveStratagems(citizenUsername);
    dataPackage.stratagemsExecutedByCitizen = activeStratagemsResult.executedBy.map(s => ({...normalizeKeysCamelCaseShallow(s.fields), airtableId: s.id}));
    dataPackage.stratagemsTargetingCitizen = activeStratagemsResult.targetedAt.map(s => ({...normalizeKeysCamelCaseShallow(s.fields), airtableId: s.id}));

    // Fetch and add active contracts
    const activeContractsRecords = await fetchCitizenContracts(citizenUsername);
    dataPackage.activeContracts = activeContractsRecords.map(c => ({...normalizeKeysCamelCaseShallow(c.fields), airtableId: c.id}));

    // Fetch and add guild details if GuildId exists
    const guildId = citizenRecord.fields.GuildId as string;
    if (guildId) {
      const guildRecord = await fetchGuildDetails(guildId);
      if (guildRecord) {
        dataPackage.guildDetails = {...normalizeKeysCamelCaseShallow(guildRecord.fields), airtableId: guildRecord.id};
      }
    }

    // Fetch and add citizen loans
    const citizenLoansRecords = await fetchCitizenLoans(citizenUsername);
    dataPackage.citizenLoans = citizenLoansRecords.map(l => ({...normalizeKeysCamelCaseShallow(l.fields), airtableId: l.id}));

    // Add managed buildings to dataPackage
    dataPackage.managedBuildings = managedBuildingsRecords.map(b => ({...normalizeKeysCamelCaseShallow(b.fields), airtableId: b.id}));

    // Add workplace building to dataPackage
    if (workplaceBuildingRecord) {
      dataPackage.workplaceBuilding = {...normalizeKeysCamelCaseShallow(workplaceBuildingRecord.fields), airtableId: workplaceBuildingRecord.id};
    }

    // Add home building to dataPackage
    if (homeBuildingRecord) {
      dataPackage.homeBuilding = {...normalizeKeysCamelCaseShallow(homeBuildingRecord.fields), airtableId: homeBuildingRecord.id};
    }

    // Fetch and add strongest relationships
    const strongestRelationshipsRecords = await fetchCitizenRelationships(citizenUsername);
    dataPackage.strongestRelationships = strongestRelationshipsRecords.map(r => {
      const normalized = normalizeKeysCamelCaseShallow(r.fields);
      // combinedScore was added temporarily for sorting, remove if not needed in final package
      // or keep if useful client-side. For now, let's assume it's not part of the final schema.
      // delete (r as any).combinedScore; // This would modify the original if not careful
      const { combinedScore, ...fieldsWithoutCombinedScore } = normalized; // Exclude combinedScore from final object
      return {...fieldsWithoutCombinedScore, airtableId: r.id};
    });
    
    // Fetch and add recent problems
    const recentProblemsRecords = await fetchCitizenProblems(citizenUsername);
    dataPackage.recentProblems = recentProblemsRecords.map(p => ({...normalizeKeysCamelCaseShallow(p.fields), airtableId: p.id}));

    // Fetch and add recent messages
    const recentMessagesRecords = await fetchCitizenMessages(citizenUsername);
    dataPackage.recentMessages = recentMessagesRecords.map(m => ({...normalizeKeysCamelCaseShallow(m.fields), airtableId: m.id}));

    // Fetch and add the last daily update
    const lastDailyUpdateRecord = await fetchLastDailyUpdate();
    if (lastDailyUpdateRecord) {
      dataPackage.latestDailyUpdate = {...normalizeKeysCamelCaseShallow(lastDailyUpdateRecord.fields), airtableId: lastDailyUpdateRecord.id};
    }

    for (const buildingRecord of ownedBuildingsRecords) {
      const buildingId = buildingRecord.fields.BuildingId as string;
      if (!buildingId) continue;

      const resourceDetails = await fetchBuildingResourceDetails(buildingId);
      const normalizedBuildingFields = normalizeKeysCamelCaseShallow(buildingRecord.fields);
      
      dataPackage.ownedBuildings.push({
        ...normalizedBuildingFields,
        airtableId: buildingRecord.id,
        resourceDetails: resourceDetails // Add resource details
      });
    }

    return NextResponse.json({ success: true, data: dataPackage });

  } catch (error: any) {
    console.error(`[API get-data-package] Error for ${citizenUsername}:`, error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch data package' }, { status: 500 });
  }
}
