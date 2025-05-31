import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

// Helper to escape single quotes for Airtable formulas
function escapeAirtableValue(value: string): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  return value.replace(/'/g, "\\'");
}

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
  gastaldo?: string; // Username of the Guild Master (from 'Master' field)
}

export async function GET(request: Request) {
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
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY, requestTimeout: 30000 }).base(AIRTABLE_BASE_ID);
    const url = new URL(request.url);

    const formulaParts: string[] = [];
    const loggableFilters: Record<string, string> = {};
    const reservedParams = ['limit', 'offset', 'sortField', 'sortDirection'];

    for (const [key, value] of url.searchParams.entries()) {
      if (reservedParams.includes(key.toLowerCase())) {
        continue;
      }
      const airtableField = key;
      loggableFilters[airtableField] = value;

      const numValue = parseFloat(value);
      if (!isNaN(numValue) && isFinite(numValue) && numValue.toString() === value) {
        formulaParts.push(`{${airtableField}} = ${value}`);
      } else if (value.toLowerCase() === 'true') {
        formulaParts.push(`{${airtableField}} = TRUE()`);
      } else if (value.toLowerCase() === 'false') {
        formulaParts.push(`{${airtableField}} = FALSE()`);
      } else {
        formulaParts.push(`{${airtableField}} = '${escapeAirtableValue(value)}'`);
      }
    }

    const filterByFormula = formulaParts.length > 0 ? `AND(${formulaParts.join(', ')})` : '';
    console.log('%c GET /api/guilds request received', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    console.log('Query parameters (filters):', loggableFilters);
    if (filterByFormula) {
      console.log('Applying Airtable filter formula:', filterByFormula);
    }
    
    // Fetch records from the Guilds table
    const records = await base('GUILDS').select({
      filterByFormula: filterByFormula,
      // Add default sort if needed, e.g., by GuildName
      sort: [{ field: 'GuildName', direction: 'asc' }]
    }).all();
    
    // Transform Airtable records to our Guild interface format
    const guilds: Guild[] = records.map(record => {
      let emblemPath = record.get('GuildEmblem') as string | undefined;
      let bannerPath = record.get('GuildBanner') as string | undefined;
      const backendBaseUrl = 'https://backend.serenissima.ai/public_assets';

      if (emblemPath) {
        if (emblemPath.startsWith('images/guilds/')) {
          emblemPath = emblemPath.replace('images/guilds/', 'guild/');
        }
        if (!emblemPath.startsWith('http')) { // Ensure it's not already a full URL
           emblemPath = `${backendBaseUrl}/${emblemPath.startsWith('/') ? emblemPath.substring(1) : emblemPath}`;
        }
      }

      if (bannerPath) {
        if (bannerPath.startsWith('images/guilds/')) {
          bannerPath = bannerPath.replace('images/guilds/', 'guild/');
        }
        if (!bannerPath.startsWith('http')) { // Ensure it's not already a full URL
          bannerPath = `${backendBaseUrl}/${bannerPath.startsWith('/') ? bannerPath.substring(1) : bannerPath}`;
        }
      }
      
      return {
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
        guildEmblem: emblemPath || undefined, // Use the transformed path
        guildBanner: bannerPath || undefined, // Use the transformed path
        color: record.get('Color') as string,
        gastaldo: record.get('Master') as string || undefined, // Fetch Master's username
      };
    });

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
