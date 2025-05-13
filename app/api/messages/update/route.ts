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
    const { messageId, type } = await request.json();
    
    if (!messageId || !type) {
      return NextResponse.json(
        { success: false, error: 'Message ID and type are required' },
        { status: 400 }
      );
    }
    
    try {
      // Initialize Airtable
      const base = initAirtable();
      
      // Update message in Airtable
      const record = await base(AIRTABLE_MESSAGES_TABLE).update(messageId, {
        'Type': type
      });
      
      return NextResponse.json({
        success: true,
        message: {
          messageId: record.id,
          type
        }
      });
      
    } catch (error) {
      console.error('Error updating message in Airtable:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update message in Airtable' },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Error updating message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update message' },
      { status: 500 }
    );
  }
}
