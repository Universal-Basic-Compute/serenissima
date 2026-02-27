import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import Airtable from 'airtable';
import { getAuthContext } from '@/lib/auth';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';

const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.error('Airtable credentials not configured');
    throw new Error('Airtable credentials not configured');
  }
  Airtable.configure({
    requestTimeout: 30000,
  });
  return new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
};

export async function POST(request: NextRequest) {
  try {
    // Authenticate user via JWT token from Authorization header
    const authContext = getAuthContext(request);
    if (!authContext.isAuthenticated || !authContext.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required. Provide a valid Bearer token in the Authorization header.' },
        { status: 401 }
      );
    }

    const username = authContext.user.username;

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
