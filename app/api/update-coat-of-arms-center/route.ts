import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { polygonId, center } = await request.json();
    
    if (!polygonId || !center) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Path to the data file
    const dataDir = path.join(process.cwd(), 'data');
    const filePath = path.join(dataDir, `${polygonId}.json`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: 'Polygon not found' },
        { status: 404 }
      );
    }
    
    // Read the file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContent);
    
    // Update the coat of arms center
    data.coatOfArmsCenter = center;
    
    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating coat of arms center:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update coat of arms center' },
      { status: 500 }
    );
  }
}
