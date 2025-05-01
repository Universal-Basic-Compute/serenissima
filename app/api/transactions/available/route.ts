import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/apiUtils';

export async function GET() {
  try {
    // Fetch all transactions from the backend
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/api/transactions/available`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch transactions: ${response.status}`);
    }

    const data = await response.json();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching available transactions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch available transactions' },
      { status: 500 }
    );
  }
}
