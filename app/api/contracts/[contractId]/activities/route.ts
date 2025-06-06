import { NextResponse, NextRequest } from 'next/server';
import Airtable from 'airtable';

// Helper to escape single quotes for Airtable formulas
function escapeAirtableValue(value: string): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  return value.replace(/'/g, "\\'");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ contractId: string }> }
) {
  const { contractId } = await context.params;

  if (!contractId) {
    return NextResponse.json(
      { success: false, error: 'Contract ID is required' },
      { status: 400 }
    );
  }

  try {
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const ACTIVITIES_TABLE_NAME = process.env.AIRTABLE_ACTIVITIES_TABLE || 'ACTIVITIES';

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { success: false, error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }

    const airtable = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    const activitiesTable = airtable(ACTIVITIES_TABLE_NAME);

    // Formula to find activities linked to the contractId.
    // This assumes ContractId field in ACTIVITIES table can store either custom ContractId or Airtable record ID.
    // If contractId passed is an Airtable record ID, this might need adjustment or a check if it's a record ID.
    // For now, assuming contractId passed is the value stored in ACTIVITIES.ContractId
    const formula = `{ContractId} = '${escapeAirtableValue(contractId)}'`;
    
    console.log(`[API /contracts/${contractId}/activities] Fetching activities with formula: ${formula}`);

    const records = await activitiesTable
      .select({
        filterByFormula: formula,
        sort: [{ field: 'CreatedAt', direction: 'desc' }],
        // Consider adding fields to select if not all are needed
        // fields: ['ActivityId', 'Type', 'Citizen', 'Status', 'Title', 'Description', 'CreatedAt', 'EndDate'] 
      })
      .all();

    const activities = records.map(record => ({
      id: record.id, // Airtable record ID of the activity
      activityId: record.get('ActivityId'),
      type: record.get('Type'),
      citizen: record.get('Citizen'),
      status: record.get('Status'),
      title: record.get('Title'),
      description: record.get('Description'),
      createdAt: record.get('CreatedAt'),
      endDate: record.get('EndDate'),
      // Add any other relevant fields from the ACTIVITIES table
    }));

    console.log(`[API /contracts/${contractId}/activities] Found ${activities.length} activities.`);

    return NextResponse.json({ success: true, activities });

  } catch (error) {
    console.error(`Error fetching activities for contract ${contractId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch activities';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
