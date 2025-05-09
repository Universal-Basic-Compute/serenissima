import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Define the data directory
const dataDir = path.join(process.cwd(), 'data', 'water-roads');

// Ensure the directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Define the path to the water roads data file
const canalsFile = path.join(dataDir, 'water-roads.json');

// Initialize the water roads data file if it doesn't exist
if (!fs.existsSync(canalsFile)) {
  fs.writeFileSync(canalsFile, JSON.stringify({
    canals: [],
    transferPoints: []
  }));
}

// GET handler to retrieve all water roads
export async function GET() {
  try {
    // Read the water roads data file
    const data = JSON.parse(fs.readFileSync(canalsFile, 'utf8'));
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading water roads data:', error);
    return NextResponse.json(
      { error: 'Failed to read water roads data' },
      { status: 500 }
    );
  }
}

// POST handler to create a new water road
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate the request body
    if (!body.points || !Array.isArray(body.points) || body.points.length < 2) {
      return NextResponse.json(
        { error: 'Invalid water road data. At least 2 points are required.' },
        { status: 400 }
      );
    }
    
    // Read the existing data
    let data;
    try {
      data = JSON.parse(fs.readFileSync(canalsFile, 'utf8'));
    } catch (error) {
      // If the file doesn't exist or is invalid, create a new data structure
      data = { canals: [], transferPoints: [] };
    }
    
    // Generate a unique ID if not provided
    const canalId = body.id || `water-road-${uuidv4()}`;
    
    // Create the new water road
    const newCanal = {
      id: canalId,
      points: body.points,
      curvature: body.curvature || 0.5,
      width: body.width || 3,
      depth: body.depth || 0.5,
      color: body.color || 0x0088ff,
      createdAt: new Date().toISOString()
    };
    
    // Add the new water road to the data
    data.canals.push(newCanal);
    
    // Process transfer points if provided
    if (body.transferPoints && Array.isArray(body.transferPoints)) {
      body.transferPoints.forEach((tp) => {
        // Replace 'new-road' with the actual road ID
        const connectedRoadIds = tp.connectedRoadIds.map((id) => 
          id === 'new-road' ? canalId : id
        );
        
        // Check if this transfer point already exists
        const existingIndex = data.transferPoints.findIndex((existing) => 
          Math.abs(existing.position.x - tp.position.x) < 0.1 &&
          Math.abs(existing.position.y - tp.position.y) < 0.1 &&
          Math.abs(existing.position.z - tp.position.z) < 0.1
        );
        
        if (existingIndex >= 0) {
          // Update existing transfer point
          const existing = data.transferPoints[existingIndex];
          const updatedRoadIds = [...new Set([...existing.connectedRoadIds, ...connectedRoadIds])];
          data.transferPoints[existingIndex] = {
            ...existing,
            connectedRoadIds: updatedRoadIds
          };
        } else {
          // Add new transfer point
          data.transferPoints.push({
            id: `transfer-point-${uuidv4()}`,
            position: tp.position,
            connectedRoadIds,
            createdAt: new Date().toISOString()
          });
        }
      });
    }
    
    // Write the updated data back to the file
    fs.writeFileSync(canalsFile, JSON.stringify(data, null, 2));
    
    // Add to Airtable if CANALS is in the TABLE_MAP
    try {
      // Create a temporary JSON file for the jsontoairtable script
      const tempFile = path.join(process.cwd(), 'jsontoairtable.json');
      fs.writeFileSync(tempFile, JSON.stringify({
        CANALS: [newCanal]
      }));
      
      // Execute the jsontoairtable script
      const { exec } = require('child_process');
      exec(`node scripts/jsontoairtable.js ${tempFile}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing jsontoairtable script: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`jsontoairtable stderr: ${stderr}`);
          return;
        }
        console.log(`jsontoairtable stdout: ${stdout}`);
        
        // Remove the temporary file
        fs.unlinkSync(tempFile);
      });
    } catch (error) {
      console.error('Error adding water road to Airtable:', error);
      // Continue anyway, as the water road is already saved to the JSON file
    }
    
    return NextResponse.json({
      success: true,
      canal: newCanal
    });
  } catch (error) {
    console.error('Error creating water road:', error);
    return NextResponse.json(
      { error: 'Failed to create water road' },
      { status: 500 }
    );
  }
}
