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
        'Citizen-Agent': 'Transport-Debug-Service'
      },
      // Add cache: 'no-store' to avoid caching issues
      cache: 'no-store',
      // Add timeout signal
      signal: AbortSignal.timeout(10000) // 10 second timeout
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
        'Citizen-Agent': 'Transport-Debug-Service'
      },
      // Add cache: 'no-store' to avoid caching issues
      cache: 'no-store',
      // Add timeout signal
      signal: AbortSignal.timeout(10000) // 10 second timeout
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
    
    console.log(`Transport debug request with mode: ${mode}`);
    
    // Initialize the transport service if needed
    if (!transportService.isPolygonsLoaded()) {
      console.log('Transport service not initialized, preloading polygons...');
      const success = await transportService.preloadPolygons();
      console.log(`Preloading polygons ${success ? 'succeeded' : 'failed'}`);
      
      if (!success) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Failed to initialize transport service',
            details: 'Could not load polygon data'
          },
          { status: 500 }
        );
      }
    }
    
    // Store the original pathfinding mode
    const originalMode = transportService.getPathfindingMode();
    console.log(`Original pathfinding mode: ${originalMode}`);
    
    // Set the requested pathfinding mode
    transportService.setPathfindingMode(mode === 'all' ? 'all' : 'real');
    console.log(`Set pathfinding mode to: ${mode === 'all' ? 'all' : 'real'}`);
    
    // Get debug information about the graph with the requested mode
    console.log('Calling debugGraph() to get graph information...');
    
    // Add a timeout to prevent hanging
    const debugGraphPromise = transportService.debugGraph();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Debug graph operation timed out after 30 seconds')), 30000);
    });
    
    const graphInfo = await Promise.race([debugGraphPromise, timeoutPromise])
      .catch(error => {
        console.error('Error or timeout in debugGraph():', error);
        // Return a minimal graph info object if there's an error
        return {
          error: error.message || 'Unknown error in debugGraph()',
          totalNodes: 0,
          totalEdges: 0,
          nodesByType: {},
          connectedComponents: 0,
          componentSizes: [],
          pathfindingMode: transportService.getPathfindingMode(),
          polygonsLoaded: transportService.isPolygonsLoaded(),
          polygonCount: 0,
          canalNetworkSegments: 0
        };
      });
    
    console.log('Graph debug info received:', Object.keys(graphInfo));
    
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
      try {
        console.log('Getting additional "all" mode graph info for comparison...');
        transportService.setPathfindingMode('all');
        
        // Add a timeout for this operation too
        const allModeGraphPromise = transportService.debugGraph();
        const allModeTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('All mode debug graph operation timed out')), 30000);
        });
        
        const allModeGraphInfo = await Promise.race([allModeGraphPromise, allModeTimeoutPromise])
          .catch(error => {
            console.error('Error or timeout in all mode debugGraph():', error);
            return {
              error: error.message || 'Unknown error in all mode debugGraph()',
              totalNodes: 0,
              totalEdges: 0
            };
          });
        
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
      } catch (error) {
        console.error('Error getting all mode graph info:', error);
        additionalInfo = {
          allModeGraphInfo: { error: 'Failed to get all mode graph info' }
        };
      }
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
      { 
        success: false, 
        error: 'An error occurred while debugging the transport graph',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
