import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import path from 'path';
import fs from 'fs';

// Airtable config
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_BUILDINGS_TABLE = process.env.AIRTABLE_BUILDINGS_TABLE || 'BUILDINGS';
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID!);

// Local files path
const BUILDINGS_DIR = path.join(process.cwd(), 'data', 'buildings');

// Ensure the local data directory exists
function ensureBuildingsDirExists() {
  if (!fs.existsSync(BUILDINGS_DIR)) {
    fs.mkdirSync(BUILDINGS_DIR, { recursive: true });
  }
  return BUILDINGS_DIR;
}

// Search a building file locally, including in subdirectories
async function findBuildingFile(buildingId: string): Promise<any | null> {
  const buildingsDir = ensureBuildingsDirExists();

  // Direct match
  const directFilePath = path.join(buildingsDir, `${buildingId}.json`);
  if (fs.existsSync(directFilePath)) {
    try {
      return JSON.parse(fs.readFileSync(directFilePath, 'utf8'));
    } catch (err) {
      console.error(`Error reading ${directFilePath}:`, err);
    }
  }

  // Search in subfolders (category / subcategory)
  try {
    const categories = fs.readdirSync(buildingsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const category of categories) {
      const categoryPath = path.join(buildingsDir, category);
      const subcategories = fs.readdirSync(categoryPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const subcategory of subcategories) {
        const subPath = path.join(categoryPath, subcategory);

        // Subcategory match
        if (subcategory.toLowerCase() === buildingId.toLowerCase()) {
          const files = fs.readdirSync(subPath).filter(f => f.endsWith('.json'));
          if (files.length) {
            const file = fs.readFileSync(path.join(subPath, files[0]), 'utf8');
            return {
              ...JSON.parse(file),
              isSubcategory: true,
              subcategory,
              category,
              availableBuildings: files.map(f => f.replace('.json', ''))
            };
          }
        }

        // Match by file name
        for (const file of fs.readdirSync(subPath).filter(f => f.endsWith('.json'))) {
          if (file.replace('.json', '').toLowerCase() === buildingId.toLowerCase()) {
            const content = fs.readFileSync(path.join(subPath, file), 'utf8');
            return {
              ...JSON.parse(content),
              subcategory,
              category
            };
          }
        }
      }

      // No subcategories: match in category root
      const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        if (file.replace('.json', '').toLowerCase() === buildingId.toLowerCase()) {
          const content = fs.readFileSync(path.join(categoryPath, file), 'utf8');
          return {
            ...JSON.parse(content),
            category
          };
        }
      }

      // Category name match
      if (category.toLowerCase() === buildingId.toLowerCase() && files.length > 0) {
        const file = fs.readFileSync(path.join(categoryPath, files[0]), 'utf8');
        return {
          ...JSON.parse(file),
          isCategory: true,
          category,
          availableBuildings: files.map(f => f.replace('.json', ''))
        };
      }
    }
  } catch (err) {
    console.error('Error during local building search:', err);
  }

  return null;
}

// Helper function to ensure building ID and position are correctly populated
function ensureBuildingDataIntegrity(building: any, buildingIdFromPath: string): any {
  let modifiableBuilding = { ...building };

  // Ensure 'id' field is present, using buildingIdFromPath if necessary
  if (!modifiableBuilding.id && buildingIdFromPath) {
    modifiableBuilding.id = buildingIdFromPath;
  }

  // Populate 'position' if empty and ID matches coordinate pattern
  if ((!modifiableBuilding.position || modifiableBuilding.position === "") && modifiableBuilding.id) {
    // Regex for building_LAT_LNG pattern (allows for optional negative signs and decimals)
    const idPattern = /^building_(-?[0-9]+(?:\.[0-9]+)?)_(-?[0-9]+(?:\.[0-9]+)?)$/;
    const idMatch = String(modifiableBuilding.id).match(idPattern);
    
    if (idMatch) {
      const lat = parseFloat(idMatch[1]);
      const lng = parseFloat(idMatch[2]); // Second captured group for longitude
      
      if (!isNaN(lat) && !isNaN(lng)) {
        modifiableBuilding.position = JSON.stringify({ lat, lng });
        console.log(`Populated position for ${modifiableBuilding.id} from ID: {"lat":${lat},"lng":${lng}}`);
      }
    }
  }
  return modifiableBuilding;
}

// ✅ Handler compatible with Next.js App Router
export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname;
    const buildingId = pathname.split('/').pop();

    if (!buildingId) {
      return NextResponse.json({ error: 'Missing buildingId' }, { status: 400 });
    }

    console.log(`GET /api/buildings/${buildingId} received`);

    // Try Airtable first
    if (AIRTABLE_API_KEY && AIRTABLE_BASE_ID) {
      try {
        const records = await base(AIRTABLE_BUILDINGS_TABLE)
          .select({
            filterByFormula: `{BuildingId} = '${buildingId}'`,
            maxRecords: 1
          })
          .firstPage();

        if (records.length > 0) {
          const fields = records[0].fields;
          const building = {
            id: buildingId,
            type: fields.Type || 'Unknown',
            land_id: fields.LandId || fields.Land || '', // Prioritize LandId if it exists, fallback to Land
            variant: fields.Variant || '',
            position: fields.Position || '',
            rotation: fields.Rotation || 0,
            owner: fields.Citizen || '',
            created_at: fields.CreatedAt || new Date().toISOString(),
            created_by: fields.CreatedBy || '',
            updated_at: fields.UpdatedAt || new Date().toISOString(),
            lease_amount: fields.LeaseAmount || 0,
            rent_amount: fields.RentAmount || 0,
            occupant: fields.Occupant || ''
          };
          
          const finalBuildingFromAirtable = ensureBuildingDataIntegrity(building, buildingId);

          console.log(`Building ${buildingId} from Airtable - Citizen field: '${fields.Citizen}', Occupant field: '${fields.Occupant}'`);
          return NextResponse.json({ building: finalBuildingFromAirtable });
        }
      } catch (err) {
        console.error('Airtable error:', err);
      }
    }

    // Fallback to local
    const buildingData = await findBuildingFile(buildingId);
    if (buildingData) {
      if (buildingData.isCategory) {
        return NextResponse.json({
          category: buildingData.category,
          availableBuildings: buildingData.availableBuildings
        });
      } else if (buildingData.isSubcategory) {
        return NextResponse.json({
          category: buildingData.category,
          subcategory: buildingData.subcategory,
          availableBuildings: buildingData.availableBuildings
        });
      }
      
      // Ensure buildingData has an ID and position if applicable
      const finalBuildingFromFile = ensureBuildingDataIntegrity(buildingData, buildingId);

      console.log(`Building ${buildingId} from local file - owner field: '${finalBuildingFromFile.owner}', occupant field: '${finalBuildingFromFile.occupant}'`);
      return NextResponse.json({ building: finalBuildingFromFile });
    }

    return NextResponse.json({ error: `Building not found: ${buildingId}` }, { status: 404 });

  } catch (err) {
    console.error('Error in GET handler:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
