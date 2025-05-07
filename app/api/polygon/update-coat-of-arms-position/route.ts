import { NextResponse } from 'next/server';

// This endpoint has been deprecated as coat of arms drag and drop functionality is no longer needed
export async function POST(request: Request) {
  return NextResponse.json(
    { 
      success: false, 
      error: 'This endpoint has been deprecated. Coat of arms position updates are no longer supported.' 
    },
    { status: 410 } // Gone status code
  );
}

// Ensure this file is treated as a module
export const config = {
  api: {
    bodyParser: true,
  },
};
