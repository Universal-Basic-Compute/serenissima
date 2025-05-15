import { NextResponse } from 'next/server';
import { transportService } from '@/lib/services/TransportService';

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
    
    // If path was found successfully, calculate the endDate
    if (result.success && result.path) {
      // Calculate the distance of the path
      const distance = calculatePathDistance(result.path);
      
      // Calculate travel time based on distance (assume average speed of 108 km/h)
      // 108 km/h = 108000 m/h = 30 m/s
      const averageSpeedMetersPerSecond = 30;
      const travelTimeSeconds = distance / averageSpeedMetersPerSecond;
      
      // Calculate endDate by adding travel time to startDate
      const endDate = new Date(startDate.getTime() + (travelTimeSeconds * 1000));
      
      // Add timing information to the result
      result.timing = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        durationSeconds: travelTimeSeconds,
        distanceMeters: distance
      };
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Get start and end points from request body
    const { startPoint, endPoint, startDate } = body;
    
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
    
    // Find the path using the transport service
    let result = await transportService.findPath(startPoint, endPoint);
    
    // If regular pathfinding failed with "not within any polygon" error, try water-only pathfinding
    if (!result.success && result.error === 'Start or end point is not within any polygon') {
      console.log('Regular pathfinding failed, attempting water-only pathfinding as fallback');
      result = await transportService.findWaterOnlyPath(startPoint, endPoint);
    }
    
    // If path was found successfully, calculate the endDate
    if (result.success && result.path) {
      // Calculate the distance of the path
      const distance = calculatePathDistance(result.path);
      
      // Calculate travel time based on distance (assume average speed of 108 km/h)
      // 108 km/h = 108000 m/h = 30 m/s
      const averageSpeedMetersPerSecond = 30;
      const travelTimeSeconds = distance / averageSpeedMetersPerSecond;
      
      // Calculate endDate by adding travel time to startDate
      const endDate = new Date(transportStartDate.getTime() + (travelTimeSeconds * 1000));
      
      // Add timing information to the result
      result.timing = {
        startDate: transportStartDate.toISOString(),
        endDate: endDate.toISOString(),
        durationSeconds: travelTimeSeconds,
        distanceMeters: distance
      };
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
