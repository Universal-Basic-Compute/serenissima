import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';

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
      
      // Find the citizen record
      const citizenRecords = await base(AIRTABLE_CITIZENS_TABLE).select({
        filterByFormula: `{Username} = '${username}'`
      }).all();
      
      if (citizenRecords.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Citizen not found' },
          { status: 404 }
        );
      }
      
      const citizenRecord = citizenRecords[0];
      
      // Update citizen's guild membership
      await base(AIRTABLE_CITIZENS_TABLE).update(citizenRecord.id, {
        'GuildId': guildId
        // 'GuildStatus' field removed as it doesn't exist in the Airtable table
      });
      
      return NextResponse.json({
        success: true,
        citizen: {
          username,
          guildId,
          guildStatus: status
        }
      });
      
    } catch (error) {
      console.error('Error updating citizen guild in Airtable:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update citizen guild in Airtable' },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Error updating citizen guild:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update citizen guild' },
      { status: 500 }
    );
  }
}
