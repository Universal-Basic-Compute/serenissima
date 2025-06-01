import { NextResponse } from 'next/server';
import { z } from 'zod';

// --- Configuration ---
// URL de base de votre moteur Python interne. Ceci devrait être une variable d'environnement.
const PYTHON_ENGINE_BASE_URL = process.env.DEFAULT_FASTAPI_URL || 'http://localhost:8000'; // Fallback si DEFAULT_FASTAPI_URL n'est pas défini

// --- Zod Schema for Request Body ---
const EatActivityRequestSchema = z.object({
  citizenUsername: z.string().min(1, "citizenUsername is required"),
  // Optionnel: pour forcer une stratégie spécifique pour le débogage/test depuis le client
  // Le moteur Python pourrait aussi ignorer ceci et appliquer sa propre logique de priorité.
  strategy: z.enum(["inventory", "home", "tavern"]).optional(), 
});

// --- Main POST Handler ---
export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const validationResult = EatActivityRequestSchema.safeParse(rawBody);

    if (!validationResult.success) {
      return NextResponse.json({ success: false, error: "Invalid request payload", details: validationResult.error.format() }, { status: 400 });
    }
    const { citizenUsername, strategy } = validationResult.data;

    console.log(`[API /activities/eat] Received request for citizen: ${citizenUsername}, strategy: ${strategy || 'auto'}`);

    // Préparer le payload pour l'appel à l'API interne Python
    const pythonPayload: any = {
      citizenUsername: citizenUsername,
    };
    if (strategy) {
      pythonPayload.strategy = strategy;
    }

    // Appeler l'endpoint interne du moteur Python
    // Remplacez '/internal/try-create-eat-activity' par le chemin réel de votre endpoint Python
    const pythonEngineEatUrl = `${PYTHON_ENGINE_BASE_URL}/api/v1/engine/try-create-eat-activity`; 
    
    console.log(`[API /activities/eat] Calling Python engine at: ${pythonEngineEatUrl} with payload:`, pythonPayload);

    const engineResponse = await fetch(pythonEngineEatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Ajoutez ici d'autres headers si nécessaire pour votre API interne (ex: clé API interne)
      },
      body: JSON.stringify(pythonPayload),
      // Il est important de définir un timeout raisonnable
      // AbortSignal.timeout est disponible dans Node.js 17.3.0+ / 16.14.0+
      // signal: AbortSignal.timeout(30000) // 30 secondes timeout
    });

    const responseData = await engineResponse.json();

    if (!engineResponse.ok) {
      console.error(`[API /activities/eat] Error from Python engine (${engineResponse.status}):`, responseData);
      // Renvoyer l'erreur du moteur Python si possible
      return NextResponse.json(
        { success: false, error: `Python engine error: ${responseData.error || engineResponse.statusText}`, details: responseData.details },
        { status: engineResponse.status }
      );
    }

    console.log(`[API /activities/eat] Response from Python engine for ${citizenUsername}:`, responseData);

    // La réponse du moteur Python devrait déjà être dans le format attendu
    // (contenant `success`, `message`, et `activity` ou `reason`)
    return NextResponse.json(responseData, { status: 200 });

  } catch (error: any) {
    console.error('[API /activities/eat] Internal error:', error);
    // Erreur générique si l'appel fetch lui-même échoue (ex: service Python non dispo)
    if (error.code === 'ECONNREFUSED') {
        return NextResponse.json({ success: false, error: 'Python engine service is unavailable.' }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: error.message || 'Failed to process eat activity request via Python engine' }, { status: 500 });
  }
}
