import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Airtable config
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_BUILDINGS_TABLE = process.env.AIRTABLE_BUILDINGS_TABLE || 'BUILDINGS';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("FATAL: Airtable API Key or Base ID is not configured. Bridge orientation API will not work.");
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID!);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { buildingId: string } }
) {
  try {
    const { buildingId } = params;
    if (!buildingId) {
      return NextResponse.json({ success: false, error: 'Building ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const { orientation } = body;

    if (typeof orientation !== 'number') {
      return NextResponse.json({ success: false, error: 'Numeric orientation value is required' }, { status: 400 });
    }

    console.log(`PATCH /api/bridges/${buildingId}/orient received. BuildingId: ${buildingId}, Orientation: ${orientation}`);

    // Find the Airtable record ID for the bridge using the BuildingId field
    const records = await base(AIRTABLE_BUILDINGS_TABLE)
      .select({
        filterByFormula: `{BuildingId} = '${buildingId}'`,
        maxRecords: 1,
        fields: ['BuildingId'] // Only need a field to confirm existence, and get record ID
      })
      .firstPage();

    if (!records || records.length === 0) {
      return NextResponse.json({ success: false, error: `Bridge with BuildingId '${buildingId}' not found` }, { status: 404 });
    }

    const airtableRecordId = records[0].id;
    console.log(`Found Airtable record ID: ${airtableRecordId} for BuildingId: ${buildingId}`);

    // Update the bridge record with the new orientation (mapped to 'Rotation' field)
    const updatedRecords = await base(AIRTABLE_BUILDINGS_TABLE).update([
      {
        id: airtableRecordId,
        fields: {
          Rotation: orientation, // Assuming 'Rotation' is the field in Airtable
          // Potentially also update an 'Orientation' field if it exists and is preferred
          // Orientation: orientation, 
        },
      },
    ]);

    if (!updatedRecords || updatedRecords.length === 0) {
      throw new Error('Failed to update bridge orientation in Airtable.');
    }

    const updatedFields = updatedRecords[0].fields;
    const responseBuilding = {
      id: updatedFields.BuildingId || buildingId, // Use BuildingId from fields or fallback to param
      type: updatedFields.Type,
      landId: updatedFields.LandId,
      variant: updatedFields.Variant,
      position: updatedFields.Position ? JSON.parse(updatedFields.Position as string) : null,
      pointId: updatedFields.Point,
      rotation: updatedFields.Rotation, // Return the updated rotation
      orientation: updatedFields.Rotation, // Also include orientation for consistency with frontend
      owner: updatedFields.Owner,
      createdAt: updatedFields.CreatedAt,
      leaseAmount: updatedFields.LeaseAmount,
      rentAmount: updatedFields.RentAmount,
      occupant: updatedFields.Occupant,
    };
    
    console.log(`Successfully updated orientation for bridge ${buildingId} to ${orientation}`);

    return NextResponse.json({ success: true, bridge: responseBuilding });

  } catch (error) {
    console.error(`Error updating bridge ${params.buildingId} orientation:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ success: false, error: 'Failed to update bridge orientation', details: errorMessage }, { status: 500 });
  }
}
