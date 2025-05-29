import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const musicDir = path.join(process.cwd(), 'public', 'music');
    
    // Check if directory exists
    if (!fs.existsSync(musicDir)) {
      return NextResponse.json(
        { success: false, error: 'Music directory not found' },
        { status: 404 }
      );
    }
    
    // Get all MP3 files
    const files = fs.readdirSync(musicDir)
      .filter(file => file.toLowerCase().endsWith('.mp3'))
      .map(file => `/music/${file}`);
    
    return NextResponse.json({ success: true, tracks: files });
  } catch (error) {
    console.error('Error getting music tracks:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get music tracks' },
      { status: 500 }
    );
  }
}
