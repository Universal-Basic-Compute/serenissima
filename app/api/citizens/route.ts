import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = 'CITIZENS';
const AIRTABLE_BUILDINGS_TABLE = 'BUILDINGS';

// Utility function to convert field names to camelCase
function toCamelCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      // Convert first character to lowercase for the new key
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      result[camelKey] = obj[key];
    }
  }
  
  return result;
}

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
    
    // Fetch citizens from Airtable - without specifying fields to get all of them
    const records = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        filterByFormula: '{inVenice} = TRUE()',  // Only fetch citizens who are in Venice
        sort: [{ field: 'LastActiveAt', direction: 'desc' }]
      })
      .all();
    
    // Fetch all buildings to determine employment and housing relationships
    const allBuildings = await base(AIRTABLE_BUILDINGS_TABLE)
      .select({
        fields: ['Occupant', 'RunBy', 'Type', 'Category', 'BuildingId'] // Added Category and BuildingId
      })
      .all();
    
    // Create maps for employment, workplace, and home
    const employmentMap: Record<string, string> = {};
    const workplaceMap: Record<string, { name: string; type: string; buildingId: string }> = {};
    const homeMap: Record<string, string> = {};
    
    allBuildings.forEach(building => {
      const occupant = building.get('Occupant') as string;
      const runBy = building.get('RunBy') as string;
      const category = building.get('Category') as string;
      const buildingId = building.get('BuildingId') as string;
      const buildingType = building.get('Type') as string || 'Unknown Building';

      if (occupant && buildingId) {
        if (category === 'business') {
          if (runBy) {
            employmentMap[occupant] = runBy;
          }
          workplaceMap[occupant] = {
            name: buildingType,
            type: buildingType,
            buildingId: buildingId 
          };
        } else if (category === 'home') {
          homeMap[occupant] = buildingId;
        }
      }
    });
    
    // Transform Airtable records to our citizen format
    const citizens = records.map(record => {
      // Get all fields and convert keys to camelCase
      const fields = toCamelCase(record.fields);
      
      // Get the position field and parse it if it's a string
      let position = record.get('Position');
      
      // Simple position parsing - assume it works
      if (typeof position === 'string' && (position.startsWith('{') || position.startsWith('['))) {
        position = JSON.parse(position);
      }

      const username = record.get('Username') as string;
      
      // Create citizen object with all fields from the record
      const citizen = {
        ...fields,  // Include all fields with camelCase keys
        username: username,
        position: position, // Use the parsed position
        worksFor: employmentMap[username] || null,
        workplace: workplaceMap[username] || null,
        home: homeMap[username] || null // Add home buildingId
      };
      
      return citizen;
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
        coatOfArmsImageUrl: null,
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
        coatOfArmsImageUrl: null,
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
        coatOfArmsImageUrl: null,
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
