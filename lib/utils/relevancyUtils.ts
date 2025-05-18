import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_RELEVANCIES_TABLE = 'RELEVANCIES';

/**
 * Save relevancies to Airtable
 */
export async function saveRelevancies(
  aiUsername: string, 
  relevancyScores: Record<string, any>,
  allLands: any[],
  allCitizens: any[] = []
): Promise<number> {
  try {
    console.log(`Saving relevancies for ${aiUsername} to Airtable...`);

    // Initialize Airtable
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      throw new Error('Airtable credentials not configured');
    }
    
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

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
    }).filter(Boolean);
    
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
    
    // Create records in batches of 10
    for (let i = 0; i < topRelevancies.length; i += 10) {
      const batch = topRelevancies.slice(i, i + 10);
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
      
    console.log(`Created ${topRelevancies.length} new relevancy records for ${aiUsername}`);
    return topRelevancies.length;
  } catch (error) {
    console.warn('Could not save to RELEVANCIES table:', error.message);
    throw error;
  }
}
