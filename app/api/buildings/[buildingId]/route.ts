import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import path from 'path';
import fs from 'fs';

// Initialize Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_BUILDINGS_TABLE = process.env.AIRTABLE_BUILDINGS_TABLE || 'BUILDINGS';

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID!);

// Fallback to local JSON file if Airtable is not available
const BUILDINGS_DIR = path.join(process.cwd(), 'data', 'buildings');

// Ensure the buildings directory exists
function ensureBuildingsDirExists() {
  if (!fs.existsSync(BUILDINGS_DIR)) {
    fs.mkdirSync(BUILDINGS_DIR, { recursive: true });
  }
  return BUILDINGS_DIR;
}

// Function to read building from local JSON file
function readBuildingFromFile(buildingId: string) {
  const buildingsDir = ensureBuildingsDirExists();
  const filePath = path.join(buildingsDir, `${buildingId}.json`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error reading building file ${filePath}:`, error);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { buildingId: string } }
) {
  try {
    const buildingId = params.buildingId;
    console.log(`GET /api/buildings/${buildingId} request received`);
    
    // Try to fetch from Airtable first
    if (AIRTABLE_API_KEY && AIRTABLE_BASE_ID) {
      try {
        // Query Airtable for the building
        const records = await base(AIRTABLE_BUILDINGS_TABLE)
          .select({
            filterByFormula: `{BuildingId} = '${buildingId}'`,
            maxRecords: 1
          })
          .firstPage();
        
        if (records && records.length > 0) {
          const record = records[0];
          const fields = record.fields;
          
          // Transform Airtable record to building object
          const building = {
            id: buildingId,
            type: fields.Type || 'Unknown',
            land_id: fields.Land || '',
            variant: fields.Variant || '',
            position: fields.Position || '',
            rotation: fields.Rotation || 0,
            owner: fields.User || '',
            created_at: fields.CreatedAt || new Date().toISOString(),
            created_by: fields.CreatedBy || '',
            updated_at: fields.UpdatedAt || new Date().toISOString(),
            lease_amount: fields.LeaseAmount || 0,
            rent_amount: fields.RentAmount || 0,
            occupant: fields.Occupant || ''
          };
          
          return NextResponse.json({ building });
        }
      } catch (airtableError) {
        console.error('Error fetching from Airtable:', airtableError);
        // Fall through to try local file
      }
    }
    
    // If Airtable fetch failed or returned no results, try local file
    const buildingData = readBuildingFromFile(buildingId);
    if (buildingData) {
      return NextResponse.json({ building: buildingData });
    }
    
    // If we get here, the building was not found
    return NextResponse.json(
      { error: `Building not found: ${buildingId}` },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error in GET /api/buildings/[buildingId]:', error);
    return NextResponse.json(
      { error: 'Failed to fetch building details' },
      { status: 500 }
    );
  }
}
