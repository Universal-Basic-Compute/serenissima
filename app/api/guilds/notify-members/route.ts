import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';
const AIRTABLE_GUILDS_TABLE = process.env.AIRTABLE_GUILDS_TABLE || 'GUILDS';

// KinOS Configuration
const KINOS_API_BASE_URL = process.env.KINOS_API_BASE_URL || 'https://api.kinos-engine.ai/';
const KINOS_BLUEPRINT_ID = process.env.KINOS_BLUEPRINT_ID || 'serenissima-ai';
const KINOS_API_KEY = process.env.KINOS_API_KEY; // Secret API Key for KinOS

if (!process.env.KINOS_API_BASE_URL) {
  console.warn(
    `KINOS_API_BASE_URL not set in environment, using default fallback: '${KINOS_API_BASE_URL}'. Please set this in your .env.local file.`
  );
}
if (!process.env.KINOS_BLUEPRINT_ID) {
  console.warn(
    `KINOS_BLUEPRINT_ID not set in environment, using default fallback: '${KINOS_BLUEPRINT_ID}'. Please set this in your .env.local file.`
  );
}

// Define a more detailed GuildMember interface for addSystem prompt
interface DetailedGuildMember {
  username: string;
  firstName?: string;
  lastName?: string;
  // Add any other relevant fields you want to pass to the Gastaldo's AI
}

interface GuildDetails {
  guildId: string;
  guildName: string;
  gastaldo?: string; // Guild Master's username
  // other guild fields if needed
}

interface GuildMember { // Ajout de l'interface GuildMember
  username: string;
  // Ajoutez d'autres champs si nécessaire, par exemple firstName, lastName
}

const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable API key or Base ID is missing');
  }
  return new Airtable({ apiKey: AIRTABLE_API_KEY, requestTimeout: 30000 }).base(AIRTABLE_BASE_ID);
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

    // We don't wait for all promises for the client response regarding initial notification
    Promise.allSettled(kinOsPromises).then(results => {
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.status !== 'skipped_sender') {
          // console.log(`KinOS initial notification result:`, result.value);
        } else if (result.status === 'rejected') {
          console.error(`KinOS initial notification promise rejected:`, result.reason);
        }
      });
    });

    // New logic for dynamic discussion
    // if (Math.random() < 0.8) { // 80% chance
    // Forcing 100% chance for debugging as requested
    console.log(`[Dynamic Discussion] Triggered for guild ${guildId}, channel ${kinOsChannelId} (100% chance)`);
    // This part will run asynchronously and not block the main response
    initiateDynamicDiscussion(guildId, kinOsChannelId, messageContent, originalSenderUsername, base)
        .catch(discussionError => {
          console.error(`[Dynamic Discussion] Error for ${guildId}#${kinOsChannelId}:`, discussionError);
        });
    // Removed the dangling 'else' block as the 'if' condition was commented out to force 100% trigger rate.

    return NextResponse.json({ success: true, message: 'KinOS notification process initiated for guild members. Dynamic discussion may follow.' });

  } catch (error) {
    console.error('Error in POST /api/guilds/notify-members:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ success: false, error: 'Failed to process KinOS notifications.', details: errorMessage }, { status: 500 });
  }
}


// Helper function to fetch details for a single guild
async function fetchGuildDetails(guildId: string, airtableBase: Airtable.Base): Promise<GuildDetails | null> {
  try {
    const records = await airtableBase(AIRTABLE_GUILDS_TABLE)
      .select({
        filterByFormula: `{GuildId} = '${guildId}'`,
        fields: ['GuildId', 'GuildName', 'Master'], // Changed 'Gastaldo' to 'Master'
        maxRecords: 1,
      })
      .firstPage();

    if (records.length > 0) {
      const record = records[0];
      return {
        guildId: record.get('GuildId') as string,
        guildName: record.get('GuildName') as string,
        gastaldo: record.get('Master') as string | undefined, // Changed 'Gastaldo' to 'Master'
      };
    }
    return null;
  } catch (error) {
    console.error(`Error fetching details for guild ${guildId}:`, error);
    return null;
  }
}

// Helper function to fetch guild members with details
async function fetchGuildMemberDetails(guildId: string, airtableBase: Airtable.Base): Promise<DetailedGuildMember[]> {
  try {
    // This logic is similar to app/api/guild-members/[guildId]/route.ts
    // For simplicity, directly querying here. Consider abstracting if used in many places.
    const citizenRecords = await airtableBase(AIRTABLE_CITIZENS_TABLE).select({
      filterByFormula: `{GuildId} = '${guildId}'`,
      fields: ['Username', 'FirstName', 'LastName'] // Add other fields as needed for the prompt
    }).all();

    return citizenRecords.map(record => ({
      username: record.get('Username') as string,
      firstName: record.get('FirstName') as string | undefined,
      lastName: record.get('LastName') as string | undefined,
    })).filter(member => member.username);
  } catch (error) {
    console.error(`Error fetching member details for guild ${guildId}:`, error);
    return [];
  }
}


// Assumed KinOS interaction function that gets an AI response
async function askKinOsForJsonDecision(
  kinUsername: string,
  channelId: string,
  promptMessage: string,
  systemContext: string // For "addSystem"
): Promise<any> {
  // CRITICAL ASSUMPTION: This endpoint structure and its ability to return a direct AI response.
  // The user mentioned "/kins/<MasterUsername>/channels/guildId_channel_name/messages"
  // and also the "/v2/blueprints/{blueprint}/kins/{kin_id}/channels/{channel_id}/add-message"
  // The latter does NOT return AI response. The former might, or it might be a typo for the general Kin message endpoint.
  // Using the general Kin message endpoint structure which typically returns responses.
  const kinOsUrl = `${KINOS_API_BASE_URL}/v2/blueprints/${KINOS_BLUEPRINT_ID}/kins/${kinUsername}/messages`;

  const payload: any = {
    content: promptMessage, // Changed from 'message' to 'content'
    role: "user", // System-initiated prompts often go as 'user' to the AI
    channel_id: channelId, // Target the specific guild-tab channel
    addSystem: systemContext // Use 'addSystem' as per KinOS docs
  };
  
  console.log(`[KinOS Ask] Sending to ${kinUsername} in channel ${channelId}. Payload:`, JSON.stringify(payload));


  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (KINOS_API_KEY) {
    headers['Authorization'] = `Bearer ${KINOS_API_KEY}`;
  }

  const response = await fetch(kinOsUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[KinOS Ask] API error for ${kinUsername} (${response.status}): ${errorBody}`);
    throw new Error(`KinOS API error: ${response.statusText} - ${errorBody}`);
  }
  
  const responseData = await response.json();
  console.log(`[KinOS Ask] Response from ${kinUsername}:`, responseData);

  // KinOS response has AI's message in 'content' field as per documentation.
  const aiResponseMessage = responseData.content;
  
  if (typeof aiResponseMessage !== 'string') {
    console.error("[KinOS Ask] AI response content is not a string or is missing. Response:", responseData);
    throw new Error("AI response content is not a string or is missing.");
  }

  try {
    // The AI is expected to return a JSON string.
    return JSON.parse(aiResponseMessage);
  } catch (e) {
    console.error(`[KinOS Ask] Failed to parse JSON response from ${kinUsername}: ${aiResponseMessage}`, e);
    throw new Error(`Failed to parse JSON from AI: ${aiResponseMessage}`);
  }
}

// Fire-and-forget message to a Kin's channel (similar to original relay, but for system directives)
async function sendSystemDirectiveToKinOsChannel(
  kinUsername: string,
  channelId: string,
  directiveMessage: string,
  originalSender: string, // For metadata
  guildId: string // For metadata
): Promise<void> {
  const kinOsUrl = `${KINOS_API_BASE_URL}/v2/blueprints/${KINOS_BLUEPRINT_ID}/kins/${kinUsername}/channels/${channelId}/add-message`;
  const payload = {
    message: directiveMessage, // This is the [SYSTEM]...[/SYSTEM] message
    role: "system", // Or "user" if KinOS expects directives as user messages
    metadata: {
      source: "guild_discussion_director",
      original_sender_of_chat_message: originalSender,
      guild_id: guildId,
      guild_tab_channel_id: channelId,
      directed_to_kin: kinUsername
    }
  };

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (KINOS_API_KEY) {
    headers['Authorization'] = `Bearer ${KINOS_API_KEY}`;
  }

  try {
    const res = await fetch(kinOsUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`[KinOS Directive] API error for ${kinUsername} (${res.status}): ${errorBody}`);
    } else {
      console.log(`[KinOS Directive] Successfully sent to ${kinUsername} in channel ${channelId}`);
    }
  } catch (error) {
    console.error(`[KinOS Directive] Failed to send to ${kinUsername}:`, error);
  }
}


async function initiateDynamicDiscussion(
  guildId: string,
  kinOsChannelId: string, // e.g. guildId_Charter_and_Rules
  originalMessageContent: string,
  originalSenderUsername: string,
  airtableBase: Airtable.Base
) {
  console.log(`[Dynamic Discussion EXEC] Entered for ${guildId}, channel ${kinOsChannelId}. Original sender: ${originalSenderUsername}`);

  // 1. Fetch Guild Master's username
  console.log(`[Dynamic Discussion EXEC] Step 1: Fetching guild details for ${guildId}`);
  const guildDetails = await fetchGuildDetails(guildId, airtableBase);
  if (!guildDetails) {
    console.log(`[Dynamic Discussion EXEC] Guild ${guildId} not found. Aborting.`);
    return;
  }
  if (!guildDetails.gastaldo) {
    console.log(`[Dynamic Discussion EXEC] Gastaldo not set for guild ${guildId} (${guildDetails.guildName}). Aborting.`);
    return;
  }
  const gastaldoUsername = guildDetails.gastaldo;
  console.log(`[Dynamic Discussion EXEC] Gastaldo for ${guildId} is ${gastaldoUsername}`);

  // 2. Fetch Guild Members' details for the system prompt
  console.log(`[Dynamic Discussion EXEC] Step 2: Fetching member details for ${guildId}`);
  const members = await fetchGuildMemberDetails(guildId, airtableBase);
  if (members.length === 0) {
    console.log(`[Dynamic Discussion EXEC] No members found for guild ${guildId}. Aborting.`);
    return;
  }
  const memberInfoForPrompt = members
    .map(m => `${m.username} (${m.firstName || ''} ${m.lastName || ''})`.trim())
    .join(', ');

  // 3. Construct prompt for Guild Master
  const tabName = kinOsChannelId.substring(guildId.length + 1).replace(/_/g, ' ');
  const masterPromptMessage = `[SYSTEM]A new message has been posted by ${originalSenderUsername} in the guild chat for channel "${tabName}" (Guild: ${guildDetails.guildName}). The message is: "${originalMessageContent}". Review the context and decide which guild member should respond to continue the discussion, or if no response is needed. Reply ONLY with a JSON object like: {"Username": "selected_username_here"} or {"Username": ""} if no one should respond or the topic is concluded.[/SYSTEM]`;
  const masterSystemContext = `You are the Gastaldo (Guild Master) for ${guildDetails.guildName}. Your task is to facilitate productive discussions in the guild chat. A new message has arrived. Your members are: ${memberInfoForPrompt}. The original sender ${originalSenderUsername} should not be selected to respond to their own message. Consider who is best suited or if the conversation should end.`;

  console.log(`[Dynamic Discussion EXEC] Step 3: Asking Gastaldo ${gastaldoUsername} for guild ${guildId}, channel ${kinOsChannelId}. Prompt: ${masterPromptMessage}`);

  try {
    console.log(`[Dynamic Discussion EXEC] Calling askKinOsForJsonDecision for Gastaldo ${gastaldoUsername}.`);
    const decisionResponse = await askKinOsForJsonDecision(
      gastaldoUsername,
      kinOsChannelId, // Master receives this in the same guild-tab channel
      masterPromptMessage,
      masterSystemContext
    );
    console.log(`[Dynamic Discussion EXEC] Received decision from Gastaldo ${gastaldoUsername}:`, decisionResponse);

    // decisionResponse is already parsed JSON from askKinOsForJsonDecision
    const selectedUsername = decisionResponse.Username;

    if (selectedUsername && typeof selectedUsername === 'string' && selectedUsername.trim() !== "") {
      console.log(`[Dynamic Discussion EXEC] Gastaldo selected username: '${selectedUsername}'`);
      if (selectedUsername === originalSenderUsername) {
        console.log(`[Dynamic Discussion EXEC] Gastaldo selected the original sender ${selectedUsername}. Ignoring to prevent self-reply loop.`);
        return;
      }
      if (!members.find(m => m.username === selectedUsername)) {
        console.log(`[Dynamic Discussion EXEC] Gastaldo selected ${selectedUsername}, who is not a current member of guild ${guildId}. Aborting directive.`);
        return;
      }

      console.log(`[Dynamic Discussion EXEC] Gastaldo ${gastaldoUsername} selected ${selectedUsername} to respond.`);

      // 4. Send directive to the selected user
      const userDirective = `[SYSTEM]The Guild Master, ${gastaldoUsername}, has selected you to contribute to the discussion in the guild chat for channel "${tabName}" (Guild: ${guildDetails.guildName}). The last message was from ${originalSenderUsername}: "${originalMessageContent}". Please review the conversation and share your point of view in the channel.[/SYSTEM]`;
      console.log(`[Dynamic Discussion EXEC] Step 4: Sending directive to selected user ${selectedUsername}. Directive: ${userDirective}`);
      
      await sendSystemDirectiveToKinOsChannel(
        selectedUsername,
        kinOsChannelId, // Selected user also gets this in the same guild-tab channel
        userDirective,
        originalSenderUsername,
        guildId
      );
      console.log(`[Dynamic Discussion EXEC] Directive sent to ${selectedUsername} for guild ${guildId}, channel ${kinOsChannelId}.`);

    } else {
      console.log(`[Dynamic Discussion EXEC] Gastaldo ${gastaldoUsername} decided no further response is needed or provided an empty/invalid selection. Selected: '${selectedUsername}'`);
    }
  } catch (error) {
    console.error(`[Dynamic Discussion EXEC] Error during interaction with Gastaldo ${gastaldoUsername} or subsequent steps:`, error);
  }
  console.log(`[Dynamic Discussion EXEC] Finished for ${guildId}, channel ${kinOsChannelId}.`);
}
