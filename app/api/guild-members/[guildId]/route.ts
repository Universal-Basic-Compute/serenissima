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
    
    // First, get the guild record to find its GuildId field (not the Airtable record ID)
    const guildRecords = await base('GUILDS').select({
      filterByFormula: `RECORD_ID() = '${guildId}'`,
      fields: ['GuildId']
    }).all();
    
    if (guildRecords.length === 0) {
      console.error(`Guild with record ID ${guildId} not found`);
      return NextResponse.json(
        { error: 'Guild not found' },
        { status: 404 }
      );
    }
    
    // Get the actual GuildId field value from the guild record
    const actualGuildId = guildRecords[0].get('GuildId') as string;
    
    if (!actualGuildId) {
      console.error(`Guild with record ID ${guildId} has no GuildId field`);
      return NextResponse.json(
        { error: 'Guild has no ID field' },
        { status: 404 }
      );
    }
    
    console.log(`Found guild with GuildId: ${actualGuildId}`);
    
    // Now fetch users who are members of this guild using the actual GuildId
    const records = await base('USERS').select({
      filterByFormula: `{GuildId} = '${actualGuildId}'`
    }).all();
    
    console.log(`Found ${records.length} members for guild with GuildId: ${actualGuildId}`);
    
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
