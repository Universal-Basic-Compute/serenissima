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
    
    if (calculateAll) {
      // Redirect to the calculateAll endpoint
      return NextResponse.redirect(new URL('/api/calculateRelevancies?calculateAll=true', request.url));
    }
    
    // Prepare filter formula based on parameters
    let filterFormula = '';
    
    // Handle the case where we want relevancies for a specific target citizen
    if (targetCitizen && relevantToCitizen) {
      // Parse the relevantToCitizen parameter which might be a comma-separated list
      const relevantToCitizens = relevantToCitizen.split(',');
      
      // Create an OR condition for each relevantToCitizen value
      const relevantToConditions = relevantToCitizens.map(citizen => 
        `{RelevantToCitizen} = '${citizen}'`
      );
      
      // Add condition for 'all' which should be visible to everyone
      relevantToConditions.push(`{RelevantToCitizen} = 'all'`);
      
      // Combine with AND for targetCitizen
      filterFormula = `AND({TargetCitizen} = '${targetCitizen}', OR(${relevantToConditions.join(', ')}))`;
    }
    // Handle the case where we want all relevancies for a specific citizen
    else if (relevantToCitizen && assetType) {
      filterFormula = `AND({RelevantToCitizen} = '${relevantToCitizen}', {AssetType} = '${assetType}')`;
    }
    // If no specific filters, return a limited set
    else if (relevantToCitizen) {
      filterFormula = `{RelevantToCitizen} = '${relevantToCitizen}'`;
    }
    
    console.log(`Fetching relevancies with filter: ${filterFormula}`);
    
    // Fetch relevancies from Airtable with the constructed filter
    const relevanciesRecords = await base(AIRTABLE_RELEVANCIES_TABLE)
      .select({
        filterByFormula: filterFormula || '',
        maxRecords: 100
      })
      .all();
    
    console.log(`Fetched ${relevanciesRecords.length} relevancy records from Airtable`);
    
    // Transform records to a more usable format
    const relevancies = relevanciesRecords.map(record => {
      return {
        relevancyId: record.id,
        assetId: record.get('AssetId') || '',
        assetType: record.get('AssetType') || '',
        category: record.get('Category') || '',
        type: record.get('Type') || '',
        targetCitizen: record.get('TargetCitizen') || '',
        relevantToCitizen: record.get('RelevantToCitizen') || '',
        score: record.get('Score') || 0,
        timeHorizon: record.get('TimeHorizon') || 'medium-term',
        title: record.get('Title') || '',
        description: record.get('Description') || '',
        notes: record.get('Notes') || '',
        createdAt: record.get('CreatedAt') || new Date().toISOString(),
        status: record.get('Status') || 'active'
      };
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
