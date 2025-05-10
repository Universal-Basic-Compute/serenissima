import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

const BUILDINGS_TABLE = 'Buildings';
const CITIZENS_TABLE = 'CITIZENS';

export async function GET(request: Request) {
  try {
    console.log('Fetching citizens with houses from Airtable...');
    
    // Get buildings where Occupant is not null
    const buildingRecords = await base(BUILDINGS_TABLE)
      .select({
        filterByFormula: 'NOT({Occupant} = "")',
        view: 'Grid view'
      })
      .firstPage();
    
    console.log(`Found ${buildingRecords.length} buildings with occupants`);
    
    // Extract citizen IDs from buildings
    const citizenIds = buildingRecords.map(record => record.fields.Occupant).filter(Boolean);
    
    if (citizenIds.length === 0) {
      console.log('No citizens found in buildings, returning debug citizens');
      return NextResponse.json(getDebugCitizens());
    }
    
    // Create a formula to find citizens by ID
    const formula = `OR(${citizenIds.map(id => `{CitizenId} = '${id}'`).join(', ')})`;
    
    // Fetch citizens from Airtable
    const citizenRecords = await base(CITIZENS_TABLE)
      .select({
        filterByFormula: formula,
        view: 'Grid view'
      })
      .firstPage();
    
    console.log(`Retrieved ${citizenRecords.length} citizens from Airtable`);
    
    // Create a map of citizens by ID
    const citizenMap = new Map();
    citizenRecords.forEach(record => {
      citizenMap.set(record.fields.CitizenId, {
        id: record.fields.CitizenId,
        name: `${record.fields.FirstName} ${record.fields.LastName}`,
        firstName: record.fields.FirstName,
        lastName: record.fields.LastName,
        socialClass: record.fields.SocialClass,
        description: record.fields.Description,
        imageUrl: record.fields.ImageUrl,
        wealth: record.fields.Wealth,
        home: record.fields.Home,
        work: record.fields.Work
      });
    });
    
    // Map buildings to citizens with positions
    const citizens = buildingRecords.map(record => {
      const citizenId = record.fields.Occupant;
      const citizen = citizenMap.get(citizenId);
      
      if (!citizen) {
        console.warn(`Citizen ${citizenId} not found for building ${record.id}`);
        return null;
      }
      
      // Parse position from building
      let position;
      try {
        position = typeof record.fields.Position === 'string' 
          ? JSON.parse(record.fields.Position) 
          : record.fields.Position;
      } catch (e) {
        console.warn(`Invalid position format for building ${record.id}:`, e);
        position = {};
      }
      
      return {
        id: citizen.id,
        name: citizen.name,
        firstName: citizen.firstName,
        lastName: citizen.lastName,
        socialClass: citizen.socialClass,
        description: citizen.description,
        profileImage: citizen.imageUrl || '/images/citizens/default.png',
        position: position,
        occupation: citizen.work || 'Resident',
        wealth: citizen.wealth || 'Average',
        landId: record.fields.Land,
        buildingId: record.fields.BuildingId,
        buildingType: record.fields.Type
      };
    }).filter(Boolean); // Remove null entries
    
    console.log(`Returning ${citizens.length} citizens with house positions`);
    
    // If no valid citizens found, return debug citizens
    if (citizens.length === 0) {
      return NextResponse.json(getDebugCitizens());
    }
    
    return NextResponse.json(citizens);
  } catch (error) {
    console.error('Error fetching citizens from Airtable:', error);
    return NextResponse.json(
      { error: 'Failed to fetch citizens data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// Helper function to get debug citizens
function getDebugCitizens() {
  return [
    {
      id: 'debug-citizen-1',
      name: 'Marco Polo',
      firstName: 'Marco',
      lastName: 'Polo',
      socialClass: 'Merchant',
      description: 'Famous explorer and merchant who traveled through Asia along the Silk Road',
      profileImage: '/images/citizens/citizen1.png',
      position: { lat: 45.4371, lng: 12.3358 },
      occupation: 'Explorer',
      wealth: 'Wealthy',
      landId: 'polygon-1',
      buildingId: 'building-1',
      buildingType: 'house'
    },
    {
      id: 'debug-citizen-2',
      name: 'Antonio Vivaldi',
      firstName: 'Antonio',
      lastName: 'Vivaldi',
      socialClass: 'Artist',
      description: 'Venetian composer, virtuoso violinist, and priest, known for his baroque compositions',
      profileImage: '/images/citizens/citizen2.png',
      position: { lat: 45.4375, lng: 12.3368 },
      occupation: 'Composer',
      wealth: 'Comfortable',
      landId: 'polygon-2',
      buildingId: 'building-2',
      buildingType: 'house'
    },
    {
      id: 'debug-citizen-3',
      name: 'Caterina Cornaro',
      firstName: 'Caterina',
      lastName: 'Cornaro',
      socialClass: 'Nobility',
      description: 'Venetian noblewoman who became the Queen of Cyprus through her marriage to James II',
      profileImage: '/images/citizens/citizen3.png',
      position: { lat: 45.4365, lng: 12.3348 },
      occupation: 'Queen of Cyprus',
      wealth: 'Very Wealthy',
      landId: 'polygon-3',
      buildingId: 'building-3',
      buildingType: 'house'
    },
    {
      id: 'debug-citizen-4',
      name: 'Giacomo Casanova',
      firstName: 'Giacomo',
      lastName: 'Casanova',
      socialClass: 'Adventurer',
      description: 'Venetian author, adventurer, and famous womanizer',
      profileImage: '/images/citizens/citizen4.png',
      position: { lat: 45.4380, lng: 12.3378 },
      occupation: 'Writer',
      wealth: 'Variable',
      landId: 'polygon-4',
      buildingId: 'building-4',
      buildingType: 'house'
    },
    {
      id: 'debug-citizen-5',
      name: 'Elena Cornaro Piscopia',
      firstName: 'Elena',
      lastName: 'Cornaro Piscopia',
      socialClass: 'Scholar',
      description: 'Venetian philosopher who was the first woman to receive a doctoral degree from a university',
      profileImage: '/images/citizens/citizen5.png',
      position: { lat: 45.4368, lng: 12.3362 },
      occupation: 'Philosopher',
      wealth: 'Comfortable',
      landId: 'polygon-5',
      buildingId: 'building-5',
      buildingType: 'house'
    }
  ];
}
