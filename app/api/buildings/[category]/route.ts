import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: { category: string } }
) {
  try {
    const { category } = params;
    
    // Validate the category
    const validCategories = [
      'residential',
      'commercial',
      'production',
      'infrastructure',
      'public&government',
      'military&defence',
      'special'
    ];
    
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { success: false, error: 'Invalid building category' },
        { status: 400 }
      );
    }
    
    // Get the file path
    const filePath = path.join(process.cwd(), 'data', 'buildings', `${category}.json`);
    
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      console.log(`Building category file not found: ${filePath}, using residential as fallback`);
      // Use residential as fallback
      const fallbackPath = path.join(process.cwd(), 'data', 'buildings', 'residential.json');
      
      if (!fs.existsSync(fallbackPath)) {
        return NextResponse.json(
          { success: false, error: 'Building data not found' },
          { status: 404 }
        );
      }
      
      // Read the fallback file
      const fallbackContent = fs.readFileSync(fallbackPath, 'utf8');
      const fallbackBuildings = JSON.parse(fallbackContent);
      
      console.log(`Serving ${fallbackBuildings.length} buildings from residential fallback`);
      return NextResponse.json(fallbackBuildings);
    }
    
    // Read the file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const buildings = JSON.parse(fileContent);
    
    console.log(`Serving ${buildings.length} buildings for category ${category}`);
    
    // Return the buildings
    return NextResponse.json(buildings);
  } catch (error) {
    console.error(`Error fetching building data for category ${params.category}:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch building data' },
      { status: 500 }
    );
  }
}
