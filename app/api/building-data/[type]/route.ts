import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);
const access = promisify(fs.access);

// Helper function to recursively search for a file
async function findBuildingFile(buildingType: string, dir: string): Promise<string | null> {
  try {
    console.log(`Searching for building file ${buildingType} in directory ${dir}`);
    
    // Check if directory exists
    try {
      await access(dir, fs.constants.R_OK);
    } catch (error) {
      console.log(`Directory ${dir} does not exist or is not readable`);
      return null;
    }
    
    const files = await readdir(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = await stat(filePath);
      
      if (stats.isDirectory()) {
        const result = await findBuildingFile(buildingType, filePath);
        if (result) return result;
      } else if (
        file === `${buildingType}.json` || 
        file.toLowerCase() === `${buildingType.toLowerCase()}.json` ||
        file.toLowerCase() === `${buildingType.replace(/\s+/g, '_').toLowerCase()}.json` ||
        file.toLowerCase() === `${buildingType.replace(/\s+/g, '-').toLowerCase()}.json`
      ) {
        console.log(`Found matching file: ${filePath}`);
        return filePath;
      }
    }
    return null;
  } catch (error) {
    console.error(`Error searching directory ${dir}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.pathname.split('/').pop(); // or use searchParams if using query param
    
    if (!type) {
      return NextResponse.json(
        { error: 'Building type is required' },
        { status: 400 }
      );
    }

    console.log(`Searching for building data for type: ${type}`);
    
    // Search in both data and public/data directories
    const dataDirs = [
      path.join(process.cwd(), 'data', 'buildings'),
      path.join(process.cwd(), 'public', 'data', 'buildings')
    ];
    
    let filePath = null;
    
    // Try each directory
    for (const dir of dataDirs) {
      filePath = await findBuildingFile(type, dir);
      if (filePath) break;
    }

    if (!filePath) {
      console.log(`Building data not found for ${type}`);
      return NextResponse.json(
        { error: `Building data not found for ${type}` },
        { status: 404 }
      );
    }

    console.log(`Reading building data from ${filePath}`);
    const fileContent = await readFile(filePath, 'utf-8');
    const buildingData = JSON.parse(fileContent);
    
    // Add category and subcategory based on file path
    const pathParts = filePath.split(path.sep);
    const buildingsIndex = pathParts.findIndex(part => part === 'buildings');
    
    if (buildingsIndex !== -1 && pathParts.length > buildingsIndex + 1) {
      // Check if there's a category
      if (pathParts.length > buildingsIndex + 1) {
        buildingData.category = pathParts[buildingsIndex + 1];
      }
      
      // Check if there's a subcategory
      if (pathParts.length > buildingsIndex + 2) {
        buildingData.subcategory = pathParts[buildingsIndex + 2];
      }
    }

    return NextResponse.json(buildingData);
  } catch (error) {
    console.error('Error fetching building data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch building data', details: error.message },
      { status: 500 }
    );
  }
}
