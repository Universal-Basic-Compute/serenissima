import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const citizenIds = searchParams.getAll('citizenId');
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const hasPath = searchParams.get('hasPath') === 'true';
    
    // Validate citizenId
    if (citizenIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one citizenId parameter is required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching activities for citizens: ${citizenIds.join(', ')}, limit: ${limit}, hasPath: ${hasPath}`);
    
    // Get Airtable credentials from environment variables
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_ACTIVITIES_TABLE = process.env.AIRTABLE_ACTIVITIES_TABLE || 'ACTIVITIES';
    
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { success: false, error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }
    
    // Construct the Airtable API URL
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_ACTIVITIES_TABLE}`;
    
    // Create the filter formula to get activities for the specified citizens
    let filterByFormula;
    if (citizenIds.length === 1) {
      filterByFormula = `{CitizenId}='${citizenIds[0]}'`;
    } else {
      filterByFormula = `OR(${citizenIds.map(id => `{CitizenId}='${id}'`).join(',')})`;
    }
    
    // Add path filter if requested
    if (hasPath) {
      filterByFormula = `AND(${filterByFormula}, NOT({Path}=''), NOT({Path}=NULL()))`;
    }
    
    // Encode the filter formula
    const encodedFilter = encodeURIComponent(filterByFormula);
    
    // Make the request to Airtable
    const response = await fetch(`${url}?filterByFormula=${encodedFilter}&sort%5B0%5D%5Bfield%5D=CreatedAt&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=${limit}`, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`Airtable API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { success: false, error: `Failed to fetch activities: ${response.statusText}` },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    
    // Extract and format the activities
    const activities = data.records.map((record: any) => ({
      ActivityId: record.id,
      ...record.fields
    }));
    
    console.log(`Found ${activities.length} activities with paths: ${hasPath}`);
    
    return NextResponse.json({
      success: true,
      activities
    });
  } catch (error) {
    console.error('Error fetching citizen activities:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while fetching activities' },
      { status: 500 }
    );
  }
}
