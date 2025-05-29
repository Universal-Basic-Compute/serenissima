import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { existsSync } from 'fs';

// Function to recursively find all JSON files in a directory
function findBuildingJsonFiles(dir: string): string[] {
  let results: string[] = [];
  
  try {
    console.log(`Scanning directory: ${dir}`);
    const items = fs.readdirSync(dir);
    console.log(`Found ${items.length} items in ${dir}`);
    
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        // Recursively search subdirectories
        console.log(`Found subdirectory: ${itemPath}`);
        const subResults = findBuildingJsonFiles(itemPath);
        console.log(`Found ${subResults.length} building files in subdirectory ${itemPath}`);
        results = results.concat(subResults);
      } else if (item.endsWith('.json')) {
        // Add JSON files to results
        //console.log(`Found JSON file: ${itemPath}`);
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
    const buildingData = JSON.parse(data);
    return {
      ...buildingData,
      productionInformation: buildingData.productionInformation || null,
      canImport: buildingData.canImport || false,
      commercialStorage: buildingData.commercialStorage || false, // Add commercialStorage property with default false
      pointType: buildingData.pointType || null, // Ensure pointType is included with a default
      size: buildingData.size || 1 // Ensure size is included with a default
    };
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
    
    // Check if the directory exists
    if (!existsSync(buildingsDir)) {
      console.error(`Buildings directory does not exist: ${buildingsDir}`);
      return NextResponse.json(
        { success: false, error: 'Buildings directory not found' },
        { status: 500 }
      );
    }
    
    console.log(`Searching for building types in directory: ${buildingsDir}`);
    
    // Find all JSON files in the buildings directory and its subdirectories
    const buildingFiles = findBuildingJsonFiles(buildingsDir);
    console.log(`Found ${buildingFiles.length} building JSON files`);
    
    // Log the first few files for debugging
    if (buildingFiles.length > 0) {
      console.log("Sample building files found:");
      buildingFiles.slice(0, 5).forEach(file => console.log(` - ${file}`));
    } else {
      console.log("No building files found. Checking directory contents:");
      try {
        const topLevelItems = fs.readdirSync(buildingsDir);
        console.log(`Top level items in ${buildingsDir}:`, topLevelItems);
        
        // Check the first subdirectory if any exist
        if (topLevelItems.length > 0) {
          const firstItem = path.join(buildingsDir, topLevelItems[0]);
          if (fs.statSync(firstItem).isDirectory()) {
            console.log(`Items in ${firstItem}:`, fs.readdirSync(firstItem));
          }
        }
      } catch (error) {
        console.error(`Error reading directory contents: ${error}`);
      }
    }
    
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
        subCategory: buildingData.subCategory || pathParts[1] || 'General',
        buildTier: buildingData.buildTier || 5, // Default to a high tier if not specified
        pointType: buildingData.pointType || 'building', // Default to 'building' if not specified
        size: buildingData.size || 1,
        constructionCosts: buildingData.constructionCosts || null,
        maintenanceCost: buildingData.maintenanceCost || 0,
        shortDescription: buildingData.shortDescription || '',
        productionInformation: buildingData.productionInformation || null,
        canImport: buildingData.canImport || false,
        commercialStorage: buildingData.commercialStorage || false, // Add commercialStorage property to the returned object
        constructionMinutes: buildingData.constructionMinutes || 0 // Ensure constructionMinutes is included
      };
    }).filter(Boolean); // Remove null entries
    
    // Apply filters if provided
    if (pointType) {
      buildings = buildings.filter(building => building.pointType === pointType);
    }
    
    // Group buildings by category and subCategory
    const buildingsByCategory: Record<string, any> = {};
    
    buildings.forEach(building => {
      const { category, subCategory } = building;
      
      if (!buildingsByCategory[category]) {
        buildingsByCategory[category] = {
          name: category,
          subcategories: {}
        };
      }
      
      if (!buildingsByCategory[category].subcategories[subCategory]) {
        buildingsByCategory[category].subcategories[subCategory] = {
          name: subCategory,
          buildings: []
        };
      }
      
      buildingsByCategory[category].subcategories[subCategory].buildings.push(building);
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
