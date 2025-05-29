import { NextResponse } from 'next/server';

// Track when the cache was last flushed
let lastFlushed = Date.now();

export async function POST() {
  try {
    // Update the last flushed timestamp
    lastFlushed = Date.now();
    
    // Return success response with timestamp
    return NextResponse.json({ 
      success: true, 
      message: 'Cache flushed successfully',
      timestamp: lastFlushed
    });
  } catch (error) {
    console.error('Error flushing cache:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to flush cache' },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return the last flushed timestamp
  return NextResponse.json({ 
    lastFlushed
  });
}
