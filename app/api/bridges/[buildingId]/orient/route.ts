import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_BUILDINGS_TABLE = process.env.AIRTABLE_BUILDINGS_TABLE || 'BUILDINGS';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("FATAL: Airtable API Key or Base ID is not configured. Bridge orientation API will not work.");
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID!);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ buildingId: string }> }
) {
  const { buildingId } = await context.params;

  if (!buildingId) {
    return NextResponse.json({ success: false, error: 'Building ID is required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { orientation } = body;

    if (typeof orientation !== 'number') {
      return NextResponse.json({ success: false, error: 'Numeric orientation value is required' }, { status: 400 });
    }

    console.log(`PATCH /api/bridges/${buildingId}/orient received. BuildingId: ${buildingId}, Orientation: ${orientation}`);

    const records = await base(AIRTABLE_BUILDINGS_TABLE)
      .select({
        filterByFormula: `{BuildingId} = '${buildingId}'`,
        maxRecords: 1,
        fields: ['BuildingId']
      })
      .firstPage();

    if (!records || records.length === 0) {
      return NextResponse.json({ success: false, error: `Bridge with BuildingId '${buildingId}' not found` }, { status: 404 });
    }

    const airtableRecordId = records[0].id;
    console.log(`[API Orient Bridge] Found Airtable record ID: ${airtableRecordId} for BuildingId: ${buildingId}`);

    const updatePayload = [{
      id: airtableRecordId,
      fields: {
        Rotation: orientation,
      },
    }];
    console.log('[API Orient Bridge] Airtable update payload:', JSON.stringify(updatePayload, null, 2));

    const updatedRecords = await base(AIRTABLE_BUILDINGS_TABLE).update(updatePayload);

    if (!updatedRecords || updatedRecords.length === 0) {
      console.error('[API Orient Bridge] Airtable update failed.');
      throw new Error('Failed to update bridge orientation in Airtable.');
    }

    console.log(`[API Orient Bridge] Successfully updated ${updatedRecords.length} record(s).`);
    const updatedFields = updatedRecords[0].fields;
    const responseBuilding = {
      id: updatedFields.BuildingId || buildingId,
      type: updatedFields.Type,
      landId: updatedFields.LandId,
      variant: updatedFields.Variant,
      position: updatedFields.Position ? JSON.parse(updatedFields.Position as string) : null,
      pointId: updatedFields.Point,
      rotation: updatedFields.Rotation,
      orientation: updatedFields.Rotation,
      owner: updatedFields.Owner,
      createdAt: updatedFields.CreatedAt,
      leasePrice: updatedFields.LeasePrice,
      rentPrice: updatedFields.RentPrice,
      occupant: updatedFields.Occupant,
    };

    console.log(`Successfully updated orientation for bridge ${buildingId} to ${orientation}`);

    return NextResponse.json({ success: true, bridge: responseBuilding });

  } catch (error) {
    console.error(`Error updating bridge ${buildingId} orientation:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ success: false, error: 'Failed to update bridge orientation', details: errorMessage }, { status: 500 });
  }
}
