import { NextResponse } from 'next/server';
import Airtable from 'airtable';
import { FieldSet, Record as AirtableRecord, Collaborator, Attachment } from 'airtable';

// Define interfaces for our data structures
interface Citizen {
  id: string;
  citizenid: string;
  name: string;
  firstname: string;
  lastname: string;
  socialclass: string;
  description: string;
  profileimage: string;
  imageurl: string;
  position: { lat: number; lng: number };
  occupation: string;
  wealth: string | number;
  createdat: string;
  home: string | null;
  work: string | null;
  currentActivity?: {
    id: string;
    type: string;
    progress: number;
    path: Array<{ lat: number; lng: number }>;
  };
  needscompletionscore?: number;
}

// Define types for Airtable fields
type AirtableValue = string | number | boolean | Collaborator | readonly Collaborator[] | readonly string[] | readonly Attachment[];

// Helper function to safely convert Airtable values to strings
function airtableValueToString(value: AirtableValue | undefined | null): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // Handle arrays and other complex types
  return String(value);
}

// Helper function to calculate distance between two geographic points using the Haversine formula
function calculateDistance(point1: {lat: number, lng: number}, point2: {lat: number, lng: number}): number {
  const R = 6371000; // Earth radius in meters
  const lat1 = point1.lat * Math.PI / 180;
  const lat2 = point2.lat * Math.PI / 180;
  const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
  const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;

  const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
          Math.cos(lat1) * Math.cos(lat2) *
          Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Helper function to calculate position along a path based on progress
function calculatePositionAlongPath(path: {lat: number, lng: number}[], progress: number) {
  if (!path || path.length < 2) {
    console.log('Invalid path: empty or too short');
    return null;
  }
  
  // Calculate total path length
  let totalDistance = 0;
  const segments: {start: number, end: number, distance: number}[] = [];
  
  for (let i = 0; i < path.length - 1; i++) {
    const distance = calculateDistance(path[i], path[i+1]);
    segments.push({
      start: totalDistance,
      end: totalDistance + distance,
      distance
    });
    totalDistance += distance;
  }
  
  if (totalDistance === 0) {
    console.log('Path has zero total distance');
    return path[0]; // Return first point if path has no length
  }
  
  // Find the segment where the progress falls
  const targetDistance = progress * totalDistance;
  const segment = segments.find(seg => targetDistance >= seg.start && targetDistance <= seg.end);
  
  if (!segment) {
    console.log(`No segment found for progress ${progress}, defaulting to start`);
    return path[0]; // Default to start if no segment found
  }
  
  // Calculate position within the segment
  const segmentProgress = (targetDistance - segment.start) / segment.distance;
  const segmentIndex = segments.indexOf(segment);
  
  const p1 = path[segmentIndex];
  const p2 = path[segmentIndex + 1];
  
  // Interpolate between the two points
  return {
    lat: p1.lat + (p2.lat - p1.lat) * segmentProgress,
    lng: p1.lng + (p2.lng - p1.lng) * segmentProgress
  };
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
      if (residentialTypes.includes(airtableValueToString(buildingType))) {
        // This is a residential building, set as home
        occupantToBuildings[occupant].home = airtableValueToString(buildingId);
        console.log(`Assigned building ${buildingId} (${buildingType}) as HOME for ${occupant}`);
      } else {
        // Any building that is not a residential type is a work building
        occupantToBuildings[occupant].work = airtableValueToString(buildingId);
        console.log(`Assigned building ${buildingId} (${buildingType}) as WORK for ${occupant}`);
      }
    });
    
    console.log(`Processed occupant assignments for ${Object.keys(occupantToBuildings).length} citizens`);
    
    // Get all citizens directly without filtering for buildings
    try {
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
      let citizens = citizenRecords.map(record => {     
        try {
          // Ensure the citizen ID is a string
          const citizenId = record.fields.CitizenId ? 
            airtableValueToString(record.fields.CitizenId)
            : `ctz_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
          
          // Get home and work assignments for this citizen
          const buildings = occupantToBuildings[citizenId] || {};
          
          // Safely convert Airtable values to strings
          const safeString = (value: AirtableValue | undefined | null, defaultValue: string = ''): string => {
            if (value === undefined || value === null) return defaultValue;
            if (typeof value === 'string') return value;
            if (typeof value === 'number' || typeof value === 'boolean') return String(value);
            // Handle arrays and other complex types
            return String(value);
          };
          
          // Ensure position is properly formatted
          let position;
          try {
            position = typeof record.fields.Position === 'string' 
              ? JSON.parse(record.fields.Position as string) 
              : (record.fields.Position as any);
          } catch (positionError) {
            console.warn(`Error parsing position for citizen ${citizenId}:`, positionError);
            position = { lat: 45.4371 + Math.random() * 0.01, lng: 12.3326 + Math.random() * 0.01 };
          }
          
          // Ensure position has valid lat/lng
          if (!position || typeof position !== 'object' || !('lat' in position) || !('lng' in position)) {
            position = { lat: 45.4371 + Math.random() * 0.01, lng: 12.3326 + Math.random() * 0.01 };
          }
          
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
            position: position,
            occupation: safeString(record.fields.Occupation, 'Citizen'),
            wealth: record.fields.Wealth !== undefined ? record.fields.Wealth : 0,
            createdat: safeString(record.fields.CreatedAt, new Date().toISOString()),
            // Add home and work assignments
            home: buildings.home || null,
            work: buildings.work || null
          };
        } catch (citizenError) {
          console.error('Error processing citizen record:', citizenError, record);
          // Return a minimal valid citizen object
          return {
            id: `error_${Date.now()}`,
            citizenid: `error_${Date.now()}`,
            name: 'Error Citizen',
            firstname: 'Error',
            lastname: 'Citizen',
            socialclass: 'Popolani',
            description: 'Error processing citizen data.',
            position: { lat: 45.4371 + Math.random() * 0.01, lng: 12.3326 + Math.random() * 0.01 },
            occupation: 'Unknown',
            wealth: 0,
            createdat: new Date().toISOString(),
            home: null,
            work: null
          };
        }
      });
    
    // Now fetch activities with paths for all citizens
    console.log('Fetching activities with paths for citizens...');
    try {
      // Get the Airtable API key and base ID
      const AIRTABLE_ACTIVITIES_TABLE = process.env.AIRTABLE_ACTIVITIES_TABLE || 'ACTIVITIES';
      
      if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
        console.warn('Airtable credentials not configured for activities');
      } else {
        // Construct the Airtable API URL
        const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${AIRTABLE_ACTIVITIES_TABLE}`;
        
        // Create the filter formula to get only activities with paths
        const filterByFormula = `AND(NOT({Path} = ''), NOT({Path} = BLANK()))`;
        
        // Prepare the request parameters
        const requestUrl = `${url}?filterByFormula=${encodeURIComponent(filterByFormula)}&sort%5B0%5D%5Bfield%5D=CreatedAt&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=100`;
        
        console.log(`Making Airtable request to: ${requestUrl}`);
        
        // Make the request to Airtable
        const response = await fetch(requestUrl, {
          headers: {
            'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          console.error(`Airtable API error: ${response.status} ${response.statusText}`);
        } else {
          const data = await response.json();
          
          if (data.records && data.records.length > 0) {
            console.log(`Found ${data.records.length} activities with paths`);
            
            // Process activities and update citizen positions
            const now = new Date();
            const citizenActivities: Record<string, any[]> = {};
            
            // Group activities by citizen
            data.records.forEach(record => {
              const activity = record.fields;
              const citizenId = activity.CitizenId;
              
              if (citizenId && activity.Path) {
                if (!citizenActivities[citizenId]) {
                  citizenActivities[citizenId] = [];
                }
                
                try {
                  // Parse path if it's a string
                  const path = typeof activity.Path === 'string' ? 
                    JSON.parse(activity.Path) : activity.Path;
                  
                  // Skip activities without valid paths
                  if (!Array.isArray(path) || path.length < 2) {
                    console.warn(`Skipping activity with invalid path for citizen ${citizenId}: not an array or too short`);
                    return;
                  }
                  
                  // Validate each point in the path
                  const validPath = path.filter(point => 
                    point && typeof point === 'object' && 
                    'lat' in point && 'lng' in point &&
                    typeof point.lat === 'number' && typeof point.lng === 'number'
                  );
                  
                  if (validPath.length < 2) {
                    console.warn(`Skipping activity with insufficient valid points for citizen ${citizenId}: ${validPath.length} valid out of ${path.length}`);
                    return;
                  }
                  
                  citizenActivities[citizenId].push({
                    id: record.id,
                    path: validPath,
                    type: activity.Type || 'unknown',
                    startTime: activity.StartDate || activity.CreatedAt,
                    endTime: activity.EndDate
                  });
                  
                  console.log(`Added activity for citizen ${citizenId}: ${activity.Type || 'unknown'} with ${validPath.length} points`);
                } catch (e) {
                  console.warn(`Failed to parse activity path for ${record.id}:`, e);
                }
              }
            });
            
            // Update citizen positions based on their activities
            citizens = citizens.map(citizen => {
              const citizenId = citizen.citizenid;
              const activities = citizenActivities[citizenId] || [];
              
              if (activities.length > 0) {
                console.log(`Processing ${activities.length} activities for citizen ${citizenId}`);
                
                // Find the most appropriate activity based on time
                let selectedActivity = null;
                let initialProgress = 0;
                
                // First, check for activities that are currently in progress
                for (const activity of activities) {
                  const startTime = activity.startTime ? new Date(activity.startTime) : null;
                  const endTime = activity.endTime ? new Date(activity.endTime) : null;
                  
                  // Skip activities without a valid start time
                  if (!startTime) {
                    console.log(`Activity for ${citizenId} has no start time, skipping`);
                    continue;
                  }
                  
                  // If the activity has both start and end times, check if we're within that timeframe
                  if (startTime && endTime) {
                    if (now >= startTime && now <= endTime) {
                      // This activity is currently active - calculate progress based on elapsed time
                      const totalDuration = endTime.getTime() - startTime.getTime();
                      const elapsedTime = now.getTime() - startTime.getTime();
                      initialProgress = Math.min(Math.max(elapsedTime / totalDuration, 0), 1);
                      selectedActivity = activity;
                      console.log(`Found active activity for ${citizenId} with progress ${initialProgress.toFixed(2)}`);
                      break; // Found an active activity, no need to check others
                    }
                  } 
                  // If the activity only has a start time (no end time), check if it started in the last hour
                  else if (startTime) {
                    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
                    if (startTime >= oneHourAgo) {
                      // This activity started recently - estimate progress based on typical speed
                      // Assume a typical activity takes about 1 hour to complete
                      const elapsedTime = now.getTime() - startTime.getTime();
                      initialProgress = Math.min(Math.max(elapsedTime / (60 * 60 * 1000), 0), 1);
                      selectedActivity = activity;
                      console.log(`Found recent activity for ${citizenId} with estimated progress ${initialProgress.toFixed(2)}`);
                      break; // Found a recent activity, no need to check others
                    }
                  }
                }
                
                // If no active or recent activity was found, just use the most recent activity with random progress
                if (!selectedActivity && activities.length > 0) {
                  // Sort activities by start time (most recent first)
                  const sortedActivities = [...activities].sort((a, b) => {
                    const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
                    const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
                    return bTime - aTime; // Descending order (most recent first)
                  });
                  
                  selectedActivity = sortedActivities[0];
                  initialProgress = Math.random(); // Random progress between 0 and 1
                  console.log(`Using most recent activity for ${citizenId} with random progress ${initialProgress.toFixed(2)}`);
                }
                
                // Calculate position based on progress
                if (selectedActivity) {
                  console.log(`Calculating position for citizen ${citizenId} along path with ${selectedActivity.path.length} points at progress ${initialProgress}`);
                  
                  const calculatedPosition = calculatePositionAlongPath(selectedActivity.path, initialProgress);
                  if (calculatedPosition) {
                    console.log(`Updated position for citizen ${citizenId} based on activity ${selectedActivity.id}: ${JSON.stringify(calculatedPosition)}`);
                    return {
                      ...citizen,
                      position: calculatedPosition,
                      // Add activity information to the citizen object
                      currentActivity: {
                        id: selectedActivity.id,
                        type: selectedActivity.type,
                        progress: initialProgress,
                        path: selectedActivity.path
                      }
                    };
                  } else {
                    console.warn(`Failed to calculate position for citizen ${citizenId}, keeping original position`);
                  }
                }
              }
              
              // Return the citizen with original position if no activity position was calculated
              return citizen;
            });
            
            console.log(`Updated positions for ${Object.keys(citizenActivities).length} citizens based on activities`);
          } else {
            console.log('No activities with paths found');
          }
        }
      }
    } catch (error) {
      console.error('Error fetching or processing activities:', error);
      // Continue with original positions if there's an error
    }
    
    console.log(`Returning ${citizens.length} citizens with home and work assignments`);
    
    // Log a sample of the citizens data
    if (citizens.length > 0) {
      console.log('Sample citizen data:', {
        id: citizens[0].citizenid,
        name: citizens[0].name,
        imageUrl: citizens[0].imageurl,
        position: citizens[0].position,
        home: citizens[0].home,
        work: citizens[0].work,
        currentActivity: citizens[0].currentActivity
      });
    }
    
    return NextResponse.json(citizens);
    } catch (citizensError) {
      console.error('Error fetching citizens from Airtable:', citizensError);
      // Log detailed error information
      if (citizensError instanceof Error) {
        console.error('Error details:', {
          name: citizensError.name,
          message: citizensError.message,
          stack: citizensError.stack
        });
      }
      
      console.log('Returning debug citizens due to error');
      return NextResponse.json(getDebugCitizens());
    }
  } catch (error) {
    console.error('Critical error in citizens API:', error);
    // Log detailed error information
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    
    // Return a proper error response with debug citizens
    return NextResponse.json({
      error: 'An error occurred while fetching citizens',
      citizens: getDebugCitizens()
    }, { status: 500 });
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
