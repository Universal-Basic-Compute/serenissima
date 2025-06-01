import { NextResponse } from 'next/server';
import { z } from 'zod';

const PYTHON_ENGINE_BASE_URL = process.env.DEFAULT_FASTAPI_URL || 'http://localhost:8000';

const TryCreateActivityRequestSchema = z.object({
  citizenUsername: z.string().min(1, "citizenUsername is required"),
  activityType: z.string().min(1, "activityType is required"),
  activityParameters: z.record(z.any()).optional(), // Permet un objet flexible pour les paramètres
});

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const validationResult = TryCreateActivityRequestSchema.safeParse(rawBody);

    if (!validationResult.success) {
      return NextResponse.json({ success: false, error: "Invalid request payload", details: validationResult.error.format() }, { status: 400 });
    }
    const { citizenUsername, activityType, activityParameters } = validationResult.data;

    console.log(`[API /activities/try-create] Received request for citizen: ${citizenUsername}, activityType: ${activityType}, params:`, activityParameters || {});

    // Préparer le payload pour l'appel à l'API interne Python
    const pythonPayload: any = {
      citizenUsername: citizenUsername,
      activityType: activityType, // Le moteur Python utilisera ceci pour router vers la bonne logique
      ...(activityParameters && { activityParameters: activityParameters }), // Inclure les paramètres s'ils existent
    };
    
    // Endpoint générique sur le moteur Python
    let parsedPythonEngineUrl: URL;
    try {
      let base = PYTHON_ENGINE_BASE_URL;
      // Assurer que la base URL a un schéma, sinon fetch peut lever une TypeError
      if (!base.startsWith('http://') && !base.startsWith('https://')) {
        console.warn(`[API /activities/try-create] PYTHON_ENGINE_BASE_URL (${base}) is missing scheme, prepending http://`);
        base = 'http://' + base;
      }
      parsedPythonEngineUrl = new URL('/api/v1/engine/try-create-activity', base);
    } catch (e: any) {
      console.error(`[API /activities/try-create] Invalid PYTHON_ENGINE_BASE_URL: ${PYTHON_ENGINE_BASE_URL}. Error: ${e.message}`);
      return NextResponse.json({ success: false, error: 'Internal server configuration error: Python engine URL is invalid.' }, { status: 500 });
    }
    const pythonEngineUrlValidated = parsedPythonEngineUrl.toString();
    
    console.log(`[API /activities/try-create] Calling Python engine at: ${pythonEngineUrlValidated} with payload:`, pythonPayload);

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
    if (error.code === 'ECONNREFUSED') {
        return NextResponse.json({ success: false, error: 'Python engine service is unavailable.' }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: error.message || 'Failed to process try-create activity request' }, { status: 500 });
  }
}
