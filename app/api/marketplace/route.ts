import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/apiUtils';

// Cache the marketplace data with a reasonable expiration
let cachedData: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const FETCH_TIMEOUT = 10000; // 10 seconds timeout

export async function GET(request: NextRequest) {
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
      console.log('Returning cached marketplace data');
      return NextResponse.json(cachedData, { headers });
    }
    
    console.log('Fetching fresh marketplace data from backend...');
    
    try {
      // Get active listings from the backend
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiBaseUrl}/api/transactions`, {
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
      console.log(`Received ${data.length} transactions from backend`);
      
      // Filter to only include active listings (no buyer, no executed_at)
      const activeListings = data.filter((listing: any) => 
        !listing.executed_at && !listing.buyer
      );
      
      console.log(`Found ${activeListings.length} active listings`);
      
      // Transform the data to match our frontend model
      const formattedListings = activeListings.map((listing: any) => ({
        id: listing.id,
        type: listing.type,
        assetId: listing.asset_id,
        seller: listing.seller,
        price: listing.price,
        createdAt: listing.created_at,
        updatedAt: listing.updated_at,
        status: 'active',
        metadata: {
          historicalName: listing.historical_name,
          englishName: listing.english_name,
          description: listing.description
        }
      }));
      
      // Update the cache
      cachedData = { 
        success: true, 
        listings: formattedListings,
        timestamp: currentTime
      };
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
        listings: [],
        _error: fetchError instanceof Error ? fetchError.message : String(fetchError)
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
        _error: error instanceof Error ? error.message : String(error)
      });
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch marketplace data', 
        message: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}
