import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = 'CITIZENS';
const AIRTABLE_BUILDINGS_TABLE = 'BUILDINGS';

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
          'LastActiveAt',
          'CreatedAt',  // Add CreatedAt field
          'UpdatedAt'   // Add UpdatedAt field
        ],
        filterByFormula: '{inVenice} = TRUE()',  // Only fetch citizens who are in Venice
        sort: [{ field: 'LastActiveAt', direction: 'desc' }]
      })
      .all();
    
    // Fetch all business buildings to determine employment relationships
    const businessBuildings = await base(AIRTABLE_BUILDINGS_TABLE)
      .select({
        fields: ['Occupant', 'RunBy', 'Type'],
        filterByFormula: '{Category} = "business"'
      })
      .all();
    
    // Create a map of occupant to employer (RunBy)
    const employmentMap = {};
    const workplaceMap = {};
    
    businessBuildings.forEach(building => {
      const occupant = building.get('Occupant') as string;
      const runBy = building.get('RunBy') as string;
      
      if (occupant && runBy) {
        employmentMap[occupant] = runBy;
        workplaceMap[occupant] = {
          name: building.get('Type') as string || 'Unknown Building',
          type: building.get('Type') as string
        };
      }
    });
    
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

      const username = record.get('Username') as string;
      
      return {
        username: username,
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
        preferences: record.get('Preferences') as object || {},
        createdAt: record.get('CreatedAt') as string || null,  // Add createdAt field
        updatedAt: record.get('UpdatedAt') as string || null,   // Add updatedAt field
        worksFor: employmentMap[username] || null,
        workplace: workplaceMap[username] || null
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
        preferences: {},
        createdAt: new Date().toISOString(),  // Add createdAt field
        updatedAt: new Date().toISOString(),   // Add updatedAt field
        worksFor: null,
        workplace: null
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
        preferences: {},
        createdAt: new Date(Date.now() - 86400000).toISOString(),  // 1 day ago
        updatedAt: new Date(Date.now() - 3600000).toISOString(),    // 1 hour ago
        worksFor: null,
        workplace: null
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
        preferences: {},
        createdAt: new Date(Date.now() - 31536000000).toISOString(),  // 1 year ago
        updatedAt: new Date(Date.now() - 604800000).toISOString(),     // 1 week ago
        worksFor: null,
        workplace: null
      }
    ];
    
    return NextResponse.json({
      success: true,
      citizens: sampleCitizens
    });
  }
}
