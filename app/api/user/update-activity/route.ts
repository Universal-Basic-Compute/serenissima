import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';

const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.error('Airtable credentials not configured');
    throw new Error('Airtable credentials not configured');
  }
  // Configure un délai d'attente plus long (par exemple, 30 secondes)
  Airtable.configure({
    requestTimeout: 30000, // 30 secondes en millisecondes
  });
  return new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
};

export async function POST(request: NextRequest) {
  try {
    // TODO: Implement proper session/authentication to get the username
    // For now, this is a placeholder. In a real app, you'd use something like:
    // const session = await getSession({ req: request }); // Example using next-auth
    // if (!session || !session.user || !session.user.name) {
    //   return NextResponse.json({ success: false, error: 'User not authenticated' }, { status: 401 });
    // }
    // const username = session.user.name;
    
    // Placeholder: Attempt to get username from a custom header or a query param for testing.
    // In a real scenario, rely on secure session management.
    let username = request.headers.get('X-User-Username');
    if (!username) {
        // As a fallback for testing, allow username in query. NOT FOR PRODUCTION.
        const url = new URL(request.url);
        username = url.searchParams.get('username');
    }
    
    // If still no username, and for a real app, if session is not found:
    if (!username) {
      // Using a default user for now if no other way to get it.
      // THIS IS NOT SECURE FOR A REAL APPLICATION.
      // Replace this with actual user identification logic.
      username = 'ConsiglioDeiDieci'; // Defaulting for demonstration
      console.warn(`Username not found in request, defaulting to '${username}'. Implement proper auth.`);
      // return NextResponse.json({ success: false, error: 'Username not provided and no active session.' }, { status: 400 });
    }

    console.log(`User activity update requested for '${username}' at ${new Date().toISOString()}`);

    const base = initAirtable();
    const records = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        filterByFormula: `{Username} = "${username}"`,
        maxRecords: 1,
      })
      .firstPage();

    if (!records || records.length === 0) {
      return NextResponse.json(
        { success: false, error: `Citizen '${username}' not found.` },
        { status: 404 }
      );
    }

    const citizenRecord = records[0];
    const newLastActiveAt = new Date().toISOString();

    await base(AIRTABLE_CITIZENS_TABLE).update([
      {
        id: citizenRecord.id,
        fields: {
          'LastActiveAt': newLastActiveAt,
        },
      },
    ]);
    
    // Airtable will automatically update the 'UpdatedAt' field if it's a "Last Modified Time" type.

    console.log(`Successfully updated LastActiveAt for citizen '${username}' to ${newLastActiveAt}.`);
    return NextResponse.json(
      { success: true, message: `User '${username}' activity updated successfully.` },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in /api/user/update-activity:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { success: false, error: 'Failed to update user activity.', details: errorMessage },
      { status: 500 }
    );
  }
}
