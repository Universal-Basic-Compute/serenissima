import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST() {
  try {
    const coatOfArmsDir = path.join(process.cwd(), 'public', 'coat-of-arms');
    
    // Create the directory if it doesn't exist
    if (!fs.existsSync(coatOfArmsDir)) {
      fs.mkdirSync(coatOfArmsDir, { recursive: true });
      console.log('Created coat of arms directory');
    }
    
    // Create a default image if it doesn't exist
    const defaultImagePath = path.join(coatOfArmsDir, 'default.png');
    if (!fs.existsSync(defaultImagePath)) {
      // Copy a placeholder image or create a simple one
      // For now, we'll just create an empty file
      fs.writeFileSync(defaultImagePath, '');
      console.log('Created default coat of arms image');
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating coat of arms directory:', error);
    return NextResponse.json({ success: false, error: 'Failed to create coat of arms directory' }, { status: 500 });
  }
}
