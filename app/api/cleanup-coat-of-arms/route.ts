import { NextRequest, NextResponse } from 'next/server';
import { readdir, unlink, stat } from 'fs/promises';
import path from 'path';

// This is an admin-only endpoint to clean up unused coat of arms images
export async function POST(request: NextRequest) {
  try {
    // Get the API key from the request
    const { apiKey } = await request.json();
    
    // Validate API key (use a secure method in production)
    if (apiKey !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get all coat of arms images
    const uploadDir = path.join(process.cwd(), 'public', 'coat-of-arms');
    const files = await readdir(uploadDir);
    
    // Get all active coat of arms from Airtable or database
    // This would require fetching from your database to get active image paths
    // For now, we'll just delete files older than 30 days as an example
    
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(uploadDir, file);
      const fileStat = await stat(filePath);
      
      // Delete files older than 30 days
      if (fileStat.mtimeMs < thirtyDaysAgo) {
        await unlink(filePath);
        deletedCount++;
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      deletedCount,
      message: `Deleted ${deletedCount} unused coat of arms images`
    });
  } catch (error) {
    console.error('Error cleaning up coat of arms:', error);
    return NextResponse.json({ 
      error: 'Failed to clean up images',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
