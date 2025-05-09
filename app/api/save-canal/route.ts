import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define the data directory
const dataDir = path.join(process.cwd(), 'data', 'canals');

// Ensure the directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

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
    
    // Generate a filename
    const filename = `canal-${Date.now()}.json`;
    const filePath = path.join(dataDir, filename);
    
    // Add timestamp
    const canalData = {
      ...body,
      createdAt: new Date().toISOString()
    };
    
    // Write the file
    fs.writeFileSync(filePath, JSON.stringify(canalData, null, 2));
    
    // Also add to the jsontoairtable.json file
    const airtableJsonPath = path.join(process.cwd(), 'jsontoairtable.json');
    let airtableData = { CANALS: [] };
    
    if (fs.existsSync(airtableJsonPath)) {
      try {
        airtableData = JSON.parse(fs.readFileSync(airtableJsonPath, 'utf8'));
        if (!airtableData.CANALS) {
          airtableData.CANALS = [];
        }
      } catch (error) {
        console.error('Error parsing jsontoairtable.json:', error);
      }
    }
    
    // Add the canal to the CANALS array
    airtableData.CANALS.push(canalData);
    
    // Write the updated data back to the file
    fs.writeFileSync(airtableJsonPath, JSON.stringify(airtableData, null, 2));
    
    return NextResponse.json({
      success: true,
      filename,
      isNew: true
    });
  } catch (error) {
    console.error('Error saving canal:', error);
    return NextResponse.json(
      { error: 'Failed to save canal', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
