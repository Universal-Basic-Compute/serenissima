import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import { relevancyService } from '@/lib/services/RelevancyService';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_LANDS_TABLE = process.env.AIRTABLE_LANDS_TABLE || 'LANDS';
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';
const AIRTABLE_BUILDINGS_TABLE = process.env.AIRTABLE_BUILDINGS_TABLE || 'BUILDINGS'; // Added for homelessness check
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
        fields: ['Username', 'FirstName', 'LastName', 'IsAI', 'SocialClass'] // Added SocialClass
      })
      .all();
    
    return records.map(record => ({
      id: record.id, // This is the Airtable Record ID
      username: record.get('Username'),
      firstName: record.get('FirstName'),
      lastName: record.get('LastName'),
      isAI: record.get('IsAI') || false,
      socialClass: record.get('SocialClass') || 'Unknown' // Added SocialClass
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
  Citizen: string, 
  relevancyScores: Record<string, any>,
  allLands: any[],
  allCitizens: any[] = [],
  homelessnessDetails?: Record<string, { total: number; homeless: number }> // Nouveau paramètre
): Promise<number> {
  try {
    console.log(`Saving relevancies for ${Citizen} to Airtable...`);

    let homelessnessNotes = "";
    if (homelessnessDetails && Object.keys(homelessnessDetails).length > 0) {
      homelessnessNotes = " Homelessness Report: ";
      const reportParts: string[] = [];
      for (const [socialClass, stats] of Object.entries(homelessnessDetails)) {
        reportParts.push(`${socialClass} (${stats.homeless}/${stats.total} homeless)`);
      }
      homelessnessNotes += reportParts.join(', ') + ".";
    }

    // Log the field names we're using to help debug
    console.log('Using the following field names for RELEVANCIES table:');
    console.log('RelevancyId, Asset, AssetType, Category, Type, TargetCitizen, RelevantToCitizen, Score, TimeHorizon, Title, Description, Notes, Status, CreatedAt');

    // Log the field names we're using to help debug
    console.log('Using the following field names for RELEVANCIES table:');
    console.log('RelevancyId, Asset, AssetType, Category, Type, TargetCitizen, RelevantToCitizen, Score, TimeHorizon, Title, Description, Notes, Status, CreatedAt');
    
    // Delete existing relevancy records for this citizen to avoid duplicates
    const existingRecords = await base(AIRTABLE_RELEVANCIES_TABLE)
      .select({
        filterByFormula: `{RelevantToCitizen} = '${Citizen}'`
      })
      .all();
      
    if (existingRecords.length > 0) {
      // Delete in batches of 10 to avoid API limits
      const recordIds = existingRecords.map(record => record.id);
      for (let i = 0; i < recordIds.length; i += 10) {
        const batch = recordIds.slice(i, i + 10);
        await base(AIRTABLE_RELEVANCIES_TABLE).destroy(batch);
      }
      console.log(`Deleted ${existingRecords.length} existing relevancy records for ${Citizen}`);
    }
      
    // Create new relevancy records
    const relevancyRecords = Object.entries(relevancyScores).map(([id, data]) => {
      // Handle different types of relevancies
      if (data.assetType === 'land') {
        return {
          fields: {
            RelevancyId: `${Citizen}_${data.asset}_${Date.now()}`, // Use data.asset (polygonId or recId) for RelevancyId uniqueness
            Asset: data.asset, // Use the asset value from the RelevancyScore object (land.landId || land.id)
            AssetType: data.assetType,
            Category: data.category,
            Type: data.type,
            TargetCitizen: data.closestLandId ? allLands.find(land => land.id === data.closestLandId)?.owner || '' : '',
            RelevantToCitizen: Citizen,
            Score: data.score,
            TimeHorizon: data.timeHorizon || 'medium',
            Title: data.title || `Nearby Land (${data.distance}m)`,
            Description: data.description || `This land is ${data.distance} meters from your nearest property`,
            Notes: (data.isConnected ? 'Connected by bridges to your existing properties.' : '') + homelessnessNotes,
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
            RelevancyId: `${Citizen}_${id}_${Date.now()}`, // Generate a unique ID
            Asset: id,
            AssetType: data.assetType,
            Category: data.category,
            Type: data.type,
            TargetCitizen: data.targetCitizen || id, // Use data.targetCitizen if provided (which will be "all")
            RelevantToCitizen: Citizen,
            Score: data.score,
            TimeHorizon: data.timeHorizon || 'medium',
            Title: data.title || `Citizen Relevancy: ${id}`,
            Description: data.description || `Relevancy information about citizen ${id}`,
            Notes: (citizen ? `${citizen.firstName || ''} ${citizen.lastName || ''}`.trim() : '') + homelessnessNotes,
            Status: data.status || 'active',
            CreatedAt: new Date().toISOString()
          }
        };
      }
    });
    
    // Add more detailed logging
    console.log(`Preparing to create ${relevancyRecords.length} relevancy records for ${Citizen}`);
    
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
      
    console.log(`Created ${recordsToSave.length} new relevancy records for ${Citizen}`);
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
    const allLands = await mergeLandDataWithPolygons(landsRecords as any[], polygons);
    
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
      
      // Calculate homelessness details
      const homelessnessBySocialClass: Record<string, { total: number; homeless: number }> = {};
      const buildingsTable = base(AIRTABLE_BUILDINGS_TABLE);

      // Filter out Forestieri before calculating homelessness
      const citizensForHomelessnessCalculation = allCitizens.filter(
        citizen => (citizen.socialClass || 'Unknown').toLowerCase() !== 'forestieri'
      );

      for (const citizen of citizensForHomelessnessCalculation) {
        const socialClass = citizen.socialClass || 'Unknown';
        if (!homelessnessBySocialClass[socialClass]) {
          homelessnessBySocialClass[socialClass] = { total: 0, homeless: 0 };
        }
        homelessnessBySocialClass[socialClass].total++;

        // Check if citizen owns a home
        // Assuming 'Owner' in BUILDINGS is a linked record to CITIZENS (can be multiple)
        // and we match by the citizen's Airtable Record ID.
        const homeFormula = `AND({Category}='home', FIND('${citizen.id}', ARRAYJOIN(Owner)))`;
        const homeRecords = await buildingsTable.select({
          filterByFormula: homeFormula,
          maxRecords: 1,
          fields: [] // We only need to know if a record exists
        }).firstPage();

        if (homeRecords.length === 0) {
          homelessnessBySocialClass[socialClass].homeless++;
        }
      }
      console.log('Homelessness details by social class:', homelessnessBySocialClass);
      
      // Calculate and save relevancies for each citizen
      for (const owner of ownersWithLands) {
        console.log(`Calculating relevancies for citizen: ${owner}`);
        
        // Get lands owned by this citizen
        const ownerLands = allLands.filter(land => land.owner === owner);
        
        if (ownerLands.length === 0) {
          console.log(`No lands found for citizen: ${owner}, but will still calculate land domination relevancy`);
          
          // For citizens with no lands, we only calculate land domination relevancy
          try {
            // Save land domination relevancies to Airtable, including homelessness details
            const relevanciesCreated = await saveRelevancies(base, owner, landDominationRelevancies, allLands, allCitizens, homelessnessBySocialClass);
            
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
        const combinedRelevanciesRaw = {
          ...proximityRelevancies,
          ...landDominationRelevancies
        };

        // Filter proximity relevancies: only persist if score > 50
        const relevanciesToSave: Record<string, any> = {};
        Object.entries(combinedRelevanciesRaw).forEach(([key, data]) => {
            if (data.category === 'proximity') {
                if (data.score > 50) {
                    relevanciesToSave[key] = data;
                }
            } else { // Keep other categories like 'domination' regardless of score
                relevanciesToSave[key] = data;
            }
        });
        
        try {
          // Save filtered relevancies to Airtable, including homelessness details
          const relevanciesCreated = await saveRelevancies(base, owner, relevanciesToSave, allLands, allCitizens, homelessnessBySocialClass);
          
          totalRelevanciesCreated += relevanciesCreated;
          
          // Store results
          results[owner] = {
            ownedLandCount: ownerLands.length,
            relevanciesCreated // This count is from saveRelevancies, reflecting what was actually saved after its internal filtering
          };
        } catch (error) {
          console.warn(`Could not save to RELEVANCIES table for ${owner}:`, error.message);
          results[owner] = {
            ownedLandCount: ownerLands.length,
            error: error.message
          };
        }
      }
      
      console.log(`Completed calculating relevancies for all citizens. Total relevancies created (after filtering and saving): ${totalRelevanciesCreated}`);
      return NextResponse.json({
        success: true,
        citizenCount: Object.keys(results).length,
        totalRelevanciesCreated,
        homelessnessBySocialClass, // Added homelessness details
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
    
    // Get the citizen username and type filter from the request body
    const body = await request.json();
    const { Citizen, typeFilter } = body;
    
    console.log(`POST request for citizen: ${Citizen}, typeFilter: ${typeFilter || 'none'}`);
    
    if (!Citizen) {
      console.error('Citizen username is required');
      return NextResponse.json(
        { error: 'Citizen username is required' },
        { status: 400 }
      );
    }
    
    // Fetch all citizens for land domination relevancy
    const allCitizens = await fetchAllCitizens(base);
    
    // Calculate relevancy scores using the new method with optional type filter
    const relevancyScores = typeFilter 
      ? await relevancyService.calculateRelevancyByType(
          await relevancyService.fetchLands(Citizen), 
          await relevancyService.fetchLands(), 
          await relevancyService.fetchLandGroups(),
          typeFilter
        )
      : await relevancyService.calculateRelevancyWithApiData(Citizen);
    
    // Calculate land domination relevancy
    // For this, we need to fetch all lands first
    const allLands = await relevancyService.fetchLands();
    const landDominationRelevancies = relevancyService.calculateLandDominationRelevancy(allCitizens, allLands);
    
    // Combine both types of relevancies
    const combinedRelevanciesRaw = {
      ...relevancyScores, // These are proximity from calculateRelevancyWithApiData or calculateRelevancyByType
      ...landDominationRelevancies
    };

    // Filter proximity relevancies: only persist if score > 50
    const relevanciesToSaveAndRespondWith: Record<string, any> = {};
    Object.entries(combinedRelevanciesRaw).forEach(([key, data]) => {
        if (data.category === 'proximity') {
            if (data.score > 50) {
                relevanciesToSaveAndRespondWith[key] = data;
            }
        } else { // Keep other categories
            relevanciesToSaveAndRespondWith[key] = data;
        }
    });
    
    // Format the response to include both simple scores and detailed data based on filtered relevancies
    const simpleScores: Record<string, number> = {};
    Object.entries(relevanciesToSaveAndRespondWith).forEach(([id, data]) => {
      simpleScores[id] = data.score;
    });
    
    let relevanciesSavedCount = 0;
    try {
      // Save filtered relevancies to Airtable
      // Note: homelessnessDetails are not calculated/available in this POST path for a single citizen.
      if (Object.keys(relevanciesToSaveAndRespondWith).length > 0) {
        relevanciesSavedCount = await saveRelevancies(base, Citizen, relevanciesToSaveAndRespondWith, allLands, allCitizens, undefined);
      } else {
        console.log(`No relevancies to save for citizen ${Citizen} after filtering.`);
      }
      
      console.log(`Successfully processed and saved ${relevanciesSavedCount} relevancies for citizen: ${Citizen}`);
      return NextResponse.json({
        success: true,
        citizen: Citizen,
        ownedLandCount: (await relevancyService.fetchLands(Citizen)).length,
        relevancyScores: simpleScores,
        detailedRelevancy: relevanciesToSaveAndRespondWith,
        saved: true,
        relevanciesSavedCount
      });
    } catch (error) {
      console.error(`Failed to save relevancies for citizen: ${Citizen}`, error);
      return NextResponse.json({
        success: false,
        citizen: Citizen,
        ownedLandCount: (await relevancyService.fetchLands(Citizen)).length,
        relevancyScores: simpleScores, // Still return the scores that were attempted to be saved
        detailedRelevancy: relevanciesToSaveAndRespondWith,
        saved: false,
        error: error.message,
        relevanciesSavedCount: 0
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
