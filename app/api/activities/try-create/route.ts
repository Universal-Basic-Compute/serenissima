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
    const pythonEngineUrl = `${PYTHON_ENGINE_BASE_URL}/api/v1/engine/try-create-activity`; 
    
    console.log(`[API /activities/try-create] Calling Python engine at: ${pythonEngineUrl} with payload:`, pythonPayload);

    const engineResponse = await fetch(pythonEngineUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pythonPayload),
    });

    const responseData = await engineResponse.json();

    if (!engineResponse.ok) {
      console.error(`[API /activities/try-create] Error from Python engine (${engineResponse.status}) for ${activityType}:`, responseData);
      return NextResponse.json(
        { success: false, error: `Python engine error for ${activityType}: ${responseData.error || engineResponse.statusText}`, details: responseData.details },
        { status: engineResponse.status }
      );
    }

    console.log(`[API /activities/try-create] Response from Python engine for ${citizenUsername} (activity: ${activityType}):`, responseData);
    return NextResponse.json(responseData, { status: 200 });

  } catch (error: any) {
    console.error(`[API /activities/try-create] Internal error for activityType ${rawBody?.activityType}:`, error);
    if (error.code === 'ECONNREFUSED') {
        return NextResponse.json({ success: false, error: 'Python engine service is unavailable.' }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: error.message || 'Failed to process try-create activity request' }, { status: 500 });
  }
}
