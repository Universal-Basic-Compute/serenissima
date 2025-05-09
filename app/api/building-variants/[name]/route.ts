import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: { name: string } }
) {
  try {
    const buildingName = params.name;
    
    // Sanitize the building name to prevent directory traversal
    const sanitizedName = buildingName.replace(/[^a-zA-Z0-9_-]/g, '');
    
    // Define the path to the building models directory
    const modelsDir = path.join(process.cwd(), 'public', 'assets', 'buildings', 'models', sanitizedName);
    
    // Check if the directory exists
    if (!fs.existsSync(modelsDir)) {
      // If directory doesn't exist, return default variant
      return NextResponse.json({
        success: true,
        variants: ['model']
      });
    }
    
    // Get all GLB files in the directory
    const files = fs.readdirSync(modelsDir)
      .filter(file => file.endsWith('.glb'))
      .map(file => file.replace('.glb', ''));
    
    // If no GLB files found, return default variant
    if (files.length === 0) {
      return NextResponse.json({
        success: true,
        variants: ['model']
      });
    }
    
    return NextResponse.json({
      success: true,
      variants: files
    });
  } catch (error) {
    console.error('Error getting building variants:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to get building variants',
        variants: ['model'] // Return default variant on error
      },
      { status: 500 }
    );
  }
}
