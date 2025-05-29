import { NextResponse } from 'next/server';
import { transportService } from '@/lib/services/TransportService';

// Define speeds
const WALKING_SPEED_MPS = 1.4; // meters per second
const GONDOLA_SPEED_MPS = WALKING_SPEED_MPS * 2; // Gondolas are twice as fast

// Helper function to calculate travel time considering different transport modes
function calculatePathTravelTime(path: {lat: number, lng: number, transportMode?: string}[]): number {
  let totalTravelTimeSeconds = 0;
  if (!path || path.length < 2) {
    return 0;
  }

  for (let i = 1; i < path.length; i++) {
    const point1 = path[i - 1];
    const point2 = path[i];
    
    const segmentDistance = haversineDistance(point1.lat, point1.lng, point2.lat, point2.lng);
    // Assume point2.transportMode indicates the mode used to travel from point1 to point2
    const mode = point2.transportMode; 
    const speed = (mode === 'gondola') ? GONDOLA_SPEED_MPS : WALKING_SPEED_MPS;
    
    if (speed > 0) {
      totalTravelTimeSeconds += segmentDistance / speed;
    }
  }
  return totalTravelTimeSeconds;
}

// Function to extract journey information from the path
function extractJourneyFromPath(path: any[]): any[] {
  if (!path || !Array.isArray(path) || path.length === 0) {
    return [];
  }
  
  const journey: any[] = [];
  let currentLandId: string | null = null;
  
  // Process each point in the path
  for (const point of path) {
    // Skip intermediate points to avoid duplicates
    if (point.isIntermediatePoint) {
      continue;
    }
    
    // Add land polygons to the journey
    if (point.polygonId && point.polygonId !== currentLandId) {
      currentLandId = point.polygonId;
      journey.push({
        type: 'land',
        id: point.polygonId,
        position: { lat: point.lat, lng: point.lng }
      });
    }
    
    // Add bridges to the journey
    if (point.type === 'bridge' && point.nodeId) {
      journey.push({
        type: 'bridge',
        id: point.nodeId,
        position: { lat: point.lat, lng: point.lng }
      });
    }
    
    // Add docks to the journey
    if (point.type === 'canal' && point.nodeId) {
      journey.push({
        type: 'dock',
        id: point.nodeId,
        position: { lat: point.lat, lng: point.lng }
      });
    }
  }
  
  return journey;
}

// Helper function to calculate the total distance of a path in meters
function calculatePathDistance(path: {lat: number, lng: number}[]): number {
  let totalDistance = 0;
  
  for (let i = 1; i < path.length; i++) {
    const point1 = path[i - 1];
    const point2 = path[i];
    
    // Calculate distance between consecutive points using the Haversine formula
    totalDistance += haversineDistance(point1.lat, point1.lng, point2.lat, point2.lng);
  }
  
  return totalDistance;
}

// Haversine formula to calculate distance between two lat/lng points in meters
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return distance;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Get start and end points from query parameters
    const startLat = parseFloat(searchParams.get('startLat') || '');
    const startLng = parseFloat(searchParams.get('startLng') || '');
    const endLat = parseFloat(searchParams.get('endLat') || '');
    const endLng = parseFloat(searchParams.get('endLng') || '');
    
    // Get optional startDate parameter
    const startDateParam = searchParams.get('startDate');
    const startDate = startDateParam ? new Date(startDateParam) : new Date();
    
    // Validate coordinates
    if (isNaN(startLat) || isNaN(startLng) || isNaN(endLat) || isNaN(endLng)) {
      return NextResponse.json(
        { success: false, error: 'Invalid coordinates. Please provide valid startLat, startLng, endLat, and endLng parameters.' },
        { status: 400 }
      );
    }
    
    // Validate startDate if provided
    if (startDateParam && isNaN(startDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid startDate. Please provide a valid date string.' },
        { status: 400 }
      );
    }
    
    const startPoint = { lat: startLat, lng: startLng };
    const endPoint = { lat: endLat, lng: endLng };
    
    // Find the path using the transport service
    const result = await transportService.findPath(startPoint, endPoint);

    // If path was found successfully, add timing and journey information
    if (result.success && result.path) {
      // Ensure transportMode is set on path points for the response
      if (result.path.length > 0) {
        result.path[0].transportMode = result.path[0].transportMode || null;
        for (let i = 1; i < result.path.length; i++) {
          if (!result.path[i].transportMode) {
            result.path[i].transportMode = 'walk'; // Default to 'walk'
          }
        }
      }

      const distance = calculatePathDistance(result.path);
      const travelTimeSeconds = calculatePathTravelTime(result.path);
      
      const transportStartDate = startDateParam ? new Date(startDateParam) : new Date();
      const endDate = new Date(transportStartDate.getTime() + (travelTimeSeconds * 1000));
      
      result.timing = {
        startDate: transportStartDate.toISOString(),
        endDate: endDate.toISOString(),
        durationSeconds: travelTimeSeconds,
        distanceMeters: distance
      };
      
      const journey = extractJourneyFromPath(result.path);
      result.journey = journey;

      // Determine transporter if gondola is used (similar to POST)
      let transporter = null;
      const usesGondola = result.path.some((p: any) => p.transportMode === 'gondola');

      if (usesGondola) {
        for (const point of result.path) {
          if (point.type === 'dock' && point.nodeId) {
            try {
              const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                              (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
              const buildingUrl = new URL(`/api/buildings/${encodeURIComponent(point.nodeId)}`, baseUrl);
              const buildingResponse = await fetch(buildingUrl.toString());

              if (buildingResponse.ok) {
                const buildingData = await buildingResponse.json();
                if (buildingData.building && buildingData.building.runBy) {
                  transporter = buildingData.building.runBy;
                  console.log(`Identified transporter ${transporter} from dock ${point.nodeId} for GET request`);
                  break; 
                }
              } else {
                console.warn(`Failed to fetch building details for dock ${point.nodeId} (GET request): ${buildingResponse.status}`);
              }
            } catch (e) {
              console.error(`Error fetching building details for dock ${point.nodeId} (GET request):`, e);
            }
          }
        }
      }
      result.transporter = transporter;
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in GET transport route:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while processing the GET request' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Get start and end points from request body
    const { startPoint, endPoint, startDate, pathfindingMode } = body;
    
    // Validate parameters
    if (!startPoint || !endPoint || 
        typeof startPoint.lat !== 'number' || typeof startPoint.lng !== 'number' ||
        typeof endPoint.lat !== 'number' || typeof endPoint.lng !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid coordinates. Please provide valid startPoint and endPoint objects with lat and lng properties.' },
        { status: 400 }
      );
    }
    
    // Parse startDate if provided, otherwise use current time
    const transportStartDate = startDate ? new Date(startDate) : new Date();
    
    // Check if startDate is valid
    if (startDate && isNaN(transportStartDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid startDate. Please provide a valid date string.' },
        { status: 400 }
      );
    }
    
    // Find the path using the transport service with specified mode or default to 'real'
    let result = await transportService.findPath(startPoint, endPoint, pathfindingMode || 'real');
    
    // If regular pathfinding failed with "not within any polygon" error, try water-only pathfinding
    if (!result.success && result.error === 'Start or end point is not within any polygon') {
      console.log('Regular pathfinding failed, attempting water-only pathfinding as fallback');
      result = await transportService.findWaterOnlyPath(startPoint, endPoint, pathfindingMode || 'real');
        
      // If water-only pathfinding also failed, return a clear error
      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: 'No path could be found between the specified points',
          details: 'Points are not within navigable areas or no valid route exists'
        });
      }
    }
    
    // If path was found successfully, calculate the endDate and determine transporter
    if (result.success && result.path) {
      // Ensure transportMode is set on path points for the response
      if (result.path.length > 0) {
        result.path[0].transportMode = result.path[0].transportMode || null;
        for (let i = 1; i < result.path.length; i++) {
          if (!result.path[i].transportMode) {
            result.path[i].transportMode = 'walk'; // Default to 'walk'
          }
        }
      }

      // Calculate the distance of the path
      const distance = calculatePathDistance(result.path);
      const travelTimeSeconds = calculatePathTravelTime(result.path);
      
      // Calculate endDate by adding travel time to startDate
      const endDate = new Date(transportStartDate.getTime() + (travelTimeSeconds * 1000));
      
      // Add timing information to the result
      result.timing = {
        startDate: transportStartDate.toISOString(),
        endDate: endDate.toISOString(),
        durationSeconds: travelTimeSeconds,
        distanceMeters: distance
      };
      
      // Extract journey information from the path
      const journey = extractJourneyFromPath(result.path);
      result.journey = journey;

      // Determine transporter if gondola is used
      let transporter = null;
      const usesGondola = result.path.some((p: any) => p.transportMode === 'gondola');

      if (usesGondola) {
        for (const point of result.path) {
          // Check if the point itself is a dock or if a segment starting/ending here is gondola
          // and this point is a dock.
          // The transportMode is on the segment, so we'd ideally check segments.
          // For simplicity, if any point in the path is a dock and gondolas are used,
          // we try to get its operator. This might need refinement if path structure is complex.
          if (point.type === 'dock' && point.nodeId) {
            try {
              const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                              (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
              const buildingUrl = new URL(`/api/buildings/${encodeURIComponent(point.nodeId)}`, baseUrl);
              const buildingResponse = await fetch(buildingUrl.toString());

              if (buildingResponse.ok) {
                const buildingData = await buildingResponse.json();
                if (buildingData.building && buildingData.building.runBy) {
                  transporter = buildingData.building.runBy;
                  console.log(`Identified transporter ${transporter} from dock ${point.nodeId}`);
                  break; // Use the first dock operator found in the path
                }
              } else {
                console.warn(`Failed to fetch building details for dock ${point.nodeId}: ${buildingResponse.status}`);
              }
            } catch (e) {
              console.error(`Error fetching building details for dock ${point.nodeId}:`, e);
            }
          }
        }
      }
      result.transporter = transporter; // Add transporter to the result, will be null if not found/not applicable
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in transport route:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while processing the request' },
      { status: 500 }
    );
  }
}
