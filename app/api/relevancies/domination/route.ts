import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable'; // Import Airtable
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
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_RELEVANCIES_TABLE = 'RELEVANCIES';

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      throw new Error('Airtable credentials not configured for saving domination relevancy');
    }
    const airtableBase = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

    try {
      if (username) {
        // Specific user: save the list of all dominant players TO this user's relevancies
        relevanciesSavedCount = await saveRelevancies(username, landDominationRelevancies, allLands, allCitizens);
        saved = true;
      } else {
        // Global calculation (username is null, meaning aiUsername was "all")
        // Create a single global relevancy record summarizing land domination.
        
        // Sort landowners by score
        const sortedLandowners = Object.entries(landDominationRelevancies)
          .map(([citizenId, data]) => ({ citizenId, ...data }))
          .sort((a, b) => b.score - a.score);

        // Take top N (e.g., 10) for the summary
        const topN = 10;
        const topLandownersSummary = sortedLandowners.slice(0, topN).map((owner, index) => 
          `${index + 1}. ${owner.title.replace('Land Domination: ', '')} (Score: ${owner.score})`
        ).join('\n');

        const globalTitle = "Overall Land Domination in Venice";
        const globalDescription = `A summary of the most dominant landowners in Venice based on land count and building potential.\n\n**Top ${topN} Landowners:**\n${topLandownersSummary}\n\nThis report provides a strategic overview of the land ownership landscape.`;
        
        const relevancyId = `global_land_domination_${Date.now()}`;
        const globalRecord = {
          fields: {
            RelevancyId: relevancyId,
            AssetID: "venice_land_domination",
            AssetType: "city_metric", 
            Category: "domination",
            Type: "overall_land_dominance",
            TargetCitizen: "ConsiglioDeiDieci", 
            RelevantToCitizen: "all",
            Score: 100, // Represents the completeness of this global report
            TimeHorizon: "long",
            Title: globalTitle,
            Description: globalDescription,
            Status: "active",
            CreatedAt: new Date().toISOString()
          }
        };
        
        // Delete existing global land domination record
        const existingGlobalRecords = await airtableBase(AIRTABLE_RELEVANCIES_TABLE)
          .select({ filterByFormula: `{AssetID} = "venice_land_domination"` })
          .all();
        if (existingGlobalRecords.length > 0) {
          await airtableBase(AIRTABLE_RELEVANCIES_TABLE).destroy(existingGlobalRecords.map(r => r.id));
          console.log(`Deleted ${existingGlobalRecords.length} existing global land domination relevancy records.`);
        }

        await airtableBase(AIRTABLE_RELEVANCIES_TABLE).create([globalRecord]);
        relevanciesSavedCount = 1;
        saved = true;
        console.log('Successfully saved global land domination relevancy to Airtable.');
      }
    } catch (error) {
      console.error('Error saving domination relevancies to Airtable:', error);
      // For global, even if saving fails, we might still want to return the calculated scores.
      // For specific user, saveRelevancies throws and is caught by the main try/catch.
      if (!username) { // If it was a global calculation, set saved to false
        saved = false;
      } else { // If specific user, rethrow to be handled by outer catch
        throw error;
      }
    }
    
    return NextResponse.json({
      success: true,
      username: username || 'all', // 'all' indicates a global record was made/attempted
      relevancyScores: simpleScores, // This is the full list of scores for all landowners
      detailedRelevancy: landDominationRelevancies, // Full details for all landowners
      saved,
      relevanciesSavedCount 
    });
    
  } catch (error) {
    console.error('Error calculating and saving domination relevancies:', error);
    return NextResponse.json(
      { error: 'Failed to calculate domination relevancies', details: error.message },
      { status: 500 }
    );
  }
}
