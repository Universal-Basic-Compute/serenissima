import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed' }, { status: 400 });
    }
    
    // Create a unique filename
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const fileName = `${uuidv4()}.${fileExtension}`;
    
    // Ensure directory exists
    const uploadDir = path.join(process.cwd(), 'public', 'coat-of-arms');
    await mkdir(uploadDir, { recursive: true });
    
    // Save the file
    const filePath = path.join(uploadDir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);
    
    // Return the public URL path
    const publicPath = `https://backend.serenissima.ai/public/assets/images/coat-of-arms/${fileName}`;
    
    return NextResponse.json({ 
      success: true, 
      image_url: publicPath
    });
  } catch (error) {
    console.error('Error uploading coat of arms:', error);
    return NextResponse.json({ 
      error: 'Failed to upload image',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
