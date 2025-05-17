import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import { relevancyService } from '@/lib/services/RelevancyService';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_LANDS_TABLE = process.env.AIRTABLE_LANDS_TABLE || 'LANDS';
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';

export async function GET(request: NextRequest) {
  try {
    // Check if Airtable credentials are configured
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }
    
    // Initialize Airtable
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const aiUsername = searchParams.get('ai');
    
    // Fetch all lands from Airtable
    console.log('Fetching all lands from Airtable...');
    const landsRecords = await base(AIRTABLE_LANDS_TABLE).select().all();
    
    // Transform land records to a more usable format
    const allLands = landsRecords.map(record => ({
      id: record.id,
      owner: record.get('Owner') as string,
      center: record.get('Center') as { lat: number, lng: number } || null,
      coordinates: record.get('Coordinates') as { lat: number, lng: number }[] || [],
      historicalName: record.get('HistoricalName') as string || null,
      buildingPoints: record.get('BuildingPoints') as number || 0
    }));
    
    // Fetch land groups to determine connectivity
    console.log('Fetching land groups for connectivity analysis...');
    const landGroupsResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/land-groups?includeUnconnected=true&minSize=1`);
    
    let landGroups: Record<string, string> = {};
    
    if (landGroupsResponse.ok) {
      const landGroupsData = await landGroupsResponse.json();
      
      if (landGroupsData.success && landGroupsData.landGroups) {
        console.log(`Loaded ${landGroupsData.landGroups.length} land groups for connectivity analysis`);
        
        // Create a mapping of polygon ID to group ID
        landGroupsData.landGroups.forEach((group: any) => {
          if (group.lands && Array.isArray(group.lands)) {
            group.lands.forEach((landId: string) => {
              landGroups[landId] = group.groupId;
            });
          }
        });
      }
    } else {
      console.warn('Failed to fetch land groups, proceeding without connectivity data');
    }
    
    // If an AI username is specified, calculate relevancy only for that AI
    if (aiUsername) {
      console.log(`Calculating relevancy for AI: ${aiUsername}`);
      
      // Get lands owned by this AI
      const aiLands = allLands.filter(land => land.owner === aiUsername);
      
      if (aiLands.length === 0) {
        return NextResponse.json(
          { message: `AI ${aiUsername} does not own any lands` },
          { status: 404 }
        );
      }
      
      // Calculate land proximity relevancy with connectivity data
      const relevancyScores = relevancyService.calculateLandProximityRelevancy(aiLands, allLands, landGroups);
      
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
    }
    
    // If no AI specified, calculate for all AI citizens
    console.log('Fetching AI citizens from Airtable...');
    const aiCitizens = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        filterByFormula: '{IsAI} = TRUE()',
        fields: ['Username']
      })
      .all();
    
    const results = {};
    
    // Calculate relevancy for each AI citizen
    for (const aiCitizen of aiCitizens) {
      const username = aiCitizen.get('Username') as string;
      if (!username) continue;
      
      // Get lands owned by this AI
      const aiLands = allLands.filter(land => land.owner === username);
      
      // Skip AIs with no lands
      if (aiLands.length === 0) continue;
      
      // Calculate land proximity relevancy with connectivity data
      const relevancyScores = relevancyService.calculateLandProximityRelevancy(aiLands, allLands, landGroups);
      
      // Store results
      results[username] = {
        ownedLandCount: aiLands.length,
        relevancyScores
      };
    }
    
    return NextResponse.json({
      success: true,
      aiCount: Object.keys(results).length,
      results
    });
    
  } catch (error) {
    console.error('Error calculating relevancies:', error);
    return NextResponse.json(
      { error: 'Failed to calculate relevancies', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check if Airtable credentials are configured
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }
    
    // Initialize Airtable
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    
    // Get the AI username from the request body
    const body = await request.json();
    const { aiUsername } = body;
    
    if (!aiUsername) {
      return NextResponse.json(
        { error: 'AI username is required' },
        { status: 400 }
      );
    }
    
    // Fetch all lands from Airtable
    console.log(`Calculating and saving relevancies for AI: ${aiUsername}`);
    const landsRecords = await base(AIRTABLE_LANDS_TABLE).select().all();
    
    // Transform land records
    const allLands = landsRecords.map(record => ({
      id: record.id,
      owner: record.get('Owner') as string,
      center: record.get('Center') as { lat: number, lng: number } || null,
      coordinates: record.get('Coordinates') as { lat: number, lng: number }[] || [],
      historicalName: record.get('HistoricalName') as string || null,
      buildingPoints: record.get('BuildingPoints') as number || 0
    }));
    
    // Fetch land groups to determine connectivity
    console.log('Fetching land groups for connectivity analysis...');
    const landGroupsResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/land-groups?includeUnconnected=true&minSize=1`);
    
    let landGroups: Record<string, string> = {};
    
    if (landGroupsResponse.ok) {
      const landGroupsData = await landGroupsResponse.json();
      
      if (landGroupsData.success && landGroupsData.landGroups) {
        console.log(`Loaded ${landGroupsData.landGroups.length} land groups for connectivity analysis`);
        
        // Create a mapping of polygon ID to group ID
        landGroupsData.landGroups.forEach((group: any) => {
          if (group.lands && Array.isArray(group.lands)) {
            group.lands.forEach((landId: string) => {
              landGroups[landId] = group.groupId;
            });
          }
        });
      }
    } else {
      console.warn('Failed to fetch land groups, proceeding without connectivity data');
    }
    
    // Get lands owned by this AI
    const aiLands = allLands.filter(land => land.owner === aiUsername);
    
    if (aiLands.length === 0) {
      return NextResponse.json(
        { message: `AI ${aiUsername} does not own any lands` },
        { status: 404 }
      );
    }
    
    // Calculate land proximity relevancy with connectivity data
    const relevancyScores = relevancyService.calculateLandProximityRelevancy(aiLands, allLands, landGroups);
      
    // Format the response to include both simple scores and detailed data
    const simpleScores: Record<string, number> = {};
    Object.entries(relevancyScores).forEach(([landId, data]) => {
      simpleScores[landId] = data.score;
    });
      
    // Create or update records in the RELEVANCIES table
    // First check if the table exists, if not, we'll skip this step
    try {
      // Delete existing relevancy records for this AI to avoid duplicates
      const existingRecords = await base('RELEVANCIES')
        .select({
          filterByFormula: `AND({RelevantToCitizen} = '${aiUsername}', {Category} = 'proximity')`
        })
        .all();
        
      if (existingRecords.length > 0) {
        // Delete in batches of 10 to avoid API limits
        const recordIds = existingRecords.map(record => record.id);
        for (let i = 0; i < recordIds.length; i += 10) {
          const batch = recordIds.slice(i, i + 10);
          await base('RELEVANCIES').destroy(batch);
        }
        console.log(`Deleted ${existingRecords.length} existing relevancy records for ${aiUsername}`);
      }
        
      // Create new relevancy records
      const relevancyRecords = Object.entries(relevancyScores).map(([landId, data]) => {
        return {
          fields: {
            AssetID: landId,
            AssetType: 'land',
            Category: 'proximity',
            Type: data.type,
            TargetCitizen: data.closestLandId ? allLands.find(land => land.id === data.closestLandId)?.owner || '' : '',
            RelevantToCitizen: aiUsername,
            Score: data.score,
            TimeHorizon: data.timeHorizon || 'medium',
            Title: data.title || `Nearby Land (${data.distance}m)`,
            Description: data.description || `This land is ${data.distance} meters from your nearest property`,
            Notes: data.isConnected ? 'Connected by bridges to your existing properties' : '',
            Status: data.status || 'active',
            CreatedAt: new Date().toISOString()
          }
        };
      });
        
      // Create records in batches of 10
      for (let i = 0; i < relevancyRecords.length; i += 10) {
        const batch = relevancyRecords.slice(i, i + 10);
        await base('RELEVANCIES').create(batch);
      }
        
      console.log(`Created ${relevancyRecords.length} new relevancy records for ${aiUsername}`);
    } catch (error) {
      console.warn('Could not save to RELEVANCIES table:', error.message);
      // Continue without saving to Airtable
    }
      
    return NextResponse.json({
      success: true,
      ai: aiUsername,
      ownedLandCount: aiLands.length,
      relevancyScores: simpleScores,
      detailedRelevancy: relevancyScores,
      saved: true
    });
    
  } catch (error) {
    console.error('Error calculating and saving relevancies:', error);
    return NextResponse.json(
      { error: 'Failed to calculate and save relevancies', details: error.message },
      { status: 500 }
    );
  }
}
