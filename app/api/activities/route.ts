import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const citizenIds = searchParams.getAll('citizenId');
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const hasPath = searchParams.get('hasPath') === 'true';
    
    console.log(`Fetching activities: limit=${limit}, hasPath=${hasPath}, citizenIds=${citizenIds.length > 0 ? citizenIds.join(',') : 'none'}`);
    
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
    
    // Create the filter formula based on parameters
    let filterByFormula = '';
    
    if (citizenIds.length > 0) {
      // Filter by specific citizens
      if (citizenIds.length === 1) {
        filterByFormula = `{CitizenId}='${citizenIds[0]}'`;
      } else {
        filterByFormula = `OR(${citizenIds.map(id => `{CitizenId}='${id}'`).join(',')})`;
      }
    }
    
    // Add path filter if requested
    if (hasPath) {
      const pathFilter = `AND(NOT({Path} = ''), NOT({Path} = BLANK()))`;
      filterByFormula = filterByFormula 
        ? `AND(${filterByFormula}, ${pathFilter})` 
        : pathFilter;
    }
    
    // Prepare the request parameters
    let requestUrl = `${url}?sort%5B0%5D%5Bfield%5D=CreatedAt&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=${limit}`;
    
    // Only add the filter if we have one
    if (filterByFormula) {
      requestUrl += `&filterByFormula=${encodeURIComponent(filterByFormula)}`;
    }
    
    console.log(`Making Airtable request to: ${requestUrl}`);
    
    // Make the request to Airtable
    const response = await fetch(requestUrl, {
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
    const activities = data.records.map((record: any) => {
      // Ensure all desired fields are explicitly mapped or spread
      const fields = record.fields;
      return {
        ActivityId: record.id,
        Citizen: fields.Citizen, // Assuming 'Citizen' is the username field link
        CitizenId: fields.CitizenId, // Actual CitizenId if different
        Path: fields.Path,
        Type: fields.Type,
        StartDate: fields.StartDate,
        CreatedAt: fields.CreatedAt, // Keep CreatedAt for sorting/fallback
        EndDate: fields.EndDate,
        Notes: fields.Notes,
        TransportMode: fields.TransportMode, // Add TransportMode
        // Include any other fields that are expected by the frontend services
        // For example, if Location, Target, ResourceType etc. are used by ActivityPathService or CitizenMarkers
        Location: fields.Location,
        Target: fields.Target,
        ResourceType: fields.ResourceType,
        Amount: fields.Amount,
        Price: fields.Price
      };
    });
    
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
