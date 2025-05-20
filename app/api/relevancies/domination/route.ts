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
    const { citizenUsername } = body; // Can be "specific_user" or "all"
    let usernameForProcessing = citizenUsername; 
    
    // If citizenUsername is "all", treat it as a global calculation (usernameForProcessing becomes null)
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
        // Global calculation (usernameForProcessing is null, meaning citizenUsername was "all")
        // Create one relevancy record FOR EACH landowner, detailing THEIR OWN domination.
        relevanciesSavedCount = 0;
        const recordsToCreate = [];

        for (const [landownerUsername, dominationData] of Object.entries(landDominationRelevancies)) {
          // dominationData is a RelevancyScore object
          // Delete existing self-domination profile for this landowner
          const existingSelfDominationRecords = await airtableBase(AIRTABLE_RELEVANCIES_TABLE)
            .select({ 
              filterByFormula: `AND({RelevantToCitizen} = '${landownerUsername}', {AssetID} = '${landownerUsername}', {Category} = 'domination', {Type} = 'self_land_dominance_profile')` 
            })
            .all();

          if (existingSelfDominationRecords.length > 0) {
            await airtableBase(AIRTABLE_RELEVANCIES_TABLE).destroy(existingSelfDominationRecords.map(r => r.id));
            console.log(`Deleted ${existingSelfDominationRecords.length} existing self-domination profile(s) for ${landownerUsername}.`);
          }
          
          // dominationData.title is like "Land Domination: PlayerName"
          // We want the title for the self-record to be more direct.
          const selfProfileTitle = `Your Land Domination Profile`;

          const selfDominationRecord = {
            fields: {
              RelevancyId: `self_domination_${landownerUsername}_${Date.now()}`,
              AssetID: landownerUsername, // The landowner themselves
              AssetType: "citizen", // dominationData.assetType is 'citizen'
              Category: "domination", // dominationData.category is 'domination'
              Type: "self_land_dominance_profile", // New specific type
              TargetCitizen: landownerUsername, // The record is about this landowner
              RelevantToCitizen: landownerUsername, // The record is for this landowner
              Score: dominationData.score,
              TimeHorizon: dominationData.timeHorizon,
              Title: selfProfileTitle,
              Description: dominationData.description, // This description is already about the specific landowner
              Status: dominationData.status,
              CreatedAt: new Date().toISOString()
            }
          };
          recordsToCreate.push(selfDominationRecord);
        }

        if (recordsToCreate.length > 0) {
          // Create records in batches of 10
          for (let i = 0; i < recordsToCreate.length; i += 10) {
            const batch = recordsToCreate.slice(i, i + 10);
            await airtableBase(AIRTABLE_RELEVANCIES_TABLE).create(batch);
            console.log(`Created batch of ${batch.length} self-domination profiles.`);
          }
          relevanciesSavedCount = recordsToCreate.length;
        }
        saved = true; // Mark as saved if the process completed, even if 0 records if no landowners
        console.log(`Successfully processed self-domination profiles for ${relevanciesSavedCount} landowners.`);
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
