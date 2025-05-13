import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export async function GET() {
  try {
    // Base directory for building data
    const baseDir = path.join(process.cwd(), 'public', 'data', 'buildings');
    
    // Check if the directory exists
    try {
      await stat(baseDir);
    } catch (error) {
      console.error(`Base directory ${baseDir} does not exist:`, error);
      return NextResponse.json(
        { error: 'Building data directory not found' },
        { status: 404 }
      );
    }
    
    // Get all directories in the base directory
    const entries = await readdir(baseDir, { withFileTypes: true });
    const categories = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
    
    return NextResponse.json(categories);
  } catch (error) {
    console.error('Error fetching building categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch building categories' },
      { status: 500 }
    );
  }
}
