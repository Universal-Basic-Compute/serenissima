import { NextResponse } from 'next/server';
import { transportService } from '@/lib/services/TransportService';

export async function GET(request: Request) {
  try {
    // Initialize the transport service if needed
    if (!transportService.isPolygonsLoaded()) {
      await transportService.preloadPolygons();
    }
    
    // Get debug information about the graph
    const graphInfo = transportService.debugGraph();
    
    return NextResponse.json({
      success: true,
      graphInfo
    });
  } catch (error) {
    console.error('Error in transport debug route:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while debugging the transport graph' },
      { status: 500 }
    );
  }
}
