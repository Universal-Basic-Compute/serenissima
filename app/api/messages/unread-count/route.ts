import { NextResponse, NextRequest } from 'next/server';
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
  
  // Initialize Airtable with requestTimeout
  return new Airtable({ apiKey: AIRTABLE_API_KEY, requestTimeout: 30000 }).base(AIRTABLE_BASE_ID);
};

export async function POST(request: NextRequest) {
  try {
    const { citizen } = await request.json();
    
    if (!citizen) {
      return NextResponse.json(
        { success: false, error: 'Citizen username is required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching unread message count for citizen: ${citizen}`);
    
    try {
      // Initialize Airtable
      const base = initAirtable();
      
      // Build filter formula to get unread messages for this citizen
      // Messages where the citizen is the receiver and ReadAt is empty
      const filterFormula = `AND({Receiver} = '${citizen}', {ReadAt} = '')`;
      
      console.log(`Airtable filter formula for unread messages count: ${filterFormula}`);
      
      // Fetch unread messages from Airtable
      const records = await base(AIRTABLE_MESSAGES_TABLE)
        .select({
          filterByFormula: filterFormula,
          fields: ['Receiver'] // We only need one field to count records
        })
        .all();
      
      const unreadMessagesCount = records.length;
      console.log(`Found ${unreadMessagesCount} unread messages for ${citizen}`);
      
      return NextResponse.json({
        success: true,
        unreadMessagesCount
      });
      
    } catch (error) {
      console.error('Error fetching unread messages from Airtable:', error);
      
      return NextResponse.json({
        success: true,
        unreadMessagesCount: 0, // Fallback to 0 on error
        _fallback: true
      });
    }
    
  } catch (error) {
    console.error('Error processing unread message count request:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch unread message count',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
