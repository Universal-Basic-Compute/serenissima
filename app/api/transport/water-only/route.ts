import { NextResponse } from 'next/server';
import { transportService } from '@/lib/services/TransportService';

// Import the helper functions from the main transport route
import { calculatePathDistance, calculatePathTravelTime, extractJourneyFromPath, fetchTransporterDetails } from '../route';

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
    
    console.log('Water-only route endpoint called directly with:', { startPoint, endPoint });
    
    // Use water-only pathfinding directly from the transport service
    const pathResult = await transportService.findWaterOnlyPath(startPoint, endPoint);
    
    if (pathResult.success && pathResult.path) {
      // Add transport mode information
      if (pathResult.path.length > 0) {
        pathResult.path[0].transportMode = pathResult.path[0].transportMode || 'gondola';
        for (let i = 1; i < pathResult.path.length; i++) {
          pathResult.path[i].transportMode = 'gondola'; // Water-only paths use gondolas
        }
      }

      // Calculate additional information
      const distance = calculatePathDistance(pathResult.path);
      const travelTimeSeconds = calculatePathTravelTime(pathResult.path);
      const journey = extractJourneyFromPath(pathResult.path);
      const transporter = await fetchTransporterDetails(pathResult.path);
      
      // Parse startDate if provided, otherwise use current time
      const transportStartDate = startDate ? new Date(startDate) : new Date();
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
    }
    
    return NextResponse.json(pathResult);
  } catch (error) {
    console.error('Error in water-only transport route:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while processing the water-only route request',
      errorDetails: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
