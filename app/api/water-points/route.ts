import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Path to the water graph data file
const WATER_GRAPH_PATH = path.join(process.cwd(), 'data', 'watergraph.json');

// Helper function to ensure the data file exists
function ensureDataFileExists() {
  if (!fs.existsSync(WATER_GRAPH_PATH)) {
    // Create the directory if it doesn't exist
    const dir = path.dirname(WATER_GRAPH_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Create an empty water graph file
    fs.writeFileSync(WATER_GRAPH_PATH, JSON.stringify({ waterPoints: [] }));
  }
}

// GET endpoint to retrieve all water points
export async function GET() {
  try {
    ensureDataFileExists();
    
    // Read the water graph data
    const data = JSON.parse(fs.readFileSync(WATER_GRAPH_PATH, 'utf8'));
    
    return NextResponse.json({
      success: true,
      waterPoints: data.waterPoints || []
    });
  } catch (error) {
    console.error('Error fetching water points:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch water points' },
      { status: 500 }
    );
  }
}

// POST endpoint to add a new water point
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { waterPoint } = body;
    
    if (!waterPoint || !waterPoint.id || !waterPoint.position) {
      return NextResponse.json(
        { success: false, error: 'Invalid water point data' },
        { status: 400 }
      );
    }
    
    ensureDataFileExists();
    
    // Read the current data
    let data = { waterPoints: [] };
    try {
      data = JSON.parse(fs.readFileSync(WATER_GRAPH_PATH, 'utf8'));
    } catch (e) {
      // If the file is empty or invalid JSON, start with an empty array
      data = { waterPoints: [] };
    }
    
    // Check if a water point with this ID already exists
    const existingIndex = data.waterPoints.findIndex(wp => wp.id === waterPoint.id);
    
    if (existingIndex >= 0) {
      // Update existing water point, preserving any existing connections
      const existingWaterPoint = data.waterPoints[existingIndex];
      
      // Ensure connections array exists on both objects
      if (!existingWaterPoint.connections) existingWaterPoint.connections = [];
      if (!waterPoint.connections) waterPoint.connections = [];
      
      // If the new water point has connections, add them to the existing ones
      // avoiding duplicates by checking connection IDs
      if (waterPoint.connections && waterPoint.connections.length > 0) {
        for (const newConnection of waterPoint.connections) {
          // Check if this connection already exists
          const existingConnectionIndex = existingWaterPoint.connections.findIndex(
            c => c.id === newConnection.id
          );
          
          if (existingConnectionIndex >= 0) {
            // Update existing connection
            existingWaterPoint.connections[existingConnectionIndex] = newConnection;
          } else {
            // Add new connection
            existingWaterPoint.connections.push(newConnection);
          }
        }
      }
      
      // Update the water point with the merged connections
      data.waterPoints[existingIndex] = {
        ...waterPoint,
        connections: existingWaterPoint.connections
      };
    } else {
      // Add new water point
      // Ensure it has a connections array
      if (!waterPoint.connections) waterPoint.connections = [];
      data.waterPoints.push(waterPoint);
    }
    
    // Write the updated data back to the file
    fs.writeFileSync(WATER_GRAPH_PATH, JSON.stringify(data, null, 2));
    
    return NextResponse.json({
      success: true,
      message: 'Water point saved successfully'
    });
  } catch (error) {
    console.error('Error saving water point:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save water point' },
      { status: 500 }
    );
  }
}
