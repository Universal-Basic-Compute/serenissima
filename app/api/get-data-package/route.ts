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

async function fetchLastActivities(username: string, count: number = 5): Promise<AirtableRecord<FieldSet>[]> {
  try {
    const records = await airtable('ACTIVITIES').select({
      filterByFormula: `{Citizen} = '${escapeAirtableValue(username)}'`,
      sort: [{ field: 'EndDate', direction: 'desc' }], // Get the most recently ended or current
      maxRecords: count,
    }).firstPage();
    return [...records]; // Convert ReadonlyArray to Array
  } catch (error) {
    console.error(`Error fetching last ${count} activities for ${username}:`, error);
    return [];
  }
}

async function fetchPlannedActivities(username: string): Promise<AirtableRecord<FieldSet>[]> {
  try {
    const now = new Date().toISOString();
    const records = await airtable('ACTIVITIES').select({
      filterByFormula: `AND({Citizen} = '${escapeAirtableValue(username)}', {Status} = 'created', IS_AFTER({StartDate}, '${now}'))`,
      sort: [{ field: 'StartDate', direction: 'asc' }], // Sort by start date ascending (soonest first)
    }).firstPage();
    return [...records]; // Convert ReadonlyArray to Array
  } catch (error) {
    console.error(`Error fetching planned activities for ${username}:`, error);
    return [];
  }
}

async function fetchOwnedLands(username: string): Promise<AirtableRecord<FieldSet>[]> {
  try {
    const records = await airtable('LANDS').select({
      filterByFormula: `{Owner} = '${escapeAirtableValue(username)}'`,
      sort: [{ field: 'HistoricalName', direction: 'asc' }],
    }).all();
    return [...records]; // Convert ReadonlyArray to Array
  } catch (error) {
    console.error(`Error fetching lands for ${username}:`, error);
    return [];
  }
}

async function fetchAllBuildingsForLands(landIds: string[]): Promise<Record<string, AirtableRecord<FieldSet>[]>> {
  if (!landIds.length) return {};
  
  try {
    // Create a formula that matches any of the landIds
    const escapedLandIds = landIds.map(id => `'${escapeAirtableValue(id)}'`).join(', ');
    const formula = `OR(${landIds.map(id => `{LandId} = '${escapeAirtableValue(id)}'`).join(', ')})`;
    
    const records = await airtable('BUILDINGS').select({
      filterByFormula: formula,
    }).all();
    
    // Group buildings by landId
    const buildingsByLand: Record<string, AirtableRecord<FieldSet>[]> = {};
    
    // Initialize empty arrays for each landId
    landIds.forEach(id => {
      buildingsByLand[id] = [];
    });
    
    // Populate the groups
    records.forEach(record => {
      const landId = record.fields.LandId as string;
      if (landId && buildingsByLand[landId]) {
        buildingsByLand[landId].push(record);
      }
    });
    
    return buildingsByLand;
  } catch (error) {
    console.error(`Error fetching buildings for lands: ${landIds.join(', ')}`, error);
    return {};
  }
}

// Keep this for backward compatibility or specific cases
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

// Cache for polygon data to avoid redundant API calls
const polygonDataCache: Map<string, { data: PolygonData | null, timestamp: number }> = new Map();
const POLYGON_CACHE_TTL = 10 * 60 * 1000; // 10 minutes in milliseconds

async function fetchPolygonDataForLand(landId: string): Promise<PolygonData | null> {
  try {
    // Check cache first
    const now = Date.now();
    const cached = polygonDataCache.get(landId);
    
    if (cached && (now - cached.timestamp < POLYGON_CACHE_TTL)) {
      console.log(`Using cached polygon data for land ${landId}`);
      return cached.data;
    }
    
    console.log(`Fetching polygon data for land ${landId} from API`);
    // Use the existing /api/lands endpoint as it merges polygon data
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/lands?LandId=${encodeURIComponent(landId)}`);
    
    if (!response.ok) {
      console.error(`Failed to fetch polygon data for land ${landId} from /api/lands: ${response.status}`);
      polygonDataCache.set(landId, { data: null, timestamp: now });
      return null;
    }
    
    const data = await response.json();
    if (data.success && data.lands && data.lands.length > 0) {
      // Assuming /api/lands returns buildingPoints in the desired format
      const landData = data.lands[0];
      const polygonData = {
        id: landData.landId, // or landData.id
        buildingPoints: landData.buildingPoints || [],
        canalPoints: landData.canalPoints || [], // Add canalPoints
        bridgePoints: landData.bridgePoints || [], // Add bridgePoints
      };
      
      // Cache the successful response
      polygonDataCache.set(landId, { data: polygonData, timestamp: now });
      return polygonData;
    }
    
    console.warn(`No land data found for ${landId} via /api/lands`);
    polygonDataCache.set(landId, { data: null, timestamp: now });
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
      sort: [{ field: 'Name', direction: 'asc' }],
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
      sort: [{ field: 'Name', direction: 'asc' }],
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

// Cache for building resource details to avoid redundant API calls
const buildingResourceCache: Map<string, { data: BuildingResourceDetails | null, timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

async function fetchBuildingResourceDetails(buildingId: string): Promise<BuildingResourceDetails | null> {
  try {
    // Check cache first
    const now = Date.now();
    const cached = buildingResourceCache.get(buildingId);
    
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      console.log(`Using cached resource details for building ${buildingId}`);
      return cached.data;
    }
    
    console.log(`Fetching resource details for building ${buildingId} from API`);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/building-resources/${encodeURIComponent(buildingId)}`);
    
    if (!response.ok) {
      console.error(`Failed to fetch resource details for building ${buildingId}: ${response.status}`);
      const errorData = { success: false, error: `Failed to fetch resource details: ${response.status}` };
      
      // Cache the error response too to avoid hammering the API with failing requests
      buildingResourceCache.set(buildingId, { data: errorData, timestamp: now });
      return errorData;
    }
    
    const data = await response.json();
    
    // Cache the successful response
    buildingResourceCache.set(buildingId, { data, timestamp: now });
    return data as BuildingResourceDetails;
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
      sort: [{ field: 'CreatedAt', direction: 'desc' }],
      maxRecords: 20, // Limit to 20 records
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
      maxRecords: 20, // Limit to 20 records
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
  executedByPast: AirtableRecord<FieldSet>[]; // New: Past executed by citizen
  targetedAtPast: AirtableRecord<FieldSet>[]; // New: Past targeted at citizen
}

async function fetchCitizenActiveStratagems(username: string): Promise<ActiveStratagemsResult> {
  const result: ActiveStratagemsResult = { executedBy: [], targetedAt: [], executedByPast: [], targetedAtPast: [] };
  try {
    const escapedUsername = escapeAirtableValue(username);
    const nowFilter = `OR({ExpiresAt} = BLANK(), IS_AFTER({ExpiresAt}, NOW()))`;

    // --- Active Stratagems ---
    // Active Stratagems executed by the citizen
    const activeExecutedByFormula = `
      AND(
        {ExecutedBy} = '${escapedUsername}',
        {Status} = 'active',
        ${nowFilter}
      )
    `.replace(/\s+/g, ' ');

    const activeExecutedByRecords = await airtable('STRATAGEMS').select({
      filterByFormula: activeExecutedByFormula,
      sort: [{ field: 'CreatedAt', direction: 'desc' }],
    }).all();
    result.executedBy = [...activeExecutedByRecords];

    // Active Stratagems targeting the citizen (and not executed by them)
    const activeTargetedAtFormula = `
      AND(
        {TargetCitizen} = '${escapedUsername}',
        NOT({ExecutedBy} = '${escapedUsername}'),
        {Status} = 'active',
        ${nowFilter}
      )
    `.replace(/\s+/g, ' ');

    const activeTargetedAtRecords = await airtable('STRATAGEMS').select({
      filterByFormula: activeTargetedAtFormula,
      sort: [{ field: 'CreatedAt', direction: 'desc' }],
    }).all();
    result.targetedAt = [...activeTargetedAtRecords];

    // --- Past Executed Stratagems (Status = 'executed') ---
    // Past Stratagems executed by the citizen
    const pastExecutedByFormula = `
      AND(
        {ExecutedBy} = '${escapedUsername}',
        {Status} = 'executed'
      )
    `.replace(/\s+/g, ' ');

    const pastExecutedByRecords = await airtable('STRATAGEMS').select({
      filterByFormula: pastExecutedByFormula,
      sort: [{ field: 'ExecutedAt', direction: 'desc' }], // Sort by when it was executed
      maxRecords: 20, // Limit past records for brevity
    }).all();
    result.executedByPast = [...pastExecutedByRecords];

    // Past Stratagems targeting the citizen (and not executed by them)
    const pastTargetedAtFormula = `
      AND(
        {TargetCitizen} = '${escapedUsername}',
        NOT({ExecutedBy} = '${escapedUsername}'),
        {Status} = 'executed'
      )
    `.replace(/\s+/g, ' ');

    const pastTargetedAtRecords = await airtable('STRATAGEMS').select({
      filterByFormula: pastTargetedAtFormula,
      sort: [{ field: 'ExecutedAt', direction: 'desc' }], // Sort by when it was executed
      maxRecords: 20, // Limit past records for brevity
    }).all();
    result.targetedAtPast = [...pastTargetedAtRecords];

  } catch (error) {
    console.error(`Error fetching stratagems for citizen ${username}:`, error);
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
  nature?: 'benevolent' | 'neutral' | 'aggressive' | 'illegal' | string; // Modified to accept any string
  status: 'Implemented' | 'Coming Soon' | 'Partially Implemented' | string; // Modified to accept any string
}


async function fetchStratagemDefinitions(): Promise<Record<string, Record<string, ShortStratagemDefinition[]>>> {
  const definitions = [ // No longer explicitly typed as StratagemDefinition[] here
    {
      name: 'Undercut',
      type: 'undercut',
      purpose: "To strategically lower the selling prices of a citizen's goods to be cheaper than their competition for a specific resource type.",
      category: 'commerce',
      nature: 'aggressive',
      status: 'Coming Soon',
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
      status: 'Coming Soon',
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
      status: 'Coming Soon',
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
        status: 'Implemented',
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

// --- Markdown Conversion Utilities ---

function formatDate(dateString?: string | Date): string {
  if (!dateString) return 'N/A';
  try {
    // Ensure dates are displayed in Venice time for human readability
    return new Date(dateString).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Rome' });
  } catch (e) {
    return String(dateString); // Fallback if date is invalid
  }
}

function formatSimpleObjectForMarkdown(obj: Record<string, any> | null, fieldsToDisplay?: string[]): string {
  if (!obj) return '- Not available\n';
  let md = '';
  const keys = fieldsToDisplay || Object.keys(obj);
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      let displayValue: string;
      if (value === null || typeof value === 'undefined') {
        displayValue = 'N/A';
      } else if (typeof value === 'string' && (key.toLowerCase().includes('date') || key.toLowerCase().includes('at'))) {
        // Attempt to format date strings
        const parsedDate = new Date(value);
        if (!isNaN(parsedDate.getTime())) {
          displayValue = formatDate(parsedDate);
        } else {
          displayValue = String(value);
        }
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        displayValue = `\n    - ${Object.entries(value).map(([k, v]) => `**${k}**: ${v}`).join('\n    - ')}`;
      } else if (Array.isArray(value)) {
        if (value.every(item => typeof item !== 'object')) {
          displayValue = value.join(', ');
        } else {
          displayValue = `[${value.length} objects]`; // Summary for array of objects
        }
      } else {
        displayValue = String(value);
      }
      md += `- **${key}**: ${displayValue}\n`;
    }
  }
  return md;
}

function convertDataPackageToMarkdown(dataPackage: any, citizenUsername: string | null): string {
  let md = `# Data Package for ${citizenUsername || 'Unknown Citizen'}\n\n`;

  // Citizen Details
  md += `## Citizen Details\n`;
  
  // Format ducats as integer if present
  if (dataPackage.citizen?.ducats !== undefined && dataPackage.citizen.ducats !== null) {
    dataPackage.citizen.ducats = Math.floor(Number(dataPackage.citizen.ducats));
  }
  
  md += formatSimpleObjectForMarkdown(dataPackage.citizen, ['username', 'firstName', 'lastName', 'socialClass', 'ducats', 'isAI', 'inVenice', 'homeCity', 'influence', 'specialty']);
  
  if (dataPackage.citizen?.corePersonality) {
    let personalityDisplay = String(dataPackage.citizen.corePersonality); // Fallback
    if (typeof dataPackage.citizen.corePersonality === 'string') {
      try {
        const parsedPersonality = JSON.parse(dataPackage.citizen.corePersonality);
        if (Array.isArray(parsedPersonality)) {
          // Format as a JSON array string, e.g., ["Trait1", "Trait2"]
          personalityDisplay = JSON.stringify(parsedPersonality);
        }
      } catch (e) {
        // If parsing fails, personalityDisplay remains the original string
        console.warn(`[API get-data-package] Could not parse corePersonality as JSON array: ${dataPackage.citizen.corePersonality}`, e);
      }
    }
    md += `- **corePersonality**: ${personalityDisplay}\n`;
  }
  
  // Add personality if available
  if (dataPackage.citizen?.personality) {
    md += `\n### Personality\n${dataPackage.citizen.personality}\n`;
  }
  
  // Add description if available
  if (dataPackage.citizen?.description) {
    md += `\n### Description\n${dataPackage.citizen.description}\n`;
  }
  
  md += '\n';

  // Current Location
  md += `## Current Location\n`;
  
  // Handle position display
  if (dataPackage.citizen?.position) {
    // Check if there's a building at this position
    let locationDescription = "";
    
    // Check if the citizen is at a building
    const buildingAtPosition = dataPackage.citizen.buildingAtPosition;
    const buildingDetails = dataPackage.citizen.buildingDetails;
    const citizensAtSamePosition = dataPackage.citizen.citizensAtSamePosition || [];
    
    if (buildingAtPosition) {
      // Format the location with building name and other citizens if any
      locationDescription = `At ${buildingAtPosition}`;
      
      // Add building details if available
      if (buildingDetails) {
        if (buildingDetails.category) {
          locationDescription += ` (${buildingDetails.category})`;
        }
        
        if (buildingDetails.owner && buildingDetails.owner !== citizenUsername) {
          locationDescription += `, owned by ${buildingDetails.owner}`;
        }
        
        if (buildingDetails.runBy && buildingDetails.runBy !== citizenUsername && buildingDetails.runBy !== buildingDetails.owner) {
          locationDescription += `, run by ${buildingDetails.runBy}`;
        }
      }
      
      if (citizensAtSamePosition.length > 0) {
        locationDescription += `\n- **With**: ${citizensAtSamePosition.length} other citizen${citizensAtSamePosition.length > 1 ? 's' : ''}`;
        
        // Add the list of citizens with more details if available
        if (citizensAtSamePosition.length <= 5) {
          // Show all citizens if 5 or fewer
          citizensAtSamePosition.forEach((citizen, index) => {
            if (typeof citizen === 'object' && citizen.username) {
              const name = [citizen.firstName, citizen.lastName].filter(Boolean).join(' ');
              const displayName = name ? `${citizen.username} (${name})` : citizen.username;
              const socialClass = citizen.socialClass ? `, ${citizen.socialClass}` : '';
              locationDescription += `\n  ${index + 1}. ${displayName}${socialClass}`;
            } else {
              locationDescription += `\n  ${index + 1}. ${citizen}`;
            }
          });
        } else {
          // Show all citizens if more than 5
          citizensAtSamePosition.forEach((citizen, index) => {
            if (typeof citizen === 'object' && citizen.username) {
              const name = [citizen.firstName, citizen.lastName].filter(Boolean).join(' ');
              const displayName = name ? `${citizen.username} (${name})` : citizen.username;
              const socialClass = citizen.socialClass ? `, ${citizen.socialClass}` : '';
              locationDescription += `\n  ${index + 1}. ${displayName}${socialClass}`;
            } else {
              locationDescription += `\n  ${index + 1}. ${citizen}`;
            }
          });
        }
      }
    } else if (dataPackage.citizen.position.lat && dataPackage.citizen.position.lng) {
      // If coordinates are valid but no building found
      locationDescription = dataPackage.citizen.inVenice ? "In the streets of Venice" : "Navigating the world";
      
      // Add other citizens if any
      if (citizensAtSamePosition.length > 0) {
        locationDescription += `\n- **With**: ${citizensAtSamePosition.length} other citizen${citizensAtSamePosition.length > 1 ? 's' : ''}`;
        
        // Add the list of citizens with more details if available
        if (citizensAtSamePosition.length <= 5) {
          citizensAtSamePosition.forEach((citizen, index) => {
            if (typeof citizen === 'object' && citizen.username) {
              const name = [citizen.firstName, citizen.lastName].filter(Boolean).join(' ');
              const displayName = name ? `${citizen.username} (${name})` : citizen.username;
              const socialClass = citizen.socialClass ? `, ${citizen.socialClass}` : '';
              locationDescription += `\n  ${index + 1}. ${displayName}${socialClass}`;
            } else {
              locationDescription += `\n  ${index + 1}. ${citizen}`;
            }
          });
        } else {
          citizensAtSamePosition.forEach((citizen, index) => {
            if (typeof citizen === 'object' && citizen.username) {
              const name = [citizen.firstName, citizen.lastName].filter(Boolean).join(' ');
              const displayName = name ? `${citizen.username} (${name})` : citizen.username;
              const socialClass = citizen.socialClass ? `, ${citizen.socialClass}` : '';
              locationDescription += `\n  ${index + 1}. ${displayName}${socialClass}`;
            } else {
              locationDescription += `\n  ${index + 1}. ${citizen}`;
            }
          });
        }
      }
    } else {
      // If coordinates are invalid
      locationDescription = "In the streets of Venice";
    }
    
    // Add coordinates for debugging if needed
    const positionDebug = dataPackage.citizen.position.lat && dataPackage.citizen.position.lng 
      ? ` (${dataPackage.citizen.position.lat.toFixed(6)}, ${dataPackage.citizen.position.lng.toFixed(6)})`
      : '';
    
    md += `${locationDescription}${positionDebug}\n`;
  } else {
    md += `Location not available\n`;
  }
  md += '\n';

  // Last Activity
  md += `## Last Activity\n`;
  md += formatSimpleObjectForMarkdown(dataPackage.lastActivity, ['type', 'title', 'status', 'startDate', 'endDate']);
  md += '\n';
  
  // Last 5 Activities
  md += `## Recent Activities (Last 5)\n`;
  if (dataPackage.lastActivities && dataPackage.lastActivities.length > 0) {
    dataPackage.lastActivities.forEach((activity: any, index: number) => {
      md += `### Activity ${index + 1}: ${activity.title || activity.type}\n`;
      md += formatSimpleObjectForMarkdown(activity, ['type', 'status', 'startDate', 'endDate', 'description', 'thought']);
    });
  } else {
    md += `- No recent activities found.\n`;
  }
  md += '\n';
  
  // Planned Activities
  md += `## Planned Activities\n`;
  if (dataPackage.plannedActivities && dataPackage.plannedActivities.length > 0) {
    dataPackage.plannedActivities.forEach((activity: any, index: number) => {
      md += `### Planned Activity ${index + 1}: ${activity.title || activity.type}\n`;
      md += formatSimpleObjectForMarkdown(activity, ['type', 'status', 'startDate', 'endDate', 'description', 'thought']);
    });
  } else {
    md += `- No planned activities found.\n`;
  }
  md += '\n';

  // Workplace
  md += `## Workplace\n`;
  md += formatSimpleObjectForMarkdown(dataPackage.workplaceBuilding, ['name', 'type', 'category', 'buildingId']);
  md += '\n';
  
  // Home
  md += `## Home\n`;
  md += formatSimpleObjectForMarkdown(dataPackage.homeBuilding, ['name', 'type', 'category', 'buildingId']);
  md += '\n';

  // Owned Lands
  md += `## Owned Lands (${dataPackage.ownedLands?.length || 0})\n`;
  if (dataPackage.ownedLands && dataPackage.ownedLands.length > 0) {
    dataPackage.ownedLands.forEach((land: any, index: number) => {
      md += `### Land ${index + 1}: ${land.historicalName || land.englishName || land.landId}\n`;
      md += formatSimpleObjectForMarkdown(land, ['landId', 'owner', 'district', 'lastIncome']);
      md += `- **Building Points**: ${land.unoccupiedBuildingPoints?.length || 0} unoccupied / ${land.totalBuildingPoints || 0} total\n`;
      // Optionally list unoccupied points if needed
      md += `- **Canal Points**: ${land.unoccupiedCanalPoints?.length || 0} unoccupied / ${land.totalCanalPoints || 0} total\n`;
      md += `- **Bridge Points**: ${land.unoccupiedBridgePoints?.length || 0} unoccupied / ${land.totalBridgePoints || 0} total\n`;
      
      if (land.buildings && land.buildings.length > 0) {
        // Filter buildings to only show those owned by the user
        const ownedBuildings = land.buildings.filter((building: any) => 
          building.owner === citizenUsername
        );
        
        if (ownedBuildings.length > 0) {
          md += `#### Buildings on this land owned by you (${ownedBuildings.length}):\n`;
          ownedBuildings.forEach((building: any, bIndex: number) => {
            md += `##### Building ${bIndex + 1}: ${building.name || building.buildingId}\n`;
            md += formatSimpleObjectForMarkdown(building, ['type', 'category', 'runBy', 'occupant', 'isConstructed']);
          });
        } else {
          md += `#### Buildings on this land: None owned by you\n`;
        }
      }
      md += '\n';
    });
  } else {
    md += `- No lands owned.\n\n`;
  }

  // Owned Buildings (not on owned lands - this logic might need adjustment based on how dataPackage is structured)
  // Assuming ownedBuildings are those not already listed under ownedLands
  md += `## Other Owned Buildings (${dataPackage.ownedBuildings?.length || 0})\n`;
  if (dataPackage.ownedBuildings && dataPackage.ownedBuildings.length > 0) {
    dataPackage.ownedBuildings.forEach((building: any, index: number) => {
      md += `### Building ${index + 1}: ${building.name || building.buildingId}\n`;
      md += formatSimpleObjectForMarkdown(building, ['type', 'category', 'owner', 'runBy', 'occupant', 'isConstructed', 'landId']);
      
      if (building.resourceDetails) {
        md += `#### Resource Details for ${building.name || building.buildingId}:\n`;
        const rd = building.resourceDetails;
        if (rd.storage) {
          md += `- **Storage**: Used ${rd.storage.used || 0} / Capacity ${rd.storage.capacity || 0}\n`;
        }
        if (rd.resources?.stored && rd.resources.stored.length > 0) {
          md += `- **Stored Resources (${rd.resources.stored.length})**:\n`;
          rd.resources.stored.forEach((res: any) => {
            md += `  - ${res.name || res.type} (Count: ${res.count}, Owner: ${res.owner})\n`;
          });
        }
        if (rd.resources?.publiclySold && rd.resources.publiclySold.length > 0) {
          md += `- **Publicly Sold (${rd.resources.publiclySold.length})**:\n`;
          rd.resources.publiclySold.forEach((contract: any) => {
            md += `  - ${contract.resourceName || contract.resourceType} (Price: ${contract.pricePerResource}, Amount: ${contract.targetAmount || contract.amount})\n`;
          });
        }
         if (rd.resources?.transformationRecipes && rd.resources.transformationRecipes.length > 0) {
            md += `- **Production Recipes (${rd.resources.transformationRecipes.length})**:\n`;
            rd.resources.transformationRecipes.forEach((recipe: any) => {
                const inputs = recipe.inputs.map((i: any) => `${i.count || i.amount || 0} ${i.name || i.type}`).join(', ');
                const outputs = recipe.outputs.map((o: any) => `${o.count || o.amount || 0} ${o.name || o.type}`).join(', ');
                md += `  - Recipe: ${recipe.recipeName || 'Production Recipe'}\n`;
                md += `    - Inputs: ${inputs}\n`;
                md += `    - Outputs: ${outputs}\n`;
                md += `    - Duration: ${recipe.durationMinutes || recipe.craftMinutes || 0} minutes\n`;
            });
        }
        md += '\n';
      }
    });
  } else {
    md += `- No other buildings owned.\n\n`;
  }

  // Managed Buildings
  md += `## Managed Buildings (${dataPackage.managedBuildings?.length || 0})\n`;
  if (dataPackage.managedBuildings && dataPackage.managedBuildings.length > 0) {
    dataPackage.managedBuildings.forEach((building: any, index: number) => {
      md += `### Building ${index + 1}: ${building.name || building.buildingId}\n`;
      md += formatSimpleObjectForMarkdown(building, ['type', 'category', 'owner', 'occupant', 'isConstructed']);
    });
  } else {
    md += `- No buildings managed.\n\n`;
  }
  
  // Active Contracts
  md += `## Active Contracts (${dataPackage.activeContracts?.length || 0})\n`;
  if (dataPackage.activeContracts && dataPackage.activeContracts.length > 0) {
    dataPackage.activeContracts.forEach((contract: any, index: number) => {
      md += `### Contract ${index + 1}: ${contract.title || contract.contractId}\n`;
      md += formatSimpleObjectForMarkdown(contract, ['type', 'buyer', 'seller', 'resourceType', 'pricePerResource', 'targetAmount', 'status', 'createdAt', 'endAt']);
    });
    if (dataPackage.activeContracts.length === 20) {
      md += `- ... (and more)\n`;
    }
    md += '\n';
  } else {
    md += `- No active contracts.\n\n`;
  }

  // Guild Details
  md += `## Guild Details\n`;
  md += formatSimpleObjectForMarkdown(dataPackage.guildDetails, ['guildName', 'guildId', 'guildTier', 'shortDescription']);
  md += '\n';

  // Citizen Loans
  md += `## Loans (${dataPackage.citizenLoans?.length || 0})\n`;
  if (dataPackage.citizenLoans && dataPackage.citizenLoans.length > 0) {
    dataPackage.citizenLoans.forEach((loan: any, index: number) => {
      md += `### Loan ${index + 1}: ${loan.name || loan.loanId}\n`;
      md += formatSimpleObjectForMarkdown(loan, ['lender', 'borrower', 'type', 'status', 'principalAmount', 'interestRate', 'termDays', 'remainingBalance', 'createdAt']);
    });
  } else {
    md += `- No loans.\n\n`;
  }

  // Strongest Relationships
  md += `## Strongest Relationships (Top 20) (${dataPackage.strongestRelationships?.length || 0})\n`;
  if (dataPackage.strongestRelationships && dataPackage.strongestRelationships.length > 0) {
    dataPackage.strongestRelationships.forEach((rel: any, index: number) => {
      const otherCitizen = rel.citizen1 === citizenUsername ? rel.citizen2 : rel.citizen1;
      md += `### Relationship ${index + 1} with ${otherCitizen}\n`;
      
      // Add title with proper formatting if available
      if (rel.title) {
        md += `- **Relationship Type**: ${rel.title}\n`;
      }
      
      // Add description with proper formatting if available
      if (rel.description) {
        md += `- **Description**: ${rel.description}\n`;
      }
      
      // Add other relationship details
      md += `- **Status**: ${rel.status || 'Unknown'}\n`;
      md += `- **Strength Score**: ${rel.strengthScore || '0'}\n`;
      md += `- **Trust Score**: ${rel.trustScore || '0'}\n`;
      
      // Format the last interaction date if available
      if (rel.lastInteraction) {
        md += `- **Last Interaction**: ${formatDate(rel.lastInteraction)}\n`;
      }
    });
    if (dataPackage.strongestRelationships.length === 20) {
      md += `- ... (and more)\n`;
    }
    md += '\n';
  } else {
    md += `- No significant relationships.\n\n`;
  }

  // Recent Problems
  md += `## Recent Problems (${dataPackage.recentProblems?.length || 0})\n`;
  if (dataPackage.recentProblems && dataPackage.recentProblems.length > 0) {
    dataPackage.recentProblems.forEach((problem: any, index: number) => {
      md += `### Problem ${index + 1}: ${problem.title || problem.problemId}\n`;
      md += formatSimpleObjectForMarkdown(problem, ['type', 'assetType', 'asset', 'status', 'severity', 'description', 'createdAt']);
    });
    if (dataPackage.recentProblems.length === 20) {
      md += `- ... (and more)\n`;
    }
    md += '\n';
  } else {
    md += `- No recent problems.\n\n`;
  }

  // Recent Messages
  md += `## Recent Messages (Last 20) (${dataPackage.recentMessages?.length || 0})\n`;
  if (dataPackage.recentMessages && dataPackage.recentMessages.length > 0) {
    dataPackage.recentMessages.forEach((message: any, index: number) => {
      md += `### Message ${index + 1}\n`;
      md += formatSimpleObjectForMarkdown(message, ['sender', 'receiver', 'type', 'content', 'channel', 'createdAt']);
    });
    if (dataPackage.recentMessages.length === 20) {
      md += `- ... (and more)\n`;
    }
    md += '\n';
  } else {
    md += `- No recent messages.\n\n`;
  }
  
  // Latest Daily Update
  md += `## Latest Daily Update\n`;
  md += formatSimpleObjectForMarkdown(dataPackage.latestDailyUpdate, ['title', 'content', 'createdAt']);
  md += '\n';

  // Available Stratagems
  md += `## Available Stratagems\n`;
  if (dataPackage.availableStratagems && Object.keys(dataPackage.availableStratagems).length > 0) {
    for (const [category, natures] of Object.entries(dataPackage.availableStratagems as Record<string, Record<string, ShortStratagemDefinition[]>>)) {
      md += `### Category: ${category}\n`;
      for (const [nature, stratagems] of Object.entries(natures)) {
        md += `#### Nature: ${nature} (${stratagems.length} stratagems)\n`;
        stratagems.forEach(strat => {
          md += `##### ${strat.name}\n`;
          md += `- **Type**: ${strat.type}\n`;
          md += `- **Purpose**: ${strat.purpose}\n`;
          md += `- **Status**: ${strat.status}\n\n`;
        });
      }
    }
  } else {
    md += `- No stratagem definitions available.\n\n`;
  }

  // Active Stratagems Executed By Citizen
  md += `## Active Stratagems Executed By Citizen (${dataPackage.stratagemsExecutedByCitizen?.length || 0})\n`;
  if (dataPackage.stratagemsExecutedByCitizen && dataPackage.stratagemsExecutedByCitizen.length > 0) {
    dataPackage.stratagemsExecutedByCitizen.forEach((strat: any, index: number) => {
      md += `### Stratagem ${index + 1}: ${strat.name || strat.stratagemId}\n`;
      md += formatSimpleObjectForMarkdown(strat, ['type', 'variant', 'targetCitizen', 'targetBuilding', 'targetResourceType', 'status', 'executedAt', 'expiresAt']);
    });
  } else {
    md += `- No active stratagems executed by this citizen.\n\n`;
  }

  // Active Stratagems Targeting Citizen
  md += `## Active Stratagems Targeting Citizen (${dataPackage.stratagemsTargetingCitizen?.length || 0})\n`;
  if (dataPackage.stratagemsTargetingCitizen && dataPackage.stratagemsTargetingCitizen.length > 0) {
    dataPackage.stratagemsTargetingCitizen.forEach((strat: any, index: number) => {
      md += `### Stratagem ${index + 1}: ${strat.name || strat.stratagemId} (Executed by: ${strat.executedBy})\n`;
      md += formatSimpleObjectForMarkdown(strat, ['type', 'variant', 'targetBuilding', 'targetResourceType', 'status', 'executedAt', 'expiresAt']);
    });
  } else {
    md += `- No active stratagems targeting this citizen.\n\n`;
  }

  // Past Executed Stratagems Executed By Citizen
  md += `## Past Stratagems Executed By Citizen (Last 20) (${dataPackage.stratagemsExecutedByCitizenPast?.length || 0})\n`;
  if (dataPackage.stratagemsExecutedByCitizenPast && dataPackage.stratagemsExecutedByCitizenPast.length > 0) {
    dataPackage.stratagemsExecutedByCitizenPast.forEach((strat: any, index: number) => {
      md += `### Stratagem ${index + 1}: ${strat.name || strat.stratagemId}\n`;
      md += formatSimpleObjectForMarkdown(strat, ['type', 'variant', 'targetCitizen', 'targetBuilding', 'targetResourceType', 'status', 'executedAt', 'expiresAt']);
    });
    if (dataPackage.stratagemsExecutedByCitizenPast.length === 20) {
      md += `- ... (and more)\n`;
    }
  } else {
    md += `- No past stratagems recorded as executed by this citizen.\n\n`;
  }

  // Past Executed Stratagems Targeting Citizen
  md += `## Past Stratagems Targeting Citizen (Last 20) (${dataPackage.stratagemsTargetingCitizenPast?.length || 0})\n`;
  if (dataPackage.stratagemsTargetingCitizenPast && dataPackage.stratagemsTargetingCitizenPast.length > 0) {
    dataPackage.stratagemsTargetingCitizenPast.forEach((strat: any, index: number) => {
      md += `### Stratagem ${index + 1}: ${strat.name || strat.stratagemId} (Executed by: ${strat.executedBy})\n`;
      md += formatSimpleObjectForMarkdown(strat, ['type', 'variant', 'targetBuilding', 'targetResourceType', 'status', 'executedAt', 'expiresAt']);
    });
    if (dataPackage.stratagemsTargetingCitizenPast.length === 20) {
      md += `- ... (and more)\n`;
    }
  } else {
    md += `- No past stratagems recorded as targeting this citizen.\n\n`;
  }

  return md;
}
// --- End Markdown Conversion Utilities ---

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const citizenUsername = searchParams.get('citizenUsername');
  const format = searchParams.get('format') || 'markdown'; // Default to markdown

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

    // Extract all landIds first
    const landIds = ownedLandsRecords
      .map(landRecord => landRecord.fields.LandId as string)
      .filter(Boolean);
    
    // Fetch all buildings for all lands in one batch
    const allBuildingsByLand = await fetchAllBuildingsForLands(landIds);
    
    // Process each land with its buildings
    const ownedLandsData = [];
    for (const landRecord of ownedLandsRecords) {
      const landId = landRecord.fields.LandId as string;
      if (!landId) continue;

      const buildingsOnLandRecords = allBuildingsByLand[landId] || [];
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

    // Parse citizen position if available
    let citizenPosition = null;
    if (citizenRecord.fields.Position) {
      try {
        citizenPosition = JSON.parse(citizenRecord.fields.Position as string);
      } catch (e) {
        console.warn(`Could not parse citizen position: ${citizenRecord.fields.Position}`);
      }
    }
    
    // Find building at citizen position using API and direct building checks
    let buildingAtPosition = null;
    let citizensAtSamePosition = []; // Initialize the array here to avoid undefined errors
    let buildingDetails = null;
    
    // First check if the citizen is at their workplace or home
    if (citizenPosition && citizenPosition.lat && citizenPosition.lng) {
      // Check workplace
      if (workplaceBuildingRecord && workplaceBuildingRecord.fields.Position) {
        try {
          const workplacePosition = JSON.parse(workplaceBuildingRecord.fields.Position as string);
          if (workplacePosition.lat === citizenPosition.lat && workplacePosition.lng === citizenPosition.lng) {
            buildingAtPosition = workplaceBuildingRecord.fields.Name || workplaceBuildingRecord.fields.Type;
            buildingDetails = {
              id: workplaceBuildingRecord.id,
              buildingId: workplaceBuildingRecord.fields.BuildingId,
              type: workplaceBuildingRecord.fields.Type,
              category: workplaceBuildingRecord.fields.Category,
              owner: workplaceBuildingRecord.fields.Owner,
              runBy: workplaceBuildingRecord.fields.RunBy
            };
            console.log(`Citizen is at workplace: ${buildingAtPosition}`);
          }
        } catch (e) {
          console.warn(`Could not parse workplace position: ${workplaceBuildingRecord.fields.Position}`);
        }
      }
      
      // Check home if not at workplace
      if (!buildingAtPosition && homeBuildingRecord && homeBuildingRecord.fields.Position) {
        try {
          const homePosition = JSON.parse(homeBuildingRecord.fields.Position as string);
          if (homePosition.lat === citizenPosition.lat && homePosition.lng === citizenPosition.lng) {
            buildingAtPosition = homeBuildingRecord.fields.Name || homeBuildingRecord.fields.Type;
            buildingDetails = {
              id: homeBuildingRecord.id,
              buildingId: homeBuildingRecord.fields.BuildingId,
              type: homeBuildingRecord.fields.Type,
              category: homeBuildingRecord.fields.Category,
              owner: homeBuildingRecord.fields.Owner,
              runBy: homeBuildingRecord.fields.RunBy
            };
            console.log(`Citizen is at home: ${buildingAtPosition}`);
          }
        } catch (e) {
          console.warn(`Could not parse home position: ${homeBuildingRecord.fields.Position}`);
        }
      }
      
      // If still not found, try the citizens-at-position API which has better position matching
      if (!buildingAtPosition || true) { // Always fetch citizens at position for enhanced display
        try {
          // Use the full URL with baseUrl for the API call
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          const positionQueryUrl = `${baseUrl}/api/get-citizens-at-position?lat=${citizenPosition.lat}&lng=${citizenPosition.lng}`;
          console.log(`Querying citizens and buildings at position: ${positionQueryUrl}`);
          
          const positionResponse = await fetch(positionQueryUrl);
          
          if (positionResponse.ok) {
            const positionData = await positionResponse.json();
            
            // Get building information if not already found
            if (!buildingAtPosition && positionData.success && positionData.building) {
              buildingAtPosition = positionData.building.name || positionData.building.type;
              buildingDetails = positionData.building;
              console.log(`Found building at citizen position via citizens-at-position API: ${buildingAtPosition}`);
            }
            
            // Get other citizens at the same position
            if (positionData.success && positionData.citizens && positionData.citizens.length > 0) {
              // Filter out the current citizen
              citizensAtSamePosition = positionData.citizens
                .filter(c => c.username !== citizenUsername)
                .map(c => ({
                  username: c.username,
                  firstName: c.firstName,
                  lastName: c.lastName,
                  socialClass: c.socialClass
                }));
              
              console.log(`Found ${citizensAtSamePosition.length} other citizens at the same position`);
            }
          } else {
            console.error(`citizens-at-position API response not OK: ${positionResponse.status}`);
          }
        } catch (error) {
          console.error('Error fetching building at position:', error);
        }
      }
    } else {
      console.log(`Invalid citizen position: ${JSON.stringify(citizenPosition)}`);
    }

    const dataPackage = {
      citizen: {
        ...normalizeKeysCamelCaseShallow(citizenRecord.fields), 
        airtableId: citizenRecord.id,
        buildingAtPosition: buildingAtPosition, // Add the building name at position
        buildingDetails: buildingDetails, // Add detailed building information
        citizensAtSamePosition: citizensAtSamePosition // Add other citizens at the same position with more details
      },
      lastActivity: lastActivityRecord ? {...normalizeKeysCamelCaseShallow(lastActivityRecord.fields), airtableId: lastActivityRecord.id} : null,
      lastActivities: [] as any[], // Initialize lastActivities array
      plannedActivities: [] as any[], // Initialize plannedActivities array
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
      stratagemsExecutedByCitizen: [] as any[], // Active Stratagems executed by the citizen
      stratagemsTargetingCitizen: [] as any[], // Active Stratagems targeting the citizen
      stratagemsExecutedByCitizenPast: [] as any[], // Past Executed Stratagems by citizen
      stratagemsTargetingCitizenPast: [] as any[], // Past Executed Stratagems targeting citizen
    };

    // Parallelize all independent data fetching operations
    const [
      availableStratagems,
      stratagemsResult,
      activeContractsRecords,
      guildRecord,
      citizenLoansRecords,
      strongestRelationshipsRecords,
      recentProblemsRecords,
      recentMessagesRecords,
      lastDailyUpdateRecord,
      lastActivitiesRecords,
      plannedActivitiesRecords
    ] = await Promise.all([
      fetchStratagemDefinitions(),
      fetchCitizenActiveStratagems(citizenUsername),
      fetchCitizenContracts(citizenUsername),
      citizenRecord.fields.GuildId ? fetchGuildDetails(citizenRecord.fields.GuildId as string) : Promise.resolve(null),
      fetchCitizenLoans(citizenUsername),
      fetchCitizenRelationships(citizenUsername),
      fetchCitizenProblems(citizenUsername),
      fetchCitizenMessages(citizenUsername),
      fetchLastDailyUpdate(),
      fetchLastActivities(citizenUsername, 5),
      fetchPlannedActivities(citizenUsername)
    ]);

    // Assign results to dataPackage
    dataPackage.availableStratagems = availableStratagems;
    
    // Last Activities - filter out duplicates of the last activity
    if (lastActivityRecord) {
      const lastActivityId = lastActivityRecord.id;
      // Filter out the last activity from the recent activities list to avoid duplication
      dataPackage.lastActivities = lastActivitiesRecords
        .filter(a => a.id !== lastActivityId)
        .map(a => ({...normalizeKeysCamelCaseShallow(a.fields), airtableId: a.id}));
    } else {
      dataPackage.lastActivities = lastActivitiesRecords.map(a => ({...normalizeKeysCamelCaseShallow(a.fields), airtableId: a.id}));
    }
    
    // Planned Activities
    dataPackage.plannedActivities = plannedActivitiesRecords.map(a => ({...normalizeKeysCamelCaseShallow(a.fields), airtableId: a.id}));
    
    // Stratagems
    dataPackage.stratagemsExecutedByCitizen = stratagemsResult.executedBy.map(s => ({...normalizeKeysCamelCaseShallow(s.fields), airtableId: s.id}));
    dataPackage.stratagemsTargetingCitizen = stratagemsResult.targetedAt.map(s => ({...normalizeKeysCamelCaseShallow(s.fields), airtableId: s.id}));
    dataPackage.stratagemsExecutedByCitizenPast = stratagemsResult.executedByPast.map(s => ({...normalizeKeysCamelCaseShallow(s.fields), airtableId: s.id}));
    dataPackage.stratagemsTargetingCitizenPast = stratagemsResult.targetedAtPast.map(s => ({...normalizeKeysCamelCaseShallow(s.fields), airtableId: s.id}));
    
    // Contracts
    dataPackage.activeContracts = activeContractsRecords.map(c => ({...normalizeKeysCamelCaseShallow(c.fields), airtableId: c.id}));

    // Guild details
    if (guildRecord) {
      dataPackage.guildDetails = {...normalizeKeysCamelCaseShallow(guildRecord.fields), airtableId: guildRecord.id};
    }

    // Loans
    dataPackage.citizenLoans = citizenLoansRecords.map(l => ({...normalizeKeysCamelCaseShallow(l.fields), airtableId: l.id}));

    // Buildings
    dataPackage.managedBuildings = managedBuildingsRecords.map(b => ({...normalizeKeysCamelCaseShallow(b.fields), airtableId: b.id}));
    
    if (workplaceBuildingRecord) {
      dataPackage.workplaceBuilding = {...normalizeKeysCamelCaseShallow(workplaceBuildingRecord.fields), airtableId: workplaceBuildingRecord.id};
    }

    if (homeBuildingRecord) {
      dataPackage.homeBuilding = {...normalizeKeysCamelCaseShallow(homeBuildingRecord.fields), airtableId: homeBuildingRecord.id};
    }

    // Relationships
    dataPackage.strongestRelationships = strongestRelationshipsRecords.map(r => {
      const normalized = normalizeKeysCamelCaseShallow(r.fields);
      const { combinedScore, ...fieldsWithoutCombinedScore } = normalized;
      return {...fieldsWithoutCombinedScore, airtableId: r.id};
    });
    
    // Problems
    dataPackage.recentProblems = recentProblemsRecords.map(p => ({...normalizeKeysCamelCaseShallow(p.fields), airtableId: p.id}));

    // Messages
    dataPackage.recentMessages = recentMessagesRecords.map(m => {
      const normalizedFields = normalizeKeysCamelCaseShallow(m.fields);
      delete normalizedFields.thinking;
      return {...normalizedFields, airtableId: m.id};
    });

    // Daily update
    if (lastDailyUpdateRecord) {
      dataPackage.latestDailyUpdate = {...normalizeKeysCamelCaseShallow(lastDailyUpdateRecord.fields), airtableId: lastDailyUpdateRecord.id};
    }

    // Parallelize fetching resource details for all owned buildings (only for business buildings)
    const buildingDetailsPromises = ownedBuildingsRecords
      .filter(buildingRecord => buildingRecord.fields.BuildingId && buildingRecord.fields.Category === 'business')
      .map(async (buildingRecord) => {
        const buildingId = buildingRecord.fields.BuildingId as string;
        const resourceDetails = await fetchBuildingResourceDetails(buildingId);
        const normalizedBuildingFields = normalizeKeysCamelCaseShallow(buildingRecord.fields);
        
        return {
          ...normalizedBuildingFields,
          airtableId: buildingRecord.id,
          resourceDetails: resourceDetails
        };
      });
    
    // Add non-business buildings without resource details
    const nonBusinessBuildings = ownedBuildingsRecords
      .filter(buildingRecord => buildingRecord.fields.BuildingId && buildingRecord.fields.Category !== 'business')
      .map(buildingRecord => ({
        ...normalizeKeysCamelCaseShallow(buildingRecord.fields),
        airtableId: buildingRecord.id
      }));
    
    // Combine business buildings (with resource details) and non-business buildings
    const businessBuildings = await Promise.all(buildingDetailsPromises);
    dataPackage.ownedBuildings = [...businessBuildings, ...nonBusinessBuildings];

    if (format.toLowerCase() === 'markdown') {
      const markdownContent = convertDataPackageToMarkdown(dataPackage, citizenUsername);
      return new NextResponse(markdownContent, {
        status: 200,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      });
    } else {
      // Default to JSON if format is not markdown (e.g., format=json)
      return NextResponse.json({ success: true, data: dataPackage });
    }

  } catch (error: any) {
    console.error(`[API get-data-package] Error for ${citizenUsername} (Format: ${format}):`, error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch data package' }, { status: 500 });
  }
}
