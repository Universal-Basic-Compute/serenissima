import { NextResponse } from 'next/server';

interface Point {
  lat: number;
  lng: number;
}

interface Activity {
  ActivityId: string;
  CitizenId: string;
  StartDate: string;
  EndDate: string;
  Path: Point[] | string;
  Type: string;
}

interface Citizen {
  CitizenId: string;
  Position: Point | string;
  Point?: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const citizenIds = searchParams.getAll('citizenId');
    const includeActivities = searchParams.get('includeActivities') === 'true';
    
    // Get Airtable credentials from environment variables
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';
    const AIRTABLE_ACTIVITIES_TABLE = process.env.AIRTABLE_ACTIVITIES_TABLE || 'ACTIVITIES';
    
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { success: false, error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }
    
    // Fetch citizens
    let citizensUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_CITIZENS_TABLE}`;
    
    // Add filter if specific citizen IDs are provided
    if (citizenIds.length > 0) {
      const filterFormula = citizenIds.length === 1
        ? `{CitizenId}='${citizenIds[0]}'`
        : `OR(${citizenIds.map(id => `{CitizenId}='${id}'`).join(',')})`;
      
      citizensUrl += `?filterByFormula=${encodeURIComponent(filterFormula)}`;
    }
    
    const citizensResponse = await fetch(citizensUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!citizensResponse.ok) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch citizens: ${citizensResponse.statusText}` },
        { status: citizensResponse.status }
      );
    }
    
    const citizensData = await citizensResponse.json();
    const citizens: Citizen[] = citizensData.records.map((record: any) => ({
      CitizenId: record.fields.CitizenId,
      Position: record.fields.Position,
      Point: record.fields.Point
    }));
    
    // Fetch active activities with paths
    const now = new Date().toISOString();
    const activitiesUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_ACTIVITIES_TABLE}?filterByFormula=${encodeURIComponent(
      `AND({StartDate}<='${now}', {EndDate}>='${now}', NOT({Path}=''), NOT({Path}=BLANK()))`
    )}`;
    
    const activitiesResponse = await fetch(activitiesUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!activitiesResponse.ok) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch activities: ${activitiesResponse.statusText}` },
        { status: activitiesResponse.status }
      );
    }
    
    const activitiesData = await activitiesResponse.json();
    const activities: Activity[] = activitiesData.records.map((record: any) => ({
      ActivityId: record.fields.ActivityId,
      CitizenId: record.fields.CitizenId,
      StartDate: record.fields.StartDate,
      EndDate: record.fields.EndDate,
      Path: record.fields.Path,
      Type: record.fields.Type
    }));
    
    // Calculate real-time positions
    const citizenPositions = citizens.map(citizen => {
      // Find active activity for this citizen
      const activity = activities.find(a => a.CitizenId === citizen.CitizenId);
      
      if (!activity) {
        // Return stored position if no active activity
        let position: Point;
        
        if (typeof citizen.Position === 'string') {
          try {
            position = JSON.parse(citizen.Position);
          } catch (e) {
            // Try to extract from Point field
            if (citizen.Point && typeof citizen.Point === 'string') {
              const parts = citizen.Point.split('_');
              if (parts.length >= 3) {
                const lat = parseFloat(parts[1]);
                const lng = parseFloat(parts[2]);
                if (!isNaN(lat) && !isNaN(lng)) {
                  position = { lat, lng };
                }
              }
            }
            
            // Default position if all else fails
            if (!position) {
              position = { lat: 45.4371, lng: 12.3326 };
            }
          }
        } else {
          position = citizen.Position as Point;
        }
        
        return {
          citizenId: citizen.CitizenId,
          position,
          activity: null
        };
      }
      
      // Parse path
      let path: Point[];
      if (typeof activity.Path === 'string') {
        try {
          path = JSON.parse(activity.Path);
        } catch (e) {
          // Return stored position if path parsing fails
          return {
            citizenId: citizen.CitizenId,
            position: typeof citizen.Position === 'string' ? JSON.parse(citizen.Position) : citizen.Position,
            activity: includeActivities ? activity : null
          };
        }
      } else {
        path = activity.Path as Point[];
      }
      
      // Calculate progress along path
      const startTime = new Date(activity.StartDate).getTime();
      const endTime = new Date(activity.EndDate).getTime();
      const currentTime = Date.now();
      const totalDuration = endTime - startTime;
      
      if (totalDuration <= 0) {
        return {
          citizenId: citizen.CitizenId,
          position: typeof citizen.Position === 'string' ? JSON.parse(citizen.Position) : citizen.Position,
          activity: includeActivities ? activity : null
        };
      }
      
      const progress = Math.min(1.0, Math.max(0.0, (currentTime - startTime) / totalDuration));
      
      // Calculate position along path
      const position = calculatePositionAlongPath(path, progress);
      
      return {
        citizenId: citizen.CitizenId,
        position,
        activity: includeActivities ? activity : null
      };
    });
    
    return NextResponse.json({
      success: true,
      positions: citizenPositions
    });
  } catch (error) {
    console.error('Error fetching citizen positions:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while fetching citizen positions' },
      { status: 500 }
    );
  }
}

// Helper function to calculate position along a path
function calculatePositionAlongPath(path: Point[], progress: number): Point {
  if (!path || path.length < 2) {
    return path[0] || { lat: 45.4371, lng: 12.3326 };
  }
  
  // Calculate total path length
  let totalDistance = 0;
  const segments: {start: number, end: number, distance: number, index: number}[] = [];
  
  for (let i = 0; i < path.length - 1; i++) {
    const distance = calculateDistance(path[i], path[i+1]);
    segments.push({
      start: totalDistance,
      end: totalDistance + distance,
      distance,
      index: i
    });
    totalDistance += distance;
  }
  
  // Find the segment where the progress falls
  const targetDistance = progress * totalDistance;
  const segment = segments.find(s => targetDistance >= s.start && targetDistance <= s.end) || segments[0];
  
  // Calculate position within the segment
  const segmentProgress = segment.distance > 0 
    ? (targetDistance - segment.start) / segment.distance 
    : 0;
  
  const segmentIndex = segment.index;
  const p1 = path[segmentIndex];
  const p2 = path[segmentIndex + 1];
  
  // Interpolate between the two points
  return {
    lat: p1.lat + (p2.lat - p1.lat) * segmentProgress,
    lng: p1.lng + (p2.lng - p1.lng) * segmentProgress
  };
}

// Helper function to calculate distance between two points
function calculateDistance(point1: Point, point2: Point): number {
  // Haversine formula
  const R = 6371000; // Earth radius in meters
  
  const lat1 = point1.lat * Math.PI / 180;
  const lng1 = point1.lng * Math.PI / 180;
  const lat2 = point2.lat * Math.PI / 180;
  const lng2 = point2.lng * Math.PI / 180;
  
  const dlat = lat2 - lat1;
  const dlng = lng2 - lng1;
  
  const a = Math.sin(dlat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlng/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c;
}
