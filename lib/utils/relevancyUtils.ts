import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_RELEVANCIES_TABLE = 'RELEVANCIES';

/**
 * Save relevancies to Airtable
 */
export async function saveRelevancies(
  citizenUsername: string, 
  relevancyScores: Record<string, any>,
  allLands: any[],
  allCitizens: any[] = []
): Promise<number> {
  try {
    console.log(`Saving relevancies for ${citizenUsername} to Airtable...`);

    // Initialize Airtable
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      throw new Error('Airtable credentials not configured');
    }
    
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

    // Delete existing relevancy records for this citizen to avoid duplicates
    const existingRecords = await base(AIRTABLE_RELEVANCIES_TABLE)
      .select({
        filterByFormula: `{RelevantToCitizen} = '${citizenUsername}'`
      })
      .all();
      
    if (existingRecords.length > 0) {
      // Delete in batches of 10 to avoid API limits
      const recordIds = existingRecords.map(record => record.id);
      for (let i = 0; i < recordIds.length; i += 10) {
        const batch = recordIds.slice(i, i + 10);
        await base(AIRTABLE_RELEVANCIES_TABLE).destroy(batch);
      }
      console.log(`Deleted ${existingRecords.length} existing relevancy records for ${citizenUsername}`);
    }
      
    // Create new relevancy records
    const relevancyRecords = Object.entries(relevancyScores).map(([id, data]) => {
      // Handle different types of relevancies
      if (data.assetType === 'land') {
        return {
          fields: {
            RelevancyId: `${citizenUsername}_${id}_${Date.now()}`, // Generate a unique ID
            AssetID: id,
            AssetType: data.assetType,
            Category: data.category,
            Type: data.type,
            TargetCitizen: data.targetCitizen || '', // Owner of the target land
            RelevantToCitizen: citizenUsername,
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
            RelevancyId: `${citizenUsername}_${id}_${Date.now()}`, // Generate a unique ID
            AssetID: id,
            AssetType: data.assetType,
            Category: data.category,
            Type: data.type,
            TargetCitizen: id, // The citizen this relevancy is about
            RelevantToCitizen: citizenUsername,
            Score: data.score,
            TimeHorizon: data.timeHorizon || 'medium',
            Title: data.title || `Citizen Relevancy: ${id}`,
            Description: data.description || `Relevancy information about citizen ${id}`,
            Notes: citizen ? `${citizen.firstName || ''} ${citizen.lastName || ''}`.trim() : '',
            Status: data.status || 'active',
            CreatedAt: new Date().toISOString()
          }
        };
      } else if (data.assetType === 'city') {
        return {
          fields: {
            RelevancyId: `global_${id}_${Date.now()}`, // Generate a unique ID with 'global' prefix
            AssetID: id,
            AssetType: data.assetType,
            Category: data.category,
            Type: data.type,
            TargetCitizen: data.targetCitizen || 'all', // Use 'all' for global relevancies
            RelevantToCitizen: citizenUsername, // For global relevancies saved TO a specific user (e.g. admin)
            Score: data.score,
            TimeHorizon: data.timeHorizon || 'medium',
            Title: data.title || `City Relevancy: ${id}`,
            Description: data.description || `Relevancy information about the city`,
            Notes: data.notes || '',
            Status: data.status || 'active',
            CreatedAt: new Date().toISOString()
          }
        };
      } else if (data.assetType === 'building') {
        // Handle building ownership relevancy (building on others' land)
        return {
          fields: {
            RelevancyId: `${citizenUsername}_${data.assetId}_${data.closestLandId}_${Date.now()}`, // Unique ID: buildingOwner_buildingId_landId_timestamp
            AssetID: data.assetId, // This is the building's ID
            AssetType: data.assetType, // 'building'
            Category: data.category, // 'ownership'
            Type: data.type, // 'building_on_others_land'
            TargetCitizen: data.targetCitizen, // The owner of the land
            RelevantToCitizen: citizenUsername, // The owner of the building
            Score: data.score,
            TimeHorizon: data.timeHorizon || 'medium',
            Title: data.title || `Building on Land of ${data.targetCitizen}`,
            Description: data.description || `Your building ${data.assetId} is on land owned by ${data.targetCitizen}.`,
            Notes: `Building ID: ${data.assetId}, Land ID: ${data.closestLandId}`, // Add land_id to notes
            Status: data.status || 'active',
            CreatedAt: new Date().toISOString()
          }
        };
      }
    }).filter(Boolean); // Ensure we only have valid records
    
    // Create records in batches of 10
    // The relevancyRecords array now contains all records to be saved, without top 10 filtering.
    console.log(`Preparing to save ${relevancyRecords.length} relevancy records for ${citizenUsername} (no top 10 filtering).`);

    for (let i = 0; i < relevancyRecords.length; i += 10) {
      const batch = relevancyRecords.slice(i, i + 10);
      try {
        const createdRecords = await base(AIRTABLE_RELEVANCIES_TABLE).create(batch);
        console.log(`Successfully created batch of ${createdRecords.length} records`);
      } catch (error) {
        // Log the specific error and the first record that failed
        console.error(`Error creating batch ${Math.floor(i/10) + 1}:`, error);
        if (batch.length > 0) {
          console.error('First record in failed batch:', JSON.stringify(batch[0], null, 2));
        }
        throw error; // Re-throw to be caught by the outer try/catch
      }
    }
      
    console.log(`Created ${relevancyRecords.length} new relevancy records for ${citizenUsername}`);
    return relevancyRecords.length;
  } catch (error) {
    console.warn('Could not save to RELEVANCIES table:', error.message);
    throw error;
  }
}
