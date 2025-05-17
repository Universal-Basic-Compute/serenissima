import { NextResponse, NextRequest } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';
const AIRTABLE_BUILDINGS_TABLE = process.env.AIRTABLE_BUILDINGS_TABLE || 'BUILDINGS';

// Cache for citizen data to reduce Airtable API calls
const citizenCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  return new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
};

// Extract username from pathname
function extractUsernameFromRequest(request: NextRequest): string | null {
  const match = request.nextUrl.pathname.match(/\/api\/citizens\/([^/]+)/);
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

    console.log(`Fetching citizen data for username: ${username}`);

    const cachedData = citizenCache.get(username);
    const now = Date.now();

    if (cachedData && now - cachedData.timestamp < CACHE_DURATION) {
      console.log(`Returning cached citizen data for username: ${username}`);
      return NextResponse.json({
        success: true,
        citizen: cachedData.data,
        _cached: true,
      });
    }

    const base = initAirtable();

    const queryCitizen = async (field: string, value: string) => {
      return await base(AIRTABLE_CITIZENS_TABLE)
        .select({
          filterByFormula: `{${field}} = "${value}"`,
          fields: [
            'Username', 
            'FirstName', 
            'LastName', 
            'CoatOfArmsImage',
            'IsAi',
            'Ducats',
            'SocialClass',
            'Description',
            'Position',
            'Prestige',
            'Wallet',
            'FamilyMotto',
            'Color',
            'GuildId',
            'Preferences',
            'LastActiveAt',
            'CreatedAt',
            'UpdatedAt'
          ],
        })
        .firstPage();
    };

    let records = await queryCitizen('Username', username);

    if (!records.length && username.startsWith('0x')) {
      records = await queryCitizen('Wallet', username);
    }

    if (records.length > 0) {
      const record = records[0];
      // Parse position if it's a string
      let position = record.get('Position') as string || '';
      try {
        if (typeof position === 'string' && (position.startsWith('{') || position.startsWith('['))) {
          position = JSON.parse(position);
        }
      } catch (error) {
        console.error('Error parsing position:', error);
        // Keep it as a string if parsing fails
      }
      
      const citizenData = {
        username: record.get('Username') as string,
        firstName: record.get('FirstName') as string || '',
        lastName: record.get('LastName') as string || '',
        coatOfArmsImage: record.get('CoatOfArmsImage') as string || null,
        isAi: record.get('IsAi') as boolean || false,
        ducats: record.get('Ducats') as number || 0,
        socialClass: record.get('SocialClass') as string || '',
        description: record.get('Description') as string || '',
        position: position,
        prestige: record.get('Prestige') as number || 0,
        walletAddress: record.get('Wallet') as string || '',
        familyMotto: record.get('FamilyMotto') as string || '',
        color: record.get('Color') as string || '',
        guildId: record.get('GuildId') as string || null,
        preferences: record.get('Preferences') as object || {},
        lastActiveAt: record.get('LastActiveAt') as string || null,
        createdAt: record.get('CreatedAt') as string || null,
        updatedAt: record.get('UpdatedAt') as string || null,
        worksFor: null, // Default value, will be populated if they work for someone
        workplace: null
      };

      // Find buildings where this citizen is an occupant
      try {
        const buildingRecords = await base(AIRTABLE_BUILDINGS_TABLE)
          .select({
            filterByFormula: `AND({Occupant} = "${citizenData.username}", {Category} = "business")`,
            fields: ['RunBy', 'Name', 'Type']
          })
          .firstPage();

        if (buildingRecords.length > 0) {
          const building = buildingRecords[0];
          const runBy = building.get('RunBy') as string;
          
          if (runBy) {
            citizenData.worksFor = runBy;
            
            // Add workplace details
            citizenData.workplace = {
              name: building.get('Name') as string || '',
              type: building.get('Type') as string || ''
            };
          }
        }
      } catch (error) {
        console.error('Error fetching building data:', error);
        // Continue without the worksFor data if there's an error
      }

      citizenCache.set(username, { data: citizenData, timestamp: now });

      return NextResponse.json({ success: true, citizen: citizenData });
    }

    citizenCache.set(username, { data: null, timestamp: now });

    return NextResponse.json(
      { success: false, error: `No citizen found for username: ${username}` },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error fetching citizen data from Airtable:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch citizen data',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
