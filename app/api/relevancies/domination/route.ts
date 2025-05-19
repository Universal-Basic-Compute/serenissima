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
    // Get the username from the request body
    const body = await request.json();
    const { aiUsername } = body; // Can be "specific_user" or "all"
    let username = aiUsername; 
    
    // If aiUsername is "all", treat it as a global calculation (username becomes null)
    if (username === "all") {
      username = null; 
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
    
    // Save to Airtable
    let saved = false;
    let relevanciesSavedCount = 0;
    try {
      // If username is provided (and not "all"), save relevancies for that specific user
      if (username) {
        relevanciesSavedCount = await saveRelevancies(username, landDominationRelevancies, allLands, allCitizens);
      } else {
        // If username is null (i.e., aiUsername was "all" or not provided),
        // save the full set of domination relevancies for each citizen who owns land.
        // This means each citizen gets a list of how dominant everyone else is.
        for (const citizenId of Object.keys(landDominationRelevancies)) {
          // The landDominationRelevancies object is keyed by the citizen the score is *about*.
          // We are saving these scores *to* the `citizenId`'s relevancy list.
          const count = await saveRelevancies(citizenId, landDominationRelevancies, allLands, allCitizens);
          relevanciesSavedCount += count; // This might be an overcount if saveRelevancies returns total saved for that user.
                                          // For simplicity, let's assume it's the number of records related to this call.
        }
        // A more accurate count for "all" would be complex as saveRelevancies filters top 10 per type.
        // For now, we'll just mark as saved.
      }
      saved = true;
    } catch (error) {
      console.error('Error saving relevancies to Airtable:', error);
    }
    
    return NextResponse.json({
      success: true,
      username: username || 'all',
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
