import { NextResponse } from 'next/server';
import { z } from 'zod';

const PYTHON_ENGINE_BASE_URL = process.env.DEFAULT_FASTAPI_URL || 'http://localhost:8000';

const TryCreateActivityRequestSchema = z.object({
  citizenUsername: z.string().min(1, "citizenUsername is required"),
  activityType: z.string().min(1, "activityType is required"), // Can be a traditional activity or a strategic action
  activityParameters: z.record(z.any()).optional(), // Flexible object for activity/action-specific parameters
});

export async function POST(request: Request) {
  let rawBody: any; // Declare rawBody here to make it accessible in the catch block
  try {
    rawBody = await request.json(); // Assign here
    const validationResult = TryCreateActivityRequestSchema.safeParse(rawBody);

    if (!validationResult.success) {
      return NextResponse.json({ success: false, error: "Invalid request payload", details: validationResult.error.format() }, { status: 400 });
    }
    const { citizenUsername, activityType, activityParameters } = validationResult.data;

    console.log(`[API /activities/try-create] Received request for citizen: ${citizenUsername}, endeavor (activity/action) type: ${activityType}, params:`, activityParameters || {});

    // Préparer le payload pour l'appel à l'API interne Python
    const pythonPayload: any = {
      citizenUsername: citizenUsername,
      activityType: activityType, // Le moteur Python utilisera ceci pour router vers la bonne logique (activité ou action)
      ...(activityParameters && { activityParameters: activityParameters }), // Inclure les paramètres s'ils existent
    };
    
    // Log des paramètres spécifiques pour manage_public_sell_contract
    if (activityType === 'manage_public_sell_contract') {
      console.log(`[API /activities/try-create] Processing manage_public_sell_contract with parameters:`, 
        activityParameters?.contractId ? `Modifying contract: ${activityParameters.contractId}` : 'Creating new contract',
        `Resource: ${activityParameters?.resourceType}`,
        `Amount: ${activityParameters?.targetAmount}`,
        `Price: ${activityParameters?.pricePerResource}`,
        `Seller Building: ${activityParameters?.sellerBuildingId}`,
        `Market Building: ${activityParameters?.targetMarketBuildingId}`
      );
    }
    
    // Log des paramètres spécifiques pour manage_import_contract
    if (activityType === 'manage_import_contract') {
      console.log(`[API /activities/try-create] Processing manage_import_contract with parameters:`, 
        activityParameters?.contractId ? `Modifying contract: ${activityParameters.contractId}` : 'Creating new contract',
        `Resource: ${activityParameters?.resourceType}`,
        `Amount: ${activityParameters?.targetAmount}`,
        `Price: ${activityParameters?.pricePerResource}`,
        `Buyer Building: ${activityParameters?.buyerBuildingId}`,
        `Office Building: ${activityParameters?.targetOfficeBuildingId}`
      );
    }
    
    // Log des paramètres spécifiques pour manage_logistics_service_contract
    if (activityType === 'manage_logistics_service_contract') {
      console.log(`[API /activities/try-create] Processing manage_logistics_service_contract with parameters:`, 
        activityParameters?.contractId ? `Modifying contract: ${activityParameters.contractId}` : 'Creating new contract',
        `Resource Type: ${activityParameters?.resourceType || 'General logistics'}`,
        `Service Fee: ${activityParameters?.serviceFeePerUnit}`,
        `Client Building: ${activityParameters?.clientBuildingId}`,
        `Guild Hall: ${activityParameters?.targetGuildHallId}`
      );
    }
    
    // Log des paramètres spécifiques pour buy_available_land
    if (activityType === 'buy_available_land') {
      console.log(`[API /activities/try-create] Processing buy_available_land with parameters:`, 
        `Land ID: ${activityParameters?.landId}`,
        `Expected Price: ${activityParameters?.expectedPrice}`,
        `From Building: ${activityParameters?.fromBuildingId || 'Current location'}`,
        `Target Building: ${activityParameters?.targetBuildingId}`
      );
    }
    
    // Log des paramètres spécifiques pour request_loan
    if (activityType === 'request_loan') {
      console.log(`[API /activities/try-create] Processing request_loan with parameters:`, 
        `Amount: ${activityParameters?.amount}`,
        `Purpose: ${activityParameters?.purpose || 'Unspecified'}`,
        `Lender: ${activityParameters?.lenderUsername || 'Financial institution'}`,
        `Target Building: ${activityParameters?.targetBuildingId || 'Nearest financial institution'}`,
        `Collateral: ${activityParameters?.collateralDetails ? 'Provided' : 'None'}`
      );
    }
    
    // Log des paramètres spécifiques pour initiate_building_project
    if (activityType === 'initiate_building_project') {
      console.log(`[API /activities/try-create] Processing initiate_building_project with parameters:`, 
        `Land ID: ${activityParameters?.landId}`,
        `Building Type: ${activityParameters?.buildingTypeDefinition?.id || 'Unknown'}`,
        `Point Details: ${JSON.stringify(activityParameters?.pointDetails || {})}`,
        `Builder Contract: ${activityParameters?.builderContractDetails ? 'Provided' : 'Not provided'}`,
        `Target Office: ${activityParameters?.targetOfficeBuildingId || 'Nearest town_hall'}`
      );
    }
    
    // Endpoint générique sur le moteur Python pour initier des activités/actions
    let parsedPythonEngineUrl: URL;
    try {
      let base = PYTHON_ENGINE_BASE_URL;
      // Assurer que la base URL a un schéma, sinon fetch peut lever une TypeError
      if (!base.startsWith('http://') && !base.startsWith('https://')) {
        console.warn(`[API /activities/try-create] PYTHON_ENGINE_BASE_URL (${base}) is missing scheme, prepending http://`);
        base = 'http://' + base;
      }
      // This Python endpoint will now handle both traditional activities and strategic actions
      parsedPythonEngineUrl = new URL('/api/v1/engine/try-create-activity', base); 
    } catch (e: any) {
      console.error(`[API /activities/try-create] Invalid PYTHON_ENGINE_BASE_URL: ${PYTHON_ENGINE_BASE_URL}. Error: ${e.message}`);
      return NextResponse.json({ success: false, error: 'Internal server configuration error: Python engine URL is invalid.' }, { status: 500 });
    }
    const pythonEngineUrlValidated = parsedPythonEngineUrl.toString();
    
    console.log(`[API /activities/try-create] Calling Python engine at: ${pythonEngineUrlValidated} with payload for endeavor type ${activityType}:`, pythonPayload);

    const engineResponse = await fetch(pythonEngineUrlValidated, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pythonPayload),
    });

    let responseData;
    let responseTextForErrorLog = ""; // For logging in case of JSON parse failure

    try {
      // Attempt to parse the response as JSON
      responseData = await engineResponse.json();
    } catch (e) {
      // If JSON parsing fails, try to get the response as text for logging
      try {
        responseTextForErrorLog = await engineResponse.text();
      } catch (textError) {
        // If reading as text also fails, use a placeholder
        responseTextForErrorLog = "[Could not read response text after JSON parse failure]";
      }
      console.error(`[API /activities/try-create] Python engine response was not valid JSON. Status: ${engineResponse.status}. Response text snippet: ${responseTextForErrorLog.substring(0, 500)}`);
      
      if (engineResponse.ok) {
        // Upstream service (Python) returned HTTP 2xx but with invalid JSON body
        return NextResponse.json(
          { success: false, error: "Python engine returned OK status but non-JSON response.", details: `Status: ${engineResponse.status}, Body: ${responseTextForErrorLog.substring(0, 200)}` },
          { status: 502 } // Bad Gateway
        );
      } else {
        // Upstream service (Python) returned an error status (non-2xx) AND non-JSON body
        return NextResponse.json(
          { success: false, error: `Python engine error: ${engineResponse.statusText || 'Unknown Error'}`, details: `Status: ${engineResponse.status}, Non-JSON response: ${responseTextForErrorLog.substring(0, 200)}` },
          { status: engineResponse.status } // Proxy the original error status
        );
      }
    }

    // If we reached here, responseData is valid JSON
    if (!engineResponse.ok) {
      console.error(`[API /activities/try-create] Error from Python engine (${engineResponse.status}) for ${activityType}:`, responseData);
      // Try to extract a meaningful error message from Python's response
      const pythonError = responseData?.error || responseData?.detail || (typeof responseData === 'string' ? responseData : engineResponse.statusText) || 'Unknown Python engine error';
      const pythonDetails = responseData?.details || responseData; // Send back the whole responseData as details if specific fields not found
      return NextResponse.json(
        { success: false, error: `Python engine error for ${activityType}: ${pythonError}`, details: pythonDetails },
        { status: engineResponse.status }
      );
    }

    console.log(`[API /activities/try-create] Response from Python engine for ${citizenUsername} (activity: ${activityType}):`, responseData);
    return NextResponse.json(responseData, { status: 200 });

  } catch (error: any) {
    // This outer catch handles errors like network issues with the Python engine itself (e.g. ECONNREFUSED),
    // or errors in the Next.js code before or after the fetch call (e.g. if request.json() fails).
    const activityTypeForLog = typeof rawBody === 'object' && rawBody !== null && 'activityType' in rawBody && typeof rawBody.activityType === 'string' ? rawBody.activityType : 'unknown';
    console.error(`[API /activities/try-create] Internal error for activityType ${activityTypeForLog}:`, error);

    // Check for ECONNREFUSED, potentially nested in error.cause
    let isConnectionRefused = false;
    if (error.code === 'ECONNREFUSED') {
      isConnectionRefused = true;
    } else if (error.cause) {
      // Node.js fetch often wraps system errors in 'cause'
      if (error.cause.code === 'ECONNREFUSED') {
        isConnectionRefused = true;
      } else if (Array.isArray(error.cause.errors) && error.cause.errors.length > 0) {
        // Handle AggregateError case if ECONNREFUSED is in the first error of the aggregate
        if (error.cause.errors[0]?.code === 'ECONNREFUSED') {
          isConnectionRefused = true;
        }
      }
    }

    if (isConnectionRefused) {
        console.error('[API /activities/try-create] Detected ECONNREFUSED. Python engine is likely down or unreachable.');
        return NextResponse.json({ success: false, error: 'Python engine service is unavailable (ECONNREFUSED).' }, { status: 503 });
    }
    
    return NextResponse.json({ success: false, error: error.message || 'Failed to process try-create activity request' }, { status: 500 });
  }
}
