import { NextRequest, NextResponse } from 'next/server';
import { relevancyService } from '@/lib/services/RelevancyService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string | undefined>> }
) {
  try {
    const { aiUsername } = await params;
    
    if (!aiUsername) {
      return NextResponse.json({ error: 'AI username is required' }, { status: 400 });
    }
    
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type'); // 'connected' or 'geographic'
    
    // Fetch lands owned by the AI
    const aiLands = await relevancyService.fetchLands(aiUsername);
    
    if (aiLands.length === 0) {
      return NextResponse.json({
        success: true,
        message: `AI ${aiUsername} does not own any lands`,
        relevancyScores: {}
      });
    }
    
    // Fetch all lands
    const allLands = await relevancyService.fetchLands();
    
    // Fetch land groups for connectivity analysis
    const landGroups = await relevancyService.fetchLandGroups();
    
    // Calculate relevancy scores with optional type filter
    const relevancyScores = typeFilter
      ? relevancyService.calculateRelevancyByType(aiLands, allLands, landGroups, typeFilter)
      : relevancyService.calculateLandProximityRelevancy(aiLands, allLands, landGroups);
    
    // Format the response to include both simple scores and detailed data
    const simpleScores: Record<string, number> = {};
    Object.entries(relevancyScores).forEach(([landId, data]) => {
      simpleScores[landId] = data.score;
    });
    
    return NextResponse.json({
      success: true,
      ai: aiUsername,
      ownedLandCount: aiLands.length,
      relevancyScores: simpleScores,
      detailedRelevancy: relevancyScores
    });
    
  } catch (error) {
    // Await params again or ensure aiUsername is in scope for error logging
    const awaitedParams = await params;
    const usernameForError = awaitedParams.aiUsername;
    console.error(`Error calculating proximity relevancies for AI ${usernameForError || 'unknown'}:`, error);
    return NextResponse.json(
      { error: 'Failed to calculate proximity relevancies', details: error.message },
      { status: 500 }
    );
  }
}
