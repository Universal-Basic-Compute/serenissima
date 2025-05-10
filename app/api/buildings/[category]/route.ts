import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  const { category } = await params;
  try {
    // Sanitize the category name to prevent directory traversal
    const sanitizedCategory = category.replace(/[^a-zA-Z0-9_-]/g, '');
    
    // Define the base directory for building data
    const baseDir = path.join(process.cwd(), 'data', 'buildings');
    
    // Check if the category directory exists
    const categoryDir = path.join(baseDir, sanitizedCategory);
    if (!fs.existsSync(categoryDir)) {
      return NextResponse.json(
        { error: `Category '${sanitizedCategory}' not found` },
        { status: 404 }
      );
    }
    
    // Get all subcategories (directories) within the category
    const subcategories = fs.readdirSync(categoryDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    // Load all building files from all subcategories
    const buildings = [];
    
    for (const subcategory of subcategories) {
      const subcategoryDir = path.join(categoryDir, subcategory);
      const files = fs.readdirSync(subcategoryDir)
        .filter(file => file.endsWith('.json'));
      
      for (const file of files) {
        try {
          const filePath = path.join(subcategoryDir, file);
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const building = JSON.parse(fileContent);
          
          // Add the building to the list
          buildings.push(building);
        } catch (error) {
          console.error(`Error loading building file ${file}:`, error);
          // Continue with other files even if one fails
        }
      }
    }
    
    return NextResponse.json(buildings);
  } catch (error) {
    console.error('Error loading buildings:', error);
    return NextResponse.json(
      { error: 'Failed to load buildings' },
      { status: 500 }
    );
  }
}
