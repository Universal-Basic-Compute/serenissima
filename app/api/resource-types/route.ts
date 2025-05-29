import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { existsSync } from 'fs';

// Function to recursively find all JSON files in a directory
function findResourceJsonFiles(dir: string): string[] {
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
        const subResults = findResourceJsonFiles(itemPath);
        console.log(`Found ${subResults.length} resource files in subdirectory ${itemPath}`);
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

// Function to load and parse a resource JSON file
function loadResourceData(filePath: string): any {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const resourceData = JSON.parse(data);
    
    return {
      // id: path.basename(filePath, '.json'), // id is derived later by the caller
      name: resourceData.name || path.basename(filePath, '.json'),
      icon: resourceData.icon || null, // Add icon field, default to null if not present
      category: resourceData.category, // Keep as is, will be processed with path fallback later
      subCategory: resourceData.subCategory, // Keep as is, will be processed with path fallback later
      tier: resourceData.tier !== undefined ? resourceData.tier : null, // Add tier, default to null
      description: resourceData.description || '',
      importPrice: resourceData.importPrice !== undefined ? resourceData.importPrice : null,
      lifetimeHours: resourceData.lifetimeHours !== undefined ? resourceData.lifetimeHours : null,
      consumptionHours: resourceData.consumptionHours !== undefined ? resourceData.consumptionHours : null
    };
  } catch (error) {
    console.error(`Error loading resource data from ${filePath}:`, error);
    return null;
  }
}

export async function GET(request: Request) {
  try {
    // Parse query parameters
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    
    // Get the resources directory path
    const resourcesDir = path.join(process.cwd(), 'data', 'resources');
    
    // Check if the directory exists
    if (!existsSync(resourcesDir)) {
      console.error(`Resources directory does not exist: ${resourcesDir}`);
      return NextResponse.json(
        { success: false, error: 'Resources directory not found' },
        { status: 500 }
      );
    }
    
    console.log(`Searching for resource types in directory: ${resourcesDir}`);
    
    // Find all JSON files in the resources directory and its subdirectories
    const resourceFiles = findResourceJsonFiles(resourcesDir);
    console.log(`Found ${resourceFiles.length} resource JSON files`);
    
    // Log the first few files for debugging
    if (resourceFiles.length > 0) {
      console.log("Sample resource files found:");
      resourceFiles.slice(0, 5).forEach(file => console.log(` - ${file}`));
    } else {
      console.log("No resource files found. Checking directory contents:");
      try {
        const topLevelItems = fs.readdirSync(resourcesDir);
        console.log(`Top level items in ${resourcesDir}:`, topLevelItems);
        
        // Check the first subdirectory if any exist
        if (topLevelItems.length > 0) {
          const firstItem = path.join(resourcesDir, topLevelItems[0]);
          if (fs.statSync(firstItem).isDirectory()) {
            console.log(`Items in ${firstItem}:`, fs.readdirSync(firstItem));
          }
        }
      } catch (error) {
        console.error(`Error reading directory contents: ${error}`);
      }
    }
    
    // Load and parse each resource file
    let resources = resourceFiles.map(filePath => {
      const loadedData = loadResourceData(filePath); // Changed variable name
      
      if (!loadedData) { // Check loadedData
        return null;
      }
      
      // Extract the relative path from the resources directory
      const relativePath = path.relative(resourcesDir, filePath);
      // Remove the .json extension
      const id = path.basename(relativePath, '.json');
      // Get the directory structure as categories, filtering out '.' if it's a root file
      const pathParts = path.dirname(relativePath).split(path.sep).filter(p => p !== '.');
      
      return {
        id,
        name: loadedData.name || id,
        icon: loadedData.icon, // Pass the icon field through
        category: loadedData.category || (pathParts.length > 0 ? pathParts[0] : 'Uncategorized'),
        subCategory: loadedData.subCategory || (pathParts.length > 1 ? pathParts[1] : null),
        tier: loadedData.tier, // tier is already defaulted in loadResourceData
        description: loadedData.description || '',
        importPrice: loadedData.importPrice || 0,
        lifetimeHours: loadedData.lifetimeHours, 
        consumptionHours: loadedData.consumptionHours
      };
    }).filter(Boolean); // Remove null entries
    
    // Apply filters if provided
    if (category) {
      resources = resources.filter(resource => 
        resource.category.toLowerCase() === category.toLowerCase()
      );
    }
    
    // Group resources by category
    const resourcesByCategory: Record<string, any> = {};
    
    resources.forEach(resource => {
      const { category } = resource;
      
      if (!resourcesByCategory[category]) {
        resourcesByCategory[category] = {
          name: category,
          resources: []
        };
      }
      
      resourcesByCategory[category].resources.push(resource);
    });
    
    // Convert to array format
    const categoriesArray = Object.values(resourcesByCategory);
    
    return NextResponse.json({
      success: true,
      resourceTypes: resources,
      categories: categoriesArray,
      filters: { category }
    });
  } catch (error) {
    console.error('Error fetching resource types:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch resource types' },
      { status: 500 }
    );
  }
}
