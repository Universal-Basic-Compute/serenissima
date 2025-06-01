import { NextResponse } from 'next/server';
import Airtable, { FieldSet, Record as AirtableRecord } from 'airtable';

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

interface PolygonData {
  id: string; // LandId
  buildingPoints?: BuildingPoint[];
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
    return await airtable('LANDS').select({
      filterByFormula: `{Owner} = '${escapeAirtableValue(username)}'`,
    }).all();
  } catch (error) {
    console.error(`Error fetching lands for ${username}:`, error);
    return [];
  }
}

async function fetchBuildingsOnLand(landId: string): Promise<AirtableRecord<FieldSet>[]> {
  try {
    return await airtable('BUILDINGS').select({
      filterByFormula: `{LandId} = '${escapeAirtableValue(landId)}'`,
    }).all();
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
      };
    }
    console.warn(`No land data found for ${landId} via /api/lands`);
    return null;
  } catch (error) {
    console.error(`Error fetching polygon data for land ${landId}:`, error);
    return null;
  }
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

    const ownedLandsData = [];
    for (const landRecord of ownedLandsRecords) {
      const landId = landRecord.fields.LandId as string;
      if (!landId) continue;

      const buildingsOnLandRecords = await fetchBuildingsOnLand(landId);
      const polygonData = await fetchPolygonDataForLand(landId);

      let unoccupiedBuildingPoints: BuildingPoint[] = [];
      if (polygonData && polygonData.buildingPoints) {
        const occupiedPointIds = new Set<string>();
        buildingsOnLandRecords.forEach(bldg => {
          const pointField = bldg.fields.Point;
          if (typeof pointField === 'string') {
            occupiedPointIds.add(pointField);
          } else if (Array.isArray(pointField)) {
            pointField.forEach(p => {
              if (typeof p === 'string') occupiedPointIds.add(p);
            });
          }
        });
        unoccupiedBuildingPoints = polygonData.buildingPoints.filter(bp => !occupiedPointIds.has(bp.id));
      }
      
      ownedLandsData.push({
        ...normalizeKeysCamelCaseShallow(landRecord.fields),
        airtableId: landRecord.id,
        buildings: buildingsOnLandRecords.map(b => ({...normalizeKeysCamelCaseShallow(b.fields), airtableId: b.id})),
        unoccupiedBuildingPoints: unoccupiedBuildingPoints,
        totalBuildingPoints: polygonData?.buildingPoints?.length || 0,
      });
    }

    const dataPackage = {
      citizen: {...normalizeKeysCamelCaseShallow(citizenRecord.fields), airtableId: citizenRecord.id},
      lastActivity: lastActivityRecord ? {...normalizeKeysCamelCaseShallow(lastActivityRecord.fields), airtableId: lastActivityRecord.id} : null,
      ownedLands: ownedLandsData,
    };

    return NextResponse.json({ success: true, data: dataPackage });

  } catch (error: any) {
    console.error(`[API get-data-package] Error for ${citizenUsername}:`, error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch data package' }, { status: 500 });
  }
}
