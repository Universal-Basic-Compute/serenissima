import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    // Await the params Promise to get the actual params object
    const resolvedParams = await params;
    
    // Get the path from the URL
    const filePath = resolvedParams.path.join('/');
    
    // Check if this is an external URL request
    if (filePath.startsWith('external/')) {
      const externalUrl = decodeURIComponent(filePath.substring(9));
      console.log(`Proxying request to external URL: ${externalUrl}`);
      
      try {
        const response = await fetch(externalUrl, {
          headers: {
            'Citizen-Agent': 'Serenissima-Proxy/1.0',
          },
        });
        
        if (!response.ok) {
          throw new Error(`External resource returned ${response.status}`);
        }
        
        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('Content-Type') || 'image/png';
        
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
          },
        });
      } catch (error) {
        console.error('Error proxying external image:', error);
        // Fall through to try local file
      }
    }
    
    // Construct the full path to the file
    const fullPath = path.join(process.cwd(), 'public', 'coat-of-arms', filePath);
    
    // Read the file
    const fileBuffer = await readFile(fullPath);
    
    // Determine content type based on file extension
    const extension = path.extname(filePath).toLowerCase();
    let contentType = 'application/octet-stream';
    
    switch (extension) {
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      case '.svg':
        contentType = 'image/svg+xml';
        break;
      case '.webp':
        contentType = 'image/webp';
        break;
    }
    
    // Return the file with appropriate headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      },
    });
  } catch (error) {
    console.error('Error serving coat of arms image:', error);
    
    // Try to serve the default image
    try {
      const defaultPath = path.join(process.cwd(), 'public', 'coat-of-arms', 'default.png');
      const defaultBuffer = await readFile(defaultPath);
      
      return new NextResponse(defaultBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        },
      });
    } catch (fallbackError) {
      return new NextResponse('Image not found', { status: 404 });
    }
  }
}
