import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Fetch land ownership data from the backend
    const response = await fetch('http://localhost:8000/api/lands', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch land ownership data');
    }

    const data = await response.json();
    return NextResponse.json({ success: true, lands: data });
  } catch (error) {
    console.error('Error fetching land ownership data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch land ownership data' },
      { status: 500 }
    );
  }
}
