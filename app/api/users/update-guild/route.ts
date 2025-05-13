import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_USERS_TABLE = process.env.AIRTABLE_USERS_TABLE || 'USERS';

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
    const { username, guildId, status = 'pending' } = await request.json();
    
    if (!username || !guildId) {
      return NextResponse.json(
        { success: false, error: 'Username and guildId are required' },
        { status: 400 }
      );
    }
    
    try {
      // Initialize Airtable
      const base = initAirtable();
      
      // Find the user record
      const userRecords = await base(AIRTABLE_USERS_TABLE).select({
        filterByFormula: `{UserName} = '${username}'`
      }).all();
      
      if (userRecords.length === 0) {
        return NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 404 }
        );
      }
      
      const userRecord = userRecords[0];
      
      // Update user's guild membership
      await base(AIRTABLE_USERS_TABLE).update(userRecord.id, {
        'GuildId': guildId,
        'GuildStatus': status
      });
      
      return NextResponse.json({
        success: true,
        user: {
          username,
          guildId,
          guildStatus: status
        }
      });
      
    } catch (error) {
      console.error('Error updating user guild in Airtable:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update user guild in Airtable' },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Error updating user guild:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update user guild' },
      { status: 500 }
    );
  }
}
