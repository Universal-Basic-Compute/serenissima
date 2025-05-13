import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Typage correct de "params" avec "params: { path: string[] }"
export async function GET(
  request: NextRequest,
  context: { params: { path: string[] } }
) {
  try {
    const filePathArray = context.params.path;

    if (!filePathArray || filePathArray.length === 0) {
      return NextResponse.json(
        { error: 'Path parameter is missing' },
        { status: 400 }
      );
    }

    const relativePath = filePathArray.join('/');
    console.log(`Requested relative path: ${relativePath}`);

    const absolutePath = path.join(process.cwd(), 'data', relativePath);
    console.log(`Resolved absolute path: ${absolutePath}`);

    try {
      await fs.access(absolutePath);
    } catch {
      return NextResponse.json(
        { error: 'File not found', path: relativePath },
        { status: 404 }
      );
    }

    const fileData = await fs.readFile(absolutePath, 'utf8');

    // Détermination du type MIME
    const ext = path.extname(absolutePath).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.json') contentType = 'application/json';
    else if (ext === '.txt') contentType = 'text/plain';
    else if (ext === '.csv') contentType = 'text/csv';

    return new NextResponse(fileData, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('Error serving file:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
