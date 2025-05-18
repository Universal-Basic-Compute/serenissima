import { NextRequest, NextResponse } from 'next/server';
import { relevancyService } from '@/lib/services/RelevancyService';
import { saveRelevancies } from '@/lib/utils/relevancyUtils';

export async function GET(request: NextRequest) {
  try {
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const aiUsername = searchParams.get('ai');
    const typeFilter = searchParams.get('type'); // 'connected' or 'geographic'
    
    if (!aiUsername) {
      return NextResponse.json({ error: 'AI username is required' }, { status: 400 });
    }
    
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
    console.error('Error calculating proximity relevancies:', error);
    return NextResponse.json(
      { error: 'Failed to calculate proximity relevancies', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the AI username and type filter from the request body
    const body = await request.json();
    const { aiUsername, typeFilter } = body;
    
    if (!aiUsername) {
      return NextResponse.json(
        { error: 'AI username is required' },
        { status: 400 }
      );
    }
    
    // Fetch all citizens for land domination relevancy
    const citizensResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/citizens`);
    const citizensData = await citizensResponse.json();
    const allCitizens = citizensData.citizens || [];
    
    // Calculate relevancy scores using the service
    const aiLands = await relevancyService.fetchLands(aiUsername);
    const allLands = await relevancyService.fetchLands();
    const landGroups = await relevancyService.fetchLandGroups();
    
    // Calculate with optional type filter
    const relevancyScores = typeFilter
      ? relevancyService.calculateRelevancyByType(aiLands, allLands, landGroups, typeFilter)
      : relevancyService.calculateLandProximityRelevancy(aiLands, allLands, landGroups);
    
    // Format the response
    const simpleScores: Record<string, number> = {};
    Object.entries(relevancyScores).forEach(([landId, data]) => {
      simpleScores[landId] = data.score;
    });
    
    // Save to Airtable
    let saved = false;
    try {
      await saveRelevancies(aiUsername, relevancyScores, allLands, allCitizens);
      saved = true;
    } catch (error) {
      console.error('Error saving relevancies to Airtable:', error);
    }
    
    return NextResponse.json({
      success: true,
      ai: aiUsername,
      ownedLandCount: aiLands.length,
      relevancyScores: simpleScores,
      detailedRelevancy: relevancyScores,
      saved
    });
    
  } catch (error) {
    console.error('Error calculating and saving proximity relevancies:', error);
    return NextResponse.json(
      { error: 'Failed to calculate proximity relevancies', details: error.message },
      { status: 500 }
    );
  }
}
