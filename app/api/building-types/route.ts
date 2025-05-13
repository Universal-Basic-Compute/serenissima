import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Function to recursively find all JSON files in a directory
function findBuildingJsonFiles(dir: string): string[] {
  let results: string[] = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        // Recursively search subdirectories
        results = results.concat(findBuildingJsonFiles(itemPath));
      } else if (item.endsWith('.json')) {
        // Add JSON files to results
        results.push(itemPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return results;
}

// Function to load and parse a building JSON file
function loadBuildingData(filePath: string): any {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading building data from ${filePath}:`, error);
    return null;
  }
}

export async function GET(request: Request) {
  try {
    // Parse query parameters
    const url = new URL(request.url);
    const pointType = url.searchParams.get('pointType');
    
    // Get the buildings directory path
    const buildingsDir = path.join(process.cwd(), 'data', 'buildings');
    
    // Find all JSON files in the buildings directory and its subdirectories
    const buildingFiles = findBuildingJsonFiles(buildingsDir);
    
    // Load and parse each building file
    let buildings = buildingFiles.map(filePath => {
      const buildingData = loadBuildingData(filePath);
      
      if (!buildingData) {
        return null;
      }
      
      // Extract the relative path from the buildings directory
      const relativePath = path.relative(buildingsDir, filePath);
      // Remove the .json extension
      const type = path.basename(relativePath, '.json');
      // Get the directory structure as categories
      const pathParts = path.dirname(relativePath).split(path.sep);
      
      return {
        type,
        name: buildingData.name,
        category: buildingData.category || pathParts[0] || 'Uncategorized',
        subcategory: buildingData.subcategory || pathParts[1] || 'General',
        tier: buildingData.tier || 1,
        pointType: buildingData.pointType || null,
        constructionCosts: buildingData.constructionCosts || null,
        maintenanceCost: buildingData.maintenanceCost || 0,
        incomeGeneration: buildingData.incomeGeneration || 0,
        shortDescription: buildingData.shortDescription || '',
        path: relativePath
      };
    }).filter(Boolean); // Remove null entries
    
    // Apply filters if provided
    if (pointType) {
      buildings = buildings.filter(building => building.pointType === pointType);
    }
    
    // Group buildings by category and subcategory
    const buildingsByCategory: Record<string, any> = {};
    
    buildings.forEach(building => {
      const { category, subcategory } = building;
      
      if (!buildingsByCategory[category]) {
        buildingsByCategory[category] = {
          name: category,
          subcategories: {}
        };
      }
      
      if (!buildingsByCategory[category].subcategories[subcategory]) {
        buildingsByCategory[category].subcategories[subcategory] = {
          name: subcategory,
          buildings: []
        };
      }
      
      buildingsByCategory[category].subcategories[subcategory].buildings.push(building);
    });
    
    // Convert to array format
    const categoriesArray = Object.values(buildingsByCategory).map(category => {
      return {
        name: category.name,
        subcategories: Object.values(category.subcategories)
      };
    });
    
    return NextResponse.json({
      success: true,
      buildingTypes: buildings,
      categories: categoriesArray,
      filters: { pointType }
    });
  } catch (error) {
    console.error('Error fetching building types:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch building types' },
      { status: 500 }
    );
  }
}
