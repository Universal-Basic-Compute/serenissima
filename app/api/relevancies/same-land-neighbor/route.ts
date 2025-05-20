import { NextRequest, NextResponse } from 'next/server';
import { relevancyService } from '@/lib/services/RelevancyService';
import Airtable from 'airtable';
import { RelevancyScore } from '@/lib/services/RelevancyService'; // Adjust path if RelevancyScore is moved/exported differently

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_RELEVANCIES_TABLE = 'RELEVANCIES';
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';

async function getAllCitizenRecordIds(base: Airtable.Base): Promise<Record<string, string>> {
  const citizenUsernamesToRecordIds: Record<string, string> = {};
  try {
    const records = await base(AIRTABLE_CITIZENS_TABLE).select({
      fields: ['Username'] // Assuming 'Username' is the field storing unique usernames
    }).all();
    records.forEach(record => {
      const username = record.fields.Username as string;
      if (username) {
        citizenUsernamesToRecordIds[username] = record.id;
      }
    });
  } catch (error) {
    console.error("Error fetching citizen record IDs:", error);
    // Depending on strictness, you might want to throw error or return empty/partial map
  }
  return citizenUsernamesToRecordIds;
}

export async function POST(request: NextRequest) {
  try {
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error('Airtable credentials not configured');
      return NextResponse.json({ error: 'Airtable credentials not configured' }, { status: 500 });
    }
    const airtableBase = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

    // const body = await request.json(); // Optional: if you want to pass citizen for specific calculation
    // const { Citizen: specificCitizen } = body;

    // For "same_land_neighbor", we typically calculate for all lands globally.
    const groupRelevancies = await relevancyService.calculateSameLandNeighborRelevancy();

    if (!groupRelevancies || groupRelevancies.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No same land neighbor relevancies to create.',
        relevanciesSavedCount: 0,
        saved: true
      });
    }

    const citizenUsernamesToRecordIds = await getAllCitizenRecordIds(airtableBase);
    let relevanciesSavedCount = 0;

    for (const relevancy of groupRelevancies) {
      const landId = relevancy.assetId;
      const stableRelevancyId = `same_land_neighbor_${landId}`;

      // Map usernames to Airtable Record IDs for RelevantToCitizen and TargetCitizen
      const relevantToCitizenRecordIds = (Array.isArray(relevancy.relevantToCitizen) ? relevancy.relevantToCitizen : [relevancy.relevantToCitizen])
        .map(username => citizenUsernamesToRecordIds[username as string])
        .filter(Boolean) as string[];
      
      const targetCitizenRecordIds = (Array.isArray(relevancy.targetCitizen) ? relevancy.targetCitizen : [relevancy.targetCitizen])
        .map(username => citizenUsernamesToRecordIds[username as string])
        .filter(Boolean) as string[];

      if (relevantToCitizenRecordIds.length === 0) {
        console.warn(`Skipping relevancy for LandId ${landId} due to no valid citizen record IDs for RelevantToCitizen.`);
        continue;
      }
      
      const fieldsToSave = {
        RelevancyId: stableRelevancyId,
        AssetID: relevancy.assetId,
        AssetType: relevancy.assetType,
        Category: relevancy.category,
        Type: relevancy.type,
        Score: relevancy.score,
        Title: relevancy.title,
        Description: relevancy.description,
        TimeHorizon: relevancy.timeHorizon,
        Status: relevancy.status,
        RelevantToCitizen: JSON.stringify(relevantToCitizenRecordIds), // Stringified array of Record IDs
        TargetCitizen: JSON.stringify(targetCitizenRecordIds),     // Stringified array of Record IDs
        Notes: `Land community on ${landId}`,
        CreatedAt: new Date().toISOString()
      };

      try {
        // Delete existing record with this stableRelevancyId
        const existingRecords = await airtableBase(AIRTABLE_RELEVANCIES_TABLE).select({
          filterByFormula: `{RelevancyId} = '${stableRelevancyId}'`,
          fields: ['RelevancyId']
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
        // Decide if one error should stop the whole process or just log and continue
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
