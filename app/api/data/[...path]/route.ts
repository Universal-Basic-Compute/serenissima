import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// ✅ Compatible Next.js 15
export async function GET(
  request: NextRequest,
  context: { params: { path?: string[] } } // RouteHandlerContext n'est pas exporté publiquement, on le reconstitue ici
) {
  try {
    const pathArray = context.params.path;

    if (!pathArray || !Array.isArray(pathArray)) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid path' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Join path segments to construct the relative path
    const filePath = pathArray.join('/');
    console.log(`Serving file from data directory: ${filePath}`);

    // Construct the absolute path to the file
    const absolutePath = path.join(process.cwd(), 'data', filePath);
    console.log(`Absolute path: ${absolutePath}`);

    // Check if the file exists
    try {
      await fs.access(absolutePath);
    } catch (error) {
      console.log(`File not found: ${absolutePath}`);
      return new NextResponse(
        JSON.stringify({ error: 'File not found', path: filePath }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Read the file content
    const fileData = await fs.readFile(absolutePath, 'utf8');

    // Determine content type
    const extension = path.extname(filePath).toLowerCase();
    let contentType = 'application/octet-stream';

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
      // Add more types as needed
    }

    // Return file content
    return new NextResponse(fileData, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('Error serving file:', error);

    return new NextResponse(
      JSON.stringify({ error: 'Failed to serve file', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
