import { NextResponse } from 'next/server';

// Cache the land owners data with a 5-minute expiration
let cachedData: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export async function GET() {
  try {
    const currentTime = Date.now();
    
    // Check if we have valid cached data
    if (cachedData && (currentTime - cacheTimestamp) < CACHE_DURATION) {
      console.log('Returning cached land owners data');
      return NextResponse.json(cachedData);
    }
    
    console.log('Fetching fresh land ownership data from backend...');
    
    // Fetch land ownership data from the backend
    const response = await fetch('http://localhost:8000/api/lands', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Add a timeout to prevent hanging requests
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Received ${data.length} land records from backend`);
    
    // Update the cache
    cachedData = { success: true, lands: data };
    cacheTimestamp = currentTime;
    
    // Set cache headers
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    
    return NextResponse.json(cachedData, { headers });
  } catch (error) {
    console.error('Error fetching land ownership data:', error);
    
    // If we have stale cache, return it rather than failing
    if (cachedData) {
      console.log('Returning stale cached data due to fetch error');
      return NextResponse.json({
        ...cachedData,
        _cached: true,
        _error: error.message
      });
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to fetch land ownership data' },
      { status: 500 }
    );
  }
}
