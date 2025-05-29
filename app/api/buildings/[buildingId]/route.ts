import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import path from 'path';
import fs from 'fs';
import { buildingPointsService } from '@/lib/services/BuildingPointsService'; // Added import

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

    // Ensure building points service is loaded for point resolution
    if (!buildingPointsService.isPointsLoaded()) {
      // console.log(`[API Building ${buildingId}] Loading building points service for point resolution...`);
      await buildingPointsService.loadBuildingPoints();
      // console.log(`[API Building ${buildingId}] Building points service loaded.`);
    }

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
          const fields = records[0].fields as Airtable.FieldSet;
          
          // Helper function to resolve point ID to coordinates
          function resolvePointIdToCoords(pointId: string): { lat: number, lng: number } | null {
            let p = buildingPointsService.getPositionForPoint(pointId);
            if (p && typeof p.lat === 'number' && typeof p.lng === 'number') {
              return p;
            }

            const parts = pointId.split('_');
            let latNum: number | undefined, lngNum: number | undefined;

            if (parts.length === 3) { // "prefix_lat_lng"
              latNum = parseFloat(parts[1]);
              lngNum = parseFloat(parts[2]);
            } else if (parts.length === 2) { // "lat_lng"
              latNum = parseFloat(parts[0]);
              lngNum = parseFloat(parts[1]);
            }

            if (latNum !== undefined && lngNum !== undefined && !isNaN(latNum) && !isNaN(lngNum)) {
              return { lat: latNum, lng: lngNum };
            }
            
            // console.warn(`[API Building ${buildingId}] Could not resolve point ID '${pointId}' to coordinates.`);
            return null;
          }

          let parsedPosition: { lat: number; lng: number } | null = null;

          // 1. Attempt to parse 'Position' field from Airtable
          if (fields.Position) {
            if (typeof fields.Position === 'string') {
              try {
                const pos = JSON.parse(fields.Position);
                if (pos && typeof pos.lat === 'number' && typeof pos.lng === 'number') {
                  parsedPosition = pos;
                }
              } catch (e) {
                // console.warn(`[API Building ${buildingId}] Could not parse Position JSON string: ${fields.Position}`);
              }
            } else if (typeof (fields.Position as any).lat === 'number' && typeof (fields.Position as any).lng === 'number') {
              parsedPosition = fields.Position as unknown as { lat: number; lng: number };
            }
          }

          // 2. Process pointFieldFromAirtable for outputPointValueForBuildingData (for the 'point' field in response)
          // This does NOT influence the 'parsedPosition' variable.
          const pointFieldFromAirtable = fields.Point as string | string[] | null;
          let outputPointValueForBuildingData: any = pointFieldFromAirtable; // Default to original value
          // console.log(`[API Building ${buildingId}] Initial pointFieldFromAirtable: ${JSON.stringify(pointFieldFromAirtable)} (type: ${typeof pointFieldFromAirtable})`); // DEBUG

          if (typeof pointFieldFromAirtable === 'string') {
            if (pointFieldFromAirtable.startsWith('[') && pointFieldFromAirtable.endsWith(']')) {
              try {
                const parsedJson = JSON.parse(pointFieldFromAirtable);
                // If parsing is successful and results in an array, use the parsed array.
                // Otherwise, outputPointValueForBuildingData remains the original string.
                if (Array.isArray(parsedJson)) {
                  outputPointValueForBuildingData = parsedJson;
                  // console.log(`[API Building ${buildingId}] Successfully parsed Point string as JSON array. Value: ${JSON.stringify(outputPointValueForBuildingData)}`);
                } else {
                  // console.warn(`[API Building ${buildingId}] Point string '${pointFieldFromAirtable}' parsed to non-array. Keeping original string.`);
                }
              } catch (e) {
                // console.error(`[API Building ${buildingId}] JSON.parse failed for Point string '${pointFieldFromAirtable}'. Keeping original string. Error: ${(e as Error).message}`);
                // If parsing fails, outputPointValueForBuildingData remains the original string.
              }
            }
            // If pointFieldFromAirtable is a string but not array-like, outputPointValueForBuildingData remains pointFieldFromAirtable.
          }
          // If pointFieldFromAirtable is already an array, null, or undefined, 
          // outputPointValueForBuildingData is already correctly set.

          // Calculate building size based on the final outputPointValueForBuildingData
          const buildingSize = Array.isArray(outputPointValueForBuildingData) ? outputPointValueForBuildingData.length : 1;
          
          // 3. If outputPointValueForBuildingData (from Airtable 'Point' field) is an array of 2-4 point IDs,
          //    try to calculate centroid for position. This will override parsedPosition from 'fields.Position'.
          if (Array.isArray(outputPointValueForBuildingData) &&
              outputPointValueForBuildingData.length >= 2 &&
              outputPointValueForBuildingData.length <= 4 &&
              outputPointValueForBuildingData.every(item => typeof item === 'string')) {

            const resolvedCoords = (outputPointValueForBuildingData as string[])
              .map(id => resolvePointIdToCoords(id))
              .filter(coord => coord !== null) as { lat: number, lng: number }[];

            if (resolvedCoords.length === outputPointValueForBuildingData.length) { // All points resolved
              let sumLat = 0;
              let sumLng = 0;
              resolvedCoords.forEach(coord => {
                sumLat += coord.lat;
                sumLng += coord.lng;
              });
              parsedPosition = { // This updates the position
                lat: sumLat / resolvedCoords.length,
                lng: sumLng / resolvedCoords.length
              };
              // console.log(`[API Building ${buildingId}] Position updated to centroid of ${resolvedCoords.length} points from 'Point' field.`);
            } else {
              // console.warn(`[API Building ${buildingId}] Not all point IDs in 'Point' field could be resolved. Position not updated from 'Point' field.`);
            }
          }
          
          // 4. Ultimate fallback if no position could be determined from Airtable 'Position' field or 'Point' field centroid calculation
          if (!parsedPosition) {
            parsedPosition = { lat: 45.4371, lng: 12.3358 }; // Default Venice center
          }

          // Prepare base building data
          const buildingData: Record<string, any> = {
            buildingId: fields.BuildingId as string || buildingId,
            type: fields.Type as string || 'Unknown',
            landId: (fields.LandId as string || fields.Land as string || '') as string,
            variant: fields.Variant as string || '',
            position: parsedPosition, // Use the parsed/calculated position
            point: outputPointValueForBuildingData, // Use the potentially parsed point value
            size: buildingSize,
            rotation: fields.Rotation as number || 0,
            owner: fields.Owner as string || '',
            runBy: fields.RunBy as string || '', // Added RunBy field
            category: fields.Category as string || '', // Added Category field
            subCategory: fields.SubCategory as string || '', // Added SubCategory field
            createdAt: fields.CreatedAt as string || new Date().toISOString(),
            updatedAt: fields.UpdatedAt as string || new Date().toISOString(),
            constructionMinutesRemaining: fields.ConstructionMinutesRemaining as number || 0, // Added ConstructionMinutesRemaining
            leasePrice: fields.LeasePrice as number || 0,
            rentPrice: fields.RentPrice as number || 0,
            occupant: fields.Occupant as string || '',
            isConstructed: fields.IsConstructed === 1 || fields.IsConstructed === true, // Defaults to false if undefined, 0, or false
            historicalName: undefined,
            englishName: undefined,
            historicalDescription: undefined,
          };

          // Helper function to compare coordinates with tolerance
          const coordsMatch = (pos1: { lat: number; lng: number }, pos2: { lat: number; lng: number }, tolerance = 0.00001) => {
            if (!pos1 || !pos2) return false;
            return Math.abs(pos1.lat - pos2.lat) < tolerance && Math.abs(pos1.lng - pos2.lng) < tolerance;
          };

          // 3. Enrich with data from polygons
          try {
            const polygonsApiUrl = `${request.nextUrl.origin}/api/get-polygons`;
            console.log(`[API Building ${buildingId}] Fetching polygons from ${polygonsApiUrl} for enrichment.`);
            const polygonsResponse = await fetch(polygonsApiUrl);

            if (polygonsResponse.ok) {
              const polygonsData = await polygonsResponse.json();
              if (polygonsData.success && polygonsData.polygons) {
                let foundMatch = false;
                for (const polygon of polygonsData.polygons) {
                  if (foundMatch) break;
                  
                  // Check buildingPoints
                  if (polygon.buildingPoints) {
                    for (const bp of polygon.buildingPoints) {
                      // Ensure pointIdFromAirtable is a string for comparison, or check if it's an array and one of the elements matches.
                      // For simplicity with current request, we'll assume enrichment logic might need adjustment if pointIdFromAirtable is an array.
                      // This part of the code is for enrichment and not directly for position calculation from multiple points.
                      const matchById = typeof pointFieldFromAirtable === 'string' && bp.id === pointFieldFromAirtable;
                      if (matchById || (buildingData.position && coordsMatch(buildingData.position, bp))) { // Removed bp.position
                        // Prioritize streetName, streetNameEnglish, streetDescription for buildingPoints
                        buildingData.historicalName = bp.streetName || bp.historicalName;
                        buildingData.englishName = bp.streetNameEnglish || bp.englishName;
                        buildingData.historicalDescription = bp.streetDescription || bp.historicalDescription;
                        if (!buildingData.position) buildingData.position = { lat: bp.lat, lng: bp.lng }; // Ensure position is set if matched by ID
                        foundMatch = true; break;
                      }
                    }
                  }
                  if (foundMatch) break;

                  // Check bridgePoints
                  if (polygon.bridgePoints) {
                    for (const brp of polygon.bridgePoints) {
                      const matchById = typeof pointFieldFromAirtable === 'string' && brp.id === pointFieldFromAirtable;
                      if (brp.edge && (matchById || (buildingData.position && coordsMatch(buildingData.position, brp.edge)))) {
                        buildingData.historicalName = brp.connection?.historicalName;
                        buildingData.englishName = brp.connection?.englishName;
                        buildingData.historicalDescription = brp.connection?.historicalDescription;
                        if (!buildingData.position) buildingData.position = { lat: brp.edge.lat, lng: brp.edge.lng };
                        foundMatch = true; break;
                      }
                    }
                  }
                  if (foundMatch) break;

                  // Check canalPoints
                  if (polygon.canalPoints) {
                    for (const cp of polygon.canalPoints) {
                      const matchById = typeof pointFieldFromAirtable === 'string' && cp.id === pointFieldFromAirtable;
                      if (cp.edge && (matchById || (buildingData.position && coordsMatch(buildingData.position, cp.edge)))) {
                        buildingData.historicalName = cp.historicalName;
                        buildingData.englishName = cp.englishName;
                        buildingData.historicalDescription = cp.historicalDescription;
                        if (!buildingData.position) buildingData.position = { lat: cp.edge.lat, lng: cp.edge.lng };
                        foundMatch = true; break;
                      }
                    }
                  }
                }
                if (foundMatch) {
                  // console.log(`[API Building ${buildingId}] Enriched with historical data. Name: ${buildingData.historicalName}`);
                } else {
                  // Log pointFieldFromAirtable instead of pointIdFromAirtable for clarity on what was used in matching
                  // console.log(`[API Building ${buildingId}] No matching point found in polygons for enrichment. Point field from Airtable: ${JSON.stringify(pointFieldFromAirtable)}, Position: ${JSON.stringify(buildingData.position)}`);
                }
              } else {
                 // console.warn(`[API Building ${buildingId}] Polygon data fetched but structure is not as expected or no polygons array. Success: ${polygonsData.success}`);
              }
            } else {
              // console.warn(`[API Building ${buildingId}] Failed to fetch polygons for enrichment: ${polygonsResponse.status} ${polygonsResponse.statusText}`);
            }
          } catch (polyErr) {
            // console.error(`[API Building ${buildingId}] Error fetching or processing polygons for enrichment:`, polyErr);
          }
          
          return NextResponse.json({ building: buildingData });
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
