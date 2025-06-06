import { NextResponse } from 'next/server';
import Airtable, { FieldSet } from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_MESSAGES_TABLE = process.env.AIRTABLE_MESSAGES_TABLE || 'MESSAGES';

// Initialize Airtable
const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  return new Airtable({ apiKey: AIRTABLE_API_KEY, requestTimeout: 30000 }).base(AIRTABLE_BASE_ID);
};

// Helper to escape single quotes for Airtable formulas
const escapeAirtableValue = (value: string | number | boolean): string => {
  if (typeof value === 'string') {
    return value.replace(/'/g, "\\'");
  }
  return String(value);
};

import { NextRequest } from 'next/server'; // Import NextRequest

export async function GET(
  request: NextRequest, // Use NextRequest for better type safety
  context: { params: Promise<{ channelName: string }> }
) {
  const { channelName } = await context.params; // Await the params

  if (!channelName) {
    return NextResponse.json(
      { success: false, error: 'Channel name is required in the path.' },
      { status: 400 }
    );
  }

  try {
    const base = initAirtable();
    const filterFormula = `{Channel} = '${escapeAirtableValue(channelName)}'`;

    console.log(`[API Messages GET /channel/${channelName}] Fetching messages with formula: ${filterFormula}`);

    const records = await base(AIRTABLE_MESSAGES_TABLE)
      .select({
        filterByFormula: filterFormula,
        sort: [{ field: 'CreatedAt', direction: 'asc' }], // Sort by creation time
        // Consider adding maxRecords if needed, e.g., maxRecords: 200
      })
      .all();

    const messages = records.map(record => ({
      messageId: record.id, // Use Airtable record ID as messageId
      sender: record.get('Sender') as string,
      receiver: record.get('Receiver') as string,
      content: record.get('Content') as string,
      type: record.get('Type') as string || 'message',
      channel: record.get('Channel') as string || null,
      createdAt: record.get('CreatedAt') as string,
      readAt: record.get('ReadAt') as string || null,
      // Add any other fields you expect in the frontend
    }));

    return NextResponse.json({
      success: true,
      messages: messages,
    });

  } catch (error) {
    console.error(`[API Messages GET /channel/${channelName}] Error fetching messages:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { success: false, error: 'Failed to fetch messages for channel', details: errorMessage },
      { status: 500 }
    );
  }
}
