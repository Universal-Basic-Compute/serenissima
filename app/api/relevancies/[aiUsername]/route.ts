import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_RELEVANCIES_TABLE = 'RELEVANCIES';

export async function GET(
  request: NextRequest,
  { params }: { params: { aiUsername: string } }
) {
  try {
    const aiUsername = params.aiUsername;
    
    if (!aiUsername) {
      return NextResponse.json({ error: 'AI username is required' }, { status: 400 });
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
    
    // Prepare filter formula
    let filterFormula = `{RelevantToCitizen} = '${aiUsername}'`;
    
    // Add type filter if specified
    if (typeFilter) {
      filterFormula = `AND(${filterFormula}, {Type} = '${typeFilter}')`;
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
      aiUsername,
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
