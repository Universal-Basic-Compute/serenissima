import { NextResponse } from 'next/server';
import Airtable from 'airtable';

export async function GET(request: Request) {
  try {
    // Get Airtable credentials from environment variables
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_RELEVANCIES_TABLE = process.env.AIRTABLE_RELEVANCIES_TABLE || 'RELEVANCIES';

    // Check if Airtable credentials are configured
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error('Airtable credentials not configured');
      return NextResponse.json(
        { success: false, error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }

    // Initialize Airtable
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const calculateAll = searchParams.get('calculateAll') === 'true';
    const relevantToCitizen = searchParams.get('relevantToCitizen');
    const assetType = searchParams.get('assetType');
    const targetCitizen = searchParams.get('targetCitizen');
    const excludeAll = searchParams.get('excludeAll') === 'true'; // Added excludeAll parameter
    
    if (calculateAll) {
      // Redirect to the calculateAll endpoint
      return NextResponse.redirect(new URL('/api/calculateRelevancies?calculateAll=true', request.url));
    }
    
    // Prepare filter formula based on parameters
    let filterFormula = '';
    const filterFormulaParts: string[] = [];

    // Helper function to escape single quotes in usernames for Airtable formulas
    const escapeAirtableString = (str: string) => str.replace(/'/g, "\\'");

    if (targetCitizen) {
      const targetUsernames = targetCitizen.split(',')
        .map(username => username.trim())
        .filter(username => username.length > 0);

      if (targetUsernames.length > 0) {
        const targetOrConditions: string[] = targetUsernames.flatMap(username => {
          const safeUsername = escapeAirtableString(username);
          // For each username, check for exact match OR if found within a JSON string array
          return [
            `{TargetCitizen} = '${safeUsername}'`,
            `FIND('"${safeUsername}"', {TargetCitizen}) > 0`
          ];
        });
        filterFormulaParts.push(`OR(${targetOrConditions.join(', ')})`);
      }
    }

    if (relevantToCitizen) {
      const relevantToUsernames = relevantToCitizen.split(',')
        .map(username => username.trim())
        .filter(username => username.length > 0); // Filter out empty strings after trimming

      if (relevantToUsernames.length > 0) {
        const relevantToOrConditions: string[] = relevantToUsernames.flatMap(username => {
          const safeUsername = escapeAirtableString(username);
          return [
            `{RelevantToCitizen} = '${safeUsername}'`, 
            `FIND('"${safeUsername}"', {RelevantToCitizen}) > 0` 
          ];
        });
        // Do NOT add '{RelevantToCitizen} = 'all'' here if specific citizens are requested
        filterFormulaParts.push(`OR(${relevantToOrConditions.join(', ')})`);
      }
      // If relevantToUsernames is empty (e.g., relevantToCitizen=" , "), no OR condition for RelevantToCitizen is added.
    }

    if (assetType) {
      // Only add assetType filter if there are other citizen-based filters,
      // or adjust if assetType can be a standalone filter.
      // Current logic implies assetType is an additional filter to citizen filters.
      if (relevantToCitizen || targetCitizen) { // Add assetType if we have citizen filters
        filterFormulaParts.push(`{AssetType} = '${escapeAirtableString(assetType)}'`);
      } else {
        // If only assetType is provided, you might want a different logic or ensure this case is handled.
        // For now, sticking to original behavior where assetType is usually combined.
        // If you want to filter by assetType alone:
        // filterFormulaParts.push(`{AssetType} = '${escapeAirtableString(assetType)}'`);
      }
    }

    if (excludeAll) {
      filterFormulaParts.push(`NOT({RelevantToCitizen} = 'all')`);
    }
    
    if (filterFormulaParts.length > 0) {
      if (filterFormulaParts.length === 1) {
        filterFormula = filterFormulaParts[0]; // Avoid AND() for a single condition
      } else {
        filterFormula = `AND(${filterFormulaParts.join(', ')})`;
      }
    } else {
      // No specific filters provided by URL parameters, fetch all (will be limited by maxRecords)
      // Or, if you prefer to return nothing if no relevantToCitizen is specified:
      // filterFormula = "FALSE()"; // This would return no records
      // Keeping original behavior: empty filter means fetch recent (sorted, limited)
      filterFormula = ''; 
    }
    
    console.log(`Fetching relevancies with filter: ${filterFormula}`);
    
    // Fetch relevancies from Airtable with the constructed filter
    const relevanciesRecords = await base(AIRTABLE_RELEVANCIES_TABLE)
      .select({
        filterByFormula: filterFormula || '',
        maxRecords: 100,
        sort: [{ field: 'CreatedAt', direction: 'desc' }]  // Sort by CreatedAt in descending order
      })
      .all();
    
    console.log(`Fetched ${relevanciesRecords.length} relevancy records from Airtable`);
    
    // Transform records to a more usable format
    const relevancies = relevanciesRecords.map(record => {
      return {
        relevancyId: record.id,
        asset: record.get('Asset') || '',
        assetType: record.get('AssetType') || '',
        category: record.get('Category') || '',
        type: record.get('Type') || '',
        targetCitizen: record.get('TargetCitizen') || '',
        relevantToCitizen: record.get('RelevantToCitizen') || '',
        score: record.get('Score') || 0,
        timeHorizon: record.get('TimeHorizon') || 'medium-term',
        title: record.get('Title') || '',
        description: record.get('Description') || '',  // Preserves markdown formatting
        notes: record.get('Notes') || '',  // Preserves markdown formatting
        createdAt: record.get('CreatedAt') || new Date().toISOString(),
        status: record.get('Status') || 'active'
      };
    });
    
    // Sort the relevancies by score in descending order before returning
    relevancies.sort((a, b) => {
      // Convert scores to numbers to ensure proper comparison
      const scoreA = typeof a.score === 'number' ? a.score : parseFloat(String(a.score));
      const scoreB = typeof b.score === 'number' ? b.score : parseFloat(String(b.score));
      
      // Sort in descending order (highest scores first)
      return scoreB - scoreA;
    });
    
    // Return the relevancies data
    return NextResponse.json({
      success: true,
      relevancies
    });
    
  } catch (error) {
    console.error('Error in relevancies endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process relevancies request', details: error.message },
      { status: 500 }
    );
  }
}
