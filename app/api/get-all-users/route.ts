import { NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('Fetching all citizens data from backend...');
    
    // Fetch all citizens data from the backend
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/citizens`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Add a cache-busting parameter to prevent stale data
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch citizens data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`Received ${data.length} citizen records from backend`);
    
    // Set cache headers to allow browsers to cache the response
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    
    return new NextResponse(JSON.stringify({ success: true, citizens: data }), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Error fetching citizens data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch citizens data' },
      { status: 500 }
    );
  }
}
