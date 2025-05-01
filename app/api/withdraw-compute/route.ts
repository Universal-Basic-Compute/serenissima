import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { wallet_address, compute_amount } = await request.json();
    
    if (!wallet_address) {
      return NextResponse.json(
        { success: false, error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    if (!compute_amount || compute_amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Compute amount must be greater than 0' },
        { status: 400 }
      );
    }
    
    // Call the backend API to withdraw compute
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/api/withdraw-compute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address,
        compute_amount,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { 
          success: false, 
          error: errorData.detail || `Failed to withdraw compute: ${response.status} ${response.statusText}` 
        },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error in withdraw-compute API route:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process withdrawal' },
      { status: 500 }
    );
  }
}
