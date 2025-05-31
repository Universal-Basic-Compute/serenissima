import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';
const AIRTABLE_GUILDS_TABLE = process.env.AIRTABLE_GUILDS_TABLE || 'GUILDS';

// KinOS Configuration
const KINOS_API_BASE_URL = process.env.KINOS_API_BASE_URL; // e.g., https://api.kinos.ai
const KINOS_BLUEPRINT_ID = process.env.KINOS_BLUEPRINT_ID;
const KINOS_API_KEY = process.env.KINOS_API_KEY; // Secret API Key for KinOS

interface GuildMember {
  username: string;
  // Add other fields if needed, but username is key for kin_id
}

const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable API key or Base ID is missing');
  }
  return new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
};

export async function POST(request: NextRequest) {
  if (!KINOS_API_BASE_URL || !KINOS_BLUEPRINT_ID) {
    console.error('KinOS API Base URL or Blueprint ID is not configured.');
    return NextResponse.json({ success: false, error: 'KinOS service not configured on server.' }, { status: 500 });
  }
  // KINOS_API_KEY can be optional if auth is not needed, but good practice to check if expected
  if (!KINOS_API_KEY) {
    console.warn('KINOS_API_KEY is not configured. Calls to KinOS might fail if authentication is required.');
    // Depending on KinOS auth requirements, you might want to return an error here.
  }

  try {
    const { guildId, kinOsChannelId, messageContent, originalSenderUsername } = await request.json();

    if (!guildId || !kinOsChannelId || !messageContent || !originalSenderUsername) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: guildId, kinOsChannelId, messageContent, or originalSenderUsername' },
        { status: 400 }
      );
    }

    const base = initAirtable();
    let members: GuildMember[] = [];

    try {
      // First, ensure the GuildId from the request is valid by checking the GUILDS table.
      // This also helps confirm the `guildId` format is the string ID.
      const guildRecords = await base(AIRTABLE_GUILDS_TABLE).select({
        filterByFormula: `{GuildId} = '${guildId}'`,
        fields: ['GuildId'] // We only need to confirm existence
      }).firstPage();

      if (guildRecords.length === 0) {
        console.error(`Guild not found for notify-members: ${guildId}`);
        return NextResponse.json({ success: false, error: 'Guild not found' }, { status: 404 });
      }
      // const actualGuildAirtableId = guildRecords[0].id; // Not strictly needed if GuildId field in CITIZENS is the string

      // Fetch members from CITIZENS table using the string GuildId
      // Assuming 'GuildId' field in CITIZENS table stores the string identifier like 'umbra_lucrum_invenit'
      const citizenRecords = await base(AIRTABLE_CITIZENS_TABLE).select({
        filterByFormula: `{GuildId} = '${guildId}'`, // Filter by the string GuildId
        fields: ['Username'] // We primarily need the username for kin_id
      }).all();

      members = citizenRecords.map(record => ({
        username: record.get('Username') as string,
      })).filter(member => member.username); // Ensure username is not null/empty

    } catch (airtableError) {
      console.error('Airtable error fetching guild members for KinOS notification:', airtableError);
      return NextResponse.json({ success: false, error: 'Failed to fetch guild members' }, { status: 500 });
    }

    if (members.length === 0) {
      console.log(`No members found for guild ${guildId} to notify via KinOS.`);
      // Still return success as the main operation (Airtable save) might have succeeded.
      // The client doesn't need to know if no one was pinged on KinOS if the guild is empty.
      return NextResponse.json({ success: true, message: 'Message processed, no members to notify via KinOS.' });
    }

    console.log(`Relaying message to ${members.length} KinOS instances for guild ${guildId}, channel ${kinOsChannelId}`);

    const kinOsPromises = members.map(member => {
      // Do not send to the original sender's KinOS for this specific relay
      if (member.username === originalSenderUsername) {
        return Promise.resolve({ username: member.username, status: 'skipped_sender' });
      }

      const kinOsUrl = `${KINOS_API_BASE_URL}/v2/blueprints/${KINOS_BLUEPRINT_ID}/kins/${member.username}/channels/${kinOsChannelId}/add-message`;
      const payload = {
        message: `[From ${originalSenderUsername} in ${guildId}#${kinOsChannelId.split('_').pop()}]: ${messageContent}`, // Prepend sender context
        role: "user", // Or "assistant" if it's a system relaying a user's message. "user" implies the kin is receiving it as if from a user.
        metadata: {
          source: "guild_chat_relay",
          original_sender: originalSenderUsername,
          guild_id: guildId,
          guild_tab_channel_id: kinOsChannelId,
          relayed_to_kin: member.username
        }
      };

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (KINOS_API_KEY) {
        headers['Authorization'] = `Bearer ${KINOS_API_KEY}`;
      }

      return fetch(kinOsUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      })
      .then(async res => {
        if (!res.ok) {
          const errorBody = await res.text();
          console.error(`KinOS API error for ${member.username} (${res.status}): ${errorBody}`);
          return { username: member.username, status: 'failed', error: res.statusText, details: errorBody };
        }
        const result = await res.json();
        console.log(`Successfully sent message to KinOS for ${member.username} in channel ${kinOsChannelId}`);
        return { username: member.username, status: 'success', result };
      })
      .catch(error => {
        console.error(`Failed to send message to KinOS for ${member.username}:`, error);
        return { username: member.username, status: 'failed', error: error.message };
      });
    });

    // We don't wait for all promises for the client response, but good to log results
    Promise.allSettled(kinOsPromises).then(results => {
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          // console.log(`KinOS notification result:`, result.value);
        } else {
          console.error(`KinOS notification promise rejected:`, result.reason);
        }
      });
    });

    return NextResponse.json({ success: true, message: 'KinOS notification process initiated for guild members.' });

  } catch (error) {
    console.error('Error in notify-members endpoint:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ success: false, error: 'Failed to process KinOS notifications.', details: errorMessage }, { status: 500 });
  }
}
