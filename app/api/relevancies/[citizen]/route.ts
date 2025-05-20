import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_RELEVANCIES_TABLE = 'RELEVANCIES';

export async function GET(
  request: NextRequest,
  context: { params: { aiUsername: string } }
) {
  const { params } = context;
  try {
    const username = params.aiUsername;
    
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }
    
    // Initialize Airtable
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }
    
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type');

    // Helper function to escape single quotes in strings for Airtable formulas
    const escapeAirtableString = (str: string) => str.replace(/'/g, "\\'");
    const safeUsername = escapeAirtableString(username);

    // Conditions for RelevantToCitizen:
    // 1. Exact match for the username
    // 2. Username found within a JSON array string
    // 3. Exact match for "all"
    // 4. "all" found within a JSON array string
    const relevantToConditions = [
      `{RelevantToCitizen} = '${safeUsername}'`,
      `FIND('"${safeUsername}"', {RelevantToCitizen}) > 0`,
      `{RelevantToCitizen} = 'all'`,
      `FIND('"all"', {RelevantToCitizen}) > 0`
    ];
    
    let filterFormula = `OR(${relevantToConditions.join(', ')})`;
    
    // Add type filter if specified
    if (typeFilter) {
      const safeTypeFilter = escapeAirtableString(typeFilter);
      filterFormula = `AND(${filterFormula}, {Type} = '${safeTypeFilter}')`;
    }
    
    console.log(`Fetching relevancies for ${username} with filter: ${filterFormula}`);
    
    // Fetch relevancies from Airtable
    const records = await base(AIRTABLE_RELEVANCIES_TABLE)
      .select({
        filterByFormula: filterFormula
      })
      .all();
    
    // Transform records to a more usable format
    const relevancies = records.map(record => ({
      id: record.id,
      relevancyId: record.get('RelevancyId'),
      assetId: record.get('AssetID'),
      assetType: record.get('AssetType'),
      category: record.get('Category'),
      type: record.get('Type'),
      targetCitizen: record.get('TargetCitizen'),
      relevantToCitizen: record.get('RelevantToCitizen'),
      score: record.get('Score'),
      timeHorizon: record.get('TimeHorizon'),
      title: record.get('Title'),
      description: record.get('Description'),
      notes: record.get('Notes'),
      status: record.get('Status'),
      createdAt: record.get('CreatedAt')
    }));
    
    return NextResponse.json({
      success: true,
      username,
      relevancies,
      count: relevancies.length
    });
    
  } catch (error) {
    console.error(`Error fetching relevancies for AI ${params.aiUsername}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch relevancies', details: error.message },
      { status: 500 }
    );
  }
}
