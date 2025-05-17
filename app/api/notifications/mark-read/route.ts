import { NextResponse } from 'next/server';
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

export async function POST(request: Request) {
  try {
    // Parse the request body
    const { citizen, notificationIds } = await request.json();
    
    if (!citizen || !notificationIds || !Array.isArray(notificationIds)) {
      return NextResponse.json(
        { success: false, error: 'Citizen and notification IDs array are required' },
        { status: 400 }
      );
    }
    
    console.log(`Marking notifications as read for citizen: ${citizen}, notifications: ${notificationIds.join(', ')}`);
    
    try {
      // Initialize Airtable
      const base = initAirtable();
      
      // Current timestamp for read time
      const readAt = new Date().toISOString();
      
      // Update each notification in Airtable
      const updatePromises = notificationIds.map(notificationId => {
        return base(AIRTABLE_NOTIFICATIONS_TABLE).update(notificationId, {
          'ReadAt': readAt
        });
      });
      
      // Wait for all updates to complete
      await Promise.all(updatePromises);
      
      return NextResponse.json({
        success: true,
        message: 'Notifications marked as read successfully'
      });
      
    } catch (error) {
      console.error('Error marking notifications as read in Airtable:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to mark notifications as read in Airtable' },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to mark notifications as read' },
      { status: 500 }
    );
  }
}
