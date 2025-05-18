import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import { relevancyService } from '@/lib/services/RelevancyService';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_LANDS_TABLE = process.env.AIRTABLE_LANDS_TABLE || 'LANDS';
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';
const AIRTABLE_RELEVANCIES_TABLE = 'RELEVANCIES';

// Helper function to get all citizens who own lands
async function getAllCitizensWithLands(base: any): Promise<string[]> {
  try {
    console.log('Fetching citizens who own lands...');
    
    // Get all citizens (not just AI citizens)
    const citizens = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        fields: ['Username']
      })
      .all();
    
    const usernames = citizens.map(citizen => citizen.get('Username')).filter(Boolean);
    
    if (usernames.length === 0) {
      console.log('No citizens found');
      return [];
    }
    
    console.log(`Found ${usernames.length} citizens`);
    
    // Now check which of these citizens own lands
    const ownersWithLands = [];
    
    for (const username of usernames) {
      // Check if this citizen owns any lands
      const landsOwned = await base(AIRTABLE_LANDS_TABLE)
        .select({
          filterByFormula: `{Owner} = '${username}'`,
          fields: ['Owner'],
          maxRecords: 1
        })
        .firstPage();
      
      if (landsOwned.length > 0) {
        ownersWithLands.push(username);
      }
    }
    
    console.log(`Found ${ownersWithLands.length} citizens who own lands`);
    return ownersWithLands;
  } catch (error) {
    console.error('Error fetching citizens with lands:', error);
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

// Helper function to fetch polygon data from get-polygons API
async function fetchPolygonData(): Promise<any[]> {
  try {
    console.log('Fetching polygon data from get-polygons API...');
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/get-polygons`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch polygons: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Fetched ${data.polygons?.length || 0} polygons from get-polygons API`);
    return data.polygons || [];
  } catch (error) {
    console.error('Error fetching polygon data:', error);
    return [];
  }
}

// Helper function to merge land data with polygon data
async function mergeLandDataWithPolygons(landsRecords: any[], polygons: any[]): Promise<any[]> {
  console.log(`Merging ${landsRecords.length} land records with ${polygons.length} polygons...`);
  
  // Create a map of polygon IDs to polygon data for quick lookup
  const polygonMap: Record<string, any> = {};
  polygons.forEach(polygon => {
    if (polygon.id) {
      polygonMap[polygon.id] = polygon;
    }
  });
  
  // Merge land records with polygon data
  const mergedLands = landsRecords.map(record => {
    const landId = record.id;
    const owner = record.get('Owner') as string;
    
    // Find matching polygon data
    const polygon = polygonMap[landId];
    
    if (polygon) {
      console.log(`Found matching polygon for land ${landId} owned by ${owner}`);
      return {
        id: landId,
        owner: owner,
        center: polygon.center || null,
        coordinates: polygon.coordinates || [],
        historicalName: polygon.historicalName || null,
        buildingPoints: (polygon.buildingPoints || []).length || 0
      };
    } else {
      console.warn(`No matching polygon found for land ${landId} owned by ${owner}`);
      return {
        id: landId,
        owner: owner,
        center: null,
        coordinates: [],
        historicalName: null,
        buildingPoints: 0
      };
    }
  });
  
  console.log(`Successfully merged ${mergedLands.length} land records with polygon data`);
  return mergedLands;
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
    console.log(`Saving relevancies for ${aiUsername} to Airtable...`);

    // Log the field names we're using to help debug
    console.log('Using the following field names for RELEVANCIES table:');
    console.log('RelevancyId, AssetID, AssetType, Category, Type, TargetCitizen, RelevantToCitizen, Score, TimeHorizon, Title, Description, Notes, Status, CreatedAt');

    // Log the field names we're using to help debug
    console.log('Using the following field names for RELEVANCIES table:');
    console.log('RelevancyId, AssetID, AssetType, Category, Type, TargetCitizen, RelevantToCitizen, Score, TimeHorizon, Title, Description, Notes, Status, CreatedAt');
    
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
            RelevancyId: `${aiUsername}_${id}_${Date.now()}`, // Generate a unique ID
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
            RelevancyId: `${aiUsername}_${id}_${Date.now()}`, // Generate a unique ID
            AssetID: id,
            AssetType: data.assetType,
            Category: data.category,
            Type: data.type,
            TargetCitizen: data.targetCitizen || id, // Use data.targetCitizen if provided (which will be "all")
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
    
    // Add more detailed logging
    console.log(`Preparing to create ${relevancyRecords.length} relevancy records for ${aiUsername}`);
    
    // Log the first record as an example (if available)
    if (relevancyRecords.length > 0) {
      console.log('Example relevancy record:');
      console.log(JSON.stringify(relevancyRecords[0], null, 2));
    }
    
    // Group relevancies by type
    const relevanciesByType: Record<string, any[]> = {};
    relevancyRecords.forEach(record => {
      const type = record.fields.Type;
      if (!relevanciesByType[type]) {
        relevanciesByType[type] = [];
      }
      relevanciesByType[type].push(record);
    });
    
    // For each type, sort by score and keep only the top 10
    const topRelevancies: any[] = [];
    Object.keys(relevanciesByType).forEach(type => {
      const sortedRelevancies = relevanciesByType[type].sort((a, b) => 
        b.fields.Score - a.fields.Score
      );
      
      // Take only the top 10 for each type
      const topForType = sortedRelevancies.slice(0, 10);
      topRelevancies.push(...topForType);
    });
    
    console.log(`Filtered to top 10 relevancies per type: ${topRelevancies.length} records from original ${relevancyRecords.length}`);
    
    // Replace relevancyRecords with the filtered topRelevancies for saving to Airtable
    const recordsToSave = topRelevancies;
      
    // Create records in batches of 10
    for (let i = 0; i < recordsToSave.length; i += 10) {
      const batch = recordsToSave.slice(i, i + 10);
      try {
        const createdRecords = await base(AIRTABLE_RELEVANCIES_TABLE).create(batch);
        console.log(`Successfully created batch of ${createdRecords.length} records`);
      } catch (error) {
        // Log the specific error and the first record that failed
        console.error(`Error creating batch ${i/10 + 1}:`, error);
        if (batch.length > 0) {
          console.error('First record in failed batch:', JSON.stringify(batch[0], null, 2));
        }
        throw error; // Re-throw to be caught by the outer try/catch
      }
    }
      
    console.log(`Created ${recordsToSave.length} new relevancy records for ${aiUsername}`);
    return recordsToSave.length;
  } catch (error) {
    console.warn('Could not save to RELEVANCIES table:', error.message);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('GET /api/calculateRelevancies request received');
    
    // Check if Airtable credentials are configured
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error('Airtable credentials not configured');
      return NextResponse.json(
        { error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }
    
    // Initialize Airtable
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username') || searchParams.get('ai'); // Support both parameters
    const calculateAll = searchParams.get('calculateAll') === 'true';
    const typeFilter = searchParams.get('type');
    
    console.log(`Request parameters: username=${username}, calculateAll=${calculateAll}, typeFilter=${typeFilter}`);
    
    // Fetch all lands from Airtable
    console.log('Fetching all lands from Airtable...');
    const landsRecords = await base(AIRTABLE_LANDS_TABLE).select().all();
    console.log(`Fetched ${landsRecords.length} land records from Airtable`);
    
    // Fetch polygon data from get-polygons API
    const polygons = await fetchPolygonData();
    
    // Merge land data with polygon data
    const allLands = await mergeLandDataWithPolygons(landsRecords, polygons);
    
    // Fetch land groups data
    const landGroups = await fetchLandGroups();
    
    // If calculateAll is true, calculate for all citizens who own lands
    if (calculateAll) {
      console.log('Calculating relevancies for all citizens who own lands');
      
      // Get all citizens who own lands
      const ownersWithLands = await getAllCitizensWithLands(base);
      
      if (ownersWithLands.length === 0) {
        console.log('No citizens with lands found');
        return NextResponse.json({
          success: true,
          message: 'No citizens with lands found'
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
      
      // Calculate and save relevancies for each citizen
      for (const owner of ownersWithLands) {
        console.log(`Calculating relevancies for citizen: ${owner}`);
        
        // Get lands owned by this citizen
        const ownerLands = allLands.filter(land => land.owner === owner);
        
        if (ownerLands.length === 0) {
          console.log(`No lands found for citizen: ${owner}, but will still calculate land domination relevancy`);
          
          // For citizens with no lands, we only calculate land domination relevancy
          try {
            // Save land domination relevancies to Airtable
            const relevanciesCreated = await saveRelevancies(base, owner, landDominationRelevancies, allLands, allCitizens);
            
            totalRelevanciesCreated += relevanciesCreated;
            
            // Store results
            results[owner] = {
              ownedLandCount: 0,
              relevanciesCreated
            };
          } catch (error) {
            console.warn(`Could not save to RELEVANCIES table for ${owner}:`, error.message);
            results[owner] = {
              ownedLandCount: 0,
              error: error.message
            };
          }
          
          continue;
        }
        
        // Calculate land proximity relevancy with connectivity data
        // Use batch processing for better performance with large datasets
        const proximityRelevancies = relevancyService.calculateRelevancyInBatches(
          ownerLands, 
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
          const relevanciesCreated = await saveRelevancies(base, owner, combinedRelevancies, allLands, allCitizens);
          
          totalRelevanciesCreated += relevanciesCreated;
          
          // Store results
          results[owner] = {
            ownedLandCount: ownerLands.length,
            relevanciesCreated
          };
        } catch (error) {
          console.warn(`Could not save to RELEVANCIES table for ${owner}:`, error.message);
          results[owner] = {
            ownedLandCount: ownerLands.length,
            error: error.message
          };
        }
      }
      
      console.log(`Completed calculating relevancies for all citizens. Total relevancies created: ${totalRelevanciesCreated}`);
      return NextResponse.json({
        success: true,
        citizenCount: Object.keys(results).length,
        totalRelevanciesCreated,
        results
      });
    }
    
    // If a username is specified, calculate relevancy only for that citizen
    if (username) {
      console.log(`Calculating relevancy for citizen: ${username}`);
      
      // Get lands owned by this citizen
      const citizenLands = allLands.filter(land => land.owner === username);
      
      // Fetch all citizens for land domination relevancy
      const allCitizens = await fetchAllCitizens(base);
      
      // Even if the citizen doesn't own lands, we should still calculate land domination relevancy
      if (citizenLands.length === 0) {
        console.log(`Citizen ${username} does not own any lands, but will still calculate land domination relevancy`);
        
        // Calculate land domination relevancy only
        const landDominationRelevancies = relevancyService.calculateLandDominationRelevancy(allCitizens, allLands);
        
        // Format the response to include both simple scores and detailed data
        const simpleScores: Record<string, number> = {};
        Object.entries(landDominationRelevancies).forEach(([id, data]) => {
          simpleScores[id] = data.score;
        });
        
        return NextResponse.json({
          success: true,
          username: username,
          ownedLandCount: 0,
          relevancyScores: simpleScores,
          detailedRelevancy: landDominationRelevancies
        });
      }
      
      // Calculate land proximity relevancy with connectivity data and type filter
      const relevancyScores = typeFilter 
        ? relevancyService.calculateRelevancyByType(citizenLands, allLands, landGroups, typeFilter)
        : relevancyService.calculateLandProximityRelevancy(citizenLands, allLands, landGroups);
      
      // Format the response to include both simple scores and detailed data
      const simpleScores: Record<string, number> = {};
      Object.entries(relevancyScores).forEach(([landId, data]) => {
        simpleScores[landId] = data.score;
      });
      
      return NextResponse.json({
        success: true,
        username: username,
        ownedLandCount: citizenLands.length,
        relevancyScores: simpleScores,
        detailedRelevancy: relevancyScores
      });
    }
    
    // If no username specified, calculate for all citizens
    console.log('Fetching citizens from Airtable...');
    const citizens = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        fields: ['Username']
      })
      .all();
    
    const results = {};
    
    // Calculate relevancy for each citizen
    for (const citizen of citizens) {
      const username = citizen.get('Username') as string;
      if (!username) continue;
      
      // Get lands owned by this citizen
      const citizenLands = allLands.filter(land => land.owner === username);
      
      // Skip citizens with no lands
      if (citizenLands.length === 0) continue;
      
      // Calculate land proximity relevancy with connectivity data
      const relevancyScores = relevancyService.calculateLandProximityRelevancy(citizenLands, allLands, landGroups);
      
      // Store results
      results[username] = {
        ownedLandCount: citizenLands.length,
        relevancyScores
      };
    }
    
    console.log(`Completed calculating relevancies for ${Object.keys(results).length} citizens`);
    return NextResponse.json({
      success: true,
      citizenCount: Object.keys(results).length,
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
    console.log('POST /api/calculateRelevancies request received');
    
    // Check if Airtable credentials are configured
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error('Airtable credentials not configured');
      return NextResponse.json(
        { error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }
    
    // Initialize Airtable
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    
    // Get the AI username and type filter from the request body
    const body = await request.json();
    const { aiUsername, typeFilter } = body;
    
    console.log(`POST request for AI: ${aiUsername}, typeFilter: ${typeFilter || 'none'}`);
    
    if (!aiUsername) {
      console.error('AI username is required');
      return NextResponse.json(
        { error: 'AI username is required' },
        { status: 400 }
      );
    }
    
    // Fetch all citizens for land domination relevancy
    const allCitizens = await fetchAllCitizens(base);
    
    // Calculate relevancy scores using the new method with optional type filter
    const relevancyScores = typeFilter 
      ? await relevancyService.calculateRelevancyByType(
          await relevancyService.fetchLands(aiUsername), 
          await relevancyService.fetchLands(), 
          await relevancyService.fetchLandGroups(),
          typeFilter
        )
      : await relevancyService.calculateRelevancyWithApiData(aiUsername);
    
    // Calculate land domination relevancy
    // For this, we need to fetch all lands first
    const allLands = await relevancyService.fetchLands();
    const landDominationRelevancies = relevancyService.calculateLandDominationRelevancy(allCitizens, allLands);
    
    // Combine both types of relevancies
    const combinedRelevancies = {
      ...relevancyScores,
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
      
      console.log(`Successfully saved relevancies for AI: ${aiUsername}`);
      return NextResponse.json({
        success: true,
        ai: aiUsername,
        ownedLandCount: (await relevancyService.fetchLands(aiUsername)).length,
        relevancyScores: simpleScores,
        detailedRelevancy: combinedRelevancies,
        saved: true
      });
    } catch (error) {
      console.error(`Failed to save relevancies for AI: ${aiUsername}`, error);
      return NextResponse.json({
        success: false,
        ai: aiUsername,
        ownedLandCount: (await relevancyService.fetchLands(aiUsername)).length,
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
