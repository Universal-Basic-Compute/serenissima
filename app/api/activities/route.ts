import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const citizenIds = searchParams.getAll('citizenId');
    const limit = parseInt(searchParams.get('limit') || '100', 100);
    const hasPath = searchParams.get('hasPath') === 'true';
    const ongoing = searchParams.get('ongoing') === 'true';
    const timeRange = searchParams.get('timeRange'); // New 'timeRange' parameter
    
    console.log(`Fetching activities: limit=${limit}, hasPath=${hasPath}, ongoing=${ongoing}, timeRange=${timeRange}, citizenIds=${citizenIds.length > 0 ? citizenIds.join(',') : 'none'}`);
    
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
    let filterByFormulaParts: string[] = [];
    
    if (citizenIds.length > 0) {
      // Filter by specific citizens
      if (citizenIds.length === 1) {
        filterByFormulaParts.push(`{Citizen}='${citizenIds[0]}'`); // Changed CitizenId to Citizen
      } else {
        filterByFormulaParts.push(`OR(${citizenIds.map(id => `{Citizen}='${id}'`).join(',')})`); // Changed CitizenId to Citizen
      }
    }
    
    // Add path filter if requested
    if (hasPath) {
      filterByFormulaParts.push(`AND(NOT({Path} = ''), NOT({Path} = BLANK()))`);
    }

    // Add timeRange filter or ongoing filter
    if (timeRange === '24h') {
      // Filter for activities created in the last 24 hours, without SET_TIMEZONE
      const twentyFourHourFilter = `IS_AFTER({CreatedAt}, DATEADD(NOW(), -24, 'hours'))`;
      filterByFormulaParts.push(twentyFourHourFilter);
      console.log('Applying 24-hour time range filter (no timezone).');
    } else if (ongoing) {
      // Airtable filter for ongoing activities:
      // For ongoing activities, broadly filter by status in Airtable.
      // Precise time-based filtering will be done in JavaScript.
      const ongoingAirtableFilter = `NOT(OR({Status} = 'processed', {Status} = 'failed'))`;
      filterByFormulaParts.push(ongoingAirtableFilter);
      console.log('Applying broad Airtable status filter for ongoing activities. JS will handle time logic.');
    }
    
    const filterByFormula = filterByFormulaParts.length > 0 ? `AND(${filterByFormulaParts.join(', ')})` : '';
    
    console.log(`Constructed Airtable filterByFormula: ${filterByFormula}`);
    
    // Prepare the request parameters
    let requestUrl = `${url}?sort%5B0%5D%5Bfield%5D=EndDate&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=${limit}`;
    
    if (filterByFormula) {
      requestUrl += `&filterByFormula=${encodeURIComponent(filterByFormula)}`;
    }
    
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
    
    let fetchedActivities = data.records.map((record: any) => {
      const fields = record.fields;
      const formattedActivity: Record<string, any> = { activityId: record.id };
      for (const key in fields) {
        if (Object.prototype.hasOwnProperty.call(fields, key)) {
          const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
          formattedActivity[camelKey] = fields[key];
        }
      }
      return formattedActivity;
    });

    // If 'ongoing' was requested (and not 'timeRange=24h'), apply precise JavaScript filter
    if (ongoing && timeRange !== '24h') {
      const now = new Date();
      fetchedActivities = fetchedActivities.filter((activity: any) => {
        if (!activity.startDate) {
            console.warn(`Activity ${activity.activityId} missing startDate, cannot apply precise ongoing JS filter.`);
            return false;
        }
        const startDateObj = new Date(activity.startDate);
        if (now < startDateObj) { // Activity hasn't started yet
            return false;
        }

        // If EndDate is blank (null/undefined in JS), it's ongoing if it has started
        if (!activity.endDate) {
            return true;
        }

        // If EndDate exists, check if 'now' is before or at EndDate
        const endDateObj = new Date(activity.endDate);
        return now <= endDateObj;
      });
      console.log(`Filtered down to ${fetchedActivities.length} truly ongoing activities using JS time check.`);
    }
    
    console.log(`Found ${fetchedActivities.length} activities. HasPath filter: ${hasPath}`);
    
    return NextResponse.json({
      success: true,
      activities: fetchedActivities
    });
  } catch (error) {
    console.error('Error fetching citizen activities:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while fetching activities' },
      { status: 500 }
    );
  }
}
