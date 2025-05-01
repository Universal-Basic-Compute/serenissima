import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Path to the loading images directory
    const loadingDir = path.join(process.cwd(), 'public', 'loading');
    console.log('Looking for loading images in directory:', loadingDir);
    
    // Check if directory exists
    if (!fs.existsSync(loadingDir)) {
      console.warn('Loading directory does not exist:', loadingDir);
      return NextResponse.json({ 
        success: false, 
        error: 'Loading directory not found' 
      });
    }
    
    // Read all files in the directory
    const files = fs.readdirSync(loadingDir);
    console.log('All files in loading directory:', files);
    
    // Filter for image files (jpg, jpeg, png, webp)
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
    });
    console.log('Filtered image files:', imageFiles);
    
    // Format the file paths to be usable in the frontend
    const imagePaths = imageFiles.map(file => `/loading/${file}`);
    
    console.log(`Found ${imagePaths.length} loading images:`, imagePaths);
    
    return NextResponse.json({ 
      success: true, 
      images: imagePaths 
    });
  } catch (error) {
    console.error('Error listing loading images:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list loading images' },
      { status: 500 }
    );
  }
}
