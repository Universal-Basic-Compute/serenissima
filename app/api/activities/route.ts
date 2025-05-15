import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const citizenId = searchParams.get('citizenId');
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    
    // Validate citizenId
    if (!citizenId) {
      return NextResponse.json(
        { success: false, error: 'citizenId parameter is required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching activities for citizen ${citizenId} with limit ${limit}`);
    
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
    
    // Create the filter formula to get activities for the specified citizen
    const filterByFormula = encodeURIComponent(`{CitizenId}='${citizenId}'`);
    
    // Make the request to Airtable
    const response = await fetch(`${url}?filterByFormula=${filterByFormula}&sort%5B0%5D%5Bfield%5D=CreatedAt&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=${limit}`, {
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
      id: record.id,
      ...record.fields
    }));
    
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
