import { NextRequest, NextResponse } from 'next/server';
import { relevancyService } from '@/lib/services/RelevancyService';
import Airtable from 'airtable';
import { RelevancyScore } from '@/lib/services/RelevancyService'; // Adjust path if RelevancyScore is moved/exported differently

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_RELEVANCIES_TABLE = 'RELEVANCIES';

export async function POST(request: NextRequest) {
  try {
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error('Airtable credentials not configured for guild-member relevancy');
      return NextResponse.json({ error: 'Airtable credentials not configured' }, { status: 500 });
    }
    const airtableBase = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

    // Calculate guild member relevancies (one record per guild)
    const guildRelevancies = await relevancyService.calculateGuildMemberRelevancy();

    if (!guildRelevancies || guildRelevancies.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No guild member relevancies to create.',
        relevanciesSavedCount: 0,
        saved: true
      });
    }

    let relevanciesSavedCount = 0;

    for (const relevancy of guildRelevancies) {
      const guildId = relevancy.asset; // This is the GuildId
      const stableRelevancyId = `guild_member_${guildId}`; 

      // relevancy.relevantToCitizen and relevancy.targetCitizen are arrays of member usernames from the service
      const memberUsernames = relevancy.relevantToCitizen as string[]; // Both fields hold the same list

      if (!memberUsernames || memberUsernames.length === 0) {
        console.warn(`[guild-member route] Skipping relevancy for GuildId ${guildId} due to no member usernames.`);
        continue;
      }
      
      const fieldsToSave = {
        RelevancyId: stableRelevancyId,
        Asset: relevancy.asset, // GuildId
        AssetType: relevancy.assetType, // 'guild'
        Category: relevancy.category,   // 'affiliation'
        Type: relevancy.type,           // 'guild_member'
        Score: relevancy.score,
        Title: relevancy.title, // Contains %TARGETCITIZEN% and Guild Name (resolved by service)
        Description: relevancy.description, // Contains %TARGETCITIZEN% and Guild Name (resolved by service)
        TimeHorizon: relevancy.timeHorizon,
        Status: relevancy.status,
        // Store arrays of usernames as stringified JSON
        RelevantToCitizen: JSON.stringify(memberUsernames), 
        TargetCitizen: JSON.stringify(memberUsernames), 
        Notes: `Guild community for ${guildId}. Members: ${memberUsernames.join(', ')}`,
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
          console.log(`[guild-member route] Deleted ${existingRecords.length} existing '${stableRelevancyId}' record(s).`);
        }

        // Create the new record
        await airtableBase(AIRTABLE_RELEVANCIES_TABLE).create([{ fields: fieldsToSave }]);
        relevanciesSavedCount++;
        console.log(`[guild-member route] Saved 'guild_member' relevancy for GuildId ${guildId}.`);
      } catch (error) {
        console.error(`[guild-member route] Error saving 'guild_member' relevancy for GuildId ${guildId}:`, error);
        console.error('[guild-member route] Failing record data:', JSON.stringify(fieldsToSave, null, 2));
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed guild member relevancies.`,
      relevanciesSavedCount,
      saved: true 
    });

  } catch (error) {
    console.error('[guild-member route] Error calculating and saving guild member relevancies:', error);
    return NextResponse.json(
      { error: 'Failed to calculate and save guild member relevancies', details: (error as Error).message },
      { status: 500 }
    );
  }
}
