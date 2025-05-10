import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';

// Helper function to calculate canal length
function calculateCanalLength(points: any[]): number {
  if (!points || points.length < 2) return 0;
  
  let totalLength = 0;
  
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i].position || points[i];
    const p2 = points[i + 1].position || points[i + 1];
    
    // Extract coordinates, handling different possible formats
    const x1 = p1.x || p1.lng || 0;
    const y1 = p1.y || p1.lat || 0;
    const z1 = p1.z || 0;
    
    const x2 = p2.x || p2.lng || 0;
    const y2 = p2.y || p2.lat || 0;
    const z2 = p2.z || 0;
    
    // Calculate Euclidean distance between points
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    
    const segmentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    totalLength += segmentLength;
  }
  
  return totalLength;
}

// Define the data directory
const dataDir = path.join(process.cwd(), 'data', 'canals');

// Ensure the directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Define the path to the canals data file
const canalsFile = path.join(dataDir, 'canals.json');

// Initialize the canals data file if it doesn't exist
if (!fs.existsSync(canalsFile)) {
  fs.writeFileSync(canalsFile, JSON.stringify({
    canals: [],
    transferPoints: []
  }));
}

// GET handler to retrieve all canals
export async function GET() {
  try {
    // Read the canals data file
    const data = JSON.parse(fs.readFileSync(canalsFile, 'utf8'));
    
    // Check if we have data in the CANALS array in jsontoairtable.json
    const airtableJsonPath = path.join(process.cwd(), 'jsontoairtable.json');
    if (fs.existsSync(airtableJsonPath)) {
      try {
        const airtableData = JSON.parse(fs.readFileSync(airtableJsonPath, 'utf8'));
        if (airtableData.CANALS && Array.isArray(airtableData.CANALS) && airtableData.CANALS.length > 0) {
          console.log(`Found ${airtableData.CANALS.length} canals in jsontoairtable.json`);
          
          // Merge canals from both sources, avoiding duplicates
          const existingIds = new Set(data.canals.map((c: any) => c.id));
          
          for (const canal of airtableData.CANALS) {
            if (!existingIds.has(canal.id)) {
              data.canals.push(canal);
              existingIds.add(canal.id);
            }
          }
        }
      } catch (error) {
        console.error('Error reading jsontoairtable.json:', error);
      }
    }
    
    console.log(`Returning ${data.canals.length} canals`);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading canals data:', error);
    return NextResponse.json(
      { error: 'Failed to read canals data' },
      { status: 500 }
    );
  }
}

// POST handler to create a new canal
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate the request body
    if (!body.points || !Array.isArray(body.points) || body.points.length < 2) {
      return NextResponse.json(
        { error: 'Invalid canal data. At least 2 points are required.' },
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
    const canalId = body.id || `canal-${uuidv4()}`;
    
    // Create the new canal with improved properties
    const newCanal = {
      id: canalId,
      points: body.points,
      curvature: body.curvature || 0.5,
      width: body.width || 3,
      depth: body.depth || 0.5,
      color: body.color || 0x0088ff,
      createdAt: new Date().toISOString(),
      // Store which points are transfer points
      transferPointIndices: body.points
        .map((point: any, index: number) => point.isTransferPoint ? index : null)
        .filter((index: number | null) => index !== null),
      // Add metadata for better organization
      metadata: {
        pointCount: body.points.length,
        totalLength: calculateCanalLength(body.points),
        isCurved: (body.curvature || 0.5) > 0,
        hasTransferPoints: body.points.some((p: any) => p.isTransferPoint)
      }
    };
    
    // Add the new canal to the data
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
      
      // For each connected canal, update its transfer points
      for (const tp of body.transferPoints) {
        for (const connectedId of tp.connectedRoadIds) {
          if (connectedId !== canalId) {
            // Find the connected canal
            const connectedCanalIndex = data.canals.findIndex(c => c.id === connectedId);
            if (connectedCanalIndex >= 0) {
              // Mark this canal as having a transfer point
              if (!data.canals[connectedCanalIndex].hasTransferPoints) {
                data.canals[connectedCanalIndex].hasTransferPoints = true;
              }
            }
          }
        }
      }
    }
    
    // Write the updated data back to the file
    fs.writeFileSync(canalsFile, JSON.stringify(data, null, 2));
    
    // Add to Airtable if CANALS is in the TABLE_MAP
    try {
      // Create a temporary JSON file for the jsontoairtable script
      const tempFile = path.join(process.cwd(), 'jsontoairtable.json');
      
      // Read the existing data to get transfer points
      let existingData;
      try {
        existingData = JSON.parse(fs.readFileSync(canalsFile, 'utf8'));
      } catch (error) {
        existingData = { canals: [], transferPoints: [] };
      }
      
      // Find transfer points related to this canal
      const relatedTransferPoints = existingData.transferPoints.filter(tp => 
        tp.connectedRoadIds && tp.connectedRoadIds.includes(canalId)
      );
      
      // Prepare canal data for Airtable
      const canalForAirtable = {
        ...newCanal,
        // Convert points to string if they're not already
        points: typeof newCanal.points === 'string' 
          ? newCanal.points 
          : JSON.stringify(newCanal.points),
        // Add transfer points
        transferPoints: JSON.stringify(relatedTransferPoints)
      };
      
      fs.writeFileSync(tempFile, JSON.stringify({
        CANALS: [canalForAirtable]
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
      console.error('Error adding canal to Airtable:', error);
      // Continue anyway, as the canal is already saved to the JSON file
    }
    
    return NextResponse.json({
      success: true,
      canal: newCanal
    });
  } catch (error) {
    console.error('Error creating canal:', error);
    return NextResponse.json(
      { error: 'Failed to create canal' },
      { status: 500 }
    );
  }
}
