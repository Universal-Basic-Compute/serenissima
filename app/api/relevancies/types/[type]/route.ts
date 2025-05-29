import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_RELEVANCIES_TABLE = 'RELEVANCIES';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string | undefined>> }
) {
  try {
    const { type } = await params;
    
    if (!type) {
      return NextResponse.json({ error: 'Relevancy type is required' }, { status: 400 });
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
    const username = searchParams.get('username') || searchParams.get('ai'); // Support both parameters
    
    // Prepare filter formula
    let filterFormula = `{Type} = '${type}'`;
    
    // Add username filter if specified
    if (username) {
      filterFormula = `AND(${filterFormula}, {RelevantToCitizen} = '${username}')`;
    }
    
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
      asset: record.get('Asset'),
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
      type,
      relevancies,
      count: relevancies.length
    });
    
  } catch (error) {
    // Await params again or ensure type is in scope for error logging
    const awaitedParams = await params;
    const typeForError = awaitedParams.type;
    console.error(`Error fetching relevancies for type ${typeForError || 'unknown'}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch relevancies', details: error.message },
      { status: 500 }
    );
  }
}
