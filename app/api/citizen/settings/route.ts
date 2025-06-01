import { NextResponse } from 'next/server';
// import Airtable from 'airtable'; // No longer directly using Airtable here

export async function POST(request: Request) {
  try {
    // Parse the request body
    const { wallet_address, settings } = await request.json();
    
    if (!wallet_address || !settings) {
      return NextResponse.json(
        { success: false, error: 'Wallet address and settings are required' },
        { status: 400 }
      );
    }
    
    // wallet_address is used as citizenUsername for the try-create endpoint
    const citizenUsername = wallet_address;

    const activityParameters: Record<string, any> = {
      settings: settings, // Pass the whole settings object to be merged by the Python engine
    };
    
    // Assuming a new activityType "update_citizen_settings" for generic settings update.
    // The Python engine handling this activityType would be responsible for fetching
    // the existing 'Preferences' JSON, merging the new 'settings', and saving it back.
    const tryCreatePayload = {
      citizenUsername: citizenUsername,
      activityType: "update_citizen_settings", 
      activityParameters: activityParameters
    };

    const tryCreateUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/activities/try-create`;
    
    console.log(`[citizen/settings] Calling /api/activities/try-create for ${citizenUsername}. Payload:`, JSON.stringify(tryCreatePayload, null, 2));

    const response = await fetch(tryCreateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tryCreatePayload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`[citizen/settings] Error from /api/activities/try-create (${response.status}):`, responseData);
      return NextResponse.json(
        { 
          success: false, 
          error: `Failed to update citizen settings via activities service: ${responseData.error || response.statusText}`,
          details: responseData.details 
        },
        { status: response.status }
      );
    }
    
    console.log(`[citizen/settings] Success response from /api/activities/try-create:`, responseData);
    // Original route returned a simple success message.
    // try-create will return activity info. Client consuming this endpoint will need to adapt.
    return NextResponse.json(
      responseData, // Proxy the full response from try-create
      { status: response.status }
    );
    
  } catch (error) {
    console.error('Error updating settings:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json(
      { success: false, error: 'Failed to update settings', details: errorMessage },
      { status: 500 }
    );
  }
}
