import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import path from 'path';
import fs from 'fs';

// Airtable config
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_BUILDINGS_TABLE = process.env.AIRTABLE_BUILDINGS_TABLE || 'BUILDINGS';
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID!);

// ✅ Handler compatible with Next.js App Router
export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname;
    const buildingId = pathname.split('/').pop();

    if (!buildingId) {
      return NextResponse.json({ error: 'Missing buildingId' }, { status: 400 });
    }

    console.log(`GET /api/buildings/${buildingId} received`);

    // Try Airtable first
    if (AIRTABLE_API_KEY && AIRTABLE_BASE_ID) {
      try {
        const records = await base(AIRTABLE_BUILDINGS_TABLE)
          .select({
            filterByFormula: `{BuildingId} = '${buildingId}'`,
            maxRecords: 1
          })
          .firstPage();

        if (records.length > 0) {
          const fields = records[0].fields as Airtable.FieldSet; // Define fields here

          // Define the expected structure for the position property
          type PositionType = { lat: number; lng: number } | string | null;

          const buildingRaw = {
            buildingId: fields.BuildingId as string || buildingId,
            type: fields.Type as string || 'Unknown',
            landId: (fields.LandId as string || fields.Land as string || '') as string,
            variant: fields.Variant as string || '',
            position: (fields.Position as PositionType) || null, // Apply the PositionType
            point: fields.Point || null,       // Keep as is, will be processed by ensureBuildingDataIntegrity
            rotation: fields.Rotation as number || 0,
            owner: fields.Owner as string || '',
            createdAt: fields.CreatedAt as string || new Date().toISOString(),
            updatedAt: fields.UpdatedAt as string || new Date().toISOString(),
            leaseAmount: fields.LeaseAmount as number || 0,
            rentAmount: fields.RentAmount as number || 0,
            occupant: fields.Occupant as string || ''
          };
          
          // Attempt to parse position from point if position is null or empty
          if (!buildingRaw.position && buildingRaw.point) {
            const pointStr = String(buildingRaw.point);
            // Regex for type_LAT_LNG or type_LAT_LNG_variant pattern
            // Allows for optional negative signs and decimals in lat/lng
            // Allows for an optional _variant at the end
            const coordPattern = /^[a-zA-Z0-9-]+_(-?[0-9]+(?:\.[0-9]+)?)_(-?[0-9]+(?:\.[0-9]+)?)(?:_[^_]+)?$/;
            const pointMatch = pointStr.match(coordPattern);
            if (pointMatch && pointMatch[1] && pointMatch[2]) {
              const lat = parseFloat(pointMatch[1]);
              const lng = parseFloat(pointMatch[2]);
              if (!isNaN(lat) && !isNaN(lng)) {
                buildingRaw.position = { lat, lng };
                console.log(`[API Building ${buildingId}] Populated position from point field '${pointStr}':`, buildingRaw.position);
              } else {
                console.warn(`[API Building ${buildingId}] Could not parse lat/lng from point field '${pointStr}' despite matching pattern.`);
              }
            } else {
                console.warn(`[API Building ${buildingId}] Point field '${pointStr}' did not match expected pattern for coordinate extraction.`);
            }
          }

          return NextResponse.json({ building: buildingRaw });
        }
      } catch (err) {
        console.error('Airtable error:', err);
      }
    }

    return NextResponse.json({ error: `Building not found: ${buildingId}` }, { status: 404 });

  } catch (err) {
    console.error('Error in GET handler:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
