import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

// Define the Guild interface
interface Guild {
  guildId: string;
  guildName: string;
  createdAt: string;
  primaryLocation: string;
  description: string;
  shortDescription?: string; // Added shortDescription
  patronSaint?: string;
  guildTier?: string;
  leadershipStructure?: string;
  entryFee?: number;
  votingSystem?: string;
  meetingFrequency?: string;
  guildHallId?: string;
  guildEmblem?: string;
  guildBanner?: string;
  color?: string;
}

export async function GET() {
  try {
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
    
    // Fetch records from the Guilds table
    const records = await base('GUILDS').select().all();
    
    // Transform Airtable records to our Guild interface format
    const guilds: Guild[] = records.map(record => ({
      guildId: String(record.get('GuildId')), // Cast to string
      guildName: record.get('GuildName') as string,
      createdAt: record.get('CreatedAt') as string,
      primaryLocation: record.get('PrimaryLocation') as string,
      description: record.get('Description') as string,
      shortDescription: record.get('ShortDescription') as string,
      patronSaint: record.get('PatronSaint') as string,
      guildTier: record.get('GuildTier') as string,
      leadershipStructure: record.get('LeadershipStructure') as string,
      entryFee: record.get('EntryFee') as number,
      votingSystem: record.get('VotingSystem') as string,
      meetingFrequency: record.get('MeetingFrequency') as string,
      guildHallId: record.get('GuildHallId') as string,
      guildEmblem: record.get('GuildEmblem') as string,
      guildBanner: record.get('GuildBanner') as string,
      color: record.get('Color') as string,
    }));

    // Return the guilds data
    return NextResponse.json({ guilds });
  } catch (error) {
    console.error('Error fetching guilds from Airtable:', error);
    return NextResponse.json(
      { error: 'Failed to fetch guilds' },
      { status: 500 }
    );
  }
}
