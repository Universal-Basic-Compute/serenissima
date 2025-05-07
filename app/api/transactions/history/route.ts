import { NextRequest, NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/apiUtils';

// Cache the transaction history data with a reasonable expiration
let cachedData: Map<string, {data: any, timestamp: number}> = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const FETCH_TIMEOUT = 10000; // 10 seconds timeout

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const assetId = searchParams.get('assetId');
    const role = searchParams.get('role');
    
    // Create a cache key based on the request parameters
    const cacheKey = `${userId || 'all'}_${assetId || 'all'}_${role || 'all'}`;
    const currentTime = Date.now();
    
    // Check if we have valid cached data
    const cachedEntry = cachedData.get(cacheKey);
    if (cachedEntry && (currentTime - cachedEntry.timestamp) < CACHE_DURATION) {
      console.log(`Returning cached transaction history for ${cacheKey}`);
      return NextResponse.json(cachedEntry.data);
    }
    
    console.log(`Fetching fresh transaction history for ${cacheKey}...`);
    
    try {
      // Build the appropriate endpoint based on parameters
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      let endpoint = `${apiBaseUrl}/api/transactions`;
      
      if (assetId) {
        endpoint = `${apiBaseUrl}/api/transactions/land/${assetId}`;
      }
      
      const response = await fetch(endpoint, {
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
      
      // Filter transactions based on parameters
      let filteredTransactions = data.filter((tx: any) => tx.executed_at); // Only include executed transactions
      
      if (userId) {
        if (role === 'buyer') {
          filteredTransactions = filteredTransactions.filter((tx: any) => tx.buyer === userId);
        } else if (role === 'seller') {
          filteredTransactions = filteredTransactions.filter((tx: any) => tx.seller === userId);
        } else {
          filteredTransactions = filteredTransactions.filter((tx: any) => 
            tx.buyer === userId || tx.seller === userId
          );
        }
      }
      
      console.log(`Found ${filteredTransactions.length} matching transactions`);
      
      // Transform the data to match our frontend model
      const formattedTransactions = filteredTransactions.map((tx: any) => ({
        id: tx.id,
        type: tx.type,
        assetId: tx.asset_id,
        seller: tx.seller,
        buyer: tx.buyer,
        price: tx.price,
        createdAt: tx.created_at,
        executedAt: tx.executed_at,
        metadata: {
          historicalName: tx.historical_name,
          englishName: tx.english_name,
          description: tx.description
        }
      }));
      
      // Sort by date (newest first)
      formattedTransactions.sort((a: any, b: any) => 
        new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()
      );
      
      // Update the cache
      const responseData = { 
        success: true, 
        transactions: formattedTransactions,
        timestamp: currentTime
      };
      
      cachedData.set(cacheKey, {
        data: responseData,
        timestamp: currentTime
      });
      
      return NextResponse.json(responseData);
    } catch (fetchError) {
      console.error('Error fetching from backend:', fetchError);
      
      // If we have stale cache, return it rather than failing
      const cachedEntry = cachedData.get(cacheKey);
      if (cachedEntry) {
        console.log('Returning stale cached data due to fetch error');
        return NextResponse.json({
          ...cachedEntry.data,
          _cached: true,
          _stale: true,
          _error: fetchError instanceof Error ? fetchError.message : String(fetchError)
        });
      }
      
      // If no cache exists, create an empty response
      return NextResponse.json({
        success: true,
        transactions: [],
        _error: fetchError instanceof Error ? fetchError.message : String(fetchError)
      });
    }
  } catch (error) {
    console.error('Error in GET handler:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch transaction history', 
        message: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}
