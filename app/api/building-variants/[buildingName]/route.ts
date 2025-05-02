import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { buildingName: string } }
) {
  try {
    const buildingName = params.buildingName;
    
    // Construct the path to the building models directory
    const modelsDir = path.join(process.cwd(), 'public', 'assets', 'buildings', 'models', buildingName);
    
    // Check if the directory exists
    if (!fs.existsSync(modelsDir)) {
      console.log(`Building directory not found: ${modelsDir}`);
      return NextResponse.json(
        { success: false, error: 'Building directory not found' },
        { status: 404 }
      );
    }
    
    // Read the directory and filter for .glb files
    const files = fs.readdirSync(modelsDir);
    const glbFiles = files.filter(file => file.endsWith('.glb'));
    
    // Extract variant names (remove .glb extension)
    const variants = glbFiles.map(file => file.replace('.glb', ''));
    
    console.log(`Found ${variants.length} variants for building ${buildingName}: ${variants.join(', ')}`);
    
    return NextResponse.json({
      success: true,
      buildingName,
      variants
    });
  } catch (error) {
    console.error(`Error fetching building variants for ${params.buildingName}:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch building variants' },
      { status: 500 }
    );
  }
}
