import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const citizensDir = path.join(process.cwd(), 'public', 'images', 'citizens');
    
    // Check if the directory exists
    let directoryExists = false;
    try {
      const stats = fs.statSync(citizensDir);
      directoryExists = stats.isDirectory();
    } catch (error) {
      directoryExists = false;
    }
    
    if (!directoryExists) {
      return NextResponse.json({
        success: false,
        error: 'Citizens directory does not exist',
        path: citizensDir
      });
    }
    
    // Read the directory
    const files = fs.readdirSync(citizensDir);
    
    // Filter for image files
    const imageFiles = files.filter(file => 
      file.endsWith('.jpg') || 
      file.endsWith('.jpeg') || 
      file.endsWith('.png') || 
      file.endsWith('.gif')
    );
    
    // Check if default.jpg exists
    const defaultImageExists = imageFiles.includes('default.jpg');
    
    return NextResponse.json({
      success: true,
      directoryExists,
      path: citizensDir,
      totalFiles: files.length,
      imageFiles: imageFiles.length,
      defaultImageExists,
      sampleFiles: imageFiles.slice(0, 10)
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
