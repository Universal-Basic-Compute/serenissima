import { NextRequest, NextResponse } from 'next/server';
import { relevancyService } from '@/lib/services/RelevancyService';
import Airtable from 'airtable';
import { RelevancyScore } from '@/lib/services/RelevancyService'; // Adjust path if RelevancyScore is moved/exported differently

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_RELEVANCIES_TABLE = 'RELEVANCIES';
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS'; // Keep for potential future use, but not for ID mapping now

// Removed getAllCitizenRecordIds as we are using usernames directly

export async function POST(request: NextRequest) {
  try {
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error('Airtable credentials not configured');
      return NextResponse.json({ error: 'Airtable credentials not configured' }, { status: 500 });
    }
    const airtableBase = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

    // For "same_land_neighbor", we calculate for all lands globally.
    // The service now returns one relevancy object per land group.
    const groupRelevancies = await relevancyService.calculateSameLandNeighborRelevancy();

    if (!groupRelevancies || groupRelevancies.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No same land neighbor relevancies to create.',
        relevanciesSavedCount: 0,
        saved: true
      });
    }

    let relevanciesSavedCount = 0;

    for (const relevancy of groupRelevancies) {
      const landId = relevancy.asset; // This is the LandId (e.g., polygon-xxxx)
      // stableRelevancyId is per land, as there's one relevancy record per land group
      const stableRelevancyId = `same_land_neighbor_${landId}`; 

      // relevancy.relevantToCitizen and relevancy.targetCitizen are arrays of usernames from the service
      const relevantToCitizenUsernames = relevancy.relevantToCitizen as string[];
      const targetCitizenUsernames = relevancy.targetCitizen as string[]; // Should be the same as relevantToCitizenUsernames

      if (!relevantToCitizenUsernames || relevantToCitizenUsernames.length === 0) {
        console.warn(`Skipping relevancy for LandId ${landId} due to no usernames for RelevantToCitizen.`);
        continue;
      }
      
      const fieldsToSave = {
        RelevancyId: stableRelevancyId,
        Asset: relevancy.asset, // LandId (e.g. polygon-xxxx)
        AssetType: relevancy.assetType, // 'land'
        Category: relevancy.category,   // 'neighborhood'
        Type: relevancy.type,           // 'same_land_neighbor'
        Score: relevancy.score,
        Title: relevancy.title, // Contains %TARGETCITIZEN% and %LAND_NAME% (resolved by service)
        Description: relevancy.description, // Contains %TARGETCITIZEN% and %LAND_NAME% (resolved by service)
        TimeHorizon: relevancy.timeHorizon,
        Status: relevancy.status,
        // Store arrays of usernames as stringified JSON
        RelevantToCitizen: JSON.stringify(relevantToCitizenUsernames), 
        TargetCitizen: JSON.stringify(targetCitizenUsernames), 
        Notes: `Land community on ${landId}. Neighbors: ${relevantToCitizenUsernames.join(', ')}`,
        CreatedAt: new Date().toISOString()
      };

      try {
        // Delete existing record with this stableRelevancyId
        const existingRecords = await airtableBase(AIRTABLE_RELEVANCIES_TABLE).select({
          filterByFormula: `{RelevancyId} = '${stableRelevancyId}'`,
          fields: ['RelevancyId'] // Only need one field to check existence
        }).all();

        if (existingRecords.length > 0) {
          await airtableBase(AIRTABLE_RELEVANCIES_TABLE).destroy(existingRecords.map(r => r.id));
          console.log(`Deleted ${existingRecords.length} existing '${stableRelevancyId}' record(s).`);
        }

        // Create the new record
        await airtableBase(AIRTABLE_RELEVANCIES_TABLE).create([{ fields: fieldsToSave }]);
        relevanciesSavedCount++;
        console.log(`Saved 'same_land_neighbor' relevancy for LandId ${landId}.`);
      } catch (error) {
        console.error(`Error saving 'same_land_neighbor' relevancy for LandId ${landId}:`, error);
        // Log the failing record for easier debugging
        console.error('Failing record data:', JSON.stringify(fieldsToSave, null, 2));
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed same land neighbor relevancies.`,
      relevanciesSavedCount,
      saved: true 
    });

  } catch (error) {
    console.error('Error calculating and saving same land neighbor relevancies:', error);
    return NextResponse.json(
      { error: 'Failed to calculate and save same land neighbor relevancies', details: error.message },
      { status: 500 }
    );
  }
}
