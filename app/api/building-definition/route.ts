import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

// Helper function to find a building definition file in the category structure
async function findBuildingDefinition(buildingType: string): Promise<any> {
  const buildingsDir = path.join(process.cwd(), 'data', 'buildings');
  
  // Ensure the directory exists
  if (!fs.existsSync(buildingsDir)) {
    return null;
  }
  
  // Normalize the building type for comparison
  const normalizedType = buildingType.toLowerCase().trim();
  
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
        
        // Get all building definition files in this subcategory
        const files = fs.readdirSync(subcategoryPath)
          .filter(file => file.endsWith('.json'));
        
        // Check each file
        for (const file of files) {
          const filePath = path.join(subcategoryPath, file);
          try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const definition = JSON.parse(fileContent);
            
            // Check if this is the building type we're looking for
            if (definition.type && definition.type.toLowerCase().trim() === normalizedType) {
              // Add category and subcategory to the definition
              definition.category = category;
              definition.subcategory = subcategory;
              return definition;
            }
          } catch (error) {
            console.error(`Error reading or parsing ${filePath}:`, error);
          }
        }
      }
    } else {
      // No subcategories, check files directly in the category
      const files = fs.readdirSync(categoryPath)
        .filter(file => file.endsWith('.json'));
      
      // Check each file
      for (const file of files) {
        const filePath = path.join(categoryPath, file);
        try {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const definition = JSON.parse(fileContent);
          
          // Check if this is the building type we're looking for
          if (definition.type && definition.type.toLowerCase().trim() === normalizedType) {
            // Add category to the definition
            definition.category = category;
            return definition;
          }
        } catch (error) {
          console.error(`Error reading or parsing ${filePath}:`, error);
        }
      }
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
