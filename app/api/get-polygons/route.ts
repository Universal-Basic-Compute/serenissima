import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    
    // Check if data directory exists
    if (!fs.existsSync(dataDir)) {
      return NextResponse.json({ polygons: [] });
    }
    
    // Read all JSON files in the data directory
    const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
    
    const polygons = files.map(file => {
      const filePath = path.join(dataDir, file);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const coordinates = JSON.parse(fileContent);
      
      return {
        id: file.replace('.json', ''),
        coordinates
      };
    });
    
    return NextResponse.json({ polygons });
  } catch (error) {
    console.error('Error fetching polygons:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch polygons' },
      { status: 500 }
    );
  }
}
