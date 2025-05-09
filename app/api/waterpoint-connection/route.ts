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

// Define the path to the connections data file
const connectionsFile = path.join(dataDir, 'connections.json');

// Initialize the connections data file if it doesn't exist
if (!fs.existsSync(connectionsFile)) {
  fs.writeFileSync(connectionsFile, JSON.stringify({
    connections: []
  }));
}

// GET handler to retrieve all connections
export async function GET() {
  try {
    // Read the connections data file
    const data = JSON.parse(fs.readFileSync(connectionsFile, 'utf8'));
    
    // Check if we have data in the WATERPOINTCONNECTIONS array in jsontoairtable.json
    const airtableJsonPath = path.join(process.cwd(), 'jsontoairtable.json');
    if (fs.existsSync(airtableJsonPath)) {
      try {
        const airtableData = JSON.parse(fs.readFileSync(airtableJsonPath, 'utf8'));
        if (airtableData.WATERPOINTCONNECTIONS && Array.isArray(airtableData.WATERPOINTCONNECTIONS) && airtableData.WATERPOINTCONNECTIONS.length > 0) {
          console.log(`Found ${airtableData.WATERPOINTCONNECTIONS.length} connections in jsontoairtable.json`);
          
          // Merge connections from both sources, avoiding duplicates
          const existingIds = new Set(data.connections.map((c: any) => c.id));
          
          for (const connection of airtableData.WATERPOINTCONNECTIONS) {
            if (!existingIds.has(connection.id)) {
              data.connections.push(connection);
              existingIds.add(connection.id);
            }
          }
        }
      } catch (error) {
        console.error('Error reading jsontoairtable.json:', error);
      }
    }
    
    console.log(`Returning ${data.connections.length} connections`);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading connections data:', error);
    return NextResponse.json(
      { error: 'Failed to read connections data' },
      { status: 500 }
    );
  }
}

// POST handler to create a new connection
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate the request body
    if (!body.sourceId || !body.targetId) {
      return NextResponse.json(
        { error: 'Invalid connection data. Source and target IDs are required.' },
        { status: 400 }
      );
    }
    
    // Read the existing data
    let data;
    try {
      data = JSON.parse(fs.readFileSync(connectionsFile, 'utf8'));
    } catch (error) {
      // If the file doesn't exist or is invalid, create a new data structure
      data = { connections: [] };
    }
    
    // Generate a unique ID if not provided
    const connectionId = body.id || `connection-${uuidv4()}`;
    
    // Create the new connection
    const newConnection = {
      id: connectionId,
      sourceId: body.sourceId,
      targetId: body.targetId,
      width: body.width || 3,
      depth: body.depth || 1,
      createdAt: body.createdAt || new Date().toISOString()
    };
    
    // Add the new connection to the data
    data.connections.push(newConnection);
    
    // Write the updated data back to the file
    fs.writeFileSync(connectionsFile, JSON.stringify(data, null, 2));
    
    // Add to Airtable if WATERPOINTCONNECTIONS is in the TABLE_MAP
    try {
      // Create a temporary JSON file for the jsontoairtable script
      const tempFile = path.join(process.cwd(), 'jsontoairtable.json');
      
      fs.writeFileSync(tempFile, JSON.stringify({
        WATERPOINTCONNECTIONS: [newConnection]
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
      console.error('Error adding connection to Airtable:', error);
      // Continue anyway, as the connection is already saved to the JSON file
    }
    
    return NextResponse.json({
      success: true,
      connection: newConnection
    });
  } catch (error) {
    console.error('Error creating connection:', error);
    return NextResponse.json(
      { error: 'Failed to create connection' },
      { status: 500 }
    );
  }
}

// DELETE handler to remove a connection
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'Connection ID is required' },
        { status: 400 }
      );
    }
    
    // Read the existing data
    let data;
    try {
      data = JSON.parse(fs.readFileSync(connectionsFile, 'utf8'));
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to read connections data' },
        { status: 500 }
      );
    }
    
    // Find the connection to delete
    const connectionIndex = data.connections.findIndex((c: any) => c.id === id);
    if (connectionIndex === -1) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      );
    }
    
    // Remove the connection
    const deletedConnection = data.connections.splice(connectionIndex, 1)[0];
    
    // Write the updated data back to the file
    fs.writeFileSync(connectionsFile, JSON.stringify(data, null, 2));
    
    return NextResponse.json({
      success: true,
      deletedConnection
    });
  } catch (error) {
    console.error('Error deleting connection:', error);
    return NextResponse.json(
      { error: 'Failed to delete connection' },
      { status: 500 }
    );
  }
}
