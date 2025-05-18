import { NextRequest, NextResponse } from 'next/server';
import { relevancyService } from '@/lib/services/RelevancyService';
import { saveRelevancies } from '@/lib/utils/relevancyUtils';

export async function GET(request: NextRequest) {
  try {
    // Fetch all lands
    const allLands = await relevancyService.fetchLands();
    
    // Fetch all citizens
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/citizens`);
    if (!response.ok) {
      throw new Error(`Failed to fetch citizens: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const allCitizens = data.citizens || [];
    
    // Calculate land domination relevancy
    const landDominationRelevancies = relevancyService.calculateLandDominationRelevancy(
      allCitizens,
      allLands
    );
    
    // Format the response
    const simpleScores: Record<string, number> = {};
    Object.entries(landDominationRelevancies).forEach(([citizenId, data]) => {
      simpleScores[citizenId] = data.score;
    });
    
    return NextResponse.json({
      success: true,
      relevancyScores: simpleScores,
      detailedRelevancy: landDominationRelevancies
    });
    
  } catch (error) {
    console.error('Error calculating domination relevancies:', error);
    return NextResponse.json(
      { error: 'Failed to calculate domination relevancies', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the AI username from the request body
    const body = await request.json();
    const { aiUsername } = body;
    
    if (!aiUsername) {
      return NextResponse.json(
        { error: 'AI username is required' },
        { status: 400 }
      );
    }
    
    // Fetch all lands
    const allLands = await relevancyService.fetchLands();
    
    // Fetch all citizens
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/citizens`);
    if (!response.ok) {
      throw new Error(`Failed to fetch citizens: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const allCitizens = data.citizens || [];
    
    // Calculate land domination relevancy
    const landDominationRelevancies = relevancyService.calculateLandDominationRelevancy(
      allCitizens,
      allLands
    );
    
    // Format the response
    const simpleScores: Record<string, number> = {};
    Object.entries(landDominationRelevancies).forEach(([citizenId, data]) => {
      simpleScores[citizenId] = data.score;
    });
    
    // Save to Airtable - only save once for this AI
    let saved = false;
    try {
      await saveRelevancies(aiUsername, landDominationRelevancies, allLands, allCitizens);
      saved = true;
    } catch (error) {
      console.error('Error saving relevancies to Airtable:', error);
    }
    
    return NextResponse.json({
      success: true,
      ai: aiUsername,
      relevancyScores: simpleScores,
      detailedRelevancy: landDominationRelevancies,
      saved
    });
    
  } catch (error) {
    console.error('Error calculating and saving domination relevancies:', error);
    return NextResponse.json(
      { error: 'Failed to calculate domination relevancies', details: error.message },
      { status: 500 }
    );
  }
}
