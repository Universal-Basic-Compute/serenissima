import { NextResponse } from 'next/server';

// Cache the land owners data with a longer expiration
let cachedData: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
const FETCH_TIMEOUT = 15000; // Reduce timeout to 15 seconds

export async function GET(request: Request) {
  try {
    const currentTime = Date.now();
    
    // Implement HTTP caching with ETag
    const headers = new Headers();
    
    // Generate ETag based on data
    const etag = `"${cacheTimestamp}"`; 
    headers.set('ETag', etag);
    headers.set('Cache-Control', 'public, max-age=300'); // 5 minutes
    
    // Check if client has valid cache
    const requestHeaders = new Headers(request.headers);
    const ifNoneMatch = requestHeaders.get('If-None-Match');
    
    if (ifNoneMatch === etag && cachedData) {
      // Client has valid cache, return 304 Not Modified
      return new Response(null, {
        status: 304,
        headers
      });
    }
    
    // Check if we have valid cached data
    if (cachedData && (currentTime - cacheTimestamp) < CACHE_DURATION) {
      console.log('Returning cached land owners data');
      return NextResponse.json(cachedData, { headers });
    }
    
    console.log('Fetching fresh land ownership data from backend...');
    
    try {
      // Use a more efficient endpoint that returns minimal data
      const response = await fetch('http://localhost:8000/api/lands/basic', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT)
      });
      
      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`Received ${data.length} land records from backend`);
      
      // Update the cache
      cachedData = { success: true, lands: data };
      cacheTimestamp = currentTime;
      
      return NextResponse.json(cachedData, { headers });
    } catch (fetchError) {
      console.error('Error fetching from backend:', fetchError);
      
      // If we have stale cache, return it rather than failing
      if (cachedData) {
        console.log('Returning stale cached data due to fetch error');
        return NextResponse.json({
          ...cachedData,
          _cached: true,
          _stale: true,
          _error: fetchError instanceof Error ? fetchError.message : String(fetchError)
        });
      }
      
      // If no cache exists, create an empty response
      return NextResponse.json({
        success: true,
        lands: [],
        _error: fetchError.message
      });
    }
  } catch (error) {
    console.error('Error in GET handler:', error);
    
    // If we have any cache, return it rather than failing
    if (cachedData) {
      console.log('Returning cached data due to handler error');
      return NextResponse.json({
        ...cachedData,
        _cached: true,
        _error: error.message
      });
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch land ownership data', 
        message: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}
