import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import { buildingPointsService } from '@/lib/services/BuildingPointsService'; // For point resolution if needed by name logic

// Airtable Configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';
const AIRTABLE_BUILDINGS_TABLE = process.env.AIRTABLE_BUILDINGS_TABLE || 'BUILDINGS';
const AIRTABLE_TRANSACTIONS_TABLE = process.env.AIRTABLE_TRANSACTIONS_TABLE || 'TRANSACTIONS';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("CRITICAL: Missing Airtable API Key or Base ID for construct-building route.");
  // Optionally, throw an error or handle appropriately if running in an environment where this is fatal
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID!);

interface PointDetails {
  lat: number;
  lng: number;
  polygonId: string;
  pointType: 'land' | 'canal' | 'bridge';
}

interface BuildingTypeDefinition {
  type: string;
  name: string;
  buildTier: number;
  pointType: string | null; // Can be 'land', 'canal', 'bridge', 'building', or null
  constructionCosts?: {
    ducats?: number;
    [resource: string]: number | undefined;
  };
  category?: string;
  subCategory?: string;
  size?: number; // Added size for multi-point buildings
  constructionMinutes?: number; // Added construction minutes
}

interface RequestBody {
  buildingTypeDefinition: BuildingTypeDefinition;
  pointDetails: PointDetails;
  citizenUsername: string;
  builderContractDetails?: {
    sellerUsername: string;
    sellerBuildingId: string;
    rate: number;
    publicContractId: string;
  };
}

// Helper function to map SocialClass to a numerical tier
const mapSocialClassToTier = (socialClass?: string): number => {
  const lowerSocialClass = socialClass?.toLowerCase();
  if (!lowerSocialClass) return 0;

  // Define tiers based on TIER_NAMES from BuildingCreationPanel (implicitly)
  // Tier 5: Unique (Nobili equivalent or higher?) -> Let's map to 5
  // Tier 4: Nobili -> 4
  // Tier 3: Cittadini -> 3
  // Tier 2: Popolani -> 2
  // Tier 1: Facchini -> 1
  if (lowerSocialClass === 'consigliodeidieci') return 5;
  if (lowerSocialClass === 'nobili') return 4; // Assuming Nobili is Tier 4 as per TIER_NAMES
  if (lowerSocialClass === 'cittadini') return 3;
  if (lowerSocialClass === 'popolani') return 2;
  if (lowerSocialClass === 'facchini') return 1;
  return 0; // Forestieri or unclassified
};

// Helper function to extract details from a point ID string (e.g., "building_45.123_-12.456_0")
const extractPointDetailsTS = (pointStr: string | null | undefined): { pointTypePrefix: string; lat: number; lng: number; indexStr?: string } | null => {
  if (!pointStr || typeof pointStr !== 'string') {
    return null;
  }
  const parts = pointStr.split('_');
  if (parts.length < 3) { // Must have at least type_lat_lng
    console.warn(`Point string '${pointStr}' has too few parts to parse.`);
    return null;
  }
  try {
    const pointTypePrefix = parts[0];
    const lat = parseFloat(parts[1]);
    const lng = parseFloat(parts[2]);
    const indexStr = parts.length > 3 ? parts[3] : undefined;
    if (isNaN(lat) || isNaN(lng)) {
      console.warn(`Could not parse lat/lng from point string: ${pointStr}`);
      return null;
    }
    return { pointTypePrefix, lat, lng, indexStr };
  } catch (e) {
    console.warn(`Error parsing point string '${pointStr}':`, e);
    return null;
  }
};

// Helper function to get location name from polygons data
const getLocationNameFromPolygons = (
  primaryPointId: string,
  pointTypePrefix: string,
  allPolygonsData: any[]
): string => {
  const primaryPointCoords = extractPointDetailsTS(primaryPointId); // Get coords from primaryPointId for fallback matching

  const pointsListKeyMap: Record<string, string> = {
    building: "buildingPoints",
    land: "buildingPoints", // Assuming 'land' pointTypePrefix refers to buildingPoints on a land polygon
    canal: "canalPoints",
    bridge: "bridgePoints",
  };
  const pointsListKey = pointsListKeyMap[pointTypePrefix];

  if (pointsListKey) {
    for (const polygon of allPolygonsData) {
      const pointsToSearch = polygon[pointsListKey];
      if (pointsToSearch && Array.isArray(pointsToSearch)) {
        let originalPointData = pointsToSearch.find(
          (p: any) => p && typeof p === 'object' && p.id === primaryPointId
        );

        // Fallback: If direct ID match failed and we are looking for a 'land' point in 'buildingPoints',
        // try matching by coordinates. This helps if the ID format of the clicked empty point (e.g., "land_lat_lng")
        // differs from the stored point ID in polygon data (e.g., "building_lat_lng_idx").
        if (!originalPointData && primaryPointCoords && pointTypePrefix === 'land' && pointsListKey === 'buildingPoints') {
          originalPointData = pointsToSearch.find((p: any) => {
            if (p && typeof p === 'object' && typeof p.lat === 'number' && typeof p.lng === 'number') {
              // Compare coordinates with a small tolerance
              return Math.abs(p.lat - primaryPointCoords.lat) < 0.00001 &&
                     Math.abs(p.lng - primaryPointCoords.lng) < 0.00001;
            }
            return false;
          });
          if (originalPointData) {
            console.log(`Name computation: Matched buildingPoint by coordinates for primaryPointId ${primaryPointId} after ID match failed.`);
          }
        }

        if (originalPointData) {
          if (pointsListKey === "buildingPoints") {
            return originalPointData.streetName || originalPointData.historicalName || primaryPointId;
          } else if (pointsListKey === "canalPoints") {
            return originalPointData.historicalName || originalPointData.englishName || primaryPointId;
          } else if (pointsListKey === "bridgePoints") {
            if (originalPointData.connection && typeof originalPointData.connection === 'object') {
              return originalPointData.connection.historicalName || originalPointData.connection.englishName || primaryPointId;
            }
            return primaryPointId; // Fallback for bridge if connection info is missing
          }
        }
      }
    }
  }
  console.warn(`Could not find location name for point '${primaryPointId}' (prefix: '${pointTypePrefix}'). Defaulting to point ID.`);
  return primaryPointId; // Fallback if no specific name found
};


// Main function to compute building name
async function computeBuildingName(
  buildingTypeDefinition: BuildingTypeDefinition,
  primaryPointId: string,
  allPolygonsData: any[],
  ownerUsername: string, // Owner is the initial operator for galleys
  airtableBase: Airtable.Base
): Promise<string> {
  const buildingTypeDisplayName = buildingTypeDefinition.name || buildingTypeDefinition.type;

  if (buildingTypeDefinition.type === "merchant_galley") {
    let operatorDisplayName = ownerUsername; // Fallback to username
    try {
      const citizenRecords = await airtableBase(AIRTABLE_CITIZENS_TABLE)
        .select({ filterByFormula: `{Username} = '${ownerUsername}'`, maxRecords: 1, fields: ["FirstName", "LastName"] })
        .firstPage();
      if (citizenRecords.length > 0) {
        const opFields = citizenRecords[0].fields;
        const firstName = opFields.FirstName as string || "";
        const lastName = opFields.LastName as string || "";
        const fullName = `${firstName} ${lastName}`.trim();
        if (fullName) {
          operatorDisplayName = fullName;
        }
      } else {
        console.warn(`Could not find citizen record for owner/operator '${ownerUsername}' of galley.`);
      }
    } catch (e) {
      console.error(`Error fetching citizen record for galley operator '${ownerUsername}':`, e);
    }
    return `Merchant Galley run by ${operatorDisplayName}`;
  }

  const pointDetails = extractPointDetailsTS(primaryPointId);
  if (!pointDetails) {
    console.warn(`Could not parse primary point ID '${primaryPointId}' for name computation. Using default name.`);
    return `${buildingTypeDisplayName} at ${primaryPointId}`;
  }

  const locationName = getLocationNameFromPolygons(primaryPointId, pointDetails.pointTypePrefix, allPolygonsData);
  return `${buildingTypeDisplayName} at ${locationName}`;
}


// Helper function to calculate distance between two lat/lng points in meters
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000; // Radius of the earth in m
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in m
  return distance;
};

// Helper function to check point type compatibility
const isPointTypeCompatible = (selectedPointType: 'land' | 'canal' | 'bridge', buildingDesignatedPointType: string | null): boolean => {
  const actualBuildingPointType = buildingDesignatedPointType || 'land'; // Default to 'land' if null

  if (selectedPointType === 'land') {
    return actualBuildingPointType === 'land' || actualBuildingPointType === 'building';
  } else { // 'canal' or 'bridge'
    return actualBuildingPointType === selectedPointType || actualBuildingPointType === 'land';
  }
};


export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { buildingTypeDefinition, pointDetails, citizenUsername, builderContractDetails } = body;

    if (!buildingTypeDefinition || !pointDetails || !citizenUsername) {
      return NextResponse.json({ success: false, error: 'Missing required parameters.' }, { status: 400 });
    }
    
    const baseConstructionCostDucats = buildingTypeDefinition.constructionCosts?.ducats || 0;
    let totalConstructionCost = baseConstructionCostDucats;
    let feeToConsiglio = 0;
    let paymentToContractor = 0;

    if (builderContractDetails) {
      totalConstructionCost = baseConstructionCostDucats * builderContractDetails.rate;
      feeToConsiglio = totalConstructionCost * 0.10;
      paymentToContractor = totalConstructionCost - feeToConsiglio;
    }

    // 1. Fetch citizen (buyer) data from Airtable
    const citizenRecords = await base(AIRTABLE_CITIZENS_TABLE)
      .select({ filterByFormula: `{Username} = '${citizenUsername}'`, maxRecords: 1 })
      .firstPage();

    if (citizenRecords.length === 0) {
      return NextResponse.json({ success: false, error: 'Citizen not found.' }, { status: 404 });
    }
    const citizenRecord = citizenRecords[0];
    const citizenDucats = (citizenRecord.fields.Ducats as number) || 0;
    const citizenSocialClass = citizenRecord.fields.SocialClass as string;

    // 2. Server-side Verification
    // 2a. Money Check
    if (citizenDucats < totalConstructionCost) {
      return NextResponse.json({ success: false, error: `Insufficient Ducats. Required: ${totalConstructionCost}, Available: ${citizenDucats}` }, { status: 400 });
    }

    // 2b. Tier Check
    const citizenTier = mapSocialClassToTier(citizenSocialClass);
    if (citizenTier < buildingTypeDefinition.buildTier) {
      return NextResponse.json({ success: false, error: `Citizen tier (${citizenTier}) too low for this building (Requires Tier ${buildingTypeDefinition.buildTier}).` }, { status: 400 });
    }

    // 2c. Point Type Check
    if (!isPointTypeCompatible(pointDetails.pointType, buildingTypeDefinition.pointType)) {
      return NextResponse.json({ success: false, error: `Building type '${buildingTypeDefinition.name}' (requires ${buildingTypeDefinition.pointType || 'land'}) not compatible with selected ${pointDetails.pointType} point.` }, { status: 400 });
    }

    // Determine final BuildingId and Point value before creating transaction
    let finalPointFieldValue: string | string[];
    let finalPosition: { lat: number; lng: number };
    let finalBuildingId: string;
    let allPolygonsData: any[] = []; // To store polygon data for name computation and multi-size placement

    // Fetch polygon data - needed for name computation and multi-point placement
    try {
      const polygonsApiUrl = `${request.nextUrl.origin}/api/get-polygons`;
      console.log(`Fetching polygon data from: ${polygonsApiUrl} for construction action.`);
      const polygonsResponse = await fetch(polygonsApiUrl);
      if (!polygonsResponse.ok) {
        throw new Error(`Failed to fetch polygon data: ${polygonsResponse.statusText}`);
      }
      const polygonsJson = await polygonsResponse.json();
      if (!polygonsJson.success || !Array.isArray(polygonsJson.polygons)) {
        throw new Error('Polygon data is not in the expected format.');
      }
      allPolygonsData = polygonsJson.polygons;
      console.log(`Fetched ${allPolygonsData.length} polygons for construction action.`);
    } catch (fetchError) {
      console.error('Error fetching polygon data for construction action:', fetchError);
      // Decide if this is fatal or if we can proceed with a default name / no multi-point
      // For now, let's make it fatal if name computation relies on it heavily.
      return NextResponse.json({ success: false, error: 'Failed to retrieve map data for placement/naming.', details: (fetchError as Error).message }, { status: 500 });
    }

    const buildingSize = buildingTypeDefinition.size || 1;
    const initialSelectedPointId = `${pointDetails.pointType}_${pointDetails.lat.toFixed(6)}_${pointDetails.lng.toFixed(6)}`;

    if (buildingSize <= 1) {
      finalPointFieldValue = initialSelectedPointId;
      finalPosition = { lat: pointDetails.lat, lng: pointDetails.lng };
      finalBuildingId = initialSelectedPointId;
    } else {
      // Multi-size building logic
      console.log(`Constructing multi-size building (size: ${buildingSize}) of type ${buildingTypeDefinition.type}`);

      // Multi-size building logic (allPolygonsData is already fetched)

      // 2. Extract relevant available points based on pointDetails.pointType
      const availablePointsForType: Array<{ id: string; lat: number; lng: number; polygonId: string }> = [];
      allPolygonsData.forEach(polygon => {
        let pointListKey: string | null = null;
        if (pointDetails.pointType === 'land') pointListKey = 'buildingPoints';
        else if (pointDetails.pointType === 'canal') pointListKey = 'canalPoints';
        else if (pointDetails.pointType === 'bridge') pointListKey = 'bridgePoints';

        if (pointListKey && polygon[pointListKey] && Array.isArray(polygon[pointListKey])) {
          (polygon[pointListKey] as any[]).forEach(p => {
            const pLat = p.edge?.lat ?? p.lat;
            const pLng = p.edge?.lng ?? p.lng;
            const pId = p.id || `${pointDetails.pointType}_${Number(pLat).toFixed(6)}_${Number(pLng).toFixed(6)}`;
            if (typeof pLat === 'number' && typeof pLng === 'number' && typeof pId === 'string') {
              availablePointsForType.push({ id: pId, lat: pLat, lng: pLng, polygonId: polygon.id });
            }
          });
        }
      });
      console.log(`Found ${availablePointsForType.length} available points of type '${pointDetails.pointType}'.`);

      // 3. Fetch occupied points
      const occupiedPointIds = new Set<string>();
      const buildingRecordsAirtable = await base(AIRTABLE_BUILDINGS_TABLE).select({ // Renamed to avoid conflict
        fields: ['Point']
      }).all();
      buildingRecordsAirtable.forEach(record => {
        const pointField = record.fields.Point as string | undefined;
        if (pointField) {
          if (pointField.startsWith('[') && pointField.endsWith(']')) {
            try {
              const pointArray = JSON.parse(pointField);
              if (Array.isArray(pointArray)) {
                pointArray.forEach(id => typeof id === 'string' && occupiedPointIds.add(id));
              }
            } catch (e) { /* ignore malformed JSON */ }
          } else {
            occupiedPointIds.add(pointField);
          }
        }
      });
      console.log(`Found ${occupiedPointIds.size} occupied point IDs.`);

      // 4. Filter unoccupied points of the correct type
      const unoccupiedPoints = availablePointsForType.filter(p => !occupiedPointIds.has(p.id) && p.id !== initialSelectedPointId);
      console.log(`Found ${unoccupiedPoints.length} unoccupied points of type '${pointDetails.pointType}' (excluding initial).`);

      // 5. Find N-1 closest additional points
      const selectedPoints: Array<{ id: string; lat: number; lng: number }> = [{ id: initialSelectedPointId, lat: pointDetails.lat, lng: pointDetails.lng }];
      
      const pointsWithDistance = unoccupiedPoints.map(p => ({
        ...p,
        distance: calculateDistance(pointDetails.lat, pointDetails.lng, p.lat, p.lng)
      })).filter(p => p.distance <= 100); // Max 100m distance

      pointsWithDistance.sort((a, b) => a.distance - b.distance);

      for (let i = 0; i < pointsWithDistance.length && selectedPoints.length < buildingSize; i++) {
        selectedPoints.push({ id: pointsWithDistance[i].id, lat: pointsWithDistance[i].lat, lng: pointsWithDistance[i].lng });
      }

      if (selectedPoints.length < buildingSize) {
        return NextResponse.json({ success: false, error: `Not enough suitable points found for a size ${buildingSize} building. Needed ${buildingSize}, found ${selectedPoints.length}. Try a different location.` }, { status: 400 });
      }
      console.log(`Selected ${selectedPoints.length} points for the building.`);

      // 6. Calculate centroid
      let sumLat = 0, sumLng = 0;
      selectedPoints.forEach(p => {
        sumLat += p.lat;
        sumLng += p.lng;
      });
      finalPosition = { lat: sumLat / selectedPoints.length, lng: sumLng / selectedPoints.length };
      finalPointFieldValue = selectedPoints.map(p => p.id);
      finalBuildingId = finalPointFieldValue[0]; // BuildingId is the first point ID
      console.log(`Calculated centroid: ${JSON.stringify(finalPosition)}, Point field value: ${JSON.stringify(finalPointFieldValue)}, BuildingId: ${finalBuildingId}`);
    }

    // 3. Ducats Transfer & Transaction Records
    const transactionsToCreate: Array<{ fields: Airtable.FieldSet }> = [];
    // Use a map to accumulate ducat changes per citizen record ID
    const ducatOperations: Record<string, { initialDucats: number, change: number }> = {};

    // Buyer pays
    ducatOperations[citizenRecord.id] = { 
      initialDucats: citizenDucats, 
      change: (ducatOperations[citizenRecord.id]?.change || 0) - totalConstructionCost 
    };

    if (builderContractDetails) {
      // Fetch builder and Consiglio records
      const builderCitizenRecords = await base(AIRTABLE_CITIZENS_TABLE)
        .select({ filterByFormula: `{Username} = '${builderContractDetails.sellerUsername}'`, maxRecords: 1 })
        .firstPage();
      if (builderCitizenRecords.length === 0) {
        return NextResponse.json({ success: false, error: `Builder citizen '${builderContractDetails.sellerUsername}' not found.` }, { status: 404 });
      }
      const builderCitizenRecord = builderCitizenRecords[0];
      const builderCurrentDucats = (builderCitizenRecord.fields.Ducats as number) || 0;
      // Accumulate payment to contractor
      ducatOperations[builderCitizenRecord.id] = ducatOperations[builderCitizenRecord.id] || { initialDucats: builderCurrentDucats, change: 0 };
      ducatOperations[builderCitizenRecord.id].change += paymentToContractor;

      const consiglioCitizenRecords = await base(AIRTABLE_CITIZENS_TABLE)
        .select({ filterByFormula: `{Username} = 'ConsiglioDeiDieci'`, maxRecords: 1 })
        .firstPage();
      if (consiglioCitizenRecords.length === 0) {
        // This should ideally not happen if ConsiglioDeiDieci is a guaranteed system citizen
        return NextResponse.json({ success: false, error: 'ConsiglioDeiDieci citizen record not found for fee collection.' }, { status: 500 });
      }
      const consiglioCitizenRecord = consiglioCitizenRecords[0];
      const consiglioCurrentDucats = (consiglioCitizenRecord.fields.Ducats as number) || 0;
      // Accumulate fee to Consiglio
      ducatOperations[consiglioCitizenRecord.id] = ducatOperations[consiglioCitizenRecord.id] || { initialDucats: consiglioCurrentDucats, change: 0 };
      ducatOperations[consiglioCitizenRecord.id].change += feeToConsiglio;
      
      // Transaction for payment to contractor
      transactionsToCreate.push({
        fields: {
          Type: 'construction_payment_to_contractor',
          AssetType: 'building_project', // Or 'contract' if linking to the construction_project contract
          Asset: finalBuildingId, // ID of the building being constructed
          Seller: builderContractDetails.sellerUsername, // Contractor is the "seller" of services
          Buyer: citizenUsername, // Citizen is the "buyer" of services
          Price: paymentToContractor,
          Notes: `Payment to ${builderContractDetails.sellerUsername} for construction of ${buildingTypeDefinition.name}. Total: ${totalConstructionCost}, Contractor Share: ${paymentToContractor}.`,
          ExecutedAt: new Date().toISOString(),
          CreatedAt: new Date().toISOString(),
        }
      });
      // Transaction for fee to Consiglio
      transactionsToCreate.push({
        fields: {
          Type: 'construction_fee_to_consiglio',
          AssetType: 'building_project',
          Asset: finalBuildingId,
          Seller: 'ConsiglioDeiDieci', // Consiglio is "selling" the right/service to build via contractor
          Buyer: citizenUsername,
          Price: feeToConsiglio,
          Notes: `10% fee for construction of ${buildingTypeDefinition.name} by ${builderContractDetails.sellerUsername}. Total: ${totalConstructionCost}, Fee: ${feeToConsiglio}.`,
          ExecutedAt: new Date().toISOString(),
          CreatedAt: new Date().toISOString(),
        }
      });
    } else {
      // Direct build (no contractor) - money goes to Consiglio or is just "spent"
      // For now, let's assume it goes to ConsiglioDeiDieci as a general city fund
       const consiglioCitizenRecords = await base(AIRTABLE_CITIZENS_TABLE)
        .select({ filterByFormula: `{Username} = 'ConsiglioDeiDieci'`, maxRecords: 1 })
        .firstPage();
      if (consiglioCitizenRecords.length > 0) {
         const consiglioCitizenRecord = consiglioCitizenRecords[0];
         const consiglioCurrentDucats = (consiglioCitizenRecord.fields.Ducats as number) || 0;
         // Accumulate payment to Consiglio for direct build
         ducatOperations[consiglioCitizenRecord.id] = ducatOperations[consiglioCitizenRecord.id] || { initialDucats: consiglioCurrentDucats, change: 0 };
         ducatOperations[consiglioCitizenRecord.id].change += totalConstructionCost;
      }

      transactionsToCreate.push({
        fields: {
          Type: 'building_construction_direct', // Or just 'building_construction'
          AssetType: 'building',
          Asset: finalBuildingId,
          Seller: 'ConsiglioDeiDieci', // Or 'System'
          Buyer: citizenUsername,
          Price: totalConstructionCost,
          Notes: `Direct construction of ${buildingTypeDefinition.name} at ${pointDetails.lat.toFixed(6)},${pointDetails.lng.toFixed(6)}.`,
          ExecutedAt: new Date().toISOString(),
          CreatedAt: new Date().toISOString(),
        }
      });
    }

    // Perform Airtable updates (Citizens and Transactions)
    // These should ideally be atomic, but Airtable doesn't support it.
    
    // Construct final citizen updates array
    const finalCitizenUpdates: Array<{ id: string, fields: Airtable.FieldSet }> = [];
    for (const [recordId, operation] of Object.entries(ducatOperations)) {
      const newDucats = operation.initialDucats + operation.change;
      finalCitizenUpdates.push({ id: recordId, fields: { Ducats: newDucats } });
    }

    // Update citizens first
    if (finalCitizenUpdates.length > 0) {
      await base(AIRTABLE_CITIZENS_TABLE).update(finalCitizenUpdates);
    }
    // Then create transactions
    if (transactionsToCreate.length > 0) {
      await base(AIRTABLE_TRANSACTIONS_TABLE).create(transactionsToCreate);
    }


    // 4. Create Building Record
    // const buildingId = `bld-${buildingTypeDefinition.type.replace(/_/g, '-')}-${Date.now()}`; // Replaced by finalBuildingId
    
    let polygonIdSuffix: string;
    if (pointDetails.polygonId === 'unknown' || !pointDetails.polygonId) {
      polygonIdSuffix = 'ORPHAN';
    } else {
      let baseSuffix = pointDetails.polygonId;
      if (baseSuffix.startsWith('polygon-')) {
        baseSuffix = baseSuffix.substring('polygon-'.length);
      }
      // Take up to the last 8 characters
      if (baseSuffix.length > 8) {
        baseSuffix = baseSuffix.slice(-8);
      }
      // If it's purely numeric after this, prefix with 's'
      if (/^\d+$/.test(baseSuffix) && baseSuffix.length > 0) {
        polygonIdSuffix = `s${baseSuffix}`;
      } else if (baseSuffix.length === 0) { 
        polygonIdSuffix = 'EMPTY'; // Should not happen if polygonId is valid
      } else {
        polygonIdSuffix = baseSuffix;
      }
    }
    // Final length check for the suffix part
    if (polygonIdSuffix.length > 10) {
        polygonIdSuffix = polygonIdSuffix.slice(0, 10);
    }

    // finalPointFieldValue, finalPosition, and finalBuildingId are now determined before transaction creation.

    // Compute building name
    const computedBuildingName = await computeBuildingName(
      buildingTypeDefinition,
      finalBuildingId, // primary point ID is used as the basis for BuildingId
      allPolygonsData,
      citizenUsername, // Owner is the initial operator for galleys
      base
    );
    
    const newBuildingData: Airtable.FieldSet = {
      BuildingId: finalBuildingId, // Use the determined BuildingId
      Name: computedBuildingName, // Use the computed name
      Type: buildingTypeDefinition.type,
      Category: buildingTypeDefinition.category,
      SubCategory: buildingTypeDefinition.subCategory,
      LandId: pointDetails.polygonId, // This assumes all points of a multi-building are on the same LandId, which might need refinement.
      Point: Array.isArray(finalPointFieldValue) ? JSON.stringify(finalPointFieldValue) : finalPointFieldValue,
      Position: JSON.stringify(finalPosition),
      Owner: citizenUsername,
      IsConstructed: false,
      ConstructionMinutesRemaining: buildingTypeDefinition.constructionMinutes || 0, // Set construction minutes
      CreatedAt: new Date().toISOString(),
      Rotation: 0,
    };

    const createdBuildingRecord = await base(AIRTABLE_BUILDINGS_TABLE).create([{ fields: newBuildingData }]);
    const newAirtableBuildingId = createdBuildingRecord[0].id; // Airtable's own record ID for the new building

    // 5. Create Construction Project Contract (if builder was used)
    if (builderContractDetails) {
      const constructionProjectContractId = `constructproject_${finalBuildingId}_${builderContractDetails.sellerUsername}_${Date.now()}`;
      const contractData: Airtable.FieldSet = {
        ContractId: constructionProjectContractId,
        Type: 'construction_project',
        Buyer: citizenUsername,
        Seller: builderContractDetails.sellerUsername,
        ResourceType: buildingTypeDefinition.type, // The type of building being constructed
        BuyerBuilding: finalBuildingId, // The ID of the building being constructed
        SellerBuilding: builderContractDetails.sellerBuildingId, // The builder's workshop
        TargetAmount: 1, // One project
        PricePerResource: totalConstructionCost, // Total cost of the project
        Status: 'active', // Or 'pending_completion', 'in_progress'
        Notes: `Construction of ${buildingTypeDefinition.name} (Type: ${buildingTypeDefinition.type}) by ${builderContractDetails.sellerUsername}. Base cost: ${baseConstructionCostDucats}, Rate: ${builderContractDetails.rate}. Total: ${totalConstructionCost}. Public contract ref: ${builderContractDetails.publicContractId}`,
        CreatedAt: new Date().toISOString(),
        EndAt: new Date(new Date().setMonth(new Date().getMonth() + 2)).toISOString(), // Set EndAt to two months from now
      };
      await base('CONTRACTS').create([{ fields: contractData }]);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Building construction initiated successfully.',
      buildingId: newAirtableBuildingId, 
      customBuildingId: finalBuildingId 
    });

  } catch (error) {
    console.error('Error in /api/actions/construct-building:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, error: 'Failed to construct building.', details: errorMessage }, { status: 500 });
  }
}
