import { NextResponse, NextRequest } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_USERS_TABLE = process.env.AIRTABLE_USERS_TABLE || 'USERS';

// Cache for user data to reduce Airtable API calls
const userCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  return new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
};

// Extract username from pathname
function extractUsernameFromRequest(request: NextRequest): string | null {
  const match = request.nextUrl.pathname.match(/\/api\/users\/([^/]+)/);
  return match?.[1] ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const username = extractUsernameFromRequest(request);

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      );
    }

    console.log(`Fetching user data for username: ${username}`);

    const cachedData = userCache.get(username);
    const now = Date.now();

    if (cachedData && now - cachedData.timestamp < CACHE_DURATION) {
      console.log(`Returning cached user data for username: ${username}`);
      return NextResponse.json({
        success: true,
        user: cachedData.data,
        _cached: true,
      });
    }

    const base = initAirtable();

    const queryUser = async (field: string, value: string) => {
      return await base(AIRTABLE_USERS_TABLE)
        .select({
          filterByFormula: `{${field}} = "${value}"`,
          fields: ['Username', 'FirstName', 'LastName', 'CoatOfArmsImage', 'FamilyMotto', 'Wallet', 'Ducats'],
        })
        .firstPage();
    };

    let records = await queryUser('Username', username);

    if (!records.length && username.startsWith('0x')) {
      records = await queryUser('Wallet', username);
    }

    if (records.length > 0) {
      const record = records[0];
      const userData = {
        username: record.get('Username') as string,
        firstName: record.get('FirstName') as string ?? '',
        lastName: record.get('LastName') as string ?? '',
        coatOfArmsImage: record.get('CoatOfArmsImage') as string ?? null,
        familyMotto: record.get('FamilyMotto') as string ?? null,
        walletAddress: record.get('Wallet') as string ?? null,
        ducats: record.get('Ducats') as number ?? 0,
      };

      userCache.set(username, { data: userData, timestamp: now });

      return NextResponse.json({ success: true, user: userData });
    }

    userCache.set(username, { data: null, timestamp: now });

    return NextResponse.json(
      { success: false, error: `No user found for username: ${username}` },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error fetching user data from Airtable:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch user data',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
