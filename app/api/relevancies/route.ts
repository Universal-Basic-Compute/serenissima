import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Helper to escape single quotes for Airtable formulas
function escapeAirtableValue(value: string): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  return value.replace(/'/g, "\\'");
}

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
    const filterFormulaParts: string[] = [];
    const loggableFilters: Record<string, string> = {};
    const reservedParams = ['limit', 'offset', 'sortfield', 'sortdirection', 'calculateall', 'relevanttocitizen', 'assettype', 'targetcitizen', 'excludeall'];

    // Helper function to escape single quotes in usernames for Airtable formulas
    // const escapeAirtableString = (str: string) => str.replace(/'/g, "\\'"); // Already defined as escapeAirtableValue

    if (targetCitizen) {
      const targetUsernames = targetCitizen.split(',')
        .map(username => username.trim())
        .filter(username => username.length > 0);
      if (targetUsernames.length > 0) {
        const targetOrConditions: string[] = targetUsernames.flatMap(username => {
          const safeUsername = escapeAirtableValue(username);
          return [
            `{TargetCitizen} = '${safeUsername}'`,
            `FIND('"${safeUsername}"', {TargetCitizen}) > 0`
          ];
        });
        filterFormulaParts.push(`OR(${targetOrConditions.join(', ')})`);
        loggableFilters['TargetCitizen'] = targetCitizen;
      }
    }

    if (relevantToCitizen) {
      const relevantToUsernames = relevantToCitizen.split(',')
        .map(username => username.trim())
        .filter(username => username.length > 0);
      if (relevantToUsernames.length > 0) {
        const relevantToOrConditions: string[] = relevantToUsernames.flatMap(username => {
          const safeUsername = escapeAirtableValue(username);
          return [
            `{RelevantToCitizen} = '${safeUsername}'`, 
            `FIND('"${safeUsername}"', {RelevantToCitizen}) > 0` 
          ];
        });
        filterFormulaParts.push(`OR(${relevantToOrConditions.join(', ')})`);
        loggableFilters['RelevantToCitizen'] = relevantToCitizen;
      }
    }

    if (assetType) {
      filterFormulaParts.push(`{AssetType} = '${escapeAirtableValue(assetType)}'`);
      loggableFilters['AssetType'] = assetType;
    }

    if (excludeAll) {
      filterFormulaParts.push(`NOT({RelevantToCitizen} = 'all')`);
      loggableFilters['excludeAll'] = 'true';
    }

    // Add dynamic filters from other query parameters
    for (const [key, value] of searchParams.entries()) {
      if (reservedParams.includes(key.toLowerCase())) {
        continue;
      }
      const airtableField = key; // Assuming query param key IS the Airtable field name
      loggableFilters[airtableField] = value;

      const numValue = parseFloat(value);
      if (!isNaN(numValue) && isFinite(numValue) && numValue.toString() === value) {
        filterFormulaParts.push(`{${airtableField}} = ${value}`);
      } else if (value.toLowerCase() === 'true') {
        filterFormulaParts.push(`{${airtableField}} = TRUE()`);
      } else if (value.toLowerCase() === 'false') {
        filterFormulaParts.push(`{${airtableField}} = FALSE()`);
      } else {
        filterFormulaParts.push(`{${airtableField}} = '${escapeAirtableValue(value)}'`);
      }
    }
    
    const filterByFormula = filterFormulaParts.length > 0 ? `AND(${filterFormulaParts.join(', ')})` : '';
    
    console.log('%c GET /api/relevancies request received', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    console.log('Query parameters (filters):', loggableFilters);
    if (filterByFormula) {
      console.log('Applying Airtable filter formula:', filterByFormula);
    }
    
    // Fetch relevancies from Airtable with the constructed filter
    const relevanciesRecords = await base(AIRTABLE_RELEVANCIES_TABLE)
      .select({
        filterByFormula: filterByFormula || '',
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
