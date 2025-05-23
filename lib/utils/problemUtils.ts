import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_PROBLEMS_TABLE = 'PROBLEMS';

/**
 * Save problems to Airtable
 */
export async function saveProblems(
  citizen: string,
  problems: Record<string, any>,
  problemTitleToClear: string // New parameter, e.g., "No Buildings on Land", "Homeless Citizen"
): Promise<number> {
  try {
    console.log(`Saving problems titled "${problemTitleToClear}" for ${citizen} to Airtable...`);

    // Initialize Airtable
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      throw new Error('Airtable credentials not configured');
    }
    
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

    // Delete existing problems for this citizen with the specific title and active status
    const existingRecords = await base(AIRTABLE_PROBLEMS_TABLE)
      .select({
        filterByFormula: `AND({Citizen} = '${citizen}', {Title} = '${problemTitleToClear}', {Status} = 'active')`
      })
      .all();

    if (existingRecords.length > 0) {
      // Delete in batches of 10 to avoid API limits
      const recordIds = existingRecords.map(record => record.id);
      for (let i = 0; i < recordIds.length; i += 10) {
        const batch = recordIds.slice(i, i + 10);
        await base(AIRTABLE_PROBLEMS_TABLE).destroy(batch);
      }
      console.log(`Deleted ${existingRecords.length} existing problem records titled "${problemTitleToClear}" for ${citizen}`);
    }

    // Create new problem records
    const problemRecords = Object.values(problems).map(problem => ({
      fields: {
        ProblemId: problem.problemId,
        Citizen: problem.citizen,
        AssetType: problem.assetType,
        Asset: problem.asset,
        Severity: problem.severity,
        Status: problem.status,
        CreatedAt: problem.createdAt,
        // UpdatedAt is computed
        Location: problem.location,
        Title: problem.title,
        Description: problem.description,
        Solutions: problem.solutions,
        Notes: problem.notes || '',
        Type: problem.type, // Add the Type field
        // Ensure position is stringified if it's an object, otherwise use it as is or default to empty string
        Position: typeof problem.position === 'object' && problem.position !== null 
                  ? JSON.stringify(problem.position) 
                  : (problem.position || '')
      }
    }));
    
    // Skip if no problems to save
    if (problemRecords.length === 0) {
      console.log(`No problems to save for ${citizen}`);
      return 0;
    }
    
    // Create records in batches of 10
    for (let i = 0; i < problemRecords.length; i += 10) {
      const batch = problemRecords.slice(i, i + 10);
      try {
        const createdRecords = await base(AIRTABLE_PROBLEMS_TABLE).create(batch);
        console.log(`Successfully created batch of ${createdRecords.length} problem records`);
      } catch (error) {
        // Log the specific error and the first record that failed
        console.error(`Error creating batch ${i/10 + 1}:`, error);
        if (batch.length > 0) {
          console.error('First record in failed batch:', JSON.stringify(batch[0], null, 2));
        }
        throw error; // Re-throw to be caught by the outer try/catch
      }
    }
      
    console.log(`Created ${problemRecords.length} new problem records for ${citizen}`);
    return problemRecords.length;
  } catch (error) {
    console.warn('Could not save to PROBLEMS table:', error.message);
    throw error;
  }
}
