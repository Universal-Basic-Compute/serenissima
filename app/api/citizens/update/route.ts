import { NextResponse } from 'next/server';
// import Airtable from 'airtable'; // No longer directly using Airtable here

// Assume the request body will now include currentCitizenUsername
// and 'id' is the citizenAirtableId.
// The other fields (username, firstName, etc.) are the new values.

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validate required fields for calling try-create
    // The client should send the current username if it's known and fixed,
    // or if the username itself is not being changed by this update.
    // If username can be changed, 'id' (citizenAirtableId) is the stable identifier.
    if (!data.currentCitizenUsername) { 
      return NextResponse.json(
        { success: false, error: 'currentCitizenUsername is required to identify the citizen for the activity' },
        { status: 400 }
      );
    }
    if (!data.id) { // This is citizenAirtableId
      return NextResponse.json(
        { success: false, error: 'Citizen ID (citizenAirtableId) is required' },
        { status: 400 }
      );
    }
    
    const activityParameters: Record<string, any> = {
      citizenAirtableId: data.id, // Python engine uses this to find the record
    };
    
    // Add fields to be updated to activityParameters
    // These are the new values for the profile.
    if (data.username !== undefined) activityParameters.username = data.username; 
    if (data.firstName !== undefined) activityParameters.firstName = data.firstName;
    if (data.lastName !== undefined) activityParameters.lastName = data.lastName;
    if (data.familyMotto !== undefined) activityParameters.familyMotto = data.familyMotto;
    if (data.coatOfArmsImageUrl !== undefined) activityParameters.coatOfArmsImageUrl = data.coatOfArmsImageUrl;
    if (data.telegramUserId !== undefined) activityParameters.telegramUserId = data.telegramUserId;
        
    // Check if there are any actual fields to update besides the ID
    const updateFieldsCount = Object.keys(activityParameters).filter(k => k !== 'citizenAirtableId').length;
    if (updateFieldsCount === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update provided in activityParameters' },
        { status: 400 }
      );
    }
    
    const tryCreatePayload = {
      citizenUsername: data.currentCitizenUsername, // Current username for identification by try-create
      activityType: "update_citizen_profile",
      activityParameters: activityParameters
      // targetOfficeBuildingId for update_citizen_profile is optional, omitting. Python engine can handle.
    };

    const tryCreateUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/activities/try-create`;
    
    console.log(`[citizens/update] Calling /api/activities/try-create for ${data.currentCitizenUsername}. Payload:`, JSON.stringify(tryCreatePayload, null, 2));

    const response = await fetch(tryCreateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tryCreatePayload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`[citizens/update] Error from /api/activities/try-create (${response.status}):`, responseData);
      return NextResponse.json(
        { 
          success: false, 
          error: `Failed to update citizen profile via activities service: ${responseData.error || response.statusText}`,
          details: responseData.details 
        },
        { status: response.status }
      );
    }
    
    console.log(`[citizens/update] Success response from /api/activities/try-create:`, responseData);
    // The response from try-create will be different from the original route's response.
    // Original route returned the updated citizen object. try-create returns activity info.
    // Client consuming this endpoint will need to adapt.
    return NextResponse.json(
      responseData, // Proxy the full response from try-create
      { status: response.status }
    );

  } catch (error) {
    console.error('Error updating citizen profile:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json(
      { success: false, error: 'Failed to update citizen profile', details: errorMessage },
      { status: 500 }
    );
  }
}
