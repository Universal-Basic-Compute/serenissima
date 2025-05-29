import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_PROBLEMS_TABLE = 'PROBLEMS';

export async function GET(request: NextRequest) {
  try {
    // Initialize Airtable
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { success: false, error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }

    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const citizen = searchParams.get('citizen');
    const assetType = searchParams.get('assetType');
    const status = searchParams.get('status') || 'active';
    
    // Prepare filter formula based on parameters
    let filterFormula = '';
    
    if (citizen && assetType) {
      filterFormula = `AND({Citizen} = '${citizen}', {AssetType} = '${assetType}', {Status} = '${status}')`;
    } else if (citizen) {
      filterFormula = `AND({Citizen} = '${citizen}', {Status} = '${status}')`;
    } else if (assetType) {
      filterFormula = `AND({AssetType} = '${assetType}', {Status} = '${status}')`;
    } else {
      filterFormula = `{Status} = '${status}'`;
    }
    
    console.log(`Fetching problems with filter: ${filterFormula}`);
    
    // Fetch problems from Airtable with the constructed filter
    const problemsRecords = await base(AIRTABLE_PROBLEMS_TABLE)
      .select({
        filterByFormula: filterFormula,
        sort: [
          { field: 'CreatedAt', direction: 'desc' },
          { field: 'Severity', direction: 'desc' },
        ]
      })
      .all();
    
    console.log(`Fetched ${problemsRecords.length} problem records from Airtable`);
    
    // Transform records to a more usable format
    const problems = problemsRecords.map(record => {
      let position = record.get('Position');
      if (typeof position === 'string') {
        try {
          position = JSON.parse(position);
        } catch (error) {
          console.error('Error parsing position for problem:', record.id, error);
          // Keep original string or set to null if parsing fails
          // position = null; // Or keep as string: position = record.get('Position');
        }
      }

      return {
        id: record.id,
        problemId: record.get('ProblemId') || '',
        citizen: record.get('Citizen') || '',
        assetType: record.get('AssetType') || '',
        asset: record.get('Asset') || '',
        severity: String(record.get('Severity') || 'medium'),
        status: record.get('Status') || 'active',
        createdAt: record.get('CreatedAt') || '',
        updatedAt: record.get('UpdatedAt') || '',
        location: record.get('Location') || '',
        position: position || '', // Use the parsed or original position
        type: record.get('Type') || '',
        title: record.get('Title') || '',
        description: record.get('Description') || '',
        solutions: record.get('Solutions') || '',
        notes: record.get('Notes') || ''
      };
    });
    
    // Return the problems data
    return NextResponse.json({
      success: true,
      problems
    });
    
  } catch (error) {
    console.error('Error in problems endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process problems request', details: error.message },
      { status: 500 }
    );
  }
}
