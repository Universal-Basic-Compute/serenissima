import { NextResponse, NextRequest } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';
const AIRTABLE_BUILDINGS_TABLE = process.env.AIRTABLE_BUILDINGS_TABLE || 'BUILDINGS';
const AIRTABLE_GUILDS_TABLE = process.env.AIRTABLE_GUILDS_TABLE || 'GUILDS'; // Added GUILDS table

// Cache for citizen data to reduce Airtable API calls
const citizenCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Utility function to convert field names to camelCase
function toCamelCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      // Convert first character to lowercase for the new key
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      result[camelKey] = obj[key];
    }
  }
  
  return result;
}

const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  return new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await context.params;

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
      // Remove the fields parameter to fetch all fields
      return await base(AIRTABLE_CITIZENS_TABLE)
        .select({
          filterByFormula: `{${field}} = "${value}"`,
          // No fields parameter here to get all fields
        })
        .firstPage();
    };

    let records = await queryCitizen('Username', username);

    if (!records.length && username.startsWith('0x')) {
      records = await queryCitizen('Wallet', username);
    }

    if (records.length > 0) {
      const record = records[0];
      
      // Get all fields from the record and convert keys to camelCase
      const camelCaseFields = toCamelCase(record.fields);

      // Resolve GuildId
      // Assumes 'Guild' is the linked record field name in CITIZENS table.
      // It would contain an array of Airtable Record IDs from the GUILDS table.
      const linkedGuildAirtableIds = record.fields.Guild as string[] | undefined;

      if (linkedGuildAirtableIds && Array.isArray(linkedGuildAirtableIds) && linkedGuildAirtableIds.length > 0) {
        const guildAirtableRecordId = linkedGuildAirtableIds[0];
        try {
          const guildRecord = await base(AIRTABLE_GUILDS_TABLE).find(guildAirtableRecordId);
          if (guildRecord && guildRecord.fields.GuildId) {
            camelCaseFields.guildId = guildRecord.fields.GuildId as string; // This is the string ID like "umbra_lucrum_invenit"
          } else {
            console.warn(`Guild record ${guildAirtableRecordId} found, but no GuildId field for citizen ${username}.`);
            camelCaseFields.guildId = null;
          }
        } catch (guildError) {
          console.error(`Error fetching guild details for citizen ${username}, guild record ID ${guildAirtableRecordId}:`, guildError);
          camelCaseFields.guildId = null;
        }
      } else {
        // If 'Guild' (linked field) was part of record.fields, toCamelCase would create 'guild'.
        // We want to ensure the final field is 'guildId' (string) or null.
        if ('guild' in camelCaseFields) {
          delete camelCaseFields.guild; // Remove the original linked record ID array if it was named 'Guild'
        }
        camelCaseFields.guildId = null;
      }
      
      // Ensure 'username' is present from the primary 'Username' Airtable field
      if (record.fields.Username && !camelCaseFields.username) {
        camelCaseFields.username = record.fields.Username as string;
      }
      
      // Parse position if it's a string
      // Assuming the JSON string itself uses camelCase keys e.g., {"lat": ..., "lng": ...}
      if (typeof camelCaseFields.position === 'string' && 
          (camelCaseFields.position.startsWith('{') || camelCaseFields.position.startsWith('['))) {
        try {
          camelCaseFields.position = JSON.parse(camelCaseFields.position);
        } catch (error) {
          console.error('Error parsing position:', error);
          // Keep it as a string if parsing fails
        }
      }

      // Parse CorePersonality
      if (typeof camelCaseFields.corePersonality === 'string') {
        try {
          const parsed = JSON.parse(camelCaseFields.corePersonality);
          if (Array.isArray(parsed) && parsed.length === 3 && parsed.every(item => typeof item === 'string')) {
            camelCaseFields.corePersonality = parsed;
          } else {
            console.warn(`CorePersonality for citizen ${username} is not a valid 3-string array: ${camelCaseFields.corePersonality}`);
            camelCaseFields.corePersonality = null; // Set to null if not valid
          }
        } catch (e) {
          console.warn(`Failed to parse CorePersonality for citizen ${username}: ${camelCaseFields.corePersonality}`, e);
          camelCaseFields.corePersonality = null; // Set to null on parsing error
        }
      } else if (camelCaseFields.corePersonality !== undefined && !Array.isArray(camelCaseFields.corePersonality)) {
        // If it exists but is not a string and not an array, it's an invalid format.
        console.warn(`CorePersonality for citizen ${username} has an unexpected format:`, camelCaseFields.corePersonality);
        camelCaseFields.corePersonality = null;
      }
      
      // Add default values for worksFor and workplace
      camelCaseFields.worksFor = null;
      camelCaseFields.workplace = null;

      // Find buildings where this citizen is an occupant
      try {
        const buildingRecords = await base(AIRTABLE_BUILDINGS_TABLE)
          .select({
            filterByFormula: `AND({Occupant} = "${camelCaseFields.username}", {Category} = "business")`,
            fields: ['RunBy', 'Name', 'Type']
          })
          .firstPage();

        if (buildingRecords.length > 0) {
          const building = buildingRecords[0];
          const runBy = building.get('RunBy') as string;
          
          if (runBy) {
            camelCaseFields.worksFor = runBy;
            
            // Add workplace details
            camelCaseFields.workplace = {
              name: building.get('Name') as string || '',
              type: building.get('Type') as string || ''
            };
          }
        }
      } catch (error) {
        console.error('Error fetching building data:', error);
        // Continue without the worksFor data if there's an error
      }

      citizenCache.set(username, { data: camelCaseFields, timestamp: now });

      return NextResponse.json({ success: true, citizen: camelCaseFields });
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
