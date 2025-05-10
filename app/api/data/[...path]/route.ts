import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  try {
    // Get the file path from the URL parameters
    const filePath = params.path.join('/');
    console.log(`Serving file from data directory: ${filePath}`);
    
    // Construct the absolute path to the file
    // Make sure to use path.join to handle path separators correctly across platforms
    const absolutePath = path.join(process.cwd(), 'data', filePath);
    
    // Read the file
    const fileData = await fs.readFile(absolutePath, 'utf8');
    
    // Determine content type based on file extension
    const extension = path.extname(filePath).toLowerCase();
    let contentType = 'application/octet-stream'; // Default content type
    
    switch (extension) {
      case '.json':
        contentType = 'application/json';
        break;
      case '.txt':
        contentType = 'text/plain';
        break;
      case '.csv':
        contentType = 'text/csv';
        break;
      // Add more content types as needed
    }
    
    // Return the file content with appropriate headers
    return new NextResponse(fileData, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error(`Error serving file from data directory:`, error);
    
    // Check if the error is because the file doesn't exist
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return new NextResponse(
        JSON.stringify({ error: 'File not found' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    // Return a generic error for other issues
    return new NextResponse(
      JSON.stringify({ error: 'Failed to serve file' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
