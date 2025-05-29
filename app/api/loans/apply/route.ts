import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/utils/apiUtils';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.borrower) {
      return NextResponse.json(
        { success: false, error: 'Borrower is required' },
        { status: 400 }
      );
    }
    
    if (!data.principalAmount || data.principalAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Principal amount must be greater than 0' },
        { status: 400 }
      );
    }
    
    // Forward the request to the backend API
    const apiBaseUrl = getBackendBaseUrl();
    const response = await fetch(`${apiBaseUrl}/api/loans/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { success: false, error: errorData.detail || 'Failed to apply for loan' },
        { status: response.status }
      );
    }
    
    const responseData = await response.json();
    return NextResponse.json({ success: true, data: responseData });
    
  } catch (error) {
    console.error('Error applying for loan:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
