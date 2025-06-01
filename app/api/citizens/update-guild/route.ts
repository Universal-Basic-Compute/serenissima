import { NextResponse } from 'next/server';
// import Airtable from 'airtable'; // No longer directly using Airtable here

export async function POST(request: Request) {
  try {
    // Parse the request body
    const { username, guildId, status = 'pending' } = await request.json(); // status is not directly used by 'manage_guild_membership' params in activities.md
    
    if (!username || !guildId) {
      return NextResponse.json(
        { success: false, error: 'Username and guildId are required' },
        { status: 400 }
      );
    }

    // Infer membershipAction. This route seems to be for assigning/joining a guild.
    // If guildId were being cleared, it might be 'leave'.
    // The 'status' field from the original request isn't a direct parameter for 'manage_guild_membership'
    // as per activities.md, but the Python engine could potentially use it if passed in Notes.
    const membershipAction = "join"; // Could also be "accept_invite" depending on game logic.

    const activityParameters: Record<string, any> = {
      guildId: guildId,
      membershipAction: membershipAction,
      // guildHallBuildingId is listed as required in activities.md for manage_guild_membership.
      // If the Python engine can auto-detect this based on guildId, we can omit it.
      // Otherwise, this route (or the client calling it) would need to provide it.
      // For now, omitting and assuming Python engine handles it or it's practically optional.
      // guildHallBuildingId: "ID_OF_THE_RELEVANT_GUILD_HALL", // Example if it were needed
    };
    
    const tryCreatePayload = {
      citizenUsername: username,
      activityType: "manage_guild_membership",
      activityParameters: activityParameters
    };

    const tryCreateUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/activities/try-create`;
    
    console.log(`[citizens/update-guild] Calling /api/activities/try-create for ${username}. Payload:`, JSON.stringify(tryCreatePayload, null, 2));

    const response = await fetch(tryCreateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tryCreatePayload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`[citizens/update-guild] Error from /api/activities/try-create (${response.status}):`, responseData);
      return NextResponse.json(
        { 
          success: false, 
          error: `Failed to update citizen guild membership via activities service: ${responseData.error || response.statusText}`,
          details: responseData.details 
        },
        { status: response.status }
      );
    }
    
    console.log(`[citizens/update-guild] Success response from /api/activities/try-create:`, responseData);
    // Original response was: { success: true, citizen: { username, guildId, guildStatus: status } }
    // try-create will return activity info. Client consuming this endpoint will need to adapt.
    return NextResponse.json(
      responseData, // Proxy the full response from try-create
      { status: response.status }
    );
    
  } catch (error) {
    console.error('Error updating citizen guild:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json(
      { success: false, error: 'Failed to update citizen guild', details: errorMessage },
      { status: 500 }
    );
  }
}
