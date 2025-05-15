import { NextResponse } from 'next/server';
import Airtable from 'airtable';
import { FieldSet, Record as AirtableRecord } from 'airtable';

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

const BUILDINGS_TABLE = 'Buildings';
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
    
    // Get all citizens directly without filtering for buildings
    const citizenRecords = await base(CITIZENS_TABLE)
      .select({
        view: 'Grid view',
        // Don't filter by Home field - get all citizens
      })
      .firstPage();
    
    console.log(`Retrieved ${citizenRecords.length} citizens from Airtable`);
    
    if (citizenRecords.length === 0) {
      console.log('No citizens found in Airtable, returning debug citizens');
      return NextResponse.json(getDebugCitizens());
    }
    
    // Try to fetch buildings to get their positions
    let buildingRecords: readonly AirtableRecord<FieldSet>[] = [];
    try {
      buildingRecords = await base(BUILDINGS_TABLE)
        .select({
          view: 'Grid view',
        })
        .firstPage();
      
      console.log(`Retrieved ${buildingRecords.length} buildings from Airtable`);
    } catch (buildingError) {
      console.warn('Error fetching buildings, will use fallback positions:', buildingError);
    }
    
    // Map citizens to the expected format
    const citizens = citizenRecords.map(record => {
      // Initialize position as null
      let position = null;
      
      // Try to find the building for this citizen
      if (record.fields.Home && buildingRecords.length > 0) {
        const homeBuilding = buildingRecords.find(b => 
          b.fields.BuildingId === record.fields.Home
        );
        
        if (homeBuilding && homeBuilding.fields.Position) {
          try {
            // Parse position if it's a string
            if (typeof homeBuilding.fields.Position === 'string') {
              const parsedPosition = JSON.parse(homeBuilding.fields.Position);
              // Ensure the parsed position has the correct structure
              if (parsedPosition && typeof parsedPosition.lat === 'number' && typeof parsedPosition.lng === 'number') {
                position = parsedPosition;
              }
            } else if (typeof homeBuilding.fields.Position === 'object' && 
                      homeBuilding.fields.Position !== null &&
                      'lat' in homeBuilding.fields.Position && 
                      'lng' in homeBuilding.fields.Position &&
                      typeof homeBuilding.fields.Position.lat === 'number' &&
                      typeof homeBuilding.fields.Position.lng === 'number') {
              // Ensure the object has the correct structure
              position = {
                lat: homeBuilding.fields.Position.lat,
                lng: homeBuilding.fields.Position.lng
              };
            }
            console.log(`Found position for citizen ${record.fields.CitizenId}'s home:`, position);
          } catch (error) {
            console.warn(`Error parsing position for building ${record.fields.Home}:`, error);
          }
        }
      }
      
      // If no position was found, log a warning
      if (!position) {
        console.warn(`No valid position found for citizen ${record.fields.CitizenId}`);
      }
      
      // Ensure the citizen ID is a string
      const citizenId = record.fields.CitizenId ? String(record.fields.CitizenId) : `ctz_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      
      return {
        id: citizenId,
        CitizenId: citizenId,
        name: `${record.fields.FirstName || 'Unknown'} ${record.fields.LastName || 'Citizen'}`,
        firstName: record.fields.FirstName || 'Unknown',
        lastName: record.fields.LastName || 'Citizen',
        FirstName: record.fields.FirstName || 'Unknown',
        LastName: record.fields.LastName || 'Citizen',
        socialClass: record.fields.SocialClass || 'Popolani',
        SocialClass: record.fields.SocialClass || 'Popolani',
        description: record.fields.Description || 'A citizen of Venice.',
        Description: record.fields.Description || 'A citizen of Venice.',
        profileImage: formatImageUrl(record.fields.ImageUrl?.toString(), citizenId),
        ImageUrl: formatImageUrl(record.fields.ImageUrl?.toString(), citizenId),
        // Ensure position is included and properly formatted
        position: position || { lat: 45.4371 + Math.random() * 0.01, lng: 12.3326 + Math.random() * 0.01 },
        occupation: record.fields.Occupation || 'Citizen',
        wealth: record.fields.Wealth || 'Average',
        Wealth: record.fields.Wealth || 'Average',
        landId: record.fields.Land || 'polygon-1',
        NeedsCompletionScore: 0.75,
        CreatedAt: record.fields.CreatedAt || new Date().toISOString()
        // Home and Work fields removed
      };
    });
    
    console.log(`Returning ${citizens.length} citizens with positions`);
    
    // Log a sample of the citizens data
    if (citizens.length > 0) {
      console.log('Sample citizen data:', {
        id: citizens[0].CitizenId,
        name: citizens[0].name,
        imageUrl: citizens[0].ImageUrl,
        position: citizens[0].position
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
      CitizenId: `debug-citizen-${i+1}`,
      name: `${firstName} ${lastName}`,
      firstName: firstName,
      lastName: lastName,
      FirstName: firstName,
      LastName: lastName,
      socialClass: socialClass,
      SocialClass: socialClass,
      description: `A ${socialClass.toLowerCase()} of Venice, living in the city during the Renaissance period.`,
      Description: `A ${socialClass.toLowerCase()} of Venice, living in the city during the Renaissance period.`,
      profileImage: `/images/citizens/default.png`,
      ImageUrl: `/images/citizens/default.png`,
      position: { lat: 45.4371 + Math.random() * 0.01, lng: 12.3326 + Math.random() * 0.01 },
      occupation: socialClass === 'Nobili' ? 'Merchant' : 
                 socialClass === 'Cittadini' ? 'Artisan' : 
                 socialClass === 'Popolani' ? 'Shopkeeper' : 'Laborer',
      wealth: socialClass === 'Nobili' ? 'Wealthy' : 
              socialClass === 'Cittadini' ? 'Comfortable' : 
              socialClass === 'Popolani' ? 'Modest' : 'Poor',
      Wealth: socialClass === 'Nobili' ? 'Wealthy' : 
              socialClass === 'Cittadini' ? 'Comfortable' : 
              socialClass === 'Popolani' ? 'Modest' : 'Poor',
      landId: `polygon-${i+1}`,
      buildingId: `building-${i+1}`,
      buildingType: socialClass === 'Nobili' ? 'Palazzo' : 
                   socialClass === 'Cittadini' ? 'Merchant House' : 
                   socialClass === 'Popolani' ? 'Townhouse' : 'Cottage',
      isHome: true,
      isWork: false,
      NeedsCompletionScore: 0.75,
      CreatedAt: new Date().toISOString()
    });
  }
  
  console.log(`Created ${debugCitizens.length} debug citizens`);
  return debugCitizens;
}
