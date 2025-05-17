import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import { relevancyService } from '@/lib/services/RelevancyService';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_LANDS_TABLE = process.env.AIRTABLE_LANDS_TABLE || 'LANDS';
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';
const AIRTABLE_RELEVANCIES_TABLE = 'RELEVANCIES';

// Helper function to get all AI citizens who own lands
async function getAllAiCitizensWithLands(base: any): Promise<string[]> {
  try {
    console.log('Fetching AI citizens who own lands...');
    
    // First get all AI citizens
    const aiCitizens = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        filterByFormula: '{IsAI} = TRUE()',
        fields: ['Username']
      })
      .all();
    
    const aiUsernames = aiCitizens.map(citizen => citizen.get('Username')).filter(Boolean);
    
    if (aiUsernames.length === 0) {
      console.log('No AI citizens found');
      return [];
    }
    
    console.log(`Found ${aiUsernames.length} AI citizens`);
    
    // Now check which of these AI citizens own lands
    const aiOwnersWithLands = [];
    
    for (const username of aiUsernames) {
      // Check if this AI owns any lands
      const landsOwned = await base(AIRTABLE_LANDS_TABLE)
        .select({
          filterByFormula: `{Owner} = '${username}'`,
          fields: ['Owner'],
          maxRecords: 1
        })
        .firstPage();
      
      if (landsOwned.length > 0) {
        aiOwnersWithLands.push(username);
      }
    }
    
    console.log(`Found ${aiOwnersWithLands.length} AI citizens who own lands`);
    return aiOwnersWithLands;
  } catch (error) {
    console.error('Error fetching AI citizens with lands:', error);
    return [];
  }
}

// Helper function to fetch land groups data
async function fetchLandGroups(): Promise<Record<string, string>> {
  try {
    console.log('Fetching land groups for connectivity analysis...');
    const landGroupsResponse = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/land-groups?includeUnconnected=true&minSize=1`
    );
    
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
    
    return landGroups;
  } catch (error) {
    console.error('Error fetching land groups:', error);
    return {};
  }
}

// Helper function to fetch all citizens data
async function fetchAllCitizens(base: any): Promise<any[]> {
  try {
    console.log('Fetching all citizens data...');
    const records = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        fields: ['Username', 'FirstName', 'LastName', 'IsAI']
      })
      .all();
    
    return records.map(record => ({
      id: record.id,
      username: record.get('Username'),
      firstName: record.get('FirstName'),
      lastName: record.get('LastName'),
      isAI: record.get('IsAI') || false
    }));
  } catch (error) {
    console.error('Error fetching citizens data:', error);
    return [];
  }
}

// Helper function to save relevancies to Airtable
async function saveRelevancies(
  base: any, 
  aiUsername: string, 
  relevancyScores: Record<string, any>,
  allLands: any[],
  allCitizens: any[] = []
): Promise<number> {
  try {
    // Delete existing relevancy records for this AI to avoid duplicates
    const existingRecords = await base(AIRTABLE_RELEVANCIES_TABLE)
      .select({
        filterByFormula: `{RelevantToCitizen} = '${aiUsername}'`
      })
      .all();
      
    if (existingRecords.length > 0) {
      // Delete in batches of 10 to avoid API limits
      const recordIds = existingRecords.map(record => record.id);
      for (let i = 0; i < recordIds.length; i += 10) {
        const batch = recordIds.slice(i, i + 10);
        await base(AIRTABLE_RELEVANCIES_TABLE).destroy(batch);
      }
      console.log(`Deleted ${existingRecords.length} existing relevancy records for ${aiUsername}`);
    }
      
    // Create new relevancy records
    const relevancyRecords = Object.entries(relevancyScores).map(([id, data]) => {
      // Handle different types of relevancies
      if (data.assetType === 'land') {
        return {
          fields: {
            AssetID: id,
            AssetType: data.assetType,
            Category: data.category,
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
      } else if (data.assetType === 'citizen') {
        // Find citizen details
        const citizen = allCitizens.find(c => 
          (c.username === id) || (c.Username === id)
        );
        
        return {
          fields: {
            AssetID: id,
            AssetType: data.assetType,
            Category: data.category,
            Type: data.type,
            TargetCitizen: id, // The citizen this relevancy is about
            RelevantToCitizen: aiUsername,
            Score: data.score,
            TimeHorizon: data.timeHorizon || 'medium',
            Title: data.title || `Citizen Relevancy: ${id}`,
            Description: data.description || `Relevancy information about citizen ${id}`,
            Notes: citizen ? `${citizen.firstName || ''} ${citizen.lastName || ''}`.trim() : '',
            Status: data.status || 'active',
            CreatedAt: new Date().toISOString()
          }
        };
      }
    });
      
    // Create records in batches of 10
    for (let i = 0; i < relevancyRecords.length; i += 10) {
      const batch = relevancyRecords.slice(i, i + 10);
      await base(AIRTABLE_RELEVANCIES_TABLE).create(batch);
    }
      
    console.log(`Created ${relevancyRecords.length} new relevancy records for ${aiUsername}`);
    return relevancyRecords.length;
  } catch (error) {
    console.warn('Could not save to RELEVANCIES table:', error.message);
    throw error;
  }
}

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
    const calculateAll = searchParams.get('calculateAll') === 'true';
    
    // Fetch all lands from Airtable
    console.log('Fetching all lands from Airtable...');
    const landsRecords = await base(AIRTABLE_LANDS_TABLE).select().all();
    
    // Transform land records to a more usable format
    const allLands = landsRecords.map(record => ({
      id: record.id,
      owner: record.get('Owner') as string,
      center: record.get('Center') as { lat: number, lng: number } | null,
      coordinates: record.get('Coordinates') as { lat: number, lng: number }[] || [],
      historicalName: record.get('HistoricalName') as string || null,
      buildingPoints: record.get('BuildingPoints') as number || 0
    }));
    
    // Fetch land groups data
    const landGroups = await fetchLandGroups();
    
    // If calculateAll is true, calculate for all AI citizens who own lands
    if (calculateAll) {
      console.log('Calculating relevancies for all AI citizens who own lands');
      
      // Get all AI citizens who own lands
      const aiOwnersWithLands = await getAllAiCitizensWithLands(base);
      
      if (aiOwnersWithLands.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'No AI citizens with lands found'
        });
      }
      
      // Fetch all citizens for land domination relevancy
      const allCitizens = await fetchAllCitizens(base);
      
      // Calculate land domination relevancy once for all citizens
      console.log('Calculating land domination relevancy for all citizens');
      const landDominationRelevancies = relevancyService.calculateLandDominationRelevancy(
        allCitizens,
        allLands
      );
      
      const results = {};
      let totalRelevanciesCreated = 0;
      
      // Calculate and save relevancies for each AI citizen
      for (const aiOwner of aiOwnersWithLands) {
        console.log(`Calculating relevancies for AI: ${aiOwner}`);
        
        // Get lands owned by this AI
        const aiLands = allLands.filter(land => land.owner === aiOwner);
        
        if (aiLands.length === 0) {
          console.log(`No lands found for AI: ${aiOwner}, skipping`);
          continue;
        }
        
        // Calculate land proximity relevancy with connectivity data
        // Use batch processing for better performance with large datasets
        const proximityRelevancies = relevancyService.calculateRelevancyInBatches(
          aiLands, 
          allLands, 
          landGroups,
          100 // Process in batches of 100 lands
        );
        
        // Combine both types of relevancies
        const combinedRelevancies = {
          ...proximityRelevancies,
          ...landDominationRelevancies
        };
        
        try {
          // Save relevancies to Airtable
          const relevanciesCreated = await saveRelevancies(base, aiOwner, combinedRelevancies, allLands, allCitizens);
          
          totalRelevanciesCreated += relevanciesCreated;
          
          // Store results
          results[aiOwner] = {
            ownedLandCount: aiLands.length,
            relevanciesCreated
          };
        } catch (error) {
          console.warn(`Could not save to RELEVANCIES table for ${aiOwner}:`, error.message);
          results[aiOwner] = {
            ownedLandCount: aiLands.length,
            error: error.message
          };
        }
      }
      
      return NextResponse.json({
        success: true,
        aiCount: Object.keys(results).length,
        totalRelevanciesCreated,
        results
      });
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
      center: record.get('Center') as { lat: number, lng: number } | null,
      coordinates: record.get('Coordinates') as { lat: number, lng: number }[] || [],
      historicalName: record.get('HistoricalName') as string || null,
      buildingPoints: record.get('BuildingPoints') as number || 0
    }));
    
    // Fetch all citizens for land domination relevancy
    const allCitizens = await fetchAllCitizens(base);
    
    // Fetch land groups data
    const landGroups = await fetchLandGroups();
    
    // Get lands owned by this AI
    const aiLands = allLands.filter(land => land.owner === aiUsername);
    
    if (aiLands.length === 0) {
      return NextResponse.json(
        { message: `AI ${aiUsername} does not own any lands` },
        { status: 404 }
      );
    }
    
    // Calculate land proximity relevancy with connectivity data
    const proximityRelevancies = relevancyService.calculateLandProximityRelevancy(aiLands, allLands, landGroups);
    
    // Calculate land domination relevancy
    const landDominationRelevancies = relevancyService.calculateLandDominationRelevancy(allCitizens, allLands);
    
    // Combine both types of relevancies
    const combinedRelevancies = {
      ...proximityRelevancies,
      ...landDominationRelevancies
    };
      
    // Format the response to include both simple scores and detailed data
    const simpleScores: Record<string, number> = {};
    Object.entries(combinedRelevancies).forEach(([id, data]) => {
      simpleScores[id] = data.score;
    });
    
    try {
      // Save relevancies to Airtable
      await saveRelevancies(base, aiUsername, combinedRelevancies, allLands, allCitizens);
      
      return NextResponse.json({
        success: true,
        ai: aiUsername,
        ownedLandCount: aiLands.length,
        relevancyScores: simpleScores,
        detailedRelevancy: combinedRelevancies,
        saved: true
      });
    } catch (error) {
      return NextResponse.json({
        success: false,
        ai: aiUsername,
        ownedLandCount: aiLands.length,
        relevancyScores: simpleScores,
        detailedRelevancy: combinedRelevancies,
        saved: false,
        error: error.message
      });
    }
    
  } catch (error) {
    console.error('Error calculating and saving relevancies:', error);
    return NextResponse.json(
      { error: 'Failed to calculate and save relevancies', details: error.message },
      { status: 500 }
    );
  }
}
