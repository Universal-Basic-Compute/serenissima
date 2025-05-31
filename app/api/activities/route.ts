import { NextResponse } from 'next/server';

// Helper to escape single quotes for Airtable formulas
function escapeAirtableValue(value: string): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  return value.replace(/'/g, "\\'");
}

export async function GET(request: Request) {
  try {
    // Get URL parameters
    const urlObject = new URL(request.url); // Use a different name to avoid conflict with 'url' module
    const searchParams = urlObject.searchParams;
    
    const citizenIds = searchParams.getAll('citizenId'); // Keep this specific handling
    const limit = parseInt(searchParams.get('limit') || '100', 10); // Ensure radix 10
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
    const loggableFilters: Record<string, string> = {};
    // Reserved parameters are those handled by specific logic or Airtable's select options directly
    const reservedParams = ['limit', 'offset', 'sortField', 'sortDirection', 'citizenId', 'hasPath', 'ongoing', 'timeRange'];
    
    // Handle specific citizenId filter
    if (citizenIds.length > 0) {
      if (citizenIds.length === 1) {
        filterByFormulaParts.push(`{Citizen} = '${escapeAirtableValue(citizenIds[0])}'`);
      } else {
        const citizenFilters = citizenIds.map(id => `{Citizen} = '${escapeAirtableValue(id)}'`);
        filterByFormulaParts.push(`OR(${citizenFilters.join(', ')})`);
      }
      loggableFilters['Citizen'] = citizenIds.join(',');
    }
    
    // Handle specific hasPath filter
    if (hasPath) {
      filterByFormulaParts.push(`LEN({Path}) > 0`);
      loggableFilters['hasPath'] = 'true';
    }

    // Handle specific timeRange or ongoing filters
    if (timeRange === '24h') {
      const twentyFourHourFilter = `IS_AFTER({CreatedAt}, DATEADD(NOW(), -24, 'hours'))`;
      filterByFormulaParts.push(twentyFourHourFilter);
      loggableFilters['timeRange'] = '24h';
      console.log('Applying 24-hour time range filter (no timezone).');
    } else if (ongoing) {
      // Broad Airtable filter for ongoing, precise JS filter applied later
      // Add status conditions separately to simplify the final AND formula
      filterByFormulaParts.push(`{Status} != 'processed'`);
      filterByFormulaParts.push(`{Status} != 'failed'`);
      loggableFilters['ongoing'] = 'true';
      console.log('Applying broad Airtable status filter for ongoing activities (Status != processed AND Status != failed). JS will handle time logic.');
    }

    // Add dynamic filters from other query parameters
    for (const [key, value] of searchParams.entries()) {
      if (reservedParams.includes(key.toLowerCase())) {
        continue;
      }
      const airtableField = key; // Assuming query param key IS the Airtable field name
      loggableFilters[airtableField] = value;

      const numValue = parseFloat(value);
      if (!isNaN(numValue) && isFinite(numValue) && numValue.toString() === value) {
        filterByFormulaParts.push(`{${airtableField}} = ${value}`);
      } else if (value.toLowerCase() === 'true') {
        filterByFormulaParts.push(`{${airtableField}} = TRUE()`);
      } else if (value.toLowerCase() === 'false') {
        filterByFormulaParts.push(`{${airtableField}} = FALSE()`);
      } else {
        filterByFormulaParts.push(`{${airtableField}} = '${escapeAirtableValue(value)}'`);
      }
    }
    
    const filterByFormula = filterByFormulaParts.length > 0 ? `AND(${filterByFormulaParts.join(', ')})` : '';
    
    console.log('%c GET /api/activities request received', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    console.log('Query parameters (filters):', loggableFilters);
    if (filterByFormula) {
      console.log('Applying Airtable filter formula:', filterByFormula);
    }
    
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
