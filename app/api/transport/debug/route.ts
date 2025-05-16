import { NextResponse } from 'next/server';
import { transportService } from '@/lib/services/TransportService';

// Add a function to fetch bridge information
async function fetchBridges() {
  try {
    // Use absolute URL for server-side fetching
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    console.log(`Fetching bridges from: ${baseUrl}/api/bridges`);
    
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
    const mode = searchParams.get('mode') || 'real'; // Default to 'real' if not specified
    
    // Initialize the transport service if needed
    if (!transportService.isPolygonsLoaded()) {
      await transportService.preloadPolygons();
    }
    
    // Store the original pathfinding mode
    const originalMode = transportService.getPathfindingMode();
    
    // Set the requested pathfinding mode
    transportService.setPathfindingMode(mode === 'all' ? 'all' : 'real');
    
    // Get debug information about the graph with the requested mode
    const graphInfo = transportService.debugGraph();
    
    // Fix the component sizes array - it's likely too large to return in full
    if (graphInfo.componentSizes && graphInfo.componentSizes.length > 0) {
      // Just return summary statistics instead of the full array
      const componentSizeStats = {
        count: graphInfo.componentSizes.length,
        min: Math.min(...graphInfo.componentSizes),
        max: Math.max(...graphInfo.componentSizes),
        avg: graphInfo.componentSizes.reduce((sum, size) => sum + size, 0) / graphInfo.componentSizes.length,
        largestComponents: graphInfo.componentSizes
          .sort((a, b) => b - a)
          .slice(0, 5) // Just return the 5 largest components
      };
      
      // Replace the full array with the summary
      graphInfo.componentSizes = componentSizeStats;
    }
    
    // Always fetch bridges and docks regardless of mode
    const bridges = await fetchBridges();
    const docks = await fetchDocks();
    
    // If mode=all, include additional information for comparison
    let additionalInfo = {};
    if (mode === 'all') {
      // We already have the 'all' mode graph info, so no need to switch modes again
      additionalInfo = {};
    } else if (mode === 'real') {
      // If we're in 'real' mode, get 'all' mode info for comparison
      transportService.setPathfindingMode('all');
      const allModeGraphInfo = transportService.debugGraph();
      
      // Fix component sizes for all mode too
      if (allModeGraphInfo.componentSizes && allModeGraphInfo.componentSizes.length > 0) {
        const componentSizeStats = {
          count: allModeGraphInfo.componentSizes.length,
          min: Math.min(...allModeGraphInfo.componentSizes),
          max: Math.max(...allModeGraphInfo.componentSizes),
          avg: allModeGraphInfo.componentSizes.reduce((sum, size) => sum + size, 0) / allModeGraphInfo.componentSizes.length,
          largestComponents: allModeGraphInfo.componentSizes
            .sort((a, b) => b - a)
            .slice(0, 5)
        };
        
        allModeGraphInfo.componentSizes = componentSizeStats;
      }
      
      additionalInfo = {
        allModeGraphInfo
      };
    }
    
    // Reset pathfinding mode to original
    transportService.setPathfindingMode(originalMode);
    
    return NextResponse.json({
      success: true,
      graphInfo,
      bridges,
      docks,
      bridgeCount: bridges.length,
      dockCount: docks.length,
      requestedMode: mode,
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
