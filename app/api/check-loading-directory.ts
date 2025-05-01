import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const loadingDir = path.join(process.cwd(), 'public', 'loading');
    console.log('Checking loading directory:', loadingDir);

    if (!fs.existsSync(loadingDir)) {
      console.error('Loading directory does not exist:', loadingDir);
      // Create the directory if it doesn't exist
      fs.mkdirSync(loadingDir, { recursive: true });
      console.log('Created loading directory:', loadingDir);
      
      return NextResponse.json({
        success: true,
        message: 'Loading directory created',
        exists: false,
        path: loadingDir
      });
    } else {
      console.log('Loading directory exists:', loadingDir);
      
      // Check contents
      const files = fs.readdirSync(loadingDir);
      console.log('Files in loading directory:', files);
      
      // Filter for image files
      const imageFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
      });
      
      console.log('Image files in loading directory:', imageFiles);
      
      return NextResponse.json({
        success: true,
        message: 'Loading directory exists',
        exists: true,
        path: loadingDir,
        files: files,
        imageFiles: imageFiles
      });
    }
  } catch (error) {
    console.error('Error checking loading directory:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check loading directory' },
      { status: 500 }
    );
  }
}
