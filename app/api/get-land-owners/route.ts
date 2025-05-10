import { NextResponse } from 'next/server';
import { fetchCoatOfArmsImage } from '@/app/utils/coatOfArmsUtils';
import path from 'path';
import fs from 'fs/promises';
import Airtable from 'airtable';

// Cache the land owners data with a longer expiration
let cachedData: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
const FETCH_TIMEOUT = 15000; // Reduce timeout to 15 seconds

// Path to the mapping file created by sync_coatofarms.py
const MAPPING_FILE_PATH = path.join(process.cwd(), 'public', 'coat-of-arms', 'mapping.json');

// Cache for the mapping data
let coatOfArmsMapping: Record<string, { production_url: string, local_path: string }> | null = null;

// Function to load the mapping file
async function loadMappingFile() {
  try {
    // Check if the file exists
    try {
      await fs.access(MAPPING_FILE_PATH);
    } catch (error) {
      console.warn(`Coat of arms mapping file not found: ${MAPPING_FILE_PATH}`);
      return null;
    }
    
    // Read and parse the mapping file
    const data = await fs.readFile(MAPPING_FILE_PATH, 'utf8');
    const mapping = JSON.parse(data);
    console.log(`Loaded coat of arms mapping with ${Object.keys(mapping).length} entries`);
    return mapping;
  } catch (error) {
    console.warn(`Could not load coat of arms mapping file: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const currentTime = Date.now();
    
    // Implement HTTP caching with ETag
    const headers = new Headers();
    
    // Generate ETag based on data
    const etag = `"${cacheTimestamp}"`; 
    headers.set('ETag', etag);
    headers.set('Cache-Control', 'public, max-age=300'); // 5 minutes
    
    // Check if client has valid cache
    const requestHeaders = new Headers(request.headers);
    const ifNoneMatch = requestHeaders.get('If-None-Match');
    
    if (ifNoneMatch === etag && cachedData) {
      // Client has valid cache, return 304 Not Modified
      return new Response(null, {
        status: 304,
        headers
      });
    }
    
    // Load the coat of arms mapping if not already loaded
    if (coatOfArmsMapping === null) {
      coatOfArmsMapping = await loadMappingFile();
    }
    
    // Check if we have valid cached data
    if (cachedData && (currentTime - cacheTimestamp) < CACHE_DURATION) {
      console.log('Returning cached land owners data');
      return NextResponse.json(cachedData, { headers });
    }
    
    console.log('Fetching fresh land ownership data from backend...');
    
    try {
      console.log('Fetching fresh land ownership data directly from Airtable...');
      
      // Get Airtable credentials from environment variables
      const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
      const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
      const AIRTABLE_LANDS_TABLE = process.env.AIRTABLE_LANDS_TABLE || 'LANDS';
      
      if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
        throw new Error('Airtable credentials not configured');
      }
      
      // Initialize Airtable client
      const base = new Airtable({apiKey: AIRTABLE_API_KEY}).base(AIRTABLE_BASE_ID);
      const landsTable = base(AIRTABLE_LANDS_TABLE);
      
      // Fetch all land records
      const records = await new Promise((resolve, reject) => {
        const allRecords: any[] = [];
        landsTable.select().eachPage(
          function page(records, fetchNextPage) {
            allRecords.push(...records);
            fetchNextPage();
          },
          function done(err) {
            if (err) {
              reject(err);
              return;
            }
            resolve(allRecords);
          }
        );
      });
      
      // Define the land data interface
      interface LandData {
        id: string;
        owner: string | null;
        coat_of_arms_image?: string;
        _coat_of_arms_source?: string;
      }

      // Transform records to the expected format
      const data = (records as any[]).map(record => ({
        id: record.fields.LandId || record.id,
        owner: record.fields.User || record.fields.Wallet || null,
        coat_of_arms_image: record.fields.CoatOfArmsImage || null
      } as LandData));
      
      console.log(`Retrieved ${data.length} land records directly from Airtable`);
      
      // Helper function to ensure coat of arms URLs use the production domain
      function ensureProductionUrl(url: string): string {
        if (!url) return url;
        
        // If the URL is relative, prepend the production URL
        if (url.startsWith('/')) {
          return `https://serenissima.ai${url}`;
        }
        
        // If the URL doesn't start with http, assume it's relative
        if (!url.startsWith('http')) {
          return `https://serenissima.ai/${url}`;
        }
        
        return url;
      }
      
      // Process the data to use local coat of arms images if available
      if (coatOfArmsMapping && Array.isArray(data)) {
        for (const land of data as LandData[]) {
          if (land.owner && land.coat_of_arms_image) {
            // Ensure the URL uses the production domain if it's relative
            land.coat_of_arms_image = ensureProductionUrl(land.coat_of_arms_image);
            
            // Check if we have a local version of this coat of arms
            const ownerMapping = coatOfArmsMapping[land.owner];
            if (ownerMapping) {
              // Replace with local path
              land.coat_of_arms_image = ownerMapping.local_path;
              land._coat_of_arms_source = 'local';
            }
          }
        }
        console.log('Processed land data with local coat of arms mappings');
      }
      
      // Update the cache
      cachedData = { success: true, lands: data };
      cacheTimestamp = currentTime;
      
      return NextResponse.json(cachedData, { headers });
    } catch (fetchError) {
      console.error('Error fetching from Airtable:', fetchError);
      
      // If we have stale cache, return it rather than failing
      if (cachedData) {
        console.log('Returning stale cached data due to fetch error');
        return NextResponse.json({
          ...cachedData,
          _cached: true,
          _stale: true,
          _error: fetchError instanceof Error ? fetchError.message : String(fetchError)
        });
      }
      
      // If no cache exists, create an empty response
      return NextResponse.json({
        success: true,
        lands: [],
        _error: fetchError instanceof Error ? fetchError.message : String(fetchError)
      });
    }
  } catch (error) {
    console.error('Error in GET handler:', error);
    
    // If we have any cache, return it rather than failing
    if (cachedData) {
      console.log('Returning cached data due to handler error');
      return NextResponse.json({
        ...cachedData,
        _cached: true,
        _error: error instanceof Error ? error.message : String(error)
      });
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch land ownership data', 
        message: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}
