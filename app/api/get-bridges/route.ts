import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define the bridges directory
const BRIDGES_DIR = path.join(process.cwd(), 'data', 'bridges');

// Ensure bridges directory exists
function ensureBridgesDirExists() {
  if (!fs.existsSync(BRIDGES_DIR)) {
    fs.mkdirSync(BRIDGES_DIR, { recursive: true });
  }
  return BRIDGES_DIR;
}

// Get all bridge files
function getAllBridgeFiles() {
  const bridgesDir = ensureBridgesDirExists();
  const files = fs.readdirSync(bridgesDir).filter(file => file.endsWith('.json'));
  return files;
}

// Read bridge from file
function readBridgeFromFile(filename: string) {
  const filePath = path.join(BRIDGES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const fileContent = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(fileContent);
}

export async function GET() {
  try {
    // Read all bridge files
    const files = getAllBridgeFiles();
    
    const bridges = files.map(file => {
      const data = readBridgeFromFile(file);
      const id = file.replace('.json', '');
      
      if (!data) {
        return null;
      }
      
      return {
        ...data,
        id: data.id || id
      };
    }).filter(Boolean);
    
    return NextResponse.json({ bridges });
  } catch (error) {
    console.error('Error fetching bridges:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bridges' },
      { status: 500 }
    );
  }
}
