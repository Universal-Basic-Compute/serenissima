import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_USERS_TABLE = 'USERS';

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

export async function GET(request: Request) {
  try {
    // Initialize Airtable
    const base = initAirtable();
    
    // Fetch users from Airtable
    const records = await base(AIRTABLE_USERS_TABLE)
      .select({
        fields: ['Username', 'FirstName', 'LastName', 'CoatOfArmsImage'],
        sort: [{ field: 'Username', direction: 'asc' }]
      })
      .all();
    
    // Transform Airtable records to our user format
    const users = records.map(record => ({
      username: record.get('Username') as string,
      firstName: record.get('FirstName') as string || '',
      lastName: record.get('LastName') as string || '',
      coatOfArmsImage: record.get('CoatOfArmsImage') as string || null
    }));
    
    return NextResponse.json({
      success: true,
      users: users
    });
    
  } catch (error) {
    console.error('Error fetching users:', error);
    
    // Return a fallback with sample users
    const sampleUsers = [
      {
        username: 'compagno',
        firstName: 'Compagno',
        lastName: 'Bot',
        coatOfArmsImage: null
      },
      {
        username: 'marco_polo',
        firstName: 'Marco',
        lastName: 'Polo',
        coatOfArmsImage: null
      },
      {
        username: 'doge_venice',
        firstName: 'Doge',
        lastName: 'of Venice',
        coatOfArmsImage: null
      }
    ];
    
    return NextResponse.json({
      success: true,
      users: sampleUsers
    });
  }
}
