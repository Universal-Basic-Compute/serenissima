import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';

// Define the data directory
const dataDir = path.join(process.cwd(), 'data', 'waterpoints');

// Ensure the directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Define the path to the waterpoints data file
const waterpointsFile = path.join(dataDir, 'waterpoints.json');

// Initialize the waterpoints data file if it doesn't exist
if (!fs.existsSync(waterpointsFile)) {
  fs.writeFileSync(waterpointsFile, JSON.stringify({
    waterpoints: []
  }));
}

// GET handler to retrieve all waterpoints
export async function GET() {
  try {
    // Read the waterpoints data file
    const data = JSON.parse(fs.readFileSync(waterpointsFile, 'utf8'));
    
    // Check if we have data in the WATERPOINTS array in jsontoairtable.json
    const airtableJsonPath = path.join(process.cwd(), 'jsontoairtable.json');
    if (fs.existsSync(airtableJsonPath)) {
      try {
        const airtableData = JSON.parse(fs.readFileSync(airtableJsonPath, 'utf8'));
        if (airtableData.WATERPOINTS && Array.isArray(airtableData.WATERPOINTS) && airtableData.WATERPOINTS.length > 0) {
          console.log(`Found ${airtableData.WATERPOINTS.length} waterpoints in jsontoairtable.json`);
          
          // Merge waterpoints from both sources, avoiding duplicates
          const existingIds = new Set(data.waterpoints.map((wp: any) => wp.id));
          
          for (const waterpoint of airtableData.WATERPOINTS) {
            if (!existingIds.has(waterpoint.id)) {
              data.waterpoints.push(waterpoint);
              existingIds.add(waterpoint.id);
            }
          }
        }
      } catch (error) {
        console.error('Error reading jsontoairtable.json:', error);
      }
    }
    
    console.log(`Returning ${data.waterpoints.length} waterpoints`);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading waterpoints data:', error);
    return NextResponse.json(
      { error: 'Failed to read waterpoints data' },
      { status: 500 }
    );
  }
}

// POST handler to create a new waterpoint
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate the request body
    if (!body.position || !body.position.lat || !body.position.lng) {
      return NextResponse.json(
        { error: 'Invalid waterpoint data. Position with lat/lng is required.' },
        { status: 400 }
      );
    }
    
    // Read the existing data
    let data;
    try {
      data = JSON.parse(fs.readFileSync(waterpointsFile, 'utf8'));
    } catch (error) {
      // If the file doesn't exist or is invalid, create a new data structure
      data = { waterpoints: [] };
    }
    
    // Generate a unique ID if not provided
    const waterpointId = body.id || `waterpoint-${uuidv4()}`;
    
    // Create the new waterpoint
    const newWaterpoint = {
      id: waterpointId,
      position: body.position,
      connections: body.connections || [],
      depth: body.depth || 1,
      type: body.type || 'regular', // regular, dock, transfer, etc.
      createdAt: new Date().toISOString()
    };
    
    // Add the new waterpoint to the data
    data.waterpoints.push(newWaterpoint);
    
    // Write the updated data back to the file
    fs.writeFileSync(waterpointsFile, JSON.stringify(data, null, 2));
    
    // Add to Airtable if WATERPOINTS is in the TABLE_MAP
    try {
      // Create a temporary JSON file for the jsontoairtable script
      const tempFile = path.join(process.cwd(), 'jsontoairtable.json');
      
      // Prepare waterpoint data for Airtable
      const waterpointForAirtable = {
        ...newWaterpoint,
        // Convert position and connections to string if they're not already
        position: typeof newWaterpoint.position === 'string' 
          ? newWaterpoint.position 
          : JSON.stringify(newWaterpoint.position),
        connections: typeof newWaterpoint.connections === 'string' 
          ? newWaterpoint.connections 
          : JSON.stringify(newWaterpoint.connections)
      };
      
      fs.writeFileSync(tempFile, JSON.stringify({
        WATERPOINTS: [waterpointForAirtable]
      }));
      
      // Execute the jsontoairtable script
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
      console.error('Error adding waterpoint to Airtable:', error);
      // Continue anyway, as the waterpoint is already saved to the JSON file
    }
    
    return NextResponse.json({
      success: true,
      waterpoint: newWaterpoint
    });
  } catch (error) {
    console.error('Error creating waterpoint:', error);
    return NextResponse.json(
      { error: 'Failed to create waterpoint' },
      { status: 500 }
    );
  }
}

// PUT handler to update a waterpoint (add connections)
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    
    // Validate the request body
    if (!body.id) {
      return NextResponse.json(
        { error: 'Invalid request. Waterpoint ID is required.' },
        { status: 400 }
      );
    }
    
    // Read the existing data
    let data;
    try {
      data = JSON.parse(fs.readFileSync(waterpointsFile, 'utf8'));
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to read waterpoints data' },
        { status: 500 }
      );
    }
    
    // Find the waterpoint to update
    const waterpointIndex = data.waterpoints.findIndex((wp: any) => wp.id === body.id);
    if (waterpointIndex === -1) {
      return NextResponse.json(
        { error: 'Waterpoint not found' },
        { status: 404 }
      );
    }
    
    // Update the waterpoint
    const updatedWaterpoint = {
      ...data.waterpoints[waterpointIndex],
      ...body
    };
    
    // If adding a connection
    if (body.addConnection) {
      if (!updatedWaterpoint.connections) {
        updatedWaterpoint.connections = [];
      }
      
      // Check if connection already exists
      const connectionExists = updatedWaterpoint.connections.some(
        (conn: any) => conn.targetId === body.addConnection.targetId
      );
      
      if (!connectionExists) {
        updatedWaterpoint.connections.push(body.addConnection);
      }
    }
    
    // Update the waterpoint in the data
    data.waterpoints[waterpointIndex] = updatedWaterpoint;
    
    // Write the updated data back to the file
    fs.writeFileSync(waterpointsFile, JSON.stringify(data, null, 2));
    
    return NextResponse.json({
      success: true,
      waterpoint: updatedWaterpoint
    });
  } catch (error) {
    console.error('Error updating waterpoint:', error);
    return NextResponse.json(
      { error: 'Failed to update waterpoint' },
      { status: 500 }
    );
  }
}
