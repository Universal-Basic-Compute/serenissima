import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_PROBLEMS_TABLE = 'PROBLEMS';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string | undefined>> }
) {
  try {
    const { problemId } = await params; // problemId will be of type string | undefined
    
    if (!problemId) {
      return NextResponse.json(
        { success: false, error: 'Problem ID is required' },
        { status: 400 }
      );
    }
    
    // Initialize Airtable
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { success: false, error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }

    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    
    // Fetch the problem from Airtable
    const records = await base(AIRTABLE_PROBLEMS_TABLE)
      .select({
        filterByFormula: `{ProblemId} = '${problemId}'`
      })
      .firstPage();
    
    if (!records || records.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Problem not found' },
        { status: 404 }
      );
    }
    
    const record = records[0];
    
    // Parse position if it's a string
    let position = record.get('Position');
    if (typeof position === 'string') {
      try {
        position = JSON.parse(position);
      } catch (error) {
        console.error('Error parsing position:', error);
        position = null;
      }
    }
    
    // Transform the record to a more usable format
    const problem = {
      id: record.id,
      problemId: record.get('ProblemId') || '',
      citizen: record.get('Citizen') || '',
      assetType: record.get('AssetType') || '',
      asset: record.get('Asset') || '',
      severity: record.get('Severity') || 'medium',
      status: record.get('Status') || 'active',
      position: position,
      location: record.get('Location') || '',
      type: record.get('Type') || '',
      title: record.get('Title') || '',
      description: record.get('Description') || '',
      solutions: record.get('Solutions') || '',
      createdAt: record.get('CreatedAt') || '',
      updatedAt: record.get('UpdatedAt') || '',
      notes: record.get('Notes') || ''
    };
    
    // Return the problem data
    return NextResponse.json({
      success: true,
      problem
    });
    
  } catch (error) {
    console.error('Error in problem details endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch problem details', details: error.message },
      { status: 500 }
    );
  }
}
