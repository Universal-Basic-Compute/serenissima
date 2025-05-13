import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  try {
    const { path: pathSegments } = await context.params;

    if (!pathSegments || pathSegments.length === 0) {
      return new NextResponse(
        JSON.stringify({ error: 'No path provided' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const filePath = pathSegments.join('/');
    console.log(`Serving file from data directory: ${filePath}`);

    const absolutePath = path.join(process.cwd(), 'data', filePath);
    console.log(`Absolute path: ${absolutePath}`);

    try {
      await fs.access(absolutePath);
    } catch (error) {
      console.log(`File not found: ${absolutePath}`);
      return new NextResponse(
        JSON.stringify({ error: 'File not found', path: filePath }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const fileData = await fs.readFile(absolutePath, 'utf8');

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
    }

    return new NextResponse(fileData, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error(`Error serving file from data directory:`, error);

    return new NextResponse(
      JSON.stringify({ error: 'Failed to serve file', details: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
