import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export async function GET(request: NextRequest) {
  try {
    // Extraire le paramètre dynamique depuis l’URL
    const category = request.nextUrl.pathname.split('/').pop(); // ou regex si besoin

    if (!category) {
      return NextResponse.json(
        { error: 'Category is required' },
        { status: 400 }
      );
    }

    const categoryDir = path.join(process.cwd(), 'public', 'data', 'buildings', category);

    try {
      await stat(categoryDir);
    } catch (error) {
      console.error(`Category directory ${categoryDir} does not exist:`, error);
      return NextResponse.json(
        { error: `Category ${category} not found` },
        { status: 404 }
      );
    }

    const entries = await readdir(categoryDir, { withFileTypes: true });

    const subdirectories = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    return NextResponse.json(subdirectories.length > 0 ? subdirectories : [""]);
  } catch (error) {
    console.error(`Error fetching subcategories:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch subcategories' },
      { status: 500 }
    );
  }
}
