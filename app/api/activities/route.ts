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
      filterByFormulaParts.push(`NOT({Path} = BLANK())`);
      loggableFilters['hasPath'] = 'true';
    }

    // Handle specific timeRange or ongoing filters
    let applyDefaultStatusExclusion = true; // Flag to control application of default status exclusion

    if (timeRange === '24h') {
      const twentyFourHourFilter = `IS_AFTER({CreatedAt}, DATEADD(NOW(), -24, 'hours'))`;
      filterByFormulaParts.push(twentyFourHourFilter);
      loggableFilters['timeRange'] = '24h';
      console.log('Applying 24-hour time range filter (no timezone).');
      applyDefaultStatusExclusion = false; // Specific time range filter applied
    } else if (ongoing) {
      // If ongoing=true, filter for statuses 'created' or 'in_progress' at the Airtable level.
      // The precise JavaScript time-based filter will then determine true "ongoing" status.
      filterByFormulaParts.push(`OR({Status} = 'created', {Status} = 'in_progress')`);
      loggableFilters['ongoing'] = 'true';
      loggableFilters['Status_ongoing_include'] = 'created, in_progress';
      console.log('Applying Airtable status filter for ongoing activities (Status = created OR Status = in_progress). JS will handle precise time logic.');
      applyDefaultStatusExclusion = false; // Specific 'ongoing' filter applied
    }

    // Add dynamic filters from other query parameters
    // This needs to happen before deciding on default status exclusion,
    // because if 'Status' is dynamically filtered, we shouldn't apply the default.
    for (const [key, value] of searchParams.entries()) {
      if (reservedParams.includes(key.toLowerCase())) {
        continue;
      }
      const airtableField = key; // Assuming query param key IS the Airtable field name
      loggableFilters[airtableField] = value;

      if (airtableField.toLowerCase() === 'status') { // Case-insensitive check for 'Status'
        applyDefaultStatusExclusion = false; // User is providing a specific status filter
      }

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

    // Apply default status exclusion if no other status-related filter was applied
    if (applyDefaultStatusExclusion) {
      // If limit is 1 and no other specific time/status filters were applied by earlier logic,
      // assume it's a "get latest" request and don't exclude by status.
      const isLikelyGetLatestRequest = limit === 1 && !timeRange && !ongoing && !searchParams.has('Status'); // Re-check searchParams.has('Status') here for safety
      
      if (!isLikelyGetLatestRequest) {
        filterByFormulaParts.push(`{Status} != 'processed'`);
        filterByFormulaParts.push(`{Status} != 'failed'`);
        filterByFormulaParts.push(`{Status} != 'interrupted'`);
        loggableFilters['Status_default_exclude'] = 'processed, failed, interrupted';
        console.log('Applying default status filter to exclude processed, failed, and interrupted activities.');
      } else {
        console.log('Likely "get latest" request (limit=1, no explicit status/time filters). Skipping default status exclusion.');
      }
    }
    
    let filterByFormula = '';
    if (filterByFormulaParts.length === 1) {
      filterByFormula = filterByFormulaParts[0];
    } else if (filterByFormulaParts.length > 1) {
      filterByFormula = `AND(${filterByFormulaParts.join(', ')})`;
    }
    
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
    
    if (response.status === 422) {
      console.warn(`Airtable API returned 422 (Unprocessable Entity) for formula: ${filterByFormula}. Returning empty activities list.`);
      return NextResponse.json(
        { success: true, activities: [], _fallbackError: true, error: 'Airtable could not process the request formula.' },
        { status: 200 }
      );
    }

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
