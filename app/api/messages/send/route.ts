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
    const { sender, receiver, content, type = 'message' } = await request.json();
    
    if (!sender || !receiver || !content) {
      return NextResponse.json(
        { success: false, error: 'Sender, receiver, and content are required' },
        { status: 400 }
      );
    }
    
    try {
      // Initialize Airtable
      const base = initAirtable();
      
      // Current timestamp for created time
      const createdAt = new Date().toISOString();
      
      // Create message in Airtable
      const record = await base(AIRTABLE_MESSAGES_TABLE).create({
        'Sender': sender,
        'Receiver': receiver,
        'Content': content,
        'Type': type,
        'CreatedAt': createdAt
      });
      
      return NextResponse.json({
        success: true,
        message: {
          messageId: record.id,
          sender,
          receiver,
          content,
          type,
          createdAt,
          readAt: null
        }
      });
      
    } catch (error) {
      console.error('Error creating message in Airtable:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to create message in Airtable' },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
