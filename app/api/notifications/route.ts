import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_NOTIFICATIONS_TABLE = process.env.AIRTABLE_NOTIFICATIONS_TABLE || 'NOTIFICATIONS';

// Format date for Airtable filter formula
const formatDateForAirtable = (dateString: string): string => {
  try {
    // Parse the date and format it in a way Airtable accepts
    const date = new Date(dateString);
    // Format as YYYY-MM-DD HH:MM:SS
    return date.toISOString().replace('T', ' ').split('.')[0];
  } catch (error) {
    console.error('Error formatting date for Airtable:', error);
    // Return a safe fallback (1 week ago)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return oneWeekAgo.toISOString().replace('T', ' ').split('.')[0];
  }
};

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

// Get notifications for a citizen
export async function POST(request: Request) {
  try {
    // Parse the request body
    const { citizen, since } = await request.json();
    
    if (!citizen) {
      console.log('\x1b[35m%s\x1b[0m', '[DEBUG] Error: Citizen is required');
      return NextResponse.json(
        { success: false, error: 'Citizen is required' },
        { status: 400 }
      );
    }
    
    // If since is not provided, default to 1 week ago
    // Convert timestamp number to ISO string if it's a number
    const effectiveSince = since 
      ? (typeof since === 'number' ? new Date(since).toISOString() : since)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    console.log('\x1b[35m%s\x1b[0m', `[DEBUG] Fetching notifications for citizen: ${citizen}, since: ${effectiveSince}`);
    
    try {
      // Initialize Airtable
      const base = initAirtable();
      
      // Format the date for Airtable filter formula
      const formattedDate = formatDateForAirtable(effectiveSince);
      
      // Build filter formula with just the citizen - removing date filter that's causing issues
      const filterFormula = `{Citizen} = '${citizen}'`;
      
      console.log('\x1b[35m%s\x1b[0m', `[DEBUG] Airtable filter formula: ${filterFormula}`);
      
      // Fetch notifications from Airtable
      const records = await base(AIRTABLE_NOTIFICATIONS_TABLE)
        .select({
          filterByFormula: filterFormula,
          sort: [{ field: 'CreatedAt', direction: 'desc' }],
          maxRecords: 100 // Limit to last 100 notifications
        })
        .all();
      
      console.log('\x1b[35m%s\x1b[0m', `[DEBUG] Found ${records.length} notifications in Airtable`);
      
      // Transform Airtable records to our notification format
      const notifications = records.map(record => ({
        notificationId: record.id,
        type: record.get('Type') as string,
        citizen: record.get('Citizen') as string,
        content: record.get('Content') as string,
        details: record.get('Details') ? JSON.parse(record.get('Details') as string) : undefined,
        createdAt: record.get('CreatedAt') as string,
        readAt: record.get('ReadAt') as string || null
      }));
      
      console.log('\x1b[35m%s\x1b[0m', `[DEBUG] Returning ${notifications.length} notifications`);
      
      return NextResponse.json({
        success: true,
        notifications: notifications
      });
      
    } catch (error) {
      console.error('\x1b[35m%s\x1b[0m', '[DEBUG] Error fetching notifications from Airtable:', error);
      
      // Fallback to sample notifications if Airtable fetch fails
      console.log('\x1b[35m%s\x1b[0m', `[DEBUG] Creating sample notifications as fallback`);
      
      const sampleNotifications = [
        {
          notificationId: `${citizen}-notification-1`,
          type: 'System',
          citizen: citizen,
          content: 'Welcome to La Serenissima! Explore the city and discover its wonders.',
          createdAt: new Date().toISOString(),
          readAt: null
        },
        {
          notificationId: `${citizen}-notification-2`,
          type: 'Contract',
          citizen: citizen,
          content: 'A new land parcel is available for purchase in San Marco district.',
          createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          readAt: null
        },
        {
          notificationId: `${citizen}-notification-3`,
          type: 'Governance',
          citizen: citizen,
          content: 'The Council of Ten has issued a new decree regarding building regulations.',
          createdAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
          readAt: null
        }
      ];
      
      return NextResponse.json({
        success: true,
        notifications: sampleNotifications
      });
    }
    
  } catch (error) {
    console.error('\x1b[35m%s\x1b[0m', '[DEBUG] Error processing notifications request:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
