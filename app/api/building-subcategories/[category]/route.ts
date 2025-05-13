import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export async function GET(
  request: Request,
  { params }: { params: { category: string } }
) {
  try {
    const category = params.category;
    
    if (!category) {
      return NextResponse.json(
        { error: 'Category is required' },
        { status: 400 }
      );
    }
    
    // Base directory for the category
    const categoryDir = path.join(process.cwd(), 'public', 'data', 'buildings', category);
    
    // Check if the directory exists
    try {
      await stat(categoryDir);
    } catch (error) {
      console.error(`Category directory ${categoryDir} does not exist:`, error);
      return NextResponse.json(
        { error: `Category ${category} not found` },
        { status: 404 }
      );
    }
    
    // Get all directories in the category directory
    const entries = await readdir(categoryDir, { withFileTypes: true });
    
    // If there are subdirectories, return them as subcategories
    const subdirectories = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
    
    if (subdirectories.length > 0) {
      return NextResponse.json(subdirectories);
    }
    
    // If there are no subdirectories, return an empty array
    // This means the category itself is the subcategory
    return NextResponse.json([""]);
  } catch (error) {
    console.error(`Error fetching subcategories for ${params.category}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch subcategories' },
      { status: 500 }
    );
  }
}
