import { NextRequest, NextResponse } from 'next/server';
// Removed Airtable import and direct configuration as logic will be delegated.
// import Airtable from 'airtable'; 
// import { buildingPointsService } from '@/lib/services/BuildingPointsService'; // Likely not needed here anymore

// Keep these interfaces if they define the expected request body structure for this endpoint
interface PointDetails {
  lat: number;
  lng: number;
  polygonId: string; // This will be used as landId for the activity
  pointType: 'land' | 'canal' | 'bridge';
}

interface BuildingTypeDefinition {
  type: string; // Or id
  name: string;
  buildTier: number;
  pointType: string | null;
  constructionCosts?: {
    ducats?: number;
    [resource: string]: number | undefined;
  };
  category?: string;
  subCategory?: string;
  size?: number;
  constructionMinutes?: number;
}

interface RequestBody {
  buildingTypeDefinition: BuildingTypeDefinition;
  pointDetails: PointDetails;
  citizenUsername: string;
  builderContractDetails?: {
    sellerUsername: string; // Maps to builderUsername in activityParameters
    sellerBuildingId: string; // Maps to builder's workshop/office
    rate: number; // Used by Python engine to calculate final cost if needed
    publicContractId: string; // Reference to the public builder contract
  };
}

// Helper functions like mapSocialClassToTier, extractPointDetailsTS, etc., are removed
// as this logic is now expected to be handled by the Python engine.

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { buildingTypeDefinition, pointDetails, citizenUsername, builderContractDetails } = body;

    if (!buildingTypeDefinition || !pointDetails || !citizenUsername) {
      return NextResponse.json({ success: false, error: 'Missing required parameters (buildingTypeDefinition, pointDetails, citizenUsername).' }, { status: 400 });
    }
    
    // Prepare payload for /api/activities/try-create
    const activityParameters: Record<string, any> = {
      landId: pointDetails.polygonId,
      buildingTypeDefinition: {
        id: buildingTypeDefinition.type, // Map 'type' from request to 'id' for Python backend
        name: buildingTypeDefinition.name,
        buildTier: buildingTypeDefinition.buildTier,
        pointType: buildingTypeDefinition.pointType,
        constructionCosts: buildingTypeDefinition.constructionCosts,
        category: buildingTypeDefinition.category,
        subCategory: buildingTypeDefinition.subCategory,
        size: buildingTypeDefinition.size,
        constructionMinutes: buildingTypeDefinition.constructionMinutes,
        // Ensure all fields from the original buildingTypeDefinition expected by Python are copied
      },
      pointDetails: { // Pass only relevant parts of pointDetails if Python expects a simpler structure
        lat: pointDetails.lat,
        lng: pointDetails.lng,
        polygonId: pointDetails.polygonId, // Python might need this again
        pointType: pointDetails.pointType,
      }
    };

    if (builderContractDetails) {
      activityParameters.builderContractDetails = {
        builderUsername: builderContractDetails.sellerUsername,
        contractValue: builderContractDetails.rate, // Assuming 'rate' is the contractValue or used to calculate it
        // The Python engine will handle the logic related to publicContractId and sellerBuildingId
        // Pass them along if the Python activity `initiate_building_project` expects them.
        publicBuilderContractId: builderContractDetails.publicContractId,
        builderWorkshopId: builderContractDetails.sellerBuildingId,
      };
    }
    // targetOfficeBuildingId is optional for initiate_building_project, omitting for now.
    // The Python engine can select a default (e.g. nearest town_hall) if needed.

    const tryCreatePayload = {
      citizenUsername: citizenUsername,
      activityType: "initiate_building_project",
      activityParameters: activityParameters
    };

    const tryCreateUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/activities/try-create`;

    console.log(`[construct-building] Calling /api/activities/try-create for ${citizenUsername} with type initiate_building_project. Payload:`, JSON.stringify(tryCreatePayload, null, 2));

    const response = await fetch(tryCreateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tryCreatePayload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`[construct-building] Error from /api/activities/try-create (${response.status}):`, responseData);
      return NextResponse.json(
        { 
          success: false, 
          error: `Failed to initiate building project via activities service: ${responseData.error || response.statusText}`,
          details: responseData.details 
        },
        { status: response.status }
      );
    }

    console.log(`[construct-building] Success response from /api/activities/try-create:`, responseData);
    // The response from try-create will likely confirm activity creation.
    // The original route returned buildingId and customBuildingId. This will change.
    // The client consuming this endpoint will need to be adapted to the new response structure.
    return NextResponse.json(
      responseData, // Proxy the full response from try-create
      { status: response.status }
    );

  } catch (error) {
    console.error('Error in /api/actions/construct-building:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, error: 'Failed to process construct building request.', details: errorMessage }, { status: 500 });
  }
}
