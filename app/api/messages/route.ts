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
      
      // Build filter formula to get messages between the two citizens
      // Include guild application messages if the otherCitizen is a guild ID
      const filterFormula = `OR(
        AND({Sender} = '${currentCitizen}', {Receiver} = '${otherCitizen}'),
        AND({Sender} = '${otherCitizen}', {Receiver} = '${currentCitizen}'),
        AND({Type} = 'guild_application', {Receiver} = '${currentCitizen}'),
        AND({Type} = 'guild_application', {Sender} = '${currentCitizen}', {Receiver} = '${otherCitizen}')
      )`;
      
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
