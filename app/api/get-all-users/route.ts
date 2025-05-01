import { NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('Fetching all users data from backend...');
    
    // Fetch all users data from the backend
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/api/users`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Add a cache-busting parameter to prevent stale data
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch users data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`Received ${data.length} user records from backend`);
    
    // Set cache headers to allow browsers to cache the response
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    
    return new NextResponse(JSON.stringify({ success: true, users: data }), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Error fetching users data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users data' },
      { status: 500 }
    );
  }
}
