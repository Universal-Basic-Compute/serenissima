import { NextResponse } from 'next/server';
import Airtable, { FieldSet } from 'airtable'; // Ajout de FieldSet

// Helper to convert a string to PascalCase
// Handles snake_case, camelCase, and kebab-case
const stringToPascalCase = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/([-_][a-z])/ig, ($1) => $1.toUpperCase().replace('-', '').replace('_', ''))
    .replace(/^(.)/, ($1) => $1.toUpperCase());
};

// Helper function to convert all keys of an object to PascalCase (shallow)
const keysToPascalCase = (obj: Record<string, any>): Record<string, any> => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [stringToPascalCase(key), value])
  );
};

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_MESSAGES_TABLE = process.env.AIRTABLE_MESSAGES_TABLE || 'MESSAGES';

// Initialize Airtable
const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  
  // Initialize Airtable with requestTimeout
  return new Airtable({ apiKey: AIRTABLE_API_KEY, requestTimeout: 30000 }).base(AIRTABLE_BASE_ID);
};

// Helper to escape single quotes for Airtable formulas
const escapeAirtableValue = (value: string | number | boolean): string => {
  if (typeof value === 'string') {
    return value.replace(/'/g, "\\'");
  }
  return String(value);
};

export async function POST(request: Request) {
  try {
    // Parse the request body
    const rawBody = await request.json();
    const body = keysToPascalCase(rawBody); // Convert keys to PascalCase

    const currentCitizen = body.CurrentCitizen; // Use PascalCase key
    const otherCitizen = body.OtherCitizen; // Use PascalCase key
    const channel = body.Channel; // Extract Channel

    if (!currentCitizen) {
      return NextResponse.json(
        { success: false, error: 'currentCitizen is required' },
        { status: 400 }
      );
    }
    
    try {
      // Initialize Airtable
      const base = initAirtable();
      
      // Build filter formula to get messages
      let filterFormula = '';

      if (channel) {
        // If channel is provided, it's the primary filter.
        filterFormula = `{Channel} = '${escapeAirtableValue(channel)}'`;
        console.log(`[API Messages POST] Filtering by channel: ${channel}`);
      } else {
        // Fallback to old logic if no channel is provided in the request
        if (!otherCitizen) { // otherCitizen becomes required if no channel
            return NextResponse.json(
                { success: false, error: 'otherCitizen is required when channel is not provided' },
                { status: 400 }
            );
        }
        console.log(`[API Messages POST] Filtering by sender/receiver: ${currentCitizen}, ${otherCitizen} (no channel provided)`);
        if (currentCitizen === otherCitizen) {
          // Self-chat: Fetch messages where sender and receiver are the current citizen,
          // and any guild applications sent TO the current citizen.
          // This will fetch messages regardless of whether they have a Channel field or not.
          filterFormula = `OR(
            AND({Sender} = '${escapeAirtableValue(currentCitizen)}', {Receiver} = '${escapeAirtableValue(currentCitizen)}'),
            AND({Type} = 'guild_application', {Receiver} = '${escapeAirtableValue(currentCitizen)}')
          )`;
        } else {
          // Chat with another citizen: Fetch messages between them,
          // and guild applications exchanged *between* them.
          // This will fetch messages regardless of whether they have a Channel field or not.
          filterFormula = `OR(
            AND({Sender} = '${escapeAirtableValue(currentCitizen)}', {Receiver} = '${escapeAirtableValue(otherCitizen)}'),
            AND({Sender} = '${escapeAirtableValue(otherCitizen)}', {Receiver} = '${escapeAirtableValue(currentCitizen)}'),
            AND({Type} = 'guild_application', {Sender} = '${escapeAirtableValue(currentCitizen)}', {Receiver} = '${escapeAirtableValue(otherCitizen)}'}),
            AND({Type} = 'guild_application', {Sender} = '${escapeAirtableValue(otherCitizen)}', {Receiver} = '${escapeAirtableValue(currentCitizen)}'})
          )`;
        }
      }
      
      // Fetch messages from Airtable
      const records = await base(AIRTABLE_MESSAGES_TABLE)
        .select({
          filterByFormula: filterFormula,
          sort: [{ field: 'CreatedAt', direction: 'asc' }],
          maxRecords: 100 // Limit to last 100 messages
        })
        .all();
      
      // Transform Airtable records to our message format
      const messages = records.map(record => ({
        messageId: record.id,
        sender: record.get('Sender') as string,
        receiver: record.get('Receiver') as string,
        content: record.get('Content') as string,
        type: record.get('Type') as string || 'message',
        createdAt: record.get('CreatedAt') as string,
        readAt: record.get('ReadAt') as string || null
      }));
      
      return NextResponse.json({
        success: true,
        messages: messages
      });
      
    } catch (error) {
      console.error('Error fetching messages from Airtable:', error);
      
      // Return empty array instead of fallback messages
      return NextResponse.json({
        success: true,
        messages: []
      });
    }
    
  } catch (error) {
    console.error('Error processing messages request:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const messageType = searchParams.get('type');
    const receiverId = searchParams.get('receiver'); // New parameter
    const latest = searchParams.get('latest');

    // Message type is no longer required
    // if (!messageType) {
    //   return NextResponse.json(
    //     { success: false, error: 'Message type parameter is required' },
    //     { status: 400 }
    //   );
    // }

    const base = initAirtable();
    let filterConditions = [];

    if (messageType) {
      filterConditions.push(`{Type} = '${messageType}'`);
    }

    if (receiverId) {
      filterConditions.push(`{Receiver} = '${receiverId}'`);
    }

    const filterFormula = filterConditions.length > 0 ? `AND(${filterConditions.join(', ')})` : '';
    
    console.log(`[API Messages GET] Filter formula: ${filterFormula}`);

    let queryOptions: Airtable.SelectOptions<FieldSet> = { // Ajout de <FieldSet>
      filterByFormula: filterFormula,
      sort: [{ field: 'CreatedAt', direction: 'asc' }], // Changed to asc for chat history
    };

    if (latest === 'true') {
      queryOptions.maxRecords = 1;
      queryOptions.sort = [{ field: 'CreatedAt', direction: 'desc' }]; // For latest, desc is fine
    } else {
      // Potentially limit number of messages for a chat history
      // queryOptions.maxRecords = 100; // Example: Load last 100 messages
    }

    const records = await base(AIRTABLE_MESSAGES_TABLE).select(queryOptions).all();

    if (!records || records.length === 0) {
      return NextResponse.json(
        { success: true, message: null, messages: [], error: 'No messages found matching the criteria.' }, // Return empty messages array
        { status: 200 }
      );
    }
    
    // If 'latest' is true, return only the first record (which is the latest due to sort order)
    if (latest === 'true') {
      const message = {
        messageId: records[0].id,
        sender: records[0].get('Sender') as string,
        receiver: records[0].get('Receiver') as string,
        content: records[0].get('Content') as string,
        type: records[0].get('Type') as string,
        createdAt: records[0].get('CreatedAt') as string,
        readAt: records[0].get('ReadAt') as string || null,
      };
      return NextResponse.json({
        success: true,
        message: message 
      });
    }
    
    // If not 'latest', return all fetched records
    const allMessages = records.map(record => ({
      messageId: records[0].id,
      sender: records[0].get('Sender') as string,
      receiver: records[0].get('Receiver') as string,
      content: records[0].get('Content') as string,
      type: record.get('Type') as string,
      createdAt: record.get('CreatedAt') as string,
      readAt: record.get('ReadAt') as string || null,
    }));

    return NextResponse.json({
      success: true,
      messages: allMessages // Return array of all messages
    });

  } catch (error) {
    console.error('Error fetching message by type:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { success: false, error: 'Failed to fetch message', details: errorMessage },
      { status: 500 }
    );
  }
}
