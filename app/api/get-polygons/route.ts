import { NextResponse } from 'next/server';
import { getAllJsonFiles, readJsonFromFile } from '@/lib/fileUtils';

export async function GET() {
  try {
    // Read all JSON files in the data directory
    const files = getAllJsonFiles();
    
    const polygons = files.map(file => {
      const coordinates = readJsonFromFile(file);
      
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
