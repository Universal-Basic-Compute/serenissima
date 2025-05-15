import { NextResponse } from 'next/server';
import Airtable from 'airtable';
import { FieldSet, Record as AirtableRecord, Collaborator, Attachment } from 'airtable';

// Define types for Airtable fields
type AirtableValue = string | number | boolean | Collaborator | readonly Collaborator[] | readonly string[] | readonly Attachment[];

// Helper function to safely convert Airtable values to strings
function airtableValueToString(value: AirtableValue | undefined | null): string {
  if (value === undefined || value === null) return '';
  return String(value);
}

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

const BUILDINGS_TABLE = 'BUILDINGS';
const CITIZENS_TABLE = 'CITIZENS';

// Helper function to format image URLs
function formatImageUrl(url: string | undefined | null, citizenId?: string): string {
  console.log(`Formatting image URL for citizen ${citizenId}:`, url);
  
  // If no URL is provided, use the CitizenId to construct the path
  if (!url) {
    const defaultPath = `/images/citizens/${citizenId || 'default'}.jpg`;
    console.log(`No URL provided, using default path: ${defaultPath}`);
    return defaultPath;
  }
  
  // If it's already an absolute URL, return it as is
  if (url.startsWith('http')) {
    console.log(`Using absolute URL: ${url}`);
    return url;
  }
  
  // If it doesn't start with a slash, add one
  if (!url.startsWith('/')) {
    url = '/' + url;
    console.log(`Added leading slash: ${url}`);
  }
  
  // If it doesn't include the citizens directory, add it
  if (!url.includes('/citizens/')) {
    // Check if the URL already has a filename
    if (url.includes('.png') || url.includes('.jpg') || url.includes('.jpeg') || url.includes('.gif')) {
      url = `/images/citizens/${url.split('/').pop()}`;
      console.log(`Extracted filename and added to citizens path: ${url}`);
    } else {
      // Otherwise use the CitizenId
      url = `/images/citizens/${citizenId || 'default'}.jpg`;
      console.log(`Using CitizenId for path: ${url}`);
    }
  }
  
  // Ensure the URL doesn't have any double slashes (except in http://)
  url = url.replace(/([^:])\/\//g, '$1/');
  
  console.log(`Final formatted URL: ${url}`);
  return url;
}

export async function GET(request: Request) {
  try {
    console.log('Fetching citizens from Airtable...');
    
    // First, fetch all buildings to get occupant information
    console.log('Fetching buildings to determine home and work locations...');
    const buildingRecords = await base(BUILDINGS_TABLE)
      .select({
        view: 'Grid view',
        fields: ['BuildingId', 'Type', 'Occupant']
      })
      .firstPage();
    
    console.log(`Retrieved ${buildingRecords.length} buildings from Airtable`);
    
    // Create a map of occupants to buildings
    const occupantToBuildings: Record<string, {home?: string, work?: string}> = {};
    
    // Define residential building types
    const residentialTypes = ['canal_house', 'merchant_s_house', 'artisan_s_house', 'fisherman_s_cottage'];
    
    // Process buildings to determine home and work assignments
    buildingRecords.forEach(building => {
      const buildingId = building.fields.BuildingId || building.id;
      const buildingType = building.fields.Type;
      // Convert Occupant to string to use as an index
      const occupant = building.fields.Occupant ? 
        airtableValueToString(building.fields.Occupant) : undefined;
      
      // Skip buildings without occupants or with non-string occupants
      if (!occupant) return;
      
      // Initialize the occupant entry if it doesn't exist
      if (!occupantToBuildings[occupant]) {
        occupantToBuildings[occupant] = {};
      }
      
      // Determine if this is a home or work building
      if (residentialTypes.includes(buildingType)) {
        // This is a residential building, set as home
        occupantToBuildings[occupant].home = buildingId;
        console.log(`Assigned building ${buildingId} (${buildingType}) as HOME for ${occupant}`);
      } else {
        // Any building that is not a residential type is a work building
        occupantToBuildings[occupant].work = buildingId;
        console.log(`Assigned building ${buildingId} (${buildingType}) as WORK for ${occupant}`);
      }
    });
    
    console.log(`Processed occupant assignments for ${Object.keys(occupantToBuildings).length} citizens`);
    
    // Get all citizens directly without filtering for buildings
    const citizenRecords = await base(CITIZENS_TABLE)
      .select({
        view: 'Grid view',
      })
      .firstPage();
    
    console.log(`Retrieved ${citizenRecords.length} citizens from Airtable`);
    
    if (citizenRecords.length === 0) {
      console.log('No citizens found in Airtable, returning debug citizens');
      return NextResponse.json(getDebugCitizens());
    }
    
    // Map citizens to the expected format
    const citizens = citizenRecords.map(record => {     
      // Ensure the citizen ID is a string
      const citizenId = record.fields.CitizenId ? 
        airtableValueToString(record.fields.CitizenId)
        : `ctz_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      
      // Get home and work assignments for this citizen
      const buildings = occupantToBuildings[citizenId] || {};
      
      // Safely convert Airtable values to strings
      const safeString = (value: AirtableValue | undefined | null, defaultValue: string = ''): string => {
        if (value === undefined || value === null) return defaultValue;
        return String(value);
      };
      
      return {
        id: citizenId,
        citizenid: citizenId,
        name: `${safeString(record.fields.FirstName, 'Unknown')} ${safeString(record.fields.LastName, 'Citizen')}`,
        firstname: safeString(record.fields.FirstName, 'Unknown'),
        lastname: safeString(record.fields.LastName, 'Citizen'),
        socialclass: safeString(record.fields.SocialClass, 'Popolani'),
        description: safeString(record.fields.Description, 'A citizen of Venice.'),
        profileimage: formatImageUrl(
          record.fields.ImageUrl ? airtableValueToString(record.fields.ImageUrl) : undefined, 
          citizenId
        ),
        imageurl: formatImageUrl(
          record.fields.ImageUrl ? airtableValueToString(record.fields.ImageUrl) : undefined, 
          citizenId
        ),
        // Ensure position is included and properly formatted
        position: typeof record.fields.Position === 'string' 
          ? JSON.parse(record.fields.Position as string) 
          : (record.fields.Position as any) || { lat: 45.4371 + Math.random() * 0.01, lng: 12.3326 + Math.random() * 0.01 },
        occupation: safeString(record.fields.Occupation, 'Citizen'),
        wealth: record.fields.Wealth !== undefined ? record.fields.Wealth : 0,
        createdat: safeString(record.fields.CreatedAt, new Date().toISOString()),
        // Add home and work assignments
        home: buildings.home || null,
        work: buildings.work || null
      };
    });
    
    console.log(`Returning ${citizens.length} citizens with home and work assignments`);
    
    // Log a sample of the citizens data
    if (citizens.length > 0) {
      console.log('Sample citizen data:', {
        id: citizens[0].citizenid,
        name: citizens[0].name,
        imageUrl: citizens[0].imageurl,
        position: citizens[0].position,
        home: citizens[0].home,
        work: citizens[0].work
      });
    }
    
    return NextResponse.json(citizens);
  } catch (error) {
    console.error('Error fetching citizens from Airtable:', error);
    console.log('Returning debug citizens due to error');
    return NextResponse.json(getDebugCitizens());
  }
}

// Enhance the debug citizens to ensure they have all required fields
function getDebugCitizens() {
  console.log('Creating debug citizens');
  
  // Create 5 debug citizens with all required fields
  const debugCitizens = [];
  
  const firstNames = ['Marco', 'Giovanni', 'Antonio', 'Francesco', 'Lucia', 'Isabella', 'Caterina'];
  const lastNames = ['Contarini', 'Morosini', 'Dandolo', 'Foscari', 'Grimani', 'Barbarigo', 'Mocenigo'];
  const socialClasses = ['Nobili', 'Cittadini', 'Popolani', 'Facchini'];
  
  for (let i = 0; i < 5; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const socialClass = socialClasses[Math.floor(Math.random() * socialClasses.length)];
    
    debugCitizens.push({
      id: `debug-citizen-${i+1}`,
      citizenid: `debug-citizen-${i+1}`,
      name: `${firstName} ${lastName}`,
      firstname: firstName,
      lastname: lastName,
      socialclass: socialClass,
      description: `A ${socialClass.toLowerCase()} of Venice, living in the city during the Renaissance period.`,
      profileimage: `/images/citizens/default.png`,
      imageurl: `/images/citizens/default.png`,
      position: { lat: 45.4371 + Math.random() * 0.01, lng: 12.3326 + Math.random() * 0.01 },
      occupation: socialClass === 'Nobili' ? 'Merchant' : 
                 socialClass === 'Cittadini' ? 'Artisan' : 
                 socialClass === 'Popolani' ? 'Shopkeeper' : 'Laborer',
      wealth: socialClass === 'Nobili' ? 'Wealthy' : 
              socialClass === 'Cittadini' ? 'Comfortable' : 
              socialClass === 'Popolani' ? 'Modest' : 'Poor',
      home: `building-home-${i+1}`,
      work: `building-work-${i+1}`,
      needscompletionscore: 0.75,
      createdat: new Date().toISOString()
    });
  }
  
  console.log(`Created ${debugCitizens.length} debug citizens`);
  return debugCitizens;
}
