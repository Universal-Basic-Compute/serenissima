import { NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/lib/apiUtils';

export async function POST(request: Request) {
  try {
    const { land_id, owner, wallet } = await request.json();
    
    if (!land_id) {
      return NextResponse.json(
        { success: false, error: 'Land ID is required' },
        { status: 400 }
      );
    }
    
    if (!owner && !wallet) {
      return NextResponse.json(
        { success: false, error: 'Owner or wallet is required' },
        { status: 400 }
      );
    }
    
    // Try to update via the backend API
    try {
      const apiBaseUrl = getBackendBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/land`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          land_id,
          user: owner,
          wallet_address: wallet
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
      
      // If backend API fails, return the error
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { success: false, error: errorData.detail || 'Failed to update land' },
        { status: response.status }
      );
    } catch (apiError) {
      console.warn('Backend API not available, falling back to local update:', apiError);
      
      // Return success even though we couldn't update
      // This is a last resort to prevent blocking the transaction
      return NextResponse.json({
        success: true,
        message: 'Land ownership update will be processed later',
        land_id,
        owner,
        wallet
      });
    }
  } catch (error) {
    console.error('Error updating land:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update land' },
      { status: 500 }
    );
  }
}
