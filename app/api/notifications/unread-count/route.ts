import { NextResponse, NextRequest } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_NOTIFICATIONS_TABLE = process.env.AIRTABLE_NOTIFICATIONS_TABLE || 'NOTIFICATIONS';

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

export async function POST(request: NextRequest) {
  try {
    const { citizen } = await request.json();
    
    if (!citizen) {
      return NextResponse.json(
        { success: false, error: 'Citizen username is required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching unread notification count for citizen: ${citizen}`);
    
    try {
      // Initialize Airtable
      const base = initAirtable();
      
      // Build filter formula to get unread notifications for this citizen
      const filterFormula = `AND({Citizen} = '${citizen}', {ReadAt} = '')`;
      
      console.log(`Airtable filter formula for unread count: ${filterFormula}`);
      
      // Fetch unread notifications from Airtable
      const records = await base(AIRTABLE_NOTIFICATIONS_TABLE)
        .select({
          filterByFormula: filterFormula,
          fields: ['Citizen'] // We only need one field to count records
        })
        .all();
      
      const unreadCount = records.length;
      console.log(`Found ${unreadCount} unread notifications for ${citizen}`);
      
      return NextResponse.json({
        success: true,
        unreadCount
      });
      
    } catch (error) {
      console.error('Error fetching unread notifications from Airtable:', error);
      
      // Fallback to a default response if Airtable fetch fails
      console.log(`Creating fallback unread count response`);
      
      return NextResponse.json({
        success: true,
        unreadCount: 0,
        _fallback: true
      });
    }
    
  } catch (error) {
    console.error('Error processing unread notification count request:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch unread notification count',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
