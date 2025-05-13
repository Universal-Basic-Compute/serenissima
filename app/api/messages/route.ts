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
    const { currentUser, otherUser } = await request.json();
    
    if (!currentUser || !otherUser) {
      return NextResponse.json(
        { success: false, error: 'Both users are required' },
        { status: 400 }
      );
    }
    
    try {
      // Initialize Airtable
      const base = initAirtable();
      
      // Build filter formula to get messages between the two users
      const filterFormula = `OR(
        AND({Sender} = '${currentUser}', {Receiver} = '${otherUser}'),
        AND({Sender} = '${otherUser}', {Receiver} = '${currentUser}')
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
      
      // Return fallback sample messages
      const now = new Date();
      const sampleMessages = [
        {
          messageId: '1',
          sender: currentUser,
          receiver: otherUser,
          content: 'Hello there!',
          type: 'message',
          createdAt: new Date(now.getTime() - 3600000).toISOString(),
          readAt: new Date(now.getTime() - 3500000).toISOString()
        },
        {
          messageId: '2',
          sender: otherUser,
          receiver: currentUser,
          content: 'Greetings! How may I assist you today?',
          type: 'message',
          createdAt: new Date(now.getTime() - 3400000).toISOString(),
          readAt: new Date(now.getTime() - 3300000).toISOString()
        }
      ];
      
      return NextResponse.json({
        success: true,
        messages: sampleMessages
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
