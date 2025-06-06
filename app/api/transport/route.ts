import { NextResponse } from 'next/server';
import { transportService } from '@/lib/services/TransportService';
import NodeCache from 'node-cache';

// Initialize cache: stdTTL is standard time-to-live in seconds, checkperiod is when to check for expired items.
// Cache successful paths for 7 days (7 * 24 * 60 * 60 seconds), errors for 5 minutes.
const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;
const pathCache = new NodeCache({ stdTTL: SEVEN_DAYS_IN_SECONDS, checkperiod: 600 });
const ERROR_CACHE_TTL = 300; // 5 minutes for error caching

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

async function fetchTransporterDetails(path: any[]): Promise<string | null> {
  let transporter = null;
  const usesGondola = path.some((p: any) => p.transportMode === 'gondola');

  if (usesGondola) {
    const dockIds = [...new Set(path.filter((p: any) => p.type === 'dock' && p.nodeId).map((p: any) => p.nodeId))];
    if (dockIds.length > 0) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
      const buildingPromises = dockIds.map(dockId => {
        const buildingUrl = new URL(`/api/buildings/${encodeURIComponent(dockId)}`, baseUrl);
        return fetch(buildingUrl.toString())
          .then(res => {
            if (res.ok) return res.json();
            console.warn(`Failed to fetch building details for dock ${dockId} (transporter lookup): ${res.status}`);
            return null;
          })
          .catch(e => {
            console.error(`Error fetching building details for dock ${dockId} (transporter lookup):`, e);
            return null;
          });
      });

      try {
        const buildingResults = await Promise.all(buildingPromises);
        for (const buildingData of buildingResults) {
          if (buildingData && buildingData.building && buildingData.building.runBy) {
            transporter = buildingData.building.runBy;
            console.log(`Identified transporter ${transporter} from one of the docks (parallel fetch for transporter lookup)`);
            break;
          }
        }
      } catch (e) {
        console.error(`Error processing parallel building details fetches for docks (transporter lookup):`, e);
      }
    }
  }
  return transporter;
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
    const pathfindingMode = 'real'; // GET requests implicitly use 'real' mode

    const cacheKey = `path_${startLat}_${startLng}_${endLat}_${endLng}_${pathfindingMode}`;
    const cachedData = pathCache.get<any>(cacheKey);

    if (cachedData) {
      console.log(`[Cache HIT] GET /api/transport for key: ${cacheKey}`);
      if (cachedData.success) {
        const transportStartDate = startDateParam ? new Date(startDateParam) : new Date();
        const endDate = new Date(transportStartDate.getTime() + (cachedData.travelTimeSeconds * 1000));
        
        return NextResponse.json({
          success: true,
          path: cachedData.path,
          timing: {
            startDate: transportStartDate.toISOString(),
            endDate: endDate.toISOString(),
            durationSeconds: cachedData.travelTimeSeconds,
            distanceMeters: cachedData.distanceMeters
          },
          journey: cachedData.journey,
          transporter: cachedData.transporter,
          _cached: true
        });
      } else {
        // Return cached error
        return NextResponse.json({ success: false, error: cachedData.error, _cached: true });
      }
    }
    console.log(`[Cache MISS] GET /api/transport for key: ${cacheKey}`);

    // Find the path using the transport service
    const pathResult = await transportService.findPath(startPoint, endPoint, pathfindingMode);

    if (pathResult.success && pathResult.path) {
      if (pathResult.path.length > 0) {
        pathResult.path[0].transportMode = pathResult.path[0].transportMode || null;
        for (let i = 1; i < pathResult.path.length; i++) {
          if (!pathResult.path[i].transportMode) {
            pathResult.path[i].transportMode = 'walk';
          }
        }
      }

      const distance = calculatePathDistance(pathResult.path);
      const travelTimeSeconds = calculatePathTravelTime(pathResult.path);
      const journey = extractJourneyFromPath(pathResult.path);
      const transporter = await fetchTransporterDetails(pathResult.path);

      const dataToCache = {
        success: true,
        path: pathResult.path,
        distanceMeters: distance,
        travelTimeSeconds: travelTimeSeconds,
        journey: journey,
        transporter: transporter
      };
      pathCache.set(cacheKey, dataToCache);
      
      const transportStartDate = startDateParam ? new Date(startDateParam) : new Date();
      const endDate = new Date(transportStartDate.getTime() + (travelTimeSeconds * 1000));
      
      return NextResponse.json({
        success: true,
        path: pathResult.path,
        timing: {
          startDate: transportStartDate.toISOString(),
          endDate: endDate.toISOString(),
          durationSeconds: travelTimeSeconds,
          distanceMeters: distance
        },
        journey: journey,
        transporter: transporter
      });
    } else {
      // Cache the failure
      pathCache.set(cacheKey, { success: false, error: pathResult.error }, ERROR_CACHE_TTL);
      return NextResponse.json(pathResult); // pathResult already contains { success: false, error: ... }
    }
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
    
    const effectivePathfindingMode = pathfindingMode || 'real';

    const cacheKey = `path_${startPoint.lat}_${startPoint.lng}_${endPoint.lat}_${endPoint.lng}_${effectivePathfindingMode}`;
    const cachedData = pathCache.get<any>(cacheKey);

    if (cachedData) {
      console.log(`[Cache HIT] POST /api/transport for key: ${cacheKey}`);
      if (cachedData.success) {
        const endDate = new Date(transportStartDate.getTime() + (cachedData.travelTimeSeconds * 1000));
        return NextResponse.json({
          success: true,
          path: cachedData.path,
          timing: {
            startDate: transportStartDate.toISOString(),
            endDate: endDate.toISOString(),
            durationSeconds: cachedData.travelTimeSeconds,
            distanceMeters: cachedData.distanceMeters
          },
          journey: cachedData.journey,
          transporter: cachedData.transporter,
          _cached: true
        });
      } else {
        return NextResponse.json({ success: false, error: cachedData.error, _cached: true });
      }
    }
    console.log(`[Cache MISS] POST /api/transport for key: ${cacheKey}`);
    
    let pathResult = await transportService.findPath(startPoint, endPoint, effectivePathfindingMode);
    
    if (!pathResult.success && pathResult.error === 'Start or end point is not within any polygon') {
      console.log('Regular pathfinding failed, attempting water-only pathfinding as fallback');
      pathResult = await transportService.findWaterOnlyPath(startPoint, endPoint, effectivePathfindingMode);
        
      if (!pathResult.success) {
        pathCache.set(cacheKey, { success: false, error: 'No path could be found between the specified points', details: 'Points are not within navigable areas or no valid route exists' }, ERROR_CACHE_TTL);
        return NextResponse.json({
          success: false,
          error: 'No path could be found between the specified points',
          details: 'Points are not within navigable areas or no valid route exists'
        });
      }
    }
    
    if (pathResult.success && pathResult.path) {
      if (pathResult.path.length > 0) {
        pathResult.path[0].transportMode = pathResult.path[0].transportMode || null;
        for (let i = 1; i < pathResult.path.length; i++) {
          if (!pathResult.path[i].transportMode) {
            pathResult.path[i].transportMode = 'walk';
          }
        }
      }

      const distance = calculatePathDistance(pathResult.path);
      const travelTimeSeconds = calculatePathTravelTime(pathResult.path);
      const journey = extractJourneyFromPath(pathResult.path);
      const transporter = await fetchTransporterDetails(pathResult.path);

      const dataToCache = {
        success: true,
        path: pathResult.path,
        distanceMeters: distance,
        travelTimeSeconds: travelTimeSeconds,
        journey: journey,
        transporter: transporter
      };
      pathCache.set(cacheKey, dataToCache);
      
      const endDate = new Date(transportStartDate.getTime() + (travelTimeSeconds * 1000));
      
      return NextResponse.json({
        success: true,
        path: pathResult.path,
        timing: {
          startDate: transportStartDate.toISOString(),
          endDate: endDate.toISOString(),
          durationSeconds: travelTimeSeconds,
          distanceMeters: distance
        },
        journey: journey,
        transporter: transporter
      });
    } else {
      pathCache.set(cacheKey, { success: false, error: pathResult.error }, ERROR_CACHE_TTL);
      return NextResponse.json(pathResult);
    }
  } catch (error) {
    console.error('Error in transport route:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while processing the request' },
      { status: 500 }
    );
  }
}
