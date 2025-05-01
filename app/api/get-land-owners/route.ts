import { NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('Fetching land ownership data from backend...');
    
    // Fetch land ownership data from the backend
    const response = await fetch('http://localhost:8000/api/lands', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Add a cache-busting parameter to prevent stale data
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch land ownership data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`Received ${data.length} land records from backend`);
    
    // Set cache headers to allow browsers to cache the response
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    
    return new NextResponse(JSON.stringify({ success: true, lands: data }), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Error fetching land ownership data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch land ownership data' },
      { status: 500 }
    );
  }
}
