import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

interface GuildMember {
  citizenId: string;
  username: string;
  firstName: string;
  lastName: string;
  coatOfArmsImageUrl: string | null;
  color: string | null;
}

export async function GET(request: NextRequest) {
  try {
    // Extract guildId from the URL
    const url = request.nextUrl;
    const pathname = url.pathname; // e.g., /api/guild-members/umbra_lucrum_invenit
    const parts = pathname.split('/');
    const guildId = parts[parts.length - 1]; // umbra_lucrum_invenit

    if (!guildId) {
      return NextResponse.json({ error: 'Missing guildId in path' }, { status: 400 });
    }

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error('Airtable API key or Base ID is missing');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

    const guildRecords = await base('GUILDS').select({
      filterByFormula: `GuildId = '${guildId}'`,
      fields: ['GuildId']
    }).all();

    if (guildRecords.length === 0) {
      return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
    }

    const actualGuildId = guildRecords[0].get('GuildId') as string;

    if (!actualGuildId) {
      return NextResponse.json({ error: 'Guild has no ID field' }, { status: 404 });
    }

    const records = await base('CITIZENS').select({
      filterByFormula: `{GuildId} = '${actualGuildId}'`
    }).all();

    const members: GuildMember[] = records.map(record => {
      const username = (record.get('Username') as string) || (record.get('CitizenId') as string);
      let coatOfArmsImageUrl = record.get('CoatOfArmsImageUrl') as string | null;

      // If coatOfArmsImageUrl is not a full URL and username exists, construct the production URL
      if (username && coatOfArmsImageUrl && !coatOfArmsImageUrl.startsWith('http')) {
        // Assuming coatOfArmsImageUrl might be a relative path or just a filename
        // We'll construct the full URL based on the username for consistency
        coatOfArmsImageUrl = `https://backend.serenissima.ai/public_assets/images/coat-of-arms/${username}.png`;
      } else if (username && !coatOfArmsImageUrl) {
        // If no URL is provided but we have a username, construct the default path
        coatOfArmsImageUrl = `https://backend.serenissima.ai/public_assets/images/coat-of-arms/${username}.png`;
      }

      return {
        citizenId: record.get('CitizenId') as string,
        username: username,
        firstName: record.get('FirstName') as string,
        lastName: record.get('LastName') as string,
        coatOfArmsImageUrl: coatOfArmsImageUrl,
        color: record.get('Color') as string || null,
      };
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error('Error fetching guild members from Airtable:', error);
    return NextResponse.json(
      { error: 'Failed to fetch guild members' },
      { status: 500 }
    );
  }
}
