import { NextResponse } from 'next/server';
import { transportService } from '@/lib/services/TransportService';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Get start and end points from request body
    const { startPoint, endPoint } = body;
    
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
    const result = await transportService.findWaterOnlyPath(startPoint, endPoint);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in water-only transport route:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while processing the water-only route request',
      errorDetails: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
