import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_MESSAGES_TABLE = process.env.AIRTABLE_MESSAGES_TABLE || 'MESSAGES';

// Initialize Airtable
const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  
  Airtable.configure({
    apiKey: AIRTABLE_API_KEY
  });
  
  return Airtable.base(AIRTABLE_BASE_ID);
};

export async function POST(request: Request) {
  try {
    // Parse the request body
    const { currentCitizen, otherCitizen } = await request.json();
    
    if (!currentCitizen || !otherCitizen) {
      return NextResponse.json(
        { success: false, error: 'Both citizens are required' },
        { status: 400 }
      );
    }
    
    try {
      // Initialize Airtable
      const base = initAirtable();
      
      // Build filter formula to get messages
      let filterFormula = '';

      if (currentCitizen === otherCitizen) {
        // Self-chat: Fetch messages where sender and receiver are the current citizen,
        // and any guild applications sent TO the current citizen.
        filterFormula = `OR(
          AND({Sender} = '${currentCitizen}', {Receiver} = '${currentCitizen}'),
          AND({Type} = 'guild_application', {Receiver} = '${currentCitizen}')
        )`;
      } else {
        // Chat with another citizen: Fetch messages between them,
        // and guild applications exchanged *between* them.
        filterFormula = `OR(
          AND({Sender} = '${currentCitizen}', {Receiver} = '${otherCitizen}'),
          AND({Sender} = '${otherCitizen}', {Receiver} = '${currentCitizen}'),
          AND({Type} = 'guild_application', {Sender} = '${currentCitizen}', {Receiver} = '${otherCitizen}'}),
          AND({Type} = 'guild_application', {Sender} = '${otherCitizen}', {Receiver} = '${currentCitizen}'})
        )`;
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
    const latest = searchParams.get('latest');

    if (!messageType) {
      return NextResponse.json(
        { success: false, error: 'Message type parameter is required' },
        { status: 400 }
      );
    }

    const base = initAirtable();
    let query = base(AIRTABLE_MESSAGES_TABLE).select({
      filterByFormula: `{Type} = '${messageType}'`,
      sort: [{ field: 'CreatedAt', direction: 'desc' }],
    });

    if (latest === 'true') {
      query = base(AIRTABLE_MESSAGES_TABLE).select({
        filterByFormula: `{Type} = '${messageType}'`,
        sort: [{ field: 'CreatedAt', direction: 'desc' }],
        maxRecords: 1,
      });
    }

    const records = await query.all();

    if (!records || records.length === 0) {
      return NextResponse.json(
        { success: true, message: null, error: 'No message found for the specified type.' },
        { status: 200 } // Or 404 if preferred, but 200 with null message is also common
      );
    }
    
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
      message: latest === 'true' ? message : records.map(record => ({ // Return array if not 'latest'
        messageId: record.id,
        sender: record.get('Sender') as string,
        receiver: record.get('Receiver') as string,
        content: record.get('Content') as string,
        type: record.get('Type') as string,
        createdAt: record.get('CreatedAt') as string,
        readAt: record.get('ReadAt') as string || null,
      }))
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
