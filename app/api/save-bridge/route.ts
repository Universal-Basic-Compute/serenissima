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

export async function POST(request: Request) {
  try {
    const bridge = await request.json();
    
    // Validate input
    if (!bridge.startPoint || !bridge.endPoint || !bridge.startLandId || !bridge.endLandId) {
      return NextResponse.json(
        { success: false, error: 'Invalid bridge data' },
        { status: 400 }
      );
    }
    
    // Ensure bridges directory exists
    ensureBridgesDirExists();
    
    // Generate a filename with timestamp
    const filename = `bridge-${Date.now()}.json`;
    const filePath = path.join(BRIDGES_DIR, filename);
    
    // Save the bridge data
    fs.writeFileSync(filePath, JSON.stringify(bridge, null, 2));
    
    return NextResponse.json({ 
      success: true, 
      filename
    });
  } catch (error) {
    console.error('Error saving bridge:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save bridge' },
      { status: 500 }
    );
  }
}
