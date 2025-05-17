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
        fields: [
          'Username', 
          'FirstName', 
          'LastName', 
          'CoatOfArmsImage',
          'IsAi',
          'Ducats',
          'SocialClass',
          'Description',
          'Position',
          'Prestige',
          'Wallet',
          'FamilyMotto',
          'Color',
          'GuildId',
          'Preferences',
          'LastActiveAt'
        ],
        sort: [{ field: 'LastActiveAt', direction: 'desc' }]
      })
      .all();
    
    // Transform Airtable records to our citizen format
    const citizens = records.map(record => {
      // Get the position field and try to parse it if it's a string
      let position = record.get('Position') as string || '';
      try {
        // If position is a string that looks like JSON, parse it
        if (typeof position === 'string' && (position.startsWith('{') || position.startsWith('['))) {
          position = JSON.parse(position);
        }
      } catch (error) {
        console.error('Error parsing position for citizen:', record.get('Username'), error);
        // Keep it as a string if parsing fails
      }

      return {
        username: record.get('Username') as string,
        firstName: record.get('FirstName') as string || '',
        lastName: record.get('LastName') as string || '',
        coatOfArmsImage: record.get('CoatOfArmsImage') as string || null,
        isAi: record.get('IsAi') as boolean || false,
        Ducats: record.get('Ducats') as number || 0,
        socialClass: record.get('SocialClass') as string || '',
        description: record.get('Description') as string || '',
        position: position, // Now this will be a parsed JSON object if valid
        prestige: record.get('Prestige') as number || 0,
        wallet: record.get('Wallet') as string || '',
        familyMotto: record.get('FamilyMotto') as string || '',
        color: record.get('Color') as string || '',
        guildId: record.get('GuildId') as string || null,
        preferences: record.get('Preferences') as object || {}
      };
    });
    
    return NextResponse.json({
      success: true,
      citizens: citizens
    });
    
  } catch (error) {
    console.error('Error fetching citizens:', error);
    
    // Return a fallback with sample citizens
    const sampleCitizens = [
      {
        username: 'compagno',
        firstName: 'Compagno',
        lastName: 'Bot',
        coatOfArmsImage: null,
        isAi: true,
        socialClass: 'Servant',
        description: 'A helpful Venetian guide',
        position: {"lat": 45.4371, "lng": 12.3326}, // Properly formatted as object
        prestige: 0,
        wallet: '',
        familyMotto: 'At your service',
        color: '#FFC107',
        guildId: null,
        preferences: {}
      },
      {
        username: 'marco_polo',
        firstName: 'Marco',
        lastName: 'Polo',
        coatOfArmsImage: null,
        isAi: true,
        socialClass: 'Merchant',
        description: 'Famous Venetian merchant and explorer',
        position: {"lat": 45.4380, "lng": 12.3350}, // Example position
        prestige: 100,
        wallet: '',
        familyMotto: 'The world awaits',
        color: '#2196F3',
        guildId: 'merchants',
        preferences: {}
      },
      {
        username: 'doge_venice',
        firstName: 'Doge',
        lastName: 'of Venice',
        coatOfArmsImage: null,
        isAi: true,
        socialClass: 'Noble',
        description: 'The elected leader of Venice',
        position: {"lat": 45.4337, "lng": 12.3390}, // Example position for Doge's Palace
        prestige: 1000,
        wallet: '',
        familyMotto: 'For the glory of Venice',
        color: '#9C27B0',
        guildId: 'council',
        preferences: {}
      }
    ];
    
    return NextResponse.json({
      success: true,
      citizens: sampleCitizens
    });
  }
}
