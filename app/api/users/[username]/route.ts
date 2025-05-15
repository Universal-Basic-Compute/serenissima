import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_USERS_TABLE = process.env.AIRTABLE_USERS_TABLE || 'USERS';

// Cache for user data to reduce Airtable API calls
const userCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Initialize Airtable
const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  
  return new Airtable({apiKey: AIRTABLE_API_KEY}).base(AIRTABLE_BASE_ID);
};

export async function GET(
  request: Request,
  { params }: { params: { username: string } }
) {
  try {
    const username = params.username;
    
    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching user data for username: ${username}`);
    
    // Check cache first
    const cachedData = userCache.get(username);
    const currentTime = Date.now();
    
    if (cachedData && (currentTime - cachedData.timestamp) < CACHE_DURATION) {
      console.log(`Returning cached user data for username: ${username}`);
      return NextResponse.json({
        success: true,
        user: cachedData.data,
        _cached: true
      });
    }
    
    // Initialize Airtable
    const base = initAirtable();
    
    // Query Airtable for the specific user
    const records = await base(AIRTABLE_USERS_TABLE).select({
      filterByFormula: `{Username} = "${username}"`,
      fields: ['Username', 'FirstName', 'LastName', 'CoatOfArmsImage', 'FamilyMotto', 'Wallet', 'Ducats']
    }).firstPage();
    
    if (records && records.length > 0) {
      // Get the user data from the first matching record
      const record = records[0];
      const userData = {
        username: record.get('Username') as string,
        firstName: record.get('FirstName') as string || '',
        lastName: record.get('LastName') as string || '',
        coatOfArmsImage: record.get('CoatOfArmsImage') as string || null,
        familyMotto: record.get('FamilyMotto') as string || null,
        walletAddress: record.get('Wallet') as string || null,
        ducats: record.get('Ducats') as number || 0
      };
      
      // Update cache
      userCache.set(username, { data: userData, timestamp: currentTime });
      
      return NextResponse.json({
        success: true,
        user: userData
      });
    } else {
      console.log(`No user found for username: ${username}`);
      
      // Try to check if the input is a wallet address instead
      if (username.startsWith('0x')) {
        const walletRecords = await base(AIRTABLE_USERS_TABLE).select({
          filterByFormula: `{Wallet} = "${username}"`,
          fields: ['Username', 'FirstName', 'LastName', 'CoatOfArmsImage', 'FamilyMotto', 'Wallet', 'Ducats']
        }).firstPage();
        
        if (walletRecords && walletRecords.length > 0) {
          // Get the user data from the first matching record
          const record = walletRecords[0];
          const userData = {
            username: record.get('Username') as string,
            firstName: record.get('FirstName') as string || '',
            lastName: record.get('LastName') as string || '',
            coatOfArmsImage: record.get('CoatOfArmsImage') as string || null,
            familyMotto: record.get('FamilyMotto') as string || null,
            walletAddress: record.get('Wallet') as string || null,
            ducats: record.get('Ducats') as number || 0
          };
          
          // Update cache
          userCache.set(username, { data: userData, timestamp: currentTime });
          
          return NextResponse.json({
            success: true,
            user: userData
          });
        }
      }
      
      // Cache the negative result too
      userCache.set(username, { data: null, timestamp: currentTime });
      
      return NextResponse.json({
        success: false,
        error: `No user found for username: ${username}`
      });
    }
  } catch (error) {
    console.error('Error fetching user data from Airtable:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch user data',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
