import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_RELEVANCIES_TABLE = 'RELEVANCIES';

/**
 * Save relevancies to Airtable
 */
export async function saveRelevancies(
  Citizen: string, 
  relevancyScores: Record<string, any>,
  allLands: any[],
  allCitizens: any[] = []
): Promise<number> {
  try {
    console.log(`Saving relevancies for ${Citizen} to Airtable...`);

    // Initialize Airtable
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      throw new Error('Airtable credentials not configured');
    }
    
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

    // Removed deletion of existing relevancy records for the citizen.
    // New records will now be added, potentially leading to duplicates if calculations are re-run
    // without changes in the underlying data that would alter RelevancyId generation (which includes Date.now()).
    console.log(`Proceeding to create new relevancy records for ${Citizen} without deleting existing ones.`);
      
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
            TargetCitizen: data.targetCitizen || '', // Owner of the target land
            RelevantToCitizen: Citizen,
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
        // Find citizen details for notes
        const primaryTargetCitizenInfo = Array.isArray(data.targetCitizen) ? data.targetCitizen[0] : data.targetCitizen;
        const citizenForNotes = allCitizens.find(c => 
          (c.username === primaryTargetCitizenInfo) || (c.Username === id) // id is the key of relevancyScores
        );

        let targetCitizenIds: string[] = [];
        if (Array.isArray(data.targetCitizen)) {
          targetCitizenIds = data.targetCitizen.map((username: string) => {
            const c = allCitizens.find(ac => ac.username === username || ac.Username === username);
            return c ? c.id : null; // c.id is Airtable Record ID
          }).filter(Boolean) as string[];
        } else if (typeof data.targetCitizen === 'string') {
          const c = allCitizens.find(ac => ac.username === data.targetCitizen || ac.Username === data.targetCitizen);
          if (c) targetCitizenIds = [c.id];
        } else { // Fallback if data.targetCitizen is not set, use 'id' from relevancyScores key
          const c = allCitizens.find(ac => ac.username === id || ac.Username === id);
          if (c) targetCitizenIds = [c.id];
        }
        
        const relevantToCitizenRecord = allCitizens.find(c => c.username === Citizen || c.Username === Citizen);
        const relevantToCitizenIdArray = relevantToCitizenRecord ? [relevantToCitizenRecord.id] : [];

        return {
          fields: {
            RelevancyId: `${Citizen}_${id}_${Date.now()}`, // Generate a unique ID
            Asset: id, // This 'id' is often the username of the target citizen or an asset identifier
            AssetType: data.assetType,
            Category: data.category,
            Type: data.type,
            TargetCitizen: targetCitizenIds, // Array of Airtable Record IDs
            RelevantToCitizen: relevantToCitizenIdArray, // Array of Airtable Record IDs (for the single citizen)
            Score: data.score,
            TimeHorizon: data.timeHorizon || 'medium',
            Title: data.title || `Citizen Relevancy: ${id}`,
            Description: data.description || `Relevancy information about citizen ${id}`,
            Notes: citizenForNotes ? `${citizenForNotes.firstName || ''} ${citizenForNotes.lastName || ''}`.trim() : '',
            Status: data.status || 'active',
            CreatedAt: new Date().toISOString()
          }
        };
      } else if (data.assetType === 'city') {
        return {
          fields: {
            RelevancyId: `global_${id}_${Date.now()}`, // Generate a unique ID with 'global' prefix
            Asset: id,
            AssetType: data.assetType,
            Category: data.category,
            Type: data.type,
            TargetCitizen: data.targetCitizen || 'all', // Use 'all' for global relevancies
            RelevantToCitizen: Citizen, // For global relevancies saved TO a specific user (e.g. admin)
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
        // and building operator relevancy
        let relevancyIdBase = `${Citizen}_${data.asset}_${data.type}`;
        if (data.category === 'ownership_conflict' && data.closestLandId) {
          relevancyIdBase = `${Citizen}_${data.asset}_${data.closestLandId}_${data.type}`;
        }

        return {
          fields: {
            RelevancyId: `${relevancyIdBase}_${Date.now()}`,
            Asset: data.asset, // This is the building's ID
            AssetType: data.assetType, // 'building'
            Category: data.category, // 'ownership_conflict' or 'operator_relations'
            Type: data.type, // e.g. 'building_on_others_land', 'operator_in_your_building'
            TargetCitizen: data.targetCitizen, // The owner of the land
            RelevantToCitizen: Citizen, // The owner of the building
            Score: data.score,
            TimeHorizon: data.timeHorizon || 'medium',
            Title: data.title || `Building on Land of ${data.targetCitizen}`,
            Description: data.description || `Your building ${data.asset} is on land owned by ${data.targetCitizen}.`,
            Notes: `Building ID: ${data.asset}, Land ID: ${data.closestLandId}`, // Add land_id to notes
            Status: data.status || 'active',
            CreatedAt: new Date().toISOString()
          }
        };
      }
    }).filter(Boolean); // Ensure we only have valid records
    
    // Create records in batches of 10
    // The relevancyRecords array now contains all records to be saved, without top 10 filtering.
    console.log(`Preparing to save ${relevancyRecords.length} relevancy records for ${Citizen} (no top 10 filtering).`);

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
      
    console.log(`Created ${relevancyRecords.length} new relevancy records for ${Citizen}`);
    return relevancyRecords.length;
  } catch (error) {
    console.warn('Could not save to RELEVANCIES table:', error.message);
    throw error;
  }
}
