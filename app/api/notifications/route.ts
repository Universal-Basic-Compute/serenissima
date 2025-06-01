import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_NOTIFICATIONS_TABLE = process.env.AIRTABLE_NOTIFICATIONS_TABLE || 'NOTIFICATIONS';

// Helper function to convert object keys to PascalCase
function keysToPascalCase(obj: Record<string, any>): Record<string, any> {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(keysToPascalCase);
  }
  return Object.keys(obj).reduce((acc, key) => {
    const pascalKey = key.charAt(0).toUpperCase() + key.slice(1);
    acc[pascalKey] = keysToPascalCase(obj[key]);
    return acc;
  }, {} as Record<string, any>);
}

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
    apiKey: AIRTABLE_API_KEY,
    requestTimeout: 60000 // 60 seconds timeout
  });
  
  return Airtable.base(AIRTABLE_BASE_ID);
};

// Get notifications for a citizen
export async function POST(request: Request) {
  try {
    // Parse the request body
    const rawBody = await request.json();
    const body = keysToPascalCase(rawBody); // Convert keys to PascalCase
    
    const citizen = body.Citizen; // Use PascalCase key
    const since = body.Since; // Use PascalCase key

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
      ? (typeof since === 'number' ? new Date(since).toISOString() : String(since))
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
        details: (() => {
          const detailsString = record.get('Details') as string;
          if (detailsString) {
            try {
              return JSON.parse(detailsString);
            } catch (e) {
              console.warn(`[DEBUG] Failed to parse Details JSON for notification ID ${record.id}:`, detailsString, e);
              // Optionally, return the raw string or a specific error object
              // For now, returning undefined as per original logic for missing details
              return undefined; 
            }
          }
          return undefined;
        })(),
        createdAt: record.get('CreatedAt') as string,
        readAt: record.get('ReadAt') as string || null
      }));
      
      console.log('\x1b[35m%s\x1b[0m', `[DEBUG] Returning ${notifications.length} notifications`);
      
      return NextResponse.json({
        success: true,
        notifications: notifications
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('\x1b[35m%s\x1b[0m', '[DEBUG] Error fetching notifications from Airtable:', errorMessage);
      
      // Return an error response instead of fallback data
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch notifications from Airtable',
        details: errorMessage,
        notifications: [] // Ensure notifications is an empty array on error
      }, { status: 500 }); // It's an internal server error if Airtable fetch fails
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\x1b[35m%s\x1b[0m', '[DEBUG] Error processing notifications request:', errorMessage);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process notifications request',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
