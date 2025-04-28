import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { coordinates } = await request.json();
    
    // Create data directory if it doesn't exist
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    
    // Generate a filename with timestamp
    const filename = `polygon-${Date.now()}.json`;
    const filePath = path.join(dataDir, filename);
    
    // Write the polygon data to a file
    fs.writeFileSync(filePath, JSON.stringify(coordinates, null, 2));
    
    return NextResponse.json({ success: true, filename });
  } catch (error) {
    console.error('Error saving polygon:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save polygon' },
      { status: 500 }
    );
  }
}
