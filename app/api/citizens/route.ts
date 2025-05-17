import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = 'CITIZENS';

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
    
    // Fetch citizens from Airtable
    const records = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        fields: ['Citizenname', 'FirstName', 'LastName', 'CoatOfArmsImage'],
        sort: [{ field: 'Citizenname', direction: 'asc' }]
      })
      .all();
    
    // Transform Airtable records to our citizen format
    const citizens = records.map(record => ({
      citizenname: record.get('Citizenname') as string,
      firstName: record.get('FirstName') as string || '',
      lastName: record.get('LastName') as string || '',
      coatOfArmsImage: record.get('CoatOfArmsImage') as string || null
    }));
    
    return NextResponse.json({
      success: true,
      citizens: citizens
    });
    
  } catch (error) {
    console.error('Error fetching citizens:', error);
    
    // Return a fallback with sample citizens
    const sampleCitizens = [
      {
        citizenname: 'compagno',
        firstName: 'Compagno',
        lastName: 'Bot',
        coatOfArmsImage: null
      },
      {
        citizenname: 'marco_polo',
        firstName: 'Marco',
        lastName: 'Polo',
        coatOfArmsImage: null
      },
      {
        citizenname: 'doge_venice',
        firstName: 'Doge',
        lastName: 'of Venice',
        coatOfArmsImage: null
      }
    ];
    
    return NextResponse.json({
      success: true,
      citizens: sampleCitizens
    });
  }
}
