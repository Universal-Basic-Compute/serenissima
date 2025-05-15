import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Cache for land owners to reduce Airtable API calls
const ownerCache = new Map<string, { owner: string | null, timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const landId = params.id;
    
    if (!landId) {
      return NextResponse.json(
        { success: false, error: 'Land ID is required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching owner for land ID: ${landId}`);
    
    // Check cache first
    const cachedData = ownerCache.get(landId);
    const currentTime = Date.now();
    
    if (cachedData && (currentTime - cachedData.timestamp) < CACHE_DURATION) {
      console.log(`Returning cached owner for land ID: ${landId}`);
      return NextResponse.json({
        success: true,
        owner: cachedData.owner,
        _cached: true
      });
    }
    
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
    
    // Query Airtable for the specific land record
    const records = await landsTable.select({
      filterByFormula: `{LandId} = "${landId}"`,
      fields: ['LandId', 'User', 'Wallet']
    }).firstPage();
    
    if (records && records.length > 0) {
      // Get the owner from the first matching record
      const record = records[0];
      const owner = record.get('User') || record.get('Wallet') || null;
      
      // Update cache
      ownerCache.set(landId, { owner, timestamp: currentTime });
      
      return NextResponse.json({
        success: true,
        owner: owner
      });
    } else {
      console.log(`No record found for land ID: ${landId}`);
      
      // Cache the negative result too
      ownerCache.set(landId, { owner: null, timestamp: currentTime });
      
      return NextResponse.json({
        success: false,
        error: `No record found for land ID: ${landId}`
      });
    }
  } catch (error) {
    console.error('Error fetching land owner from Airtable:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch land owner',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
