import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { wallet_address, ducats } = await request.json();
    
    if (!wallet_address) {
      return NextResponse.json(
        { success: false, error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    if (!ducats || ducats <= 0) {
      return NextResponse.json(
        { success: false, error: 'Ducats must be greater than 0' },
        { status: 400 }
      );
    }
    
    // Check if citizen has any active loans
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_BASE_URL || 'http://localhost:5000'}/api/loans/citizen/${wallet_address}`);
      
      if (response.ok) {
        const citizenLoans = await response.json();
        const activeLoans = citizenLoans.filter(loan => loan.status === 'active');
        
        if (activeLoans.length > 0) {
          return NextResponse.json(
            { 
              success: false, 
              error: 'You must repay all active loans before withdrawing compute. This is required by the Venetian Banking Guild.' 
            },
            { status: 400 }
          );
        }
      }
    } catch (error) {
      console.warn('Error checking citizen loans, proceeding with withdrawal:', error);
      // Continue with withdrawal if we can't check loans to avoid blocking citizens
    }
    
    // Call the backend API to withdraw compute
    const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_BASE_URL || 'http://localhost:5000'}/api/withdraw-compute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address,
        ducats,
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
