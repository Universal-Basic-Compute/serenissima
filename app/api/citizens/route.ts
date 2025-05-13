import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

const BUILDINGS_TABLE = 'Buildings';
const CITIZENS_TABLE = 'CITIZENS';

// Helper function to format image URLs
function formatImageUrl(url: string | undefined, citizenId?: string): string {
  // If no URL is provided, use the CitizenId to construct the path
  if (!url) {
    return `/images/citizens/${citizenId || 'default'}.png`;
  }
  
  // If it's already an absolute URL, return it as is
  if (url.startsWith('http')) return url;
  
  // If it doesn't start with a slash, add one
  if (!url.startsWith('/')) url = '/' + url;
  
  // If it doesn't include the citizens directory, add it
  if (!url.includes('/citizens/')) {
    // Check if the URL already has a filename
    if (url.includes('.png') || url.includes('.jpg') || url.includes('.jpeg') || url.includes('.gif')) {
      url = `/images/citizens/${url.split('/').pop()}`;
    } else {
      // Otherwise use the CitizenId
      url = `/images/citizens/${citizenId || 'default'}.png`;
    }
  }
  
  return url;
}

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
        work: record.fields.Work,
        CreatedAt: record.fields.CreatedAt || new Date().toISOString()
      });
    });
    
    // Load polygon data to find building positions
    let polygons = [];
    try {
      // Try to load polygons from the API
      const polygonsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/get-polygons`);
      if (polygonsResponse.ok) {
        const polygonsData = await polygonsResponse.json();
        polygons = polygonsData.polygons || [];
        console.log(`Loaded ${polygons.length} polygons for building position lookup`);
      }
    } catch (error) {
      console.warn('Error loading polygons for building position lookup:', error);
    }
    
    // Helper function to find building positions from polygon data
    function findBuildingPosition(buildingId: string, polygons: any[]): { lat: number, lng: number } | null {
      // First, try to find the building in the buildingPoints of all polygons
      for (const polygon of polygons) {
        if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
          const buildingPoint = polygon.buildingPoints.find((bp: any) => 
            bp.buildingId === buildingId || 
            bp.id === buildingId || 
            bp.BuildingId === buildingId
          );
          
          if (buildingPoint) {
            // Found the building point, return its position
            console.log(`API: Found building ${buildingId} in polygon ${polygon.id} buildingPoints`);
            
            // Check if the building point has a position property
            if (buildingPoint.position) {
              return buildingPoint.position;
            }
            
            // If not, check if it has lat/lng properties
            if (buildingPoint.lat !== undefined && buildingPoint.lng !== undefined) {
              return { lat: buildingPoint.lat, lng: buildingPoint.lng };
            }
            
            // If not, check if it has x/z properties (sometimes used instead of lat/lng)
            if (buildingPoint.x !== undefined && buildingPoint.z !== undefined) {
              return { lat: buildingPoint.x, lng: buildingPoint.z };
            }
          }
        }
      }
      
      // If we couldn't find the building in buildingPoints, try to use the polygon center
      for (const polygon of polygons) {
        // Check if this polygon contains the building
        if (polygon.buildings && Array.isArray(polygon.buildings)) {
          const building = polygon.buildings.find((b: any) => 
            b.id === buildingId || 
            b.buildingId === buildingId || 
            b.BuildingId === buildingId
          );
          
          if (building) {
            console.log(`API: Found building ${buildingId} in polygon ${polygon.id} buildings array`);
            
            // Use the polygon's center as the building position
            if (polygon.center) {
              return polygon.center;
            } else if (polygon.centroid) {
              return polygon.centroid;
            } else if (polygon.coatOfArmsCenter) {
              return polygon.coatOfArmsCenter;
            }
          }
        }
        
        // Also check if the polygon itself has a buildingId property that matches
        if (polygon.buildingId === buildingId || polygon.BuildingId === buildingId) {
          console.log(`API: Polygon ${polygon.id} itself has buildingId ${buildingId}`);
          
          // Use the polygon's center as the building position
          if (polygon.center) {
            return polygon.center;
          } else if (polygon.centroid) {
            return polygon.centroid;
          } else if (polygon.coatOfArmsCenter) {
            return polygon.coatOfArmsCenter;
          }
        }
      }
      
      return null;
    }
    
    // Map buildings to citizens with positions
    const citizens = buildingRecords.map(record => {
      // Convert Airtable Occupant field to string, ensuring type safety
      const occupant = record.fields.Occupant;
      
      // Define types for Airtable fields which can have various formats
      type Collaborator = { id: string; email: string; name: string };
      type Attachment = { id: string; url: string; filename: string; size: number; type: string };
      
      // Define a more specific type for Airtable's field format
      type AirtableFieldValue = string | number | boolean | Collaborator | 
                               readonly string[] | readonly Collaborator[] | readonly Attachment[] | undefined | null;
      
      // Explicitly cast the Airtable field to string to fix type error
      let citizenId = '';
      if (occupant) {
        if (typeof occupant === 'string') {
          citizenId = occupant;
        } else if (Array.isArray(occupant) && occupant.length > 0) {
          // Ensure we're converting to string properly
          citizenId = typeof occupant[0] === 'string' ? occupant[0] : String(occupant[0]);
        } else if (typeof occupant === 'object' && occupant !== null) {
          // Get the first value and ensure it's a string
          const firstValue = Object.values(occupant)[0];
          citizenId = typeof firstValue === 'string' ? firstValue : String(firstValue);
        } else {
          // For any other type, convert to string
          citizenId = String(occupant);
        }
      }
      const citizen = citizenMap.get(citizenId);
      
      if (!citizen) {
        console.warn(`Citizen ${citizenId} not found for building ${record.id}`);
        return null;
      }
      
      // Get building ID
      const buildingId = record.fields.BuildingId;
      
      // Find building position from polygon data
      let position;
      if (buildingId) {
        position = findBuildingPosition(buildingId, polygons);
        
        if (position) {
          console.log(`Found position for building ${buildingId}:`, position);
        } else {
          console.warn(`No position found for building ${buildingId}, trying to parse from record`);
          
          // Try to parse position from building record as fallback
          try {
            position = typeof record.fields.Position === 'string' 
              ? JSON.parse(record.fields.Position) 
              : record.fields.Position;
          } catch (e) {
            console.warn(`Invalid position format for building ${record.id}:`, e);
            position = {};
          }
        }
      } else {
        // Try to parse position from building record if no buildingId
        try {
          position = typeof record.fields.Position === 'string' 
            ? JSON.parse(record.fields.Position) 
            : record.fields.Position;
        } catch (e) {
          console.warn(`Invalid position format for building ${record.id}:`, e);
          position = {};
        }
      }
      
      // Determine if this is a home or work building
      const isHome = citizen.home === record.fields.BuildingId;
      
      // Use the outer formatImageUrl function
      
      // Ensure we have a consistent structure with all required fields
      return {
        id: citizen.id,
        CitizenId: citizen.id, // Ensure both formats are available
        name: citizen.name,
        firstName: citizen.firstName,
        lastName: citizen.lastName,
        FirstName: citizen.firstName, // Ensure both formats are available
        LastName: citizen.lastName, // Ensure both formats are available
        socialClass: citizen.socialClass,
        SocialClass: citizen.socialClass, // Ensure both formats are available
        description: citizen.description,
        Description: citizen.description, // Ensure both formats are available
        profileImage: formatImageUrl(citizen.imageUrl, citizen.id),
        ImageUrl: formatImageUrl(citizen.imageUrl, citizen.id), // Ensure both formats are available
        position: position,
        occupation: citizen.work || 'Resident',
        wealth: citizen.wealth || 'Average',
        Wealth: citizen.wealth || 'Average', // Ensure both formats are available
        landId: record.fields.Land,
        buildingId: record.fields.BuildingId,
        buildingType: record.fields.Type,
        isHome: isHome,
        isWork: citizen.work === record.fields.BuildingId,
        Home: citizen.home, // Ensure both formats are available
        Work: citizen.work, // Ensure both formats are available
        // Add NeedsCompletionScore for compatibility with CitizenDetailsPanel
        NeedsCompletionScore: 0.75, // Default value, replace with actual calculation if available
        CreatedAt: citizen.CreatedAt || new Date().toISOString()
      };
    }).filter(Boolean); // Remove null entries
    
    console.log(`Returning ${citizens.length} citizens with house positions`);
    
    // If no valid citizens found, return debug citizens
    if (citizens.length === 0) {
      console.log('No valid citizens found, returning debug citizens');
      return NextResponse.json(getDebugCitizens());
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
  const debugCitizens = [
    {
      id: 'debug-citizen-1',
      CitizenId: 'debug-citizen-1',
      name: 'Marco Polo',
      firstName: 'Marco',
      lastName: 'Polo',
      FirstName: 'Marco',
      LastName: 'Polo',
      socialClass: 'Merchant',
      SocialClass: 'Merchant',
      description: 'Famous explorer and merchant who traveled through Asia along the Silk Road',
      Description: 'Famous explorer and merchant who traveled through Asia along the Silk Road',
      profileImage: formatImageUrl('/images/citizens/citizen1.png', 'debug-citizen-1'),
      ImageUrl: formatImageUrl('/images/citizens/citizen1.png', 'debug-citizen-1'),
      position: { lat: 45.4371, lng: 12.3358 },
      occupation: 'Explorer',
      wealth: 'Wealthy',
      Wealth: 'Wealthy',
      landId: 'polygon-1',
      buildingId: 'building-1',
      buildingType: 'house',
      isHome: true,
      isWork: false,
      Home: 'building-1',
      Work: 'building-2',
      NeedsCompletionScore: 0.75,
      CreatedAt: new Date().toISOString()
    },
    {
      id: 'debug-citizen-2',
      CitizenId: 'debug-citizen-2',
      name: 'Antonio Vivaldi',
      firstName: 'Antonio',
      lastName: 'Vivaldi',
      FirstName: 'Antonio',
      LastName: 'Vivaldi',
      socialClass: 'Artist',
      SocialClass: 'Artist',
      description: 'Venetian composer, virtuoso violinist, and priest, known for his baroque compositions',
      Description: 'Venetian composer, virtuoso violinist, and priest, known for his baroque compositions',
      profileImage: formatImageUrl('/images/citizens/citizen2.png', 'debug-citizen-2'),
      ImageUrl: formatImageUrl('/images/citizens/citizen2.png', 'debug-citizen-2'),
      position: { lat: 45.4375, lng: 12.3368 },
      occupation: 'Composer',
      wealth: 'Comfortable',
      Wealth: 'Comfortable',
      landId: 'polygon-2',
      buildingId: 'building-2',
      buildingType: 'house',
      isHome: true,
      isWork: false,
      Home: 'building-2',
      Work: 'building-3',
      NeedsCompletionScore: 0.75,
      CreatedAt: new Date().toISOString()
    },
    {
      id: 'debug-citizen-3',
      CitizenId: 'debug-citizen-3',
      name: 'Caterina Cornaro',
      firstName: 'Caterina',
      lastName: 'Cornaro',
      FirstName: 'Caterina',
      LastName: 'Cornaro',
      socialClass: 'Nobility',
      SocialClass: 'Nobility',
      description: 'Venetian noblewoman who became the Queen of Cyprus through her marriage to James II',
      Description: 'Venetian noblewoman who became the Queen of Cyprus through her marriage to James II',
      profileImage: formatImageUrl('/images/citizens/citizen3.png', 'debug-citizen-3'),
      ImageUrl: formatImageUrl('/images/citizens/citizen3.png', 'debug-citizen-3'),
      position: { lat: 45.4365, lng: 12.3348 },
      occupation: 'Queen of Cyprus',
      wealth: 'Very Wealthy',
      Wealth: 'Very Wealthy',
      landId: 'polygon-3',
      buildingId: 'building-3',
      buildingType: 'house',
      isHome: true,
      isWork: false,
      Home: 'building-3',
      Work: 'building-4',
      NeedsCompletionScore: 0.75,
      CreatedAt: new Date().toISOString()
    },
    {
      id: 'debug-citizen-4',
      CitizenId: 'debug-citizen-4',
      name: 'Giacomo Casanova',
      firstName: 'Giacomo',
      lastName: 'Casanova',
      FirstName: 'Giacomo',
      LastName: 'Casanova',
      socialClass: 'Adventurer',
      SocialClass: 'Adventurer',
      description: 'Venetian author, adventurer, and famous womanizer',
      Description: 'Venetian author, adventurer, and famous womanizer',
      profileImage: formatImageUrl('/images/citizens/citizen4.png', 'debug-citizen-4'),
      ImageUrl: formatImageUrl('/images/citizens/citizen4.png', 'debug-citizen-4'),
      position: { lat: 45.4380, lng: 12.3378 },
      occupation: 'Writer',
      wealth: 'Variable',
      Wealth: 'Variable',
      landId: 'polygon-4',
      buildingId: 'building-4',
      buildingType: 'house',
      isHome: true,
      isWork: false,
      Home: 'building-4',
      Work: 'building-5',
      NeedsCompletionScore: 0.75,
      CreatedAt: new Date().toISOString()
    },
    {
      id: 'debug-citizen-5',
      CitizenId: 'debug-citizen-5',
      name: 'Elena Cornaro Piscopia',
      firstName: 'Elena',
      lastName: 'Cornaro Piscopia',
      FirstName: 'Elena',
      LastName: 'Cornaro Piscopia',
      socialClass: 'Scholar',
      SocialClass: 'Scholar',
      description: 'Venetian philosopher who was the first woman to receive a doctoral degree from a university',
      Description: 'Venetian philosopher who was the first woman to receive a doctoral degree from a university',
      profileImage: formatImageUrl('/images/citizens/citizen5.png', 'debug-citizen-5'),
      ImageUrl: formatImageUrl('/images/citizens/citizen5.png', 'debug-citizen-5'),
      position: { lat: 45.4368, lng: 12.3362 },
      occupation: 'Philosopher',
      wealth: 'Comfortable',
      Wealth: 'Comfortable',
      landId: 'polygon-5',
      buildingId: 'building-5',
      buildingType: 'house',
      isHome: true,
      isWork: false,
      Home: 'building-5',
      Work: 'building-1',
      NeedsCompletionScore: 0.75,
      CreatedAt: new Date().toISOString()
    }
  ];
  
  console.log(`Returning ${debugCitizens.length} debug citizens`);
  return debugCitizens;
}
