import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile, access } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Path to the mapping file created by sync_coatofarms.py
const MAPPING_FILE_PATH = path.join(process.cwd(), 'public', 'coat-of-arms', 'mapping.json');

// Cache for the mapping data
let coatOfArmsMapping: Record<string, { production_url: string, local_path: string }> | null = null;

// Function to load the mapping file
async function loadMappingFile() {
  try {
    // Check if the file exists
    await access(MAPPING_FILE_PATH, constants.R_OK);
    
    // Read and parse the mapping file
    const data = await readFile(MAPPING_FILE_PATH, 'utf8');
    coatOfArmsMapping = JSON.parse(data);
    console.log(`Loaded coat of arms mapping with ${Object.keys(coatOfArmsMapping).length} entries`);
  } catch (error) {
    console.warn(`Could not load coat of arms mapping file: ${error instanceof Error ? error.message : String(error)}`);
    coatOfArmsMapping = null;
  }
}

// Load the mapping file on startup
loadMappingFile().catch(console.error);

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json();
    
    if (!imageUrl) {
      return NextResponse.json({ error: 'No image URL provided' }, { status: 400 });
    }
    
    // Check if we have a local version of this image
    if (coatOfArmsMapping) {
      // Try to find the image URL in our mapping
      const entry = Object.values(coatOfArmsMapping).find(item => 
        item.production_url === imageUrl || 
        imageUrl.endsWith(item.local_path)
      );
      
      if (entry) {
        console.log(`Found local coat of arms image: ${entry.local_path}`);
        return NextResponse.json({ 
          success: true, 
          image_url: entry.local_path,
          source: 'local'
        });
      }
    }
    
    // If no local version found, fetch from the external URL
    console.log(`Fetching coat of arms from external URL: ${imageUrl}`);
    const response = await fetch(imageUrl, {
      headers: {
        // You might need to add headers to mimic a browser request
        'Citizen-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      // Ensure we're not sending cookies or credentials to the external URL
      credentials: 'omit'
    });
    
    if (!response.ok) {
      return NextResponse.json({ 
        error: `Failed to fetch image: ${response.status} ${response.statusText}` 
      }, { status: 500 });
    }
    
    // Get the image data
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    
    // Determine file extension based on content type
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const fileExtension = contentType.split('/')[1] || 'jpg';
    
    // Create a unique filename
    const fileName = `${uuidv4()}.${fileExtension}`;
    
    // Ensure directory exists
    const uploadDir = path.join(process.cwd(), 'public', 'coat-of-arms');
    await mkdir(uploadDir, { recursive: true });
    
    // Save the file
    const filePath = path.join(uploadDir, fileName);
    await writeFile(filePath, imageBuffer);
    
    // Return the public URL path
    const publicPath = `https://backend.serenissima.ai/public_assets/images/coat-of-arms/${fileName}`;
    
    return NextResponse.json({ 
      success: true, 
      image_url: publicPath,
      source: 'remote'
    });
  } catch (error) {
    console.error('Error fetching coat of arms:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch and save image',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
