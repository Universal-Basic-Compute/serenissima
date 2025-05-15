import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

// Helper function to find a building definition file in the flat directory structure
async function findBuildingDefinition(buildingType: string): Promise<any> {
  const buildingsDir = path.join(process.cwd(), 'data', 'buildings');
  
  // Ensure the directory exists
  if (!fs.existsSync(buildingsDir)) {
    return null;
  }
  
  // Normalize the building type for comparison
  const normalizedType = buildingType.toLowerCase().trim();
  
  // Get all building definition files in the flat directory
  const files = fs.readdirSync(buildingsDir)
    .filter(file => file.endsWith('.json'));
  
  // Check each file
  for (const file of files) {
    const filePath = path.join(buildingsDir, file);
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const definition = JSON.parse(fileContent);
      
      // Check if this is the building type we're looking for
      if (definition.type && definition.type.toLowerCase().trim() === normalizedType) {
        return definition;
      }
    } catch (error) {
      console.error(`Error reading or parsing ${filePath}:`, error);
    }
  }
  
  // Building definition not found
  return null;
}

export async function GET(request: NextRequest) {
  try {
    // Get the building type from the query parameters
    const url = new URL(request.url);
    const buildingType = url.searchParams.get('type');
    
    if (!buildingType) {
      return NextResponse.json(
        { error: 'Building type is required' },
        { status: 400 }
      );
    }
    
    // Find the building definition
    const definition = await findBuildingDefinition(buildingType);
    
    if (!definition) {
      return NextResponse.json(
        { error: `Building definition not found for type: ${buildingType}` },
        { status: 404 }
      );
    }
    
    return NextResponse.json(definition);
  } catch (error) {
    console.error('Error in GET /api/building-definition:', error);
    return NextResponse.json(
      { error: 'Failed to fetch building definition' },
      { status: 500 }
    );
  }
}
