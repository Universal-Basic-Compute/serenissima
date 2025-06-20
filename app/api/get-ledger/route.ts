import { NextResponse } from 'next/server';
import Airtable, { FieldSet, Record as AirtableRecord } from 'airtable';
import fs from 'fs/promises';
import path from 'path';

// Helper functions for descriptive text
function describeStrength(score: number): string {
  if (score >= 95) return "Our affairs are completely intertwined";
  if (score >= 90) return "We are bound by countless threads of commerce";
  if (score >= 85) return "Major partners in multiple ventures";
  if (score >= 80) return "Deeply connected through business";
  if (score >= 75) return "Significant mutual dependencies";
  if (score >= 70) return "Strong and active partnership";
  if (score >= 65) return "Regular and important dealings";
  if (score >= 60) return "Steady business relationship";
  if (score >= 55) return "Frequent interactions and trades";
  if (score >= 50) return "Moderate but consistent connection";
  if (score >= 45) return "Occasional significant business";
  if (score >= 40) return "Sporadic but meaningful dealings";
  if (score >= 35) return "Infrequent partnership";
  if (score >= 30) return "Limited commercial connection";
  if (score >= 25) return "Rare business encounters";
  if (score >= 20) return "Minimal shared interests";
  if (score >= 15) return "Barely connected commercially";
  if (score >= 10) return "A thin thread of association";
  if (score >= 5) return "We've done business once or twice";
  if (score >= 1) return "The slightest commercial acquaintance";
  return "No meaningful connection";
}

function describeTrust(score: number): string {
  if (score >= 95) return "I would entrust them with my fortune and my life";
  if (score >= 90) return "My trust in them is nearly absolute";
  if (score >= 85) return "A most reliable and proven ally";
  if (score >= 80) return "I trust them in all but the most sensitive matters";
  if (score >= 75) return "A dependable partner in commerce and life";
  if (score >= 70) return "Trustworthy in most dealings";
  if (score >= 65) return "Generally reliable, with occasional doubts";
  if (score >= 60) return "I trust them with standard business";
  if (score >= 55) return "More trustworthy than not";
  if (score >= 50) return "Equal measures of trust and caution";
  if (score >= 45) return "I proceed with notable caution";
  if (score >= 40) return "Trust is limited to small matters";
  if (score >= 35) return "I verify everything twice";
  if (score >= 30) return "They've earned my lasting suspicion";
  if (score >= 25) return "A proven deceiver and false friend";
  if (score >= 20) return "Their treachery still stings";
  if (score >= 15) return "I spit when I hear their name";
  if (score >= 10) return "They disgust me utterly";
  if (score >= 5) return "My enemy in all but open warfare";
  if (score >= 1) return "I dream of their destruction";
  return "If Hell has merchants, they'll rule there";
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function describeMoodIntensity(intensity: number, emotion: string): string {
  if (intensity === 10) return `Completely consumed by ${emotion}`;
  if (intensity === 9) return `${capitalize(emotion)} dominates my every thought`;
  if (intensity === 8) return `Profoundly ${emotion}`;
  if (intensity === 7) return `Quite ${emotion} indeed`;
  if (intensity === 6) return `Notably ${emotion}`;
  if (intensity === 5) return `Moderately ${emotion}`;
  if (intensity === 4) return `Somewhat ${emotion}`;
  if (intensity === 3) return `Mildly ${emotion}`;
  if (intensity === 2) return `Slightly ${emotion}`;
  if (intensity === 1) return `A mere touch of ${emotion}`;
  return `Emotionally neutral`;
}

// Cache configuration
const LEDGER_CACHE: Record<string, { data: any, timestamp: number }> = {};
const LEDGER_CACHE_TTL = 3 * 60 * 1000; // 3 minutes in milliseconds

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
    // Create a date object from the input
    const date = new Date(dateString);
    
    // Subtract 500 years from the date
    const adjustedDate = new Date(date);
    adjustedDate.setFullYear(date.getFullYear() - 500);
    
    // Ensure dates are displayed in Venice time with English month names
    return adjustedDate.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Rome' });
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

function convertLedgerToMarkdown(Ledger: any, citizenUsername: string | null): string {
  let md = `# ${citizenUsername || 'Unknown Citizen'}'s Ledger\n\n`;
  
  md += `My personal ledger - here I maintain careful records of all that defines my position in Venice: properties under my control, relationships cultivated, active contracts binding my posessions, and the daily activities that shape my merchant destiny. Without these pages, I would be navigating La Serenissima blind.\n\n`;

  // Citizen Details - renamed to "My Standing in the Republic"
  md += `## My Standing in the Republic\n`;
  
  // Format ducats as integer if present
  if (Ledger.citizen?.ducats !== undefined && Ledger.citizen.ducats !== null) {
    Ledger.citizen.ducats = Math.floor(Number(Ledger.citizen.ducats));
  }
  
  // More immersive formatting for citizen details
  if (Ledger.citizen) {
    md += `- **I am known as**: ${Ledger.citizen.username || 'Unknown'}\n`;
    
    const firstName = Ledger.citizen.firstName || '';
    const lastName = Ledger.citizen.lastName || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    if (fullName) {
      md += `- **Born**: ${fullName}\n`;
    }
    
    const socialClass = Ledger.citizen.socialClass || 'Unknown';
    const homeCity = Ledger.citizen.homeCity;
    md += `- **My station**: ${socialClass}${homeCity ? ` from ${homeCity}` : ''}\n`;
    
    if (Ledger.citizen.ducats !== undefined) {
      md += `- **Ducats in my coffers**: ${Ledger.citizen.ducats}\n`;
    }
    
    if (Ledger.citizen.influence !== undefined) {
      md += `- **Influence I command**: ${Ledger.citizen.influence}\n`;
    }
    
    if (Ledger.citizen.specialty) {
      md += `- **My craft**: ${Ledger.citizen.specialty}\n`;
    }
    
    if (Ledger.citizen.inVenice !== undefined) {
      md += `- **Present in Venice**: ${Ledger.citizen.inVenice ? 'Yes' : 'No'}\n`;
    }
  } else {
    md += formatSimpleObjectForMarkdown(Ledger.citizen, ['username', 'firstName', 'lastName', 'socialClass', 'ducats', 'inVenice', 'homeCity', 'influence', 'specialty']);
  }
  
  if (Ledger.citizen?.corePersonality) {
    let personalityDisplay = String(Ledger.citizen.corePersonality); // Fallback
    if (typeof Ledger.citizen.corePersonality === 'string') {
      try {
        const parsedPersonality = JSON.parse(Ledger.citizen.corePersonality);
        if (Array.isArray(parsedPersonality)) {
          // Format as a list of traits
          md += `- **What drives me**: ${parsedPersonality.join(', ')}\n`;
        } else {
          md += `- **What drives me**: ${personalityDisplay}\n`;
        }
      } catch (e) {
        // If parsing fails, personalityDisplay remains the original string
        console.warn(`[API get-ledger] Could not parse corePersonality as JSON array: ${Ledger.citizen.corePersonality}`, e);
        md += `- **What drives me**: ${personalityDisplay}\n`;
      }
    } else {
      md += `- **What drives me**: ${personalityDisplay}\n`;
    }
  }
  
  // Add personality if available
  if (Ledger.citizen?.personality) {
    md += `\n### The Nature of My Character\n${Ledger.citizen.personality}\n`;
  }
  
  // Add description if available
  if (Ledger.citizen?.description) {
    md += `\n### How Others See Me\n${Ledger.citizen.description}\n`;
  }
  
  md += '\n';

  // Current Location - renamed to "Where I Find Myself"
  md += `## Where I Find Myself\n`;
  
  // Handle position display
  if (Ledger.citizen?.position) {
    // Check if there's a building at this position
    let locationDescription = "";
    
    // Check if the citizen is at a building
    const buildingAtPosition = Ledger.citizen.buildingAtPosition;
    const buildingDetails = Ledger.citizen.buildingDetails;
    const citizensAtSamePosition = Ledger.citizen.citizensAtSamePosition || [];
    
    if (buildingAtPosition) {
      // Format the location with building name and other citizens if any
      if (buildingDetails && buildingDetails.owner === citizenUsername) {
        locationDescription = `Presently at ${buildingAtPosition}, my own establishment`;
      } else if (buildingDetails && buildingDetails.owner) {
        locationDescription = `Presently at ${buildingAtPosition}, owned by ${buildingDetails.owner}`;
      } else {
        locationDescription = `Presently at ${buildingAtPosition}`;
      }
      
      // Add building details if available
      if (buildingDetails) {
        if (buildingDetails.category && !locationDescription.includes(buildingDetails.category)) {
          locationDescription += ` (${buildingDetails.category})`;
        }
        
        if (buildingDetails.runBy && buildingDetails.runBy !== citizenUsername && 
            buildingDetails.runBy !== buildingDetails.owner && 
            !locationDescription.includes(`run by ${buildingDetails.runBy}`)) {
          locationDescription += `, run by ${buildingDetails.runBy}`;
        }
      }
      
      if (citizensAtSamePosition.length > 0) {
        locationDescription += `\n- **In the company of**: ${citizensAtSamePosition.length} other soul${citizensAtSamePosition.length > 1 ? 's' : ''}`;
        
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
    } else if (Ledger.citizen.position.lat && Ledger.citizen.position.lng) {
      // If coordinates are valid but no building found
      locationDescription = Ledger.citizen.inVenice ? "Walking the streets of Venice" : "Journeying beyond the lagoon";
      
      // Add other citizens if any
      if (citizensAtSamePosition.length > 0) {
        locationDescription += `\n- **In the company of**: ${citizensAtSamePosition.length} other soul${citizensAtSamePosition.length > 1 ? 's' : ''}`;
        
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
      locationDescription = "Somewhere in the streets of Venice";
    }
    
    // Add coordinates for debugging if needed
    const positionDebug = Ledger.citizen.position.lat && Ledger.citizen.position.lng 
      ? ` (${Ledger.citizen.position.lat.toFixed(6)}, ${Ledger.citizen.position.lng.toFixed(6)})`
      : '';
    
    md += `${locationDescription}${positionDebug}\n`;
  } else {
    md += `My whereabouts are uncertain\n`;
  }
  
  // Add current date (subtract 500 years)
  const currentDate = new Date();
  const historicalDate = new Date(currentDate);
  historicalDate.setFullYear(currentDate.getFullYear() - 500);
  
  md += `\n## The Day and Conditions\n`;
  // Use direct formatting for the current date to ensure it's 500 years ago with English month names
  md += `Today is ${historicalDate.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Rome' })}`;
  
  // Add weather information if available
  if (Ledger.weather) {
    md += `. The skies are ${Ledger.weather.description}`;
    if (Ledger.weather.temperature !== null) {
      md += `, with a temperature of ${Math.round(Ledger.weather.temperature)}°C`;
    }
    if (Ledger.weather.condition) {
      const conditionEmoji = {
        'clear': '☀️',
        'rainy': '🌧️',
        'windy': '💨'
      }[Ledger.weather.condition] || '';
      md += ` ${conditionEmoji}`;
    }
  }
  
  md += '\n\n';
  
  // Add citizen's current mood if available - renamed to "My Disposition"
  if (Ledger.citizen?.mood) {
    md += `## My Disposition\n`;
    const moodIntensity = Ledger.citizen.moodIntensity || 5;
    const moodDescription = describeMoodIntensity(moodIntensity, Ledger.citizen.mood);
    md += `I find myself ${Ledger.citizen.mood} (${moodIntensity}/10) - ${moodDescription}`;
    
    // Add mood description if available
    if (Ledger.citizen.moodDescription) {
      md += `. ${Ledger.citizen.moodDescription}`;
    }
    
    // Add primary emotion if available
    if (Ledger.citizen.primaryEmotion && Ledger.citizen.primaryEmotion !== Ledger.citizen.mood) {
      md += `\n\nThe weight of ${Ledger.citizen.primaryEmotion}ness presses upon me`;
    }
    
    // Add basic emotions breakdown if available
    if (Ledger.citizen.basicEmotions && Object.keys(Ledger.citizen.basicEmotions).length > 0) {
      md += `\n\n`;
      for (const [emotion, score] of Object.entries(Ledger.citizen.basicEmotions)) {
        const percentage = Ledger.citizen.emotionDistribution?.[emotion] 
          ? ` (${Ledger.citizen.emotionDistribution[emotion].toFixed(1)}%)` 
          : '';
        md += `- ${emotion} fills me: ${score}${percentage}\n`;
      }
    }
    
    md += '\n';
  }

  // Last Activity - part of "What Has Occupied My Time"
  md += `## What Has Occupied My Time\n`;
  
  if (Ledger.lastActivity) {
    md += `### Most Recent Endeavor\n`;
    
    const activity = Ledger.lastActivity;
    md += `- **Task**: ${activity.title || activity.type}\n`;
    
    if (activity.status) {
      const statusMap: Record<string, string> = {
        'created': 'planned',
        'in_progress': 'underway',
        'processed': 'completed',
        'failed': 'unsuccessful',
        'error': 'encountered difficulties',
        'interrupted': 'was interrupted'
      };
      md += `- **State**: ${statusMap[activity.status] || activity.status}\n`;
    }
    
    if (activity.startDate) {
      md += `- **Began**: ${formatDate(activity.startDate)}\n`;
    }
    
    if (activity.endDate) {
      md += `- **Concluded**: ${formatDate(activity.endDate)}\n`;
    }
    
    if (activity.description) {
      md += `- **Details**: ${activity.description}\n`;
    }
    
    if (activity.thought) {
      md += `- **My reflections**: ${activity.thought}\n`;
    }
    
    md += '\n';
  } else {
    md += `- I have no record of recent activities.\n\n`;
  }
  
  // Last 5 Activities - continued from "What Has Occupied My Time"
  if (Ledger.lastActivities && Ledger.lastActivities.length > 0) {
    md += `### Prior Endeavors\n`;
    Ledger.lastActivities.forEach((activity: any, index: number) => {
      md += `#### ${index + 1}. ${activity.title || activity.type}\n`;
      
      if (activity.status) {
        const statusMap: Record<string, string> = {
          'created': 'planned',
          'in_progress': 'underway',
          'processed': 'completed',
          'failed': 'unsuccessful',
          'error': 'encountered difficulties',
          'interrupted': 'was interrupted'
        };
        md += `- **State**: ${statusMap[activity.status] || activity.status}\n`;
      }
      
      if (activity.startDate) {
        md += `- **Began**: ${formatDate(activity.startDate)}\n`;
      }
      
      if (activity.endDate) {
        md += `- **Concluded**: ${formatDate(activity.endDate)}\n`;
      }
      
      if (activity.description) {
        md += `- **Details**: ${activity.description}\n`;
      }
      
      if (activity.thought) {
        md += `- **My reflections**: ${activity.thought}\n`;
      }
    });
  }
  md += '\n';
  
  // Planned Activities - renamed to "My Intended Actions"
  md += `## My Intended Actions\n`;
  if (Ledger.plannedActivities && Ledger.plannedActivities.length > 0) {
    Ledger.plannedActivities.forEach((activity: any, index: number) => {
      md += `### Plan ${index + 1}: ${activity.title || activity.type}\n`;
      
      if (activity.startDate) {
        md += `- **To begin**: ${formatDate(activity.startDate)}\n`;
      }
      
      if (activity.endDate) {
        md += `- **Expected completion**: ${formatDate(activity.endDate)}\n`;
      }
      
      if (activity.description) {
        md += `- **Details**: ${activity.description}\n`;
      }
      
      if (activity.thought) {
        md += `- **My considerations**: ${activity.thought}\n`;
      }
    });
  } else {
    md += `- I have no specific plans at present.\n`;
  }
  md += '\n';

  // Workplace - renamed to "My Place of Trade"
  md += `## My Place of Trade\n`;
  if (Ledger.workplaceBuilding) {
    const workplace = Ledger.workplaceBuilding;
    md += `I conduct my business at ${workplace.name || workplace.type || 'an unnamed establishment'}`;
    
    if (workplace.category) {
      md += ` (${workplace.category})`;
    }
    
    if (workplace.buildingId) {
      md += `\n- **Known in records as**: ${workplace.buildingId}`;
    }
    
    md += '\n';
  } else {
    md += `I have no formal place of business at present.\n`;
  }
  md += '\n';
  
  // Home - renamed to "My Dwelling"
  md += `## My Dwelling\n`;
  if (Ledger.homeBuilding) {
    const home = Ledger.homeBuilding;
    md += `I reside at ${home.name || home.type || 'an unnamed residence'}`;
    
    if (home.category) {
      md += ` (${home.category})`;
    }
    
    if (home.buildingId) {
      md += `\n- **Known in records as**: ${home.buildingId}`;
    }
    
    md += '\n';
  } else {
    md += `I have no permanent residence at present.\n`;
  }
  md += '\n';

  // Owned Lands - renamed to "Lands Under My Control"
  md += `## Lands Under My Control (${Ledger.ownedLands?.length || 0})\n`;
  if (Ledger.ownedLands && Ledger.ownedLands.length > 0) {
    Ledger.ownedLands.forEach((land: any, index: number) => {
      md += `### Property ${index + 1}: ${land.historicalName || land.englishName || land.landId}\n`;
      
      if (land.district) {
        md += `- **District**: ${land.district}\n`;
      }
      
      if (land.lastIncome !== undefined) {
        md += `- **Last yielded**: ${land.lastIncome} ducats\n`;
      }
      
      md += `- **Available for construction**: ${land.unoccupiedBuildingPoints?.length || 0} plots of ${land.totalBuildingPoints || 0} total\n`;
      md += `- **Canal access points**: ${land.unoccupiedCanalPoints?.length || 0} of ${land.totalCanalPoints || 0} total\n`;
      md += `- **Bridge possibilities**: ${land.unoccupiedBridgePoints?.length || 0} of ${land.totalBridgePoints || 0} total\n`;
      
      if (land.buildings && land.buildings.length > 0) {
        // Filter buildings to only show those owned by the user
        const ownedBuildings = land.buildings.filter((building: any) => 
          building.owner === citizenUsername
        );
        
        if (ownedBuildings.length > 0) {
          md += `#### Structures I've raised here (${ownedBuildings.length}):\n`;
          ownedBuildings.forEach((building: any, bIndex: number) => {
            md += `##### ${bIndex + 1}. ${building.name || building.type || building.buildingId}\n`;
            
            if (building.category) {
              md += `- **Purpose**: ${building.category}\n`;
            }
            
            if (building.runBy && building.runBy !== citizenUsername) {
              md += `- **Managed by**: ${building.runBy}\n`;
            }
            
            if (building.occupant && building.occupant !== citizenUsername) {
              md += `- **Occupied by**: ${building.occupant}\n`;
            }
            
            if (building.isConstructed !== undefined) {
              md += `- **Construction**: ${building.isConstructed ? 'Complete' : 'In progress'}\n`;
            }
          });
        } else {
          md += `#### Structures on this land: None bearing my name\n`;
        }
      }
      md += '\n';
    });
  } else {
    md += `- I hold no lands in my name.\n\n`;
  }

  // Owned Buildings - renamed to "Other Properties in My Name"
  md += `## Other Properties in My Name (${Ledger.ownedBuildings?.length || 0})\n`;
  if (Ledger.ownedBuildings && Ledger.ownedBuildings.length > 0) {
    Ledger.ownedBuildings.forEach((building: any, index: number) => {
      md += `### Property ${index + 1}: ${building.name || building.type || building.buildingId}\n`;
      
      if (building.category) {
        md += `- **Purpose**: ${building.category}\n`;
      }
      
      if (building.runBy && building.runBy !== citizenUsername) {
        md += `- **Managed by**: ${building.runBy}\n`;
      }
      
      if (building.occupant && building.occupant !== citizenUsername) {
        md += `- **Occupied by**: ${building.occupant}\n`;
      }
      
      if (building.isConstructed !== undefined) {
        md += `- **Construction**: ${building.isConstructed ? 'Complete' : 'In progress'}\n`;
      }
      
      if (building.landId) {
        md += `- **Located on**: ${building.landId}\n`;
      }
      
      if (building.resourceDetails) {
        md += `#### Resources and Commerce at ${building.name || building.type || building.buildingId}:\n`;
        const rd = building.resourceDetails;
        if (rd.storage) {
          md += `- **Storage**: ${rd.storage.used || 0} units of ${rd.storage.capacity || 0} capacity filled\n`;
        }
        if (rd.resources?.stored && rd.resources.stored.length > 0) {
          md += `- **Goods in storage (${rd.resources.stored.length})**:\n`;
          rd.resources.stored.forEach((res: any) => {
            md += `  - ${res.count} ${res.name || res.type}${res.owner !== citizenUsername ? ` (belongs to ${res.owner})` : ''}\n`;
          });
        }
        if (rd.resources?.publiclySold && rd.resources.publiclySold.length > 0) {
          md += `- **Goods for sale (${rd.resources.publiclySold.length})**:\n`;
          rd.resources.publiclySold.forEach((contract: any) => {
            md += `  - ${contract.targetAmount || contract.amount} ${contract.resourceName || contract.resourceType} at ${contract.pricePerResource} ducats each\n`;
          });
        }
         if (rd.resources?.transformationRecipes && rd.resources.transformationRecipes.length > 0) {
            md += `- **Production capabilities (${rd.resources.transformationRecipes.length})**:\n`;
            rd.resources.transformationRecipes.forEach((recipe: any) => {
                const inputs = recipe.inputs.map((i: any) => `${i.count || i.amount || 0} ${i.name || i.type}`).join(', ');
                const outputs = recipe.outputs.map((o: any) => `${o.count || o.amount || 0} ${o.name || o.type}`).join(', ');
                md += `  - Process: ${recipe.recipeName || 'Production Recipe'}\n`;
                md += `    - Requires: ${inputs}\n`;
                md += `    - Produces: ${outputs}\n`;
                md += `    - Takes: ${recipe.durationMinutes || recipe.craftMinutes || 0} minutes\n`;
            });
        }
        md += '\n';
      }
    });
  } else {
    md += `- I own no other buildings beyond those on my lands.\n\n`;
  }

  // Managed Buildings - renamed to "Properties Under My Management"
  md += `## Properties Under My Management (${Ledger.managedBuildings?.length || 0})\n`;
  if (Ledger.managedBuildings && Ledger.managedBuildings.length > 0) {
    Ledger.managedBuildings.forEach((building: any, index: number) => {
      md += `### Property ${index + 1}: ${building.name || building.type || building.buildingId}\n`;
      
      if (building.category) {
        md += `- **Purpose**: ${building.category}\n`;
      }
      
      if (building.owner && building.owner !== citizenUsername) {
        md += `- **Owned by**: ${building.owner}\n`;
      }
      
      if (building.occupant && building.occupant !== citizenUsername) {
        md += `- **Occupied by**: ${building.occupant}\n`;
      }
      
      if (building.isConstructed !== undefined) {
        md += `- **Construction**: ${building.isConstructed ? 'Complete' : 'In progress'}\n`;
      }
    });
  } else {
    md += `- I manage no properties for others.\n\n`;
  }
  
  // Active Contracts - renamed to "My Outstanding Obligations"
  md += `## My Outstanding Obligations (${Ledger.activeContracts?.length || 0})\n`;
  if (Ledger.activeContracts && Ledger.activeContracts.length > 0) {
    Ledger.activeContracts.forEach((contract: any, index: number) => {
      md += `### Obligation ${index + 1}: ${contract.title || contract.contractId}\n`;
      
      if (contract.type) {
        const typeMap: Record<string, string> = {
          'import': 'Import goods',
          'public_sell': 'Sell to the public',
          'recurrent': 'Regular trade',
          'construction_project': 'Construction work',
          'logistics_service_request': 'Transport services',
          'building_bid': 'Bid on property',
          'land_listing': 'Land for sale',
          'land_offer': 'Offer on land',
          'land_sell': 'Land transaction'
        };
        md += `- **Nature**: ${typeMap[contract.type] || contract.type}\n`;
      }
      
      if (contract.buyer) {
        if (contract.buyer === citizenUsername) {
          md += `- **I am to receive from**: ${contract.seller}\n`;
        } else {
          md += `- **I am to provide to**: ${contract.buyer}\n`;
        }
      }
      
      if (contract.seller && !md.includes(contract.seller)) {
        if (contract.seller === citizenUsername) {
          md += `- **I am to provide to**: ${contract.buyer}\n`;
        } else {
          md += `- **I am to receive from**: ${contract.seller}\n`;
        }
      }
      
      if (contract.resourceType) {
        md += `- **Concerning**: ${contract.resourceType}\n`;
      }
      
      if (contract.pricePerResource !== undefined) {
        md += `- **At the price of**: ${contract.pricePerResource} ducats per unit\n`;
      }
      
      if (contract.targetAmount !== undefined) {
        md += `- **Quantity agreed**: ${contract.targetAmount} units\n`;
      }
      
      if (contract.status) {
        md += `- **Current state**: ${contract.status}\n`;
      }
      
      if (contract.createdAt) {
        md += `- **Agreed upon**: ${formatDate(contract.createdAt)}\n`;
      }
      
      if (contract.endAt) {
        md += `- **To be fulfilled by**: ${formatDate(contract.endAt)}\n`;
      }
    });
    if (Ledger.activeContracts.length === 20) {
      md += `- ... (and more obligations not listed here)\n`;
    }
    md += '\n';
  } else {
    md += `- I have no active contracts or obligations at present.\n\n`;
  }

  // Guild Details - renamed to "My Guild Affiliations"
  md += `## My Guild Affiliations\n`;
  if (Ledger.guildDetails) {
    const guild = Ledger.guildDetails;
    md += `I am a member of the ${guild.guildName || 'unnamed guild'}`;
    
    if (guild.guildTier) {
      md += ` (Tier ${guild.guildTier})`;
    }
    
    md += '\n';
    
    if (guild.shortDescription) {
      md += `- **Guild purpose**: ${guild.shortDescription}\n`;
    }
    
    if (guild.guildId) {
      md += `- **Guild registry number**: ${guild.guildId}\n`;
    }
  } else {
    md += `I hold no guild memberships at present.\n`;
  }
  md += '\n';

  // Create a separate tab for Loans - renamed to "My Financial Arrangements"
  md += `## My Financial Arrangements\n\n`;
  
  // Citizen Loans
  md += `### Active Loans (${Ledger.citizenLoans?.length || 0})\n`;
  if (Ledger.citizenLoans && Ledger.citizenLoans.length > 0) {
    Ledger.citizenLoans.forEach((loan: any, index: number) => {
      md += `#### Arrangement ${index + 1}: ${loan.name || loan.loanId}\n`;
      
      if (loan.lender === citizenUsername) {
        md += `- **I have lent to**: ${loan.borrower}\n`;
      } else if (loan.borrower === citizenUsername) {
        md += `- **I have borrowed from**: ${loan.lender}\n`;
      } else {
        md += `- **Between**: ${loan.lender} and ${loan.borrower}\n`;
      }
      
      if (loan.type) {
        md += `- **Nature**: ${loan.type}\n`;
      }
      
      if (loan.status) {
        md += `- **Status**: ${loan.status}\n`;
      }
      
      if (loan.principalAmount !== undefined) {
        md += `- **Principal sum**: ${loan.principalAmount} ducats\n`;
      }
      
      if (loan.interestRate !== undefined) {
        const percentage = (Number(loan.interestRate) * 100).toFixed(1);
        md += `- **Interest rate**: ${percentage}%\n`;
      }
      
      if (loan.termDays !== undefined) {
        md += `- **Term**: ${loan.termDays} days\n`;
      }
      
      if (loan.remainingBalance !== undefined) {
        md += `- **Outstanding balance**: ${loan.remainingBalance} ducats\n`;
      }
      
      if (loan.createdAt) {
        md += `- **Established**: ${formatDate(loan.createdAt)}\n`;
      }
    });
  } else {
    md += `- I have no active loans or debts.\n\n`;
  }
  
  // Strongest Relationships - renamed to "Those I Know (And Who Know Me)"
  md += `## Those I Know (And Who Know Me) (${Ledger.strongestRelationships?.length || 0})\n`;
  if (Ledger.strongestRelationships && Ledger.strongestRelationships.length > 0) {
    Ledger.strongestRelationships.forEach((rel: any, index: number) => {
      const otherCitizen = rel.citizen1 === citizenUsername ? rel.citizen2 : rel.citizen1;
      md += `### ${index + 1}. ${otherCitizen}\n`;
      
      // Add title with proper formatting if available
      if (rel.title) {
        md += `- **Our bond**: ${rel.title}\n`;
      }
      
      // Add description with proper formatting if available
      if (rel.description) {
        md += `- **Nature of our association**: ${rel.description}\n`;
      }
      
      // Add other relationship details
      if (rel.status) {
        md += `- **Current standing**: ${rel.status}\n`;
      }
      
      if (rel.strengthScore !== undefined) {
        const strengthDescription = describeStrength(Number(rel.strengthScore));
        md += `- **How well we work together**: ${rel.strengthScore} - ${strengthDescription}\n`;
      }
      
      if (rel.trustScore !== undefined) {
        const trustDescription = describeTrust(Number(rel.trustScore));
        md += `- **Trust between us**: ${rel.trustScore}/100 - ${trustDescription}\n`;
      }
      
      // Format the last interaction date if available
      if (rel.lastInteraction) {
        md += `- **Last crossed paths**: ${formatDate(rel.lastInteraction)}\n`;
      }
    });
    if (Ledger.strongestRelationships.length === 20) {
      md += `- ... (and more acquaintances not listed here)\n`;
    }
    md += '\n';
  } else {
    md += `- I have formed no significant relationships yet.\n\n`;
  }

  // Recent Problems - renamed to "Matters Requiring Attention"
  md += `## Matters Requiring Attention (${Ledger.recentProblems?.length || 0})\n`;
  if (Ledger.recentProblems && Ledger.recentProblems.length > 0) {
    Ledger.recentProblems.forEach((problem: any, index: number) => {
      md += `### Concern ${index + 1}: ${problem.title || problem.problemId}\n`;
      
      if (problem.type) {
        md += `- **Nature**: ${problem.type.replace(/_/g, ' ')}\n`;
      }
      
      if (problem.assetType && problem.asset) {
        md += `- **Regarding**: ${problem.asset} (${problem.assetType})\n`;
      }
      
      if (problem.status) {
        md += `- **Status**: ${problem.status}\n`;
      }
      
      if (problem.severity) {
        md += `- **Urgency**: ${problem.severity}\n`;
      }
      
      if (problem.description) {
        md += `- **Details**: ${problem.description}\n`;
      }
      
      if (problem.createdAt) {
        md += `- **First noted**: ${formatDate(problem.createdAt)}\n`;
      }
    });
    if (Ledger.recentProblems.length === 20) {
      md += `- ... (and more concerns not listed here)\n`;
    }
    md += '\n';
  } else {
    md += `- No pressing matters require my attention at present.\n\n`;
  }

  // Recent Messages - renamed to "My Correspondence"
  md += `## My Correspondence (${Ledger.recentMessages?.length || 0})\n`;
  if (Ledger.recentMessages && Ledger.recentMessages.length > 0) {
    Ledger.recentMessages.forEach((message: any, index: number) => {
      md += `### Letter ${index + 1}\n`;
      
      if (message.sender === citizenUsername) {
        md += `- **From**: Myself\n`;
      } else {
        md += `- **From**: ${message.sender}\n`;
      }
      
      if (message.receiver === citizenUsername) {
        md += `- **To**: Myself\n`;
      } else {
        md += `- **To**: ${message.receiver}\n`;
      }
      
      if (message.type) {
        md += `- **Nature**: ${message.type.replace(/_/g, ' ')}\n`;
      }
      
      if (message.createdAt) {
        md += `- **Written**: ${formatDate(message.createdAt)}\n`;
      }
      
      if (message.content) {
        md += `- **Contents**: "${message.content}"\n`;
      }
      
      if (message.channel) {
        md += `- **Channel**: ${message.channel}\n`;
      }
    });
    if (Ledger.recentMessages.length === 20) {
      md += `- ... (and more correspondence not listed here)\n`;
    }
    md += '\n';
  } else {
    md += `- I have exchanged no messages of late.\n\n`;
  }
  
  // Thoughts (Messages where sender = receiver) - keep as is but enhance
  md += `## Personal Thoughts (${Ledger.thoughts?.length || 0})\n`;
  if (Ledger.thoughts && Ledger.thoughts.length > 0) {
    Ledger.thoughts.forEach((thought: any, index: number) => {
      md += `### Reflection ${index + 1}\n`;
      
      if (thought.type) {
        const typeMap: Record<string, string> = {
          'kinos_daily_reflection': 'Evening contemplation',
          'kinos_theater_reflection': 'Thoughts after the theater',
          'kinos_public_bath_reflection': 'Musings at the baths',
          'kinos_practical_reflection': 'Practical considerations',
          'kinos_guided_reflection': 'Guided meditation',
          'kinos_unguided_reflection': 'Free contemplation',
          'encounter_reflection': 'On meeting someone',
          'kinos_thought_continuation': 'Further thoughts'
        };
        md += `- **Nature**: ${typeMap[thought.type] || thought.type.replace(/_/g, ' ')}\n`;
      }
      
      if (thought.createdAt) {
        md += `- **Recorded**: ${formatDate(thought.createdAt)}\n`;
      }
      
      if (thought.content) {
        md += `- **In my own words**: "${thought.content}"\n`;
      }
    });
    if (Ledger.thoughts.length === 20) {
      md += `- ... (and more thoughts not recorded here)\n`;
    }
    md += '\n';
  } else {
    md += `- I have recorded no personal reflections of late.\n\n`;
  }
  
  // Latest Daily Update - renamed to "Word from the Rialto"
  md += `## Word from the Rialto\n`;
  if (Ledger.latestDailyUpdate) {
    const update = Ledger.latestDailyUpdate;
    
    if (update.title) {
      md += `### ${update.title}\n`;
    } else {
      md += `### Latest proclamations and whispers\n`;
    }
    
    if (update.content) {
      md += `${update.content}\n`;
    } else {
      md += `No specific news has reached my ears.\n`;
    }
    
    if (update.createdAt) {
      md += `\n*Heard on ${formatDate(update.createdAt)}*\n`;
    }
  } else {
    md += `No news of significance has reached me recently.\n`;
  }
  md += '\n';
  
  // Active Reports (for Forestieri only) - renamed to "News from Distant Ports"
  if (Ledger.activeReports && Ledger.activeReports.length > 0) {
    md += `## News from Distant Ports (${Ledger.activeReports.length})\n`;
    Ledger.activeReports.forEach((report: any, index: number) => {
      md += `### From ${report.originCity || 'unknown lands'}: ${report.title || 'Unnamed Report'}\n`;
      
      if (report.content) {
        md += `${report.content}\n\n`;
      }
      
      if (report.category) {
        md += `- **Nature of report**: ${report.category}\n`;
      }
      
      if (report.affectedResources && report.affectedResources.length > 0) {
        md += `- **This concerns**: ${report.affectedResources.join(', ')}\n`;
      }
      
      if (report.priceChanges && report.priceChanges.length > 0) {
        md += `- **Market implications**: \n`;
        report.priceChanges.forEach((change: any) => {
          const direction = change.change > 0 ? '↑' : '↓';
          const percentage = Math.abs(change.change * 100).toFixed(1);
          md += `  - ${change.resource}: ${direction} ${percentage}%\n`;
        });
      }
      
      if (report.createdAt) {
        md += `- **Reached Venice**: ${formatDate(report.createdAt)}\n`;
      }
      
      if (report.endAt) {
        md += `- **Reliable until**: ${formatDate(report.endAt)}\n`;
      }
      
      md += '\n';
    });
  } else if (Ledger.citizen?.socialClass === 'Forestieri') {
    md += `## News from Distant Ports\n`;
    md += `- No reports from abroad have reached me at present.\n\n`;
  }

  // Available Stratagems - renamed to "Tactics I Might Employ"
  md += `## Tactics I Might Employ\n`;
  if (Ledger.availableStratagems && Object.keys(Ledger.availableStratagems).length > 0) {
    for (const [category, natures] of Object.entries(Ledger.availableStratagems as Record<string, Record<string, ShortStratagemDefinition[]>>)) {
      md += `### In ${category.charAt(0).toUpperCase() + category.slice(1)}\n`;
      
      for (const [nature, stratagems] of Object.entries(natures)) {
        const natureDisplay = nature.charAt(0).toUpperCase() + nature.slice(1);
        md += `#### ${natureDisplay} approaches (${stratagems.length})\n`;
        
        stratagems.forEach(strat => {
          md += `##### ${strat.name}\n`;
          md += `- **Method**: ${strat.type.replace(/_/g, ' ')}\n`;
          md += `- **Purpose**: ${strat.purpose}\n`;
          
          const statusMap: Record<string, string> = {
            'Implemented': 'Available now',
            'Coming Soon': 'Not yet possible',
            'Partially Implemented': 'Limited availability'
          };
          md += `- **Availability**: ${statusMap[strat.status] || strat.status}\n\n`;
        });
      }
    }
  } else {
    md += `- I have yet to learn of strategic maneuvers I might employ.\n\n`;
  }

  // Active Stratagems Executed By Citizen - renamed to "My Current Schemes"
  md += `## My Current Schemes (${Ledger.stratagemsExecutedByCitizen?.length || 0})\n`;
  if (Ledger.stratagemsExecutedByCitizen && Ledger.stratagemsExecutedByCitizen.length > 0) {
    Ledger.stratagemsExecutedByCitizen.forEach((strat: any, index: number) => {
      md += `### Scheme ${index + 1}: ${strat.name || strat.type?.replace(/_/g, ' ') || strat.stratagemId}\n`;
      
      if (strat.variant) {
        md += `- **Approach**: ${strat.variant}\n`;
      }
      
      if (strat.targetCitizen) {
        md += `- **Directed at**: ${strat.targetCitizen}\n`;
      }
      
      if (strat.targetBuilding) {
        md += `- **Focused on property**: ${strat.targetBuilding}\n`;
      }
      
      if (strat.targetResourceType) {
        md += `- **Concerning**: ${strat.targetResourceType}\n`;
      }
      
      if (strat.status) {
        md += `- **Current state**: ${strat.status}\n`;
      }
      
      if (strat.executedAt) {
        md += `- **Set in motion**: ${formatDate(strat.executedAt)}\n`;
      }
      
      if (strat.expiresAt) {
        md += `- **Concludes**: ${formatDate(strat.expiresAt)}\n`;
      }
    });
  } else {
    md += `- I have no schemes currently in motion.\n\n`;
  }

  // Active Stratagems Targeting Citizen - renamed to "Plots Against Me"
  md += `## Plots Against Me (${Ledger.stratagemsTargetingCitizen?.length || 0})\n`;
  if (Ledger.stratagemsTargetingCitizen && Ledger.stratagemsTargetingCitizen.length > 0) {
    Ledger.stratagemsTargetingCitizen.forEach((strat: any, index: number) => {
      md += `### Plot ${index + 1}: ${strat.name || strat.type?.replace(/_/g, ' ') || strat.stratagemId}\n`;
      
      if (strat.executedBy) {
        md += `- **Orchestrated by**: ${strat.executedBy}\n`;
      }
      
      if (strat.variant) {
        md += `- **Nature**: ${strat.variant}\n`;
      }
      
      if (strat.targetBuilding) {
        md += `- **Targeting my property**: ${strat.targetBuilding}\n`;
      }
      
      if (strat.targetResourceType) {
        md += `- **Concerning my**: ${strat.targetResourceType}\n`;
      }
      
      if (strat.status) {
        md += `- **Current state**: ${strat.status}\n`;
      }
      
      if (strat.executedAt) {
        md += `- **Begun on**: ${formatDate(strat.executedAt)}\n`;
      }
      
      if (strat.expiresAt) {
        md += `- **Concludes**: ${formatDate(strat.expiresAt)}\n`;
      }
    });
  } else {
    md += `- None that I know of... but in Venice, who can be certain?\n\n`;
  }

  // Past Executed Stratagems Executed By Citizen - renamed to "My Past Machinations"
  md += `## My Past Machinations (${Ledger.stratagemsExecutedByCitizenPast?.length || 0})\n`;
  if (Ledger.stratagemsExecutedByCitizenPast && Ledger.stratagemsExecutedByCitizenPast.length > 0) {
    Ledger.stratagemsExecutedByCitizenPast.forEach((strat: any, index: number) => {
      md += `### Scheme ${index + 1}: ${strat.name || strat.type?.replace(/_/g, ' ') || strat.stratagemId}\n`;
      
      if (strat.variant) {
        md += `- **Approach**: ${strat.variant}\n`;
      }
      
      if (strat.targetCitizen) {
        md += `- **Was directed at**: ${strat.targetCitizen}\n`;
      }
      
      if (strat.targetBuilding) {
        md += `- **Focused on property**: ${strat.targetBuilding}\n`;
      }
      
      if (strat.targetResourceType) {
        md += `- **Concerned**: ${strat.targetResourceType}\n`;
      }
      
      if (strat.status) {
        md += `- **Final state**: ${strat.status}\n`;
      }
      
      if (strat.executedAt) {
        md += `- **Set in motion**: ${formatDate(strat.executedAt)}\n`;
      }
      
      if (strat.expiresAt) {
        md += `- **Concluded**: ${formatDate(strat.expiresAt)}\n`;
      }
    });
    if (Ledger.stratagemsExecutedByCitizenPast.length === 20) {
      md += `- ... (and more past schemes not recorded here)\n`;
    }
  } else {
    md += `- I have no record of past schemes.\n\n`;
  }

  // Past Executed Stratagems Targeting Citizen - renamed to "Past Plots Against Me"
  md += `## Past Plots Against Me (${Ledger.stratagemsTargetingCitizenPast?.length || 0})\n`;
  if (Ledger.stratagemsTargetingCitizenPast && Ledger.stratagemsTargetingCitizenPast.length > 0) {
    Ledger.stratagemsTargetingCitizenPast.forEach((strat: any, index: number) => {
      md += `### Plot ${index + 1}: ${strat.name || strat.type?.replace(/_/g, ' ') || strat.stratagemId}\n`;
      
      if (strat.executedBy) {
        md += `- **Was orchestrated by**: ${strat.executedBy}\n`;
      }
      
      if (strat.variant) {
        md += `- **Nature**: ${strat.variant}\n`;
      }
      
      if (strat.targetBuilding) {
        md += `- **Targeted my property**: ${strat.targetBuilding}\n`;
      }
      
      if (strat.targetResourceType) {
        md += `- **Concerned my**: ${strat.targetResourceType}\n`;
      }
      
      if (strat.status) {
        md += `- **Final state**: ${strat.status}\n`;
      }
      
      if (strat.executedAt) {
        md += `- **Begun on**: ${formatDate(strat.executedAt)}\n`;
      }
      
      if (strat.expiresAt) {
        md += `- **Concluded**: ${formatDate(strat.expiresAt)}\n`;
      }
    });
    if (Ledger.stratagemsTargetingCitizenPast.length === 20) {
      md += `- ... (and more past plots not recorded here)\n`;
    }
  } else {
    md += `- I have no record of past plots against me.\n\n`;
  }

  return md;
}
// --- End Markdown Conversion Utilities ---

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const citizenUsername = searchParams.get('citizenUsername');
  const format = searchParams.get('format') || 'markdown'; // Default to markdown
  const forceRefresh = searchParams.get('forceRefresh') === 'true';

  if (!citizenUsername) {
    return NextResponse.json({ success: false, error: 'citizenUsername parameter is required' }, { status: 400 });
  }
  
  // Check cache if not forcing refresh
  const now = Date.now();
  const cacheKey = `${citizenUsername}_${format}`;
  
  if (!forceRefresh && LEDGER_CACHE[cacheKey] && (now - LEDGER_CACHE[cacheKey].timestamp < LEDGER_CACHE_TTL)) {
    console.log(`[API get-ledger] Using cached ledger for ${citizenUsername} (format: ${format}, age: ${Math.round((now - LEDGER_CACHE[cacheKey].timestamp) / 1000)} seconds)`);
    
    if (format.toLowerCase() === 'markdown') {
      return new NextResponse(LEDGER_CACHE[cacheKey].data, {
        status: 200,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      });
    } else {
      return NextResponse.json({ success: true, data: LEDGER_CACHE[cacheKey].data, fromCache: true });
    }
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

    // Initialize citizenMood with default values - will be updated by the mood calculation
    let citizenMood = { 
      complex_mood: "neutral", 
      intensity: 5, 
      mood_description: "",
      basic_emotions: {},
      primary_emotion: "neutral",
      emotion_distribution: {}
    };
    
    // Make sure the Ledger object is initialized with these default values

    // Initialize weatherData as null before using it
    let weatherData = null;
  
    const Ledger = {
      citizen: {
        ...normalizeKeysCamelCaseShallow(citizenRecord.fields), 
        airtableId: citizenRecord.id,
        buildingAtPosition: buildingAtPosition, // Add the building name at position
        buildingDetails: buildingDetails, // Add detailed building information
        citizensAtSamePosition: citizensAtSamePosition, // Add other citizens at the same position with more details
        mood: citizenMood.complex_mood,
        moodIntensity: citizenMood.intensity,
        moodDescription: citizenMood.mood_description,
        primaryEmotion: citizenMood.primary_emotion,
        basicEmotions: citizenMood.basic_emotions,
        emotionDistribution: citizenMood.emotion_distribution
      },
      weather: null, // Will be updated after fetching
      activeReports: [], // Will be populated for Forestieri citizens
      activeReports: [], // Will be populated for Forestieri citizens
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
      thoughts: [] as any[], // Initialize thoughts array (messages where sender = receiver)
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
      plannedActivitiesRecords,
      fetchedWeatherData,
      reportsData
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
      fetchPlannedActivities(citizenUsername),
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/weather`).then(res => res.json()).catch(() => null),
      // Fetch reports for Forestieri citizens
      citizenRecord.fields.SocialClass === 'Forestieri' 
        ? fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/reports`).then(res => res.json()).catch(() => null)
        : Promise.resolve(null)
    ]);

    // Assign weather data to Ledger
    weatherData = fetchedWeatherData;
    Ledger.weather = weatherData?.success ? weatherData : null;
    
    // Assign active reports for Forestieri citizens
    if (citizenRecord.fields.SocialClass === 'Forestieri' && reportsData?.success) {
      // Filter reports - Forestieri only have 50% chance to access each report
      // Use a deterministic seed based on ReportId and Username
      const filteredReports = (reportsData.reports || []).filter(report => {
        // Create a deterministic seed from ReportId and Username
        const seed = `${report.reportId}-${citizenUsername}`;
        // Simple hash function to get a number from the seed string
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
          hash = ((hash << 5) - hash) + seed.charCodeAt(i);
          hash |= 0; // Convert to 32bit integer
        }
        // Use the hash to determine if this Forestieri has access to this report (50% chance)
        return Math.abs(hash) % 2 === 0;
      });
      
      Ledger.activeReports = filteredReports;
      console.log(`[API get-ledger] Assigned ${filteredReports.length} reports for Forestieri citizen ${citizenUsername}`);
    } else {
      console.log(`[API get-ledger] No reports assigned: isForeigner=${citizenRecord.fields.SocialClass === 'Forestieri'}, reportsSuccess=${reportsData?.success}`);
    }
    
    // Assign results to Ledger
    Ledger.availableStratagems = availableStratagems;
    
    // Last Activities - filter out duplicates of the last activity
    if (lastActivityRecord) {
      const lastActivityId = lastActivityRecord.id;
      // Filter out the last activity from the recent activities list to avoid duplication
      Ledger.lastActivities = lastActivitiesRecords
        .filter(a => a.id !== lastActivityId)
        .map(a => ({...normalizeKeysCamelCaseShallow(a.fields), airtableId: a.id}));
    } else {
      Ledger.lastActivities = lastActivitiesRecords.map(a => ({...normalizeKeysCamelCaseShallow(a.fields), airtableId: a.id}));
    }
    
    // Calculate the citizen's mood using the dedicated API endpoint
    try {
      // Use the internal API to calculate mood
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const moodResponse = await fetch(`${baseUrl}/api/calculate-mood`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          citizenUsername: citizenUsername,
          // Pass the ledger data we've already collected to avoid duplicate fetching
          ledgerData: {
            citizen: {
              ...normalizeKeysCamelCaseShallow(citizenRecord.fields),
              airtableId: citizenRecord.id,
              buildingAtPosition: buildingAtPosition,
              buildingDetails: buildingDetails,
              citizensAtSamePosition: citizensAtSamePosition
            },
            lastActivity: lastActivityRecord ? {...normalizeKeysCamelCaseShallow(lastActivityRecord.fields), airtableId: lastActivityRecord.id} : null,
            lastActivities: Ledger.lastActivities,
            homeBuilding: homeBuildingRecord ? {...normalizeKeysCamelCaseShallow(homeBuildingRecord.fields), airtableId: homeBuildingRecord.id} : null,
            workplaceBuilding: workplaceBuildingRecord ? {...normalizeKeysCamelCaseShallow(workplaceBuildingRecord.fields), airtableId: workplaceBuildingRecord.id} : null,
            strongestRelationships: Ledger.strongestRelationships,
            recentProblems: Ledger.recentProblems,
            stratagemsExecutedByCitizen: Ledger.stratagemsExecutedByCitizen,
            stratagemsTargetingCitizen: Ledger.stratagemsTargetingCitizen,
            ownedLands: ownedLandsData,
            ownedBuildings: Ledger.ownedBuildings,
            citizenLoans: Ledger.citizenLoans
          }
        })
      });
        
      if (moodResponse.ok) {
        const moodData = await moodResponse.json();
        if (moodData.success && moodData.mood) {
          console.log(`Mood calculated for ${citizenUsername}: ${moodData.mood.complex_mood} (${moodData.mood.intensity}/10)`);
          citizenMood = moodData.mood;
          
          // Update the Ledger.citizen object with the mood data
          Ledger.citizen.mood = citizenMood.complex_mood;
          Ledger.citizen.moodIntensity = citizenMood.intensity;
          Ledger.citizen.moodDescription = citizenMood.mood_description;
          Ledger.citizen.primaryEmotion = citizenMood.primary_emotion;
          Ledger.citizen.basicEmotions = citizenMood.basic_emotions;
          Ledger.citizen.emotionDistribution = citizenMood.emotion_distribution;
        }
      } else {
        console.error(`Failed to fetch mood from API: ${moodResponse.status}`);
      }
    } catch (error) {
      console.error('Error calculating mood via API:', error);
      // Continue with default mood
    }
    
    // Planned Activities
    Ledger.plannedActivities = plannedActivitiesRecords.map(a => ({...normalizeKeysCamelCaseShallow(a.fields), airtableId: a.id}));
    
    // Stratagems
    Ledger.stratagemsExecutedByCitizen = stratagemsResult.executedBy.map(s => ({...normalizeKeysCamelCaseShallow(s.fields), airtableId: s.id}));
    Ledger.stratagemsTargetingCitizen = stratagemsResult.targetedAt.map(s => ({...normalizeKeysCamelCaseShallow(s.fields), airtableId: s.id}));
    Ledger.stratagemsExecutedByCitizenPast = stratagemsResult.executedByPast.map(s => ({...normalizeKeysCamelCaseShallow(s.fields), airtableId: s.id}));
    Ledger.stratagemsTargetingCitizenPast = stratagemsResult.targetedAtPast.map(s => ({...normalizeKeysCamelCaseShallow(s.fields), airtableId: s.id}));
    
    // Contracts
    Ledger.activeContracts = activeContractsRecords.map(c => ({...normalizeKeysCamelCaseShallow(c.fields), airtableId: c.id}));

    // Guild details
    if (guildRecord) {
      Ledger.guildDetails = {...normalizeKeysCamelCaseShallow(guildRecord.fields), airtableId: guildRecord.id};
    }

    // Loans
    Ledger.citizenLoans = citizenLoansRecords.map(l => ({...normalizeKeysCamelCaseShallow(l.fields), airtableId: l.id}));

    // Buildings
    Ledger.managedBuildings = managedBuildingsRecords.map(b => ({...normalizeKeysCamelCaseShallow(b.fields), airtableId: b.id}));
    
    if (workplaceBuildingRecord) {
      Ledger.workplaceBuilding = {...normalizeKeysCamelCaseShallow(workplaceBuildingRecord.fields), airtableId: workplaceBuildingRecord.id};
    }

    if (homeBuildingRecord) {
      Ledger.homeBuilding = {...normalizeKeysCamelCaseShallow(homeBuildingRecord.fields), airtableId: homeBuildingRecord.id};
    }

    // Relationships
    Ledger.strongestRelationships = strongestRelationshipsRecords.map(r => {
      const normalized = normalizeKeysCamelCaseShallow(r.fields);
      const { combinedScore, ...fieldsWithoutCombinedScore } = normalized;
      return {...fieldsWithoutCombinedScore, airtableId: r.id};
    });
    
    // Problems
    Ledger.recentProblems = recentProblemsRecords.map(p => ({...normalizeKeysCamelCaseShallow(p.fields), airtableId: p.id}));

    // Messages - separate thoughts (sender = receiver) from regular messages
    const allMessages = recentMessagesRecords.map(m => {
      const normalizedFields = normalizeKeysCamelCaseShallow(m.fields);
      delete normalizedFields.thinking;
      return {...normalizedFields, airtableId: m.id};
    });
    
    // Filter messages into regular messages and thoughts
    Ledger.recentMessages = allMessages.filter(m => m.sender !== m.receiver);
    Ledger.thoughts = allMessages.filter(m => m.sender === m.receiver);

    // Daily update
    if (lastDailyUpdateRecord) {
      Ledger.latestDailyUpdate = {...normalizeKeysCamelCaseShallow(lastDailyUpdateRecord.fields), airtableId: lastDailyUpdateRecord.id};
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
    Ledger.ownedBuildings = [...businessBuildings, ...nonBusinessBuildings];

    if (format.toLowerCase() === 'markdown') {
      const markdownContent = convertLedgerToMarkdown(Ledger, citizenUsername);
      
      // Cache the result
      LEDGER_CACHE[cacheKey] = {
        data: markdownContent,
        timestamp: now
      };
      
      return new NextResponse(markdownContent, {
        status: 200,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      });
    } else {
      // Default to JSON if format is not markdown (e.g., format=json)
      
      // Cache the result
      LEDGER_CACHE[cacheKey] = {
        data: Ledger,
        timestamp: now
      };
      
      return NextResponse.json({ success: true, data: Ledger });
    }

  } catch (error: any) {
    console.error(`[API get-ledger] Error for ${citizenUsername} (Format: ${format}):`, error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch ledger' }, { status: 500 });
  }
}
