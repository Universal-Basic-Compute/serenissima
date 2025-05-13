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

// Function to search for buildings in subcategory folders
async function findBuildingFile(buildingId: string): Promise<any> {
  const buildingsDir = ensureBuildingsDirExists();
  
  // First, try direct lookup by ID
  const directFilePath = path.join(buildingsDir, `${buildingId}.json`);
  if (fs.existsSync(directFilePath)) {
    try {
      const fileContent = fs.readFileSync(directFilePath, 'utf8');
      return JSON.parse(fileContent);
    } catch (error) {
      console.error(`Error reading building file ${directFilePath}:`, error);
    }
  }
  
  // If not found, search in category/subcategory structure
  try {
    // Get all category directories
    const categories = fs.readdirSync(buildingsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    // Search through each category
    for (const category of categories) {
      const categoryPath = path.join(buildingsDir, category);
      
      // Check if this is a subcategory structure
      const hasSubcategories = fs.readdirSync(categoryPath, { withFileTypes: true })
        .some(dirent => dirent.isDirectory());
      
      if (hasSubcategories) {
        // Get all subcategory directories
        const subcategories = fs.readdirSync(categoryPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        
        // Search through each subcategory
        for (const subcategory of subcategories) {
          const subcategoryPath = path.join(categoryPath, subcategory);
          
          // Check if the buildingId matches the subcategory name
          if (subcategory.toLowerCase() === buildingId.toLowerCase()) {
            // Return a list of buildings in this subcategory
            const files = fs.readdirSync(subcategoryPath)
              .filter(file => file.endsWith('.json'));
            
            if (files.length > 0) {
              // Return the first building as an example
              const filePath = path.join(subcategoryPath, files[0]);
              try {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const building = JSON.parse(fileContent);
                return {
                  ...building,
                  isSubcategory: true,
                  subcategory: subcategory,
                  category: category,
                  availableBuildings: files.map(file => file.replace('.json', ''))
                };
              } catch (error) {
                console.error(`Error reading building file ${filePath}:`, error);
              }
            }
          }
          
          // Get all building definition files in this subcategory
          const files = fs.readdirSync(subcategoryPath)
            .filter(file => file.endsWith('.json'));
          
          // Check each file
          for (const file of files) {
            // Check if the filename (without extension) matches the buildingId
            if (file.toLowerCase().replace('.json', '') === buildingId.toLowerCase()) {
              const filePath = path.join(subcategoryPath, file);
              try {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const building = JSON.parse(fileContent);
                return {
                  ...building,
                  subcategory: subcategory,
                  category: category
                };
              } catch (error) {
                console.error(`Error reading building file ${filePath}:`, error);
              }
            }
          }
        }
      } else {
        // No subcategories, check files directly in the category
        const files = fs.readdirSync(categoryPath)
          .filter(file => file.endsWith('.json'));
        
        // Check if the category name matches the buildingId
        if (category.toLowerCase() === buildingId.toLowerCase()) {
          // Return a list of buildings in this category
          if (files.length > 0) {
            // Return the first building as an example
            const filePath = path.join(categoryPath, files[0]);
            try {
              const fileContent = fs.readFileSync(filePath, 'utf8');
              const building = JSON.parse(fileContent);
              return {
                ...building,
                isCategory: true,
                category: category,
                availableBuildings: files.map(file => file.replace('.json', ''))
              };
            } catch (error) {
              console.error(`Error reading building file ${filePath}:`, error);
            }
          }
        }
        
        // Check each file
        for (const file of files) {
          // Check if the filename (without extension) matches the buildingId
          if (file.toLowerCase().replace('.json', '') === buildingId.toLowerCase()) {
            const filePath = path.join(categoryPath, file);
            try {
              const fileContent = fs.readFileSync(filePath, 'utf8');
              const building = JSON.parse(fileContent);
              return {
                ...building,
                category: category
              };
            } catch (error) {
              console.error(`Error reading building file ${filePath}:`, error);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error searching for building in category structure:', error);
  }
  
  return null;
}

// Function to read building from local JSON file
function readBuildingFromFile(buildingId: string) {
  return findBuildingFile(buildingId);
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
    const buildingData = await findBuildingFile(buildingId);
    if (buildingData) {
      // Check if this is a category or subcategory
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
      
      // Regular building
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
