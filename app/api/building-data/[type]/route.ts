import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

// Helper function to recursively search for a file
async function findBuildingFile(buildingType: string, dir: string): Promise<string | null> {
  try {
    const files = await readdir(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = await stat(filePath);
      
      if (stats.isDirectory()) {
        // Recursively search subdirectories
        const result = await findBuildingFile(buildingType, filePath);
        if (result) return result;
      } else if (file === `${buildingType}.json`) {
        // Found the file
        return filePath;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error searching directory ${dir}:`, error);
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: { type: string } }
) {
  try {
    const buildingType = params.type;
    
    if (!buildingType) {
      return NextResponse.json(
        { error: 'Building type is required' },
        { status: 400 }
      );
    }
    
    // Base directory for building data
    const baseDir = path.join(process.cwd(), 'public', 'data', 'buildings');
    
    // Search for the building file
    const filePath = await findBuildingFile(buildingType, baseDir);
    
    if (!filePath) {
      return NextResponse.json(
        { error: `Building data not found for ${buildingType}` },
        { status: 404 }
      );
    }
    
    // Read and parse the file
    const fileContent = await readFile(filePath, 'utf-8');
    const buildingData = JSON.parse(fileContent);
    
    return NextResponse.json(buildingData);
  } catch (error) {
    console.error('Error fetching building data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch building data' },
      { status: 500 }
    );
  }
}
