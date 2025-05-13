import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // This is just a placeholder route handler
  // The actual rendering is handled by the page.tsx component
  return NextResponse.json({ message: '2D view is available' });
}
