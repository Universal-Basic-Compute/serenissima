import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const polygonsDir = path.join(process.cwd(), 'data', 'polygons');
    
    // Check if the directory exists
    if (!fs.existsSync(polygonsDir)) {
      console.error(`Polygons directory not found: ${polygonsDir}`);
      return NextResponse.json({ 
        success: false, 
        error: 'Polygons directory not found',
        files: [] 
      });
    }
    
    // Read all JSON files in the directory
    const files = fs.readdirSync(polygonsDir)
      .filter(file => file.endsWith('.json'));
    
    console.log(`Found ${files.length} polygon files in ${polygonsDir}`);
    
    return NextResponse.json({ 
      success: true, 
      files,
      directory: polygonsDir
    });
  } catch (error) {
    console.error('Error listing polygon files:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to list polygon files',
      errorDetails: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
