import { NextRequest, NextResponse } from 'next/server';
import { relevancyService } from '@/lib/services/RelevancyService';
import { saveRelevancies } from '@/lib/utils/relevancyUtils';

export async function GET(request: NextRequest) {
  try {
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username') || searchParams.get('ai'); // Support both parameters
    
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }
    
    // Calculate building-land ownership relevancy
    const relevancyScores = await relevancyService.calculateBuildingLandOwnershipRelevancy(username);
    
    // Format the response
    const simpleScores: Record<string, number> = {};
    Object.entries(relevancyScores).forEach(([id, data]) => {
      simpleScores[id] = data.score;
    });
    
    return NextResponse.json({
      success: true,
      username,
      relevancyScores: simpleScores,
      detailedRelevancy: relevancyScores
    });
    
  } catch (error) {
    console.error('Error calculating building ownership relevancies:', error);
    return NextResponse.json(
      { error: 'Failed to calculate building ownership relevancies', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the username from the request body
    const body = await request.json();
    const { citizenUsername } = body; // Changed from aiUsername
    const username = citizenUsername; // Use the new parameter
    
    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }
    
    // Fetch all citizens for relevancy context (e.g. finding names)
    const citizensResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/citizens`);
    const citizensData = await citizensResponse.json();
    const allCitizens = citizensData.citizens || [];
    
    // Fetch all lands
    const allLands = await relevancyService.fetchLands();
    
    // Calculate building-land ownership relevancy
    const relevancyScores = await relevancyService.calculateBuildingLandOwnershipRelevancy(username);
    
    // Format the response
    const simpleScores: Record<string, number> = {};
    Object.entries(relevancyScores).forEach(([id, data]) => {
      simpleScores[id] = data.score;
    });
    
    // Save to Airtable
    let saved = false;
    try {
      await saveRelevancies(username, relevancyScores, allLands, allCitizens);
      saved = true;
    } catch (error) {
      console.error('Error saving relevancies to Airtable:', error);
    }
    
    return NextResponse.json({
      success: true,
      username,
      relevancyScores: simpleScores,
      detailedRelevancy: relevancyScores,
      saved
    });
    
  } catch (error) {
    console.error('Error calculating and saving building ownership relevancies:', error);
    return NextResponse.json(
      { error: 'Failed to calculate building ownership relevancies', details: error.message },
      { status: 500 }
    );
  }
}
