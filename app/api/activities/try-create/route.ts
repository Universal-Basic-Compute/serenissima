import { NextResponse } from 'next/server';
import { z } from 'zod';

const PYTHON_ENGINE_BASE_URL = process.env.BACKEND_BASE_URL || 'http://localhost:10000';

const TryCreateActivityRequestSchema = z.object({
  citizenUsername: z.string().min(1, "citizenUsername is required"),
  activityType: z.string().min(1, "activityType is required"), // Can be a traditional activity or a strategic action
  activityParameters: z.record(z.any()).optional(), // Flexible object for activity/action-specific parameters
});

export async function POST(request: Request) {
  let rawBody: any; // Declare rawBody here to make it accessible in the catch block
  try {
    rawBody = await request.json(); // Assign here
    console.log(`[API /activities/try-create] Raw request body:`, JSON.stringify(rawBody, null, 2)); // Log the raw request body
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
    
    // Log des paramètres spécifiques pour manage_public_import_contract
    if (activityType === 'manage_public_import_contract') {
      console.log(`[API /activities/try-create] Processing manage_public_import_contract with parameters:`, 
        activityParameters?.contractId ? `Modifying contract: ${activityParameters.contractId}` : 'Creating new contract',
        `Resource: ${activityParameters?.resourceType}`,
        `Amount: ${activityParameters?.targetAmount}`,
        `Price: ${activityParameters?.pricePerResource}`,
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
    
    // Log des paramètres spécifiques pour manage_public_storage_offer
    if (activityType === 'manage_public_storage_offer') {
      console.log(`[API /activities/try-create] Processing manage_public_storage_offer with parameters:`,
        activityParameters?.contractId_to_create_if_new ? `Managing contract: ${activityParameters.contractId_to_create_if_new}` : 'No specific contract ID provided (likely new)',
        `Seller Building: ${activityParameters?.sellerBuildingId}`,
        `Resource: ${activityParameters?.resourceType}`,
        `Capacity: ${activityParameters?.capacityOffered}`,
        `Price/Unit/Day: ${activityParameters?.pricePerUnitPerDay}`,
        `Strategy: ${activityParameters?.pricingStrategy}`
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
    
    // Log des paramètres spécifiques pour offer_loan
    if (activityType === 'offer_loan') {
      console.log(`[API /activities/try-create] Processing offer_loan with parameters:`, 
        `Amount: ${activityParameters?.amount}`,
        `Interest Rate: ${activityParameters?.interestRate * 100}%`,
        `Term Days: ${activityParameters?.termDays}`,
        `Target Borrower: ${activityParameters?.targetBorrowerUsername || 'Public offer'}`,
        `Target Building: ${activityParameters?.targetOfficeBuildingId || 'Nearest financial/notary institution'}`
      );
    }
    
    // Log des paramètres spécifiques pour send_message
    if (activityType === 'send_message') {
      const inReplyTo = activityParameters?.notes?.inReplyToMessageId; // Changed details to notes
      const channel = activityParameters?.channel; // Extract channel if present
      console.log(`[API /activities/try-create] Processing send_message with parameters:`, 
        `Receiver: ${activityParameters?.receiverUsername}`,
        `Message Type: ${activityParameters?.messageType || 'message'}`,
        `Content Length: ${activityParameters?.content ? (activityParameters.content as string).length : 0} characters`,
        `Target Building: ${activityParameters?.targetBuildingId || 'Receiver location'}`,
        inReplyTo ? `In Reply To: ${inReplyTo}` : 'Not a reply or ID not provided in notes', // Changed details to notes
        channel ? `Channel: ${channel}` : 'No channel specified' // Log channel
      );
    }
    
    // Log des paramètres spécifiques pour manage_guild_membership
    if (activityType === 'manage_guild_membership') {
      console.log(`[API /activities/try-create] Processing manage_guild_membership with parameters:`, 
        `Guild ID: ${activityParameters?.guildId}`,
        `Membership Action: ${activityParameters?.membershipAction}`,
        `Guild Hall Building ID: ${activityParameters?.guildHallBuildingId || 'Auto-detect'}`
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

    // Log des paramètres spécifiques pour les nouvelles activités de gestion foncière
    if (activityType === 'list_land_for_sale') {
      console.log(`[API /activities/try-create] Processing list_land_for_sale:`, activityParameters);
    }
    if (activityType === 'make_offer_for_land') {
      console.log(`[API /activities/try-create] Processing make_offer_for_land:`, activityParameters);
    }
    if (activityType === 'accept_land_offer') {
      console.log(`[API /activities/try-create] Processing accept_land_offer:`, activityParameters);
    }
    if (activityType === 'buy_listed_land') {
      console.log(`[API /activities/try-create] Processing buy_listed_land:`, activityParameters);
    }
    if (activityType === 'cancel_land_listing') {
      console.log(`[API /activities/try-create] Processing cancel_land_listing:`, activityParameters);
    }
    if (activityType === 'cancel_land_offer') {
      console.log(`[API /activities/try-create] Processing cancel_land_offer:`, activityParameters);
    }
    // buy_available_land est déjà loggué plus haut

    if (activityType === 'adjust_land_lease_price') {
      console.log(`[API /activities/try-create] Processing adjust_land_lease_price:`, activityParameters);
    }
    if (activityType === 'adjust_building_rent_price') {
      console.log(`[API /activities/try-create] Processing adjust_building_rent_price:`, activityParameters);
    }
    if (activityType === 'adjust_building_lease_price') {
      console.log(`[API /activities/try-create] Processing adjust_building_lease_price:`, activityParameters);
    }
    if (activityType === 'bid_on_building') {
      console.log(`[API /activities/try-create] Processing bid_on_building:`, activityParameters);
    }
    if (activityType === 'respond_to_building_bid') {
      console.log(`[API /activities/try-create] Processing respond_to_building_bid:`, activityParameters);
    }
    if (activityType === 'withdraw_building_bid') {
      console.log(`[API /activities/try-create] Processing withdraw_building_bid:`, activityParameters);
    }
    if (activityType === 'manage_markup_buy_contract') {
      console.log(`[API /activities/try-create] Processing manage_markup_buy_contract:`, activityParameters);
    }
    if (activityType === 'manage_storage_query_contract') {
      console.log(`[API /activities/try-create] Processing manage_storage_query_contract:`, activityParameters);
    }
    if (activityType === 'adjust_business_wages') {
      console.log(`[API /activities/try-create] Processing adjust_business_wages:`, activityParameters);
    }
    if (activityType === 'change_business_manager') {
      console.log(`[API /activities/try-create] Processing change_business_manager:`, activityParameters);
    }
    if (activityType === 'update_citizen_profile') {
      console.log(`[API /activities/try-create] Processing update_citizen_profile:`, activityParameters);
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
      
      // Try to extract a meaningful error message from Python's response for the primary 'error' field
      let extractedPythonMessage: string;
      if (responseData && typeof responseData.error === 'string') {
        extractedPythonMessage = responseData.error;
      } else if (responseData && typeof responseData.detail === 'string') {
        extractedPythonMessage = responseData.detail;
      } else if (responseData && Array.isArray(responseData.detail)) {
        // FastAPI validation errors often in responseData.detail as an array
        const detailStr = JSON.stringify(responseData.detail);
        extractedPythonMessage = detailStr.length > 200 ? detailStr.substring(0, 197) + "..." : detailStr;
      } else if (responseData && typeof (responseData as any).message === 'string') {
        extractedPythonMessage = (responseData as any).message;
      } else if (responseData && typeof (responseData as any).msg === 'string') {
        extractedPythonMessage = (responseData as any).msg;
      } else if (typeof responseData === 'string') {
        extractedPythonMessage = responseData;
      } else if (responseData && typeof responseData === 'object' && responseData !== null) {
        // Fallback: stringify the whole object if it's not too large and no specific message field found
        const responseStr = JSON.stringify(responseData);
        extractedPythonMessage = responseStr.length > 200 ? responseStr.substring(0, 197) + "..." : responseStr;
      } else {
        extractedPythonMessage = engineResponse.statusText || 'Unknown Python engine error';
      }

      const pythonErrorString = extractedPythonMessage;
      // pythonDetails should still be the full responseData for complete context,
      // or responseData.details if that specific sub-field exists.
      const pythonDetails = responseData?.details || responseData; 

      return NextResponse.json(
        { success: false, error: `Python engine error for ${activityType}: ${pythonErrorString}`, details: pythonDetails },
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
        const currentPythonBaseUrlForError = process.env.BACKEND_BASE_URL || 'http://localhost:10000'; // Re-fetch for logging
        console.error(`[API /activities/try-create] Detected ECONNREFUSED. Python engine is likely down or unreachable at configured URL (derived from BACKEND_BASE_URL: '${currentPythonBaseUrlForError}').`);
        return NextResponse.json({ success: false, error: `Python engine service is unavailable (ECONNREFUSED). Attempted to reach: ${currentPythonBaseUrlForError}` }, { status: 503 });
    }
    
    return NextResponse.json({ success: false, error: error.message || 'Failed to process try-create activity request' }, { status: 500 });
  }
}
