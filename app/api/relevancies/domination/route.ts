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
    const { Citizen } = body; // Can be "specific_user" or "all"
    let usernameForProcessing = Citizen; 
    
    // If Citizen is "all", treat it as a global calculation (usernameForProcessing becomes null)
    if (usernameForProcessing === "all") {
      usernameForProcessing = null; 
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
      if (usernameForProcessing) {
        // Specific user: save the list of all dominant players TO this user's relevancies
        relevanciesSavedCount = await saveRelevancies(usernameForProcessing, landDominationRelevancies, allLands, allCitizens);
        saved = true;
      } else {
        // Global calculation (usernameForProcessing is null, meaning Citizen was "all")
        // Create one relevancy record PER LANDOWNER, relevant to "all", detailing that landowner's domination.
        relevanciesSavedCount = 0;
        const recordsToCreate = [];
        const relevantToGlobal = "all"; // Or "ConsiglioDeiDieci"

        // Removed deletion of existing global landowner profiles.
        // New global landowner profiles will be added. RelevancyId includes Date.now() for uniqueness.
        console.log(`Proceeding to create new global landowner profiles without deleting existing ones.`);

        for (const [landownerUsername, dominationData] of Object.entries(landDominationRelevancies)) {
          // dominationData is a RelevancyScore object from relevancyService.calculateLandDominationRelevancy
          // dominationData.title is already "Land Domination: FullName"
          // dominationData.description is already about the specific landowner

          // Only create global_landowner_profile if score > 2
          if (dominationData.score > 2) {
            const globalLandownerProfileRecord = {
              fields: {
                RelevancyId: `global_domination_${landownerUsername}_${Date.now()}`,
                Asset: landownerUsername, // The landowner being profiled
                AssetType: "citizen",       // dominationData.assetType is 'citizen'
                Category: "domination",     // dominationData.category is 'domination'
                Type: "global_landowner_profile", // Specific type for these global profiles
                TargetCitizen: landownerUsername, // The record is about this landowner
                RelevantToCitizen: relevantToGlobal, // The record is for global view
                Score: dominationData.score,
                TimeHorizon: dominationData.timeHorizon,
                Title: dominationData.title, // e.g., "Land Domination: Giovanni Contarini"
                Description: dominationData.description,
                Status: dominationData.status,
                CreatedAt: new Date().toISOString()
              }
            };
            recordsToCreate.push(globalLandownerProfileRecord);
          } else {
            console.log(`[API Domination POST - Global] Skipping landowner profile for ${landownerUsername} due to score ${dominationData.score} <= 2.`);
          }
        }

        if (recordsToCreate.length > 0) {
          // Create records in batches of 10
          for (let i = 0; i < recordsToCreate.length; i += 10) {
            const batch = recordsToCreate.slice(i, i + 10);
            await airtableBase(AIRTABLE_RELEVANCIES_TABLE).create(batch);
            console.log(`Created batch of ${batch.length} global landowner profiles.`);
          }
          relevanciesSavedCount = recordsToCreate.length;
        }
        saved = true; // Mark as saved if the process completed
        console.log(`Successfully processed global landowner profiles for ${relevanciesSavedCount} landowners.`);
      }
    } catch (error) {
      console.error('Error saving self-domination relevancies to Airtable:', error);
      if (!usernameForProcessing) { 
        saved = false; // If global calculation failed during saving
      } else { 
        throw error; // If specific user, rethrow
      }
    }
    
    return NextResponse.json({
      success: true,
      username: usernameForProcessing || 'all', // 'all' indicates a global record was made/attempted
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
