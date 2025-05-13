import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  context: { params: Record<string, string | string[]> }
): Promise<NextResponse> {
  try {
    const rawPath = context.params.path;

    const pathArray = Array.isArray(rawPath) ? rawPath : [rawPath];
    if (!pathArray || pathArray.length === 0) {
      return NextResponse.json(
        { error: 'Missing path parameter' },
        { status: 400 }
      );
    }

    const relativePath = pathArray.join('/');
    console.log(`Requested path: ${relativePath}`);

    // ✅ Protection contre les traversals "../"
    const dataRoot = path.join(process.cwd(), 'data');
    const absolutePath = path.join(dataRoot, relativePath);
    if (!absolutePath.startsWith(dataRoot)) {
      return NextResponse.json(
        { error: 'Invalid path: access denied' },
        { status: 403 }
      );
    }

    try {
      await fs.access(absolutePath);
    } catch {
      return NextResponse.json(
        { error: 'File not found', path: relativePath },
        { status: 404 }
      );
    }

    const fileData = await fs.readFile(absolutePath, 'utf8');

    const ext = path.extname(absolutePath).toLowerCase();
    let contentType = 'application/octet-stream';
    switch (ext) {
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
    console.error('Unhandled error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
