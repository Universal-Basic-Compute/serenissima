import { NextResponse } from 'next/server';
import { serverUtils } from '@/lib/fileUtils';
import fs from 'fs';
import path from 'path';

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Polygon ID is required' },
        { status: 400 }
      );
    }
    
    // 1. Delete the JSON file
    const dataDir = serverUtils.ensureDataDirExists();
    const filePath = path.join(dataDir, `${id}.json`);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Deleted polygon file: ${filePath}`);
    } else {
      console.warn(`Polygon file not found: ${filePath}`);
    }
    
    // 2. Delete the Airtable record
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiBaseUrl}/api/land/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        console.warn(`Failed to delete Airtable record for ${id}: ${response.statusText}`);
      } else {
        console.log(`Deleted Airtable record for ${id}`);
      }
    } catch (error) {
      console.error(`Error deleting Airtable record for ${id}:`, error);
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Polygon ${id} deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting polygon:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete polygon' },
      { status: 500 }
    );
  }
}
