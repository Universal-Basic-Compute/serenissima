import { NextResponse, NextRequest } from 'next/server';
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
        const result = await findBuildingFile(buildingType, filePath);
        if (result) return result;
      } else if (file === `${buildingType}.json`) {
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

    const baseDir = path.join(process.cwd(), 'public', 'data', 'buildings');
    const filePath = await findBuildingFile(type, baseDir);

    if (!filePath) {
      return NextResponse.json(
        { error: `Building data not found for ${type}` },
        { status: 404 }
      );
    }

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
