import { NextResponse } from 'next/server';
import { transportService } from '@/lib/services/TransportService';

// Add a function to fetch bridge information
async function fetchBridges() {
  try {
    // Use absolute URL for server-side fetching
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/bridges`, {
      // Add these headers for server-side fetch
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Transport-Debug-Service'
      },
      // Add cache: 'no-store' to avoid caching issues
      cache: 'no-store'
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`Successfully fetched ${data.bridges?.length || 0} bridges`);
      return data.bridges || [];
    }
    
    console.error(`Failed to fetch bridges: ${response.status} ${response.statusText}`);
    return [];
  } catch (error) {
    console.error('Error fetching bridges:', error);
    return [];
  }
}

// Add a function to fetch dock information
async function fetchDocks() {
  try {
    // Use absolute URL for server-side fetching
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/docks`, {
      // Add these headers for server-side fetch
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Transport-Debug-Service'
      },
      // Add cache: 'no-store' to avoid caching issues
      cache: 'no-store'
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`Successfully fetched ${data.docks?.length || 0} docks`);
      return data.docks || [];
    }
    
    console.error(`Failed to fetch docks: ${response.status} ${response.statusText}`);
    return [];
  } catch (error) {
    console.error('Error fetching docks:', error);
    return [];
  }
}

export async function GET(request: Request) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode');
    
    // Initialize the transport service if needed
    if (!transportService.isPolygonsLoaded()) {
      await transportService.preloadPolygons();
    }
    
    // Get debug information about the graph
    const graphInfo = transportService.debugGraph();
    
    // Always fetch bridges and docks regardless of mode
    const bridges = await fetchBridges();
    const docks = await fetchDocks();
    
    // If mode=all, include additional information
    let additionalInfo = {};
    if (mode === 'all') {
      // Set pathfinding mode to 'all' temporarily if requested
      const originalMode = transportService.getPathfindingMode();
      transportService.setPathfindingMode('all');
      
      // Get updated graph info with 'all' mode
      const allModeGraphInfo = transportService.debugGraph();
      
      // Reset pathfinding mode to original
      transportService.setPathfindingMode(originalMode);
      
      additionalInfo = {
        allModeGraphInfo
      };
    }
    
    return NextResponse.json({
      success: true,
      graphInfo,
      bridges,
      docks,
      bridgeCount: bridges.length,
      dockCount: docks.length,
      ...additionalInfo
    });
  } catch (error) {
    console.error('Error in transport debug route:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while debugging the transport graph' },
      { status: 500 }
    );
  }
}
