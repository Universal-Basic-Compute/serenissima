import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json();
    
    if (!imageUrl) {
      return NextResponse.json({ error: 'No image URL provided' }, { status: 400 });
    }
    
    // Fetch the image from the external URL
    const response = await fetch(imageUrl, {
      headers: {
        // You might need to add headers to mimic a browser request
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      return NextResponse.json({ 
        error: `Failed to fetch image: ${response.status} ${response.statusText}` 
      }, { status: 500 });
    }
    
    // Get the image data
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    
    // Determine file extension based on content type
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const fileExtension = contentType.split('/')[1] || 'jpg';
    
    // Create a unique filename
    const fileName = `${uuidv4()}.${fileExtension}`;
    
    // Ensure directory exists
    const uploadDir = path.join(process.cwd(), 'public', 'coat-of-arms');
    await mkdir(uploadDir, { recursive: true });
    
    // Save the file
    const filePath = path.join(uploadDir, fileName);
    await writeFile(filePath, imageBuffer);
    
    // Return the public URL path
    const publicPath = `/coat-of-arms/${fileName}`;
    
    return NextResponse.json({ 
      success: true, 
      image_url: publicPath
    });
  } catch (error) {
    console.error('Error fetching coat of arms:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch and save image',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
