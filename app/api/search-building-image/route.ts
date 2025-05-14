import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define the buildings directory path
const BUILDINGS_DIR = path.join(process.cwd(), 'public', 'images', 'buildings');

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    
    if (!type) {
      return NextResponse.json(
        { success: false, error: 'Building type is required' },
        { status: 400 }
      );
    }
    
    console.log(`Searching for building image for type: ${type}`);
    
    // Normalize the type
    const normalizedType = type.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
    
    // Search for the image in all categories and subcategories
    const imagePath = await searchForBuildingImage(normalizedType);
    
    if (imagePath) {
      return NextResponse.json({
        success: true,
        imagePath: imagePath
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Building image not found',
        fallbackPath: '/images/buildings/commercial/retail_shops/market_stall.jpg'
      });
    }
  } catch (error) {
    console.error('Error searching for building image:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to search for building image',
        fallbackPath: '/images/buildings/commercial/retail_shops/market_stall.jpg'
      },
      { status: 500 }
    );
  }
}

// Function to recursively search for a building image
async function searchForBuildingImage(buildingType: string): Promise<string | null> {
  // Check if the buildings directory exists
  if (!fs.existsSync(BUILDINGS_DIR)) {
    console.error('Buildings directory not found:', BUILDINGS_DIR);
    return null;
  }
  
  // Get all categories
  const categories = fs.readdirSync(BUILDINGS_DIR).filter(item => 
    fs.statSync(path.join(BUILDINGS_DIR, item)).isDirectory()
  );
  
  // Search through each category and its subcategories
  for (const category of categories) {
    const categoryPath = path.join(BUILDINGS_DIR, category);
    
    // Get all subcategories
    const subcategories = fs.readdirSync(categoryPath).filter(item => 
      fs.statSync(path.join(categoryPath, item)).isDirectory()
    );
    
    // Search through each subcategory
    for (const subcategory of subcategories) {
      const subcategoryPath = path.join(categoryPath, subcategory);
      
      // Check if the building image exists in this subcategory
      const possibleImagePaths = [
        path.join(subcategoryPath, `${buildingType}.jpg`),
        path.join(subcategoryPath, `${buildingType}.png`),
        // Add more extensions if needed
      ];
      
      for (const imagePath of possibleImagePaths) {
        if (fs.existsSync(imagePath)) {
          // Convert to web path format
          const webPath = imagePath
            .replace(path.join(process.cwd(), 'public'), '')
            .replace(/\\/g, '/');
          
          console.log(`Found building image at: ${webPath}`);
          return webPath;
        }
      }
    }
  }
  
  // If we get here, we couldn't find the image
  console.log(`Could not find image for building type: ${buildingType}`);
  return null;
}
