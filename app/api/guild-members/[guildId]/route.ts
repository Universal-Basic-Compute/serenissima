import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

// Define the GuildMember interface
interface GuildMember {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  coatOfArmsImage: string | null;
  color: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { guildId: string } }
) {
  try {
    const guildId = params.guildId;

    // Check if Airtable credentials are configured
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error('Airtable API key or Base ID is missing');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Initialize Airtable
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    
    // Fetch users who are members of this guild
    const records = await base('USERS').select({
      filterByFormula: `{GuildId} = '${guildId}'`
    }).all();
    
    // Transform Airtable records to our GuildMember interface format
    const members: GuildMember[] = records.map(record => ({
      userId: record.id,
      username: record.get('UserName') as string,
      firstName: record.get('FirstName') as string,
      lastName: record.get('LastName') as string,
      coatOfArmsImage: record.get('CoatOfArmsImage') as string || null,
      color: record.get('Color') as string || null,
    }));

    // Return the members data
    return NextResponse.json({ members });
  } catch (error) {
    console.error('Error fetching guild members from Airtable:', error);
    return NextResponse.json(
      { error: 'Failed to fetch guild members' },
      { status: 500 }
    );
  }
}
