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
  let modifiableBuilding = { ...building }; // Contains original 'position' and 'point' fields

  // 1. Try to use existing 'position' field if it's valid
  let parsedPosition = null;
  if (typeof modifiableBuilding.position === 'string' && modifiableBuilding.position.trim() !== "") {
    try {
      parsedPosition = JSON.parse(modifiableBuilding.position);
    } catch (e) {
      console.warn(`Building ${buildingIdFromPath}: 'position' field is a string but not valid JSON: ${modifiableBuilding.position}`);
    }
  } else if (typeof modifiableBuilding.position === 'object' && modifiableBuilding.position !== null) {
    parsedPosition = modifiableBuilding.position; // Already an object
  }

  // Generic pattern for type_LAT_LNG (e.g., building_LAT_LNG, canal_LAT_LNG)
  // Allows for types containing letters, numbers, and hyphens.
  const coordPattern = /^[a-zA-Z0-9-]+_(-?[0-9]+(?:\.[0-9]+)?)_(-?[0-9]+(?:\.[0-9]+)?)$/;

  // 2. If 'position' is not valid or not present, try to parse from 'buildingIdFromPath'
  if (!parsedPosition && buildingIdFromPath) {
    const idMatch = String(buildingIdFromPath).match(coordPattern);
    if (idMatch) {
      const lat = parseFloat(idMatch[1]);
      const lng = parseFloat(idMatch[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        parsedPosition = { lat, lng };
        console.log(`Building ${buildingIdFromPath}: Populated position from buildingIdFromPath '${buildingIdFromPath}':`, parsedPosition);
      }
    }
  }
  
  // 3. If 'position' is still not determined, try to parse from 'point' field (from Airtable/file)
  if (!parsedPosition && modifiableBuilding.point) {
    const pointValue = String(modifiableBuilding.point);
    const pointMatch = pointValue.match(coordPattern);
    if (pointMatch) {
      const lat = parseFloat(pointMatch[1]);
      const lng = parseFloat(pointMatch[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        parsedPosition = { lat, lng };
        console.log(`Building ${buildingIdFromPath}: Populated position from 'point' field '${pointValue}':`, parsedPosition);
      }
    }
  }

  modifiableBuilding.position = parsedPosition; // Assign the final parsed position (object or null)

  // Ensure 'id' field is present in the returned object, using buildingIdFromPath if building.id is missing
  // Also handles if Airtable provided 'BuildingId' instead of 'id' in the initial mapping
  if (!modifiableBuilding.id && buildingIdFromPath) {
    modifiableBuilding.id = buildingIdFromPath;
  } else if (!modifiableBuilding.id && modifiableBuilding.BuildingId) { 
     modifiableBuilding.id = modifiableBuilding.BuildingId;
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
          const fields = records[0].fields as Airtable.FieldSet; // Define fields here
          const buildingRaw = {
            id: fields.BuildingId as string || buildingId,
            type: fields.Type as string || 'Unknown',
            landId: (fields.LandId as string || fields.Land as string || '') as string,
            variant: fields.Variant as string || '',
            position: fields.Position || null, // Keep as is (string, object, or null from Airtable)
            point: fields.Point || null,       // Keep as is, will be processed by ensureBuildingDataIntegrity
            rotation: fields.Rotation as number || 0,
            owner: fields.Owner as string || '',
            createdAt: fields.CreatedAt as string || new Date().toISOString(),
            createdBy: fields.CreatedBy as string || '',
            updatedAt: fields.UpdatedAt as string || new Date().toISOString(),
            leaseAmount: fields.LeaseAmount as number || 0,
            rentAmount: fields.RentAmount as number || 0,
            occupant: fields.Occupant as string || ''
          };
          
          let processedBuilding = ensureBuildingDataIntegrity(buildingRaw, buildingId);

          // Rename 'point' to 'pointId' for the final response and remove original Airtable 'BuildingId' if it was used
          if (processedBuilding.point) {
            processedBuilding.pointId = processedBuilding.point;
            delete processedBuilding.point;
          }
          if (processedBuilding.BuildingId) { // Clean up if BuildingId was part of buildingRaw
            delete processedBuilding.BuildingId;
          }

          return NextResponse.json({ building: processedBuilding });
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
      
      // buildingData is the raw data from the file
      let processedBuildingFromFile = ensureBuildingDataIntegrity(buildingData, buildingId);

      // Rename 'point' to 'pointId' for the final response and remove original 'BuildingId' if present
      if (processedBuildingFromFile.point) {
        processedBuildingFromFile.pointId = processedBuildingFromFile.point;
        delete processedBuildingFromFile.point;
      }
      if (processedBuildingFromFile.BuildingId) { // Clean up if local file used Airtable naming
        delete processedBuildingFromFile.BuildingId;
      }

      console.log(`Building ${buildingId} from local file - owner field: '${processedBuildingFromFile.owner}', occupant field: '${processedBuildingFromFile.occupant}'`);
      return NextResponse.json({ building: processedBuildingFromFile });
    }

    return NextResponse.json({ error: `Building not found: ${buildingId}` }, { status: 404 });

  } catch (err) {
    console.error('Error in GET handler:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
