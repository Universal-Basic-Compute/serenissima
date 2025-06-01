import { NextResponse } from 'next/server';
import { z } from 'zod';

// Define the schema for the request body
const TryReadRequestSchema = z.object({
  requestType: z.string().min(1, "requestType is required"),
  parameters: z.record(z.any()).optional().default({}), // Parameters for the underlying GET request
});

// Helper to construct query string from parameters object
const buildQueryString = (params: Record<string, any>): string => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        value.forEach(v => query.append(key, String(v)));
      } else {
        query.set(key, String(value));
      }
    }
  }
  return query.toString();
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const validationResult = TryReadRequestSchema.safeParse(rawBody);

    if (!validationResult.success) {
      return NextResponse.json({ 
        success: false, 
        error: "Invalid request payload", 
        details: validationResult.error.format() 
      }, { status: 400 });
    }

    const { requestType, parameters } = validationResult.data;
    const { username, citizenUsername, buildingId, landId, resourceType, category, pointType, type, limit, problemId } = parameters;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    let targetUrl = '';
    let responseData: any;

    console.log(`[API /try-read] Received requestType: ${requestType}, parameters:`, parameters);

    switch (requestType) {
      case 'get_my_profile':
      case 'get_citizen_public_profile': // Handles both, as they point to the same underlying API
        if (!username) return NextResponse.json({ success: false, error: "Parameter 'username' is required for " + requestType }, { status: 400 });
        targetUrl = `${baseUrl}/api/citizens/${encodeURIComponent(username)}`;
        break;
      case 'get_my_lands':
        if (!username) return NextResponse.json({ success: false, error: "Parameter 'username' is required for get_my_lands" }, { status: 400 });
        targetUrl = `${baseUrl}/api/lands?Owner=${encodeURIComponent(username)}`;
        break;
      case 'get_my_buildings':
        if (!username) return NextResponse.json({ success: false, error: "Parameter 'username' is required for get_my_buildings" }, { status: 400 });
        targetUrl = `${baseUrl}/api/buildings?Owner=${encodeURIComponent(username)}`;
        break;
      case 'get_my_inventory':
        if (!username) return NextResponse.json({ success: false, error: "Parameter 'username' is required for get_my_inventory" }, { status: 400 });
        targetUrl = `${baseUrl}/api/resources/counts?owner=${encodeURIComponent(username)}`;
        break;
      case 'get_my_active_sell_contracts':
        if (!username) return NextResponse.json({ success: false, error: "Parameter 'username' is required for get_my_active_sell_contracts" }, { status: 400 });
        targetUrl = `${baseUrl}/api/contracts?Seller=${encodeURIComponent(username)}&Type=public_sell&Status=active`;
        break;
      case 'get_my_active_import_contracts':
        if (!username) return NextResponse.json({ success: false, error: "Parameter 'username' is required for get_my_active_import_contracts" }, { status: 400 });
        targetUrl = `${baseUrl}/api/contracts?Buyer=${encodeURIComponent(username)}&Type=import&Status=active`;
        break;
      case 'get_my_problems':
        if (!username) return NextResponse.json({ success: false, error: "Parameter 'username' is required for get_my_problems" }, { status: 400 });
        targetUrl = `${baseUrl}/api/problems?Citizen=${encodeURIComponent(username)}&Status=active`;
        break;
      case 'get_my_opportunities':
        if (!username) return NextResponse.json({ success: false, error: "Parameter 'username' is required for get_my_opportunities" }, { status: 400 });
        targetUrl = `${baseUrl}/api/relevancies?RelevantToCitizen=${encodeURIComponent(username)}&Category=opportunity`;
        break;
      case 'get_my_latest_activity':
        if (!username) return NextResponse.json({ success: false, error: "Parameter 'username' is required for get_my_latest_activity" }, { status: 400 });
        targetUrl = `${baseUrl}/api/activities?citizenId=${encodeURIComponent(username)}&limit=1`;
        break;
      case 'get_lands_for_sale':
        targetUrl = `${baseUrl}/api/contracts?Type=land_sale&Status=available`;
        break;
      case 'get_building_types':
        const btParams = new URLSearchParams();
        if (pointType) btParams.set('pointType', pointType);
        targetUrl = `${baseUrl}/api/building-types${btParams.toString() ? '?' + btParams.toString() : ''}`;
        break;
      case 'get_resource_types':
        const rtParams = new URLSearchParams();
        if (category) rtParams.set('category', category);
        targetUrl = `${baseUrl}/api/resource-types${rtParams.toString() ? '?' + rtParams.toString() : ''}`;
        break;
      case 'get_public_builders':
        targetUrl = `${baseUrl}/api/get-public-builders`;
        break;
      case 'get_stocked_public_sell_contracts':
        const spscParams = new URLSearchParams();
        if (resourceType) spscParams.set('ResourceType', resourceType);
        targetUrl = `${baseUrl}/api/contracts/stocked-public-sell${spscParams.toString() ? '?' + spscParams.toString() : ''}`;
        break;
      case 'get_global_thoughts':
        targetUrl = `${baseUrl}/api/get-thoughts`; // Corrected endpoint
        break;
      case 'get_citizen_thoughts': // New specific request type
        if (!username) return NextResponse.json({ success: false, error: "Parameter 'username' is required for get_citizen_thoughts" }, { status: 400 });
        const ctParams = new URLSearchParams({ citizenUsername: username });
        if (limit) ctParams.set('limit', String(limit));
        targetUrl = `${baseUrl}/api/thoughts?${ctParams.toString()}`; // Corrected endpoint for specific citizen
        break;
      case 'get_all_guilds':
        targetUrl = `${baseUrl}/api/guilds`;
        break;
      case 'get_active_decrees':
        targetUrl = `${baseUrl}/api/decrees?Status=active`;
        break;
      case 'get_data_package':
        if (!username) return NextResponse.json({ success: false, error: "Parameter 'username' is required for get_data_package" }, { status: 400 });
        targetUrl = `${baseUrl}/api/get-data-package?citizenUsername=${encodeURIComponent(username)}`;
        break;
      case 'get_building_details':
        if (!buildingId) return NextResponse.json({ success: false, error: "Parameter 'buildingId' is required for get_building_details" }, { status: 400 });
        targetUrl = `${baseUrl}/api/buildings/${encodeURIComponent(buildingId)}`;
        break;
      case 'get_building_resources':
        if (!buildingId) return NextResponse.json({ success: false, error: "Parameter 'buildingId' is required for get_building_resources" }, { status: 400 });
        targetUrl = `${baseUrl}/api/building-resources/${encodeURIComponent(buildingId)}`;
        break;
      case 'get_land_details': // For specific land by LandId
        if (!landId) return NextResponse.json({ success: false, error: "Parameter 'landId' is required for get_land_details" }, { status: 400 });
        targetUrl = `${baseUrl}/api/lands?LandId=${encodeURIComponent(landId)}`;
        break;
      case 'get_problem_details':
        if (!problemId) return NextResponse.json({ success: false, error: "Parameter 'problemId' is required for get_problem_details" }, { status: 400 });
        targetUrl = `${baseUrl}/api/problems/${encodeURIComponent(problemId)}`;
        break;
      // Add more cases here for other predefined GET requests
      default:
        return NextResponse.json({ success: false, error: `Unknown requestType: ${requestType}` }, { status: 400 });
    }

    console.log(`[API /try-read] Fetching from target URL: ${targetUrl}`);
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Add any other necessary headers, e.g., Authorization if some GETs become protected
      },
    });

    responseData = await response.json();

    if (!response.ok) {
      console.error(`[API /try-read] Error from internal fetch to ${targetUrl}: ${response.status}`, responseData);
      return NextResponse.json({
        success: false,
        requestType,
        error: `Failed to fetch data for ${requestType}`,
        details: responseData,
        status: response.status,
      }, { status: response.status });
    }

    return NextResponse.json({
      success: true,
      requestType,
      data: responseData,
    });

  } catch (error: any) {
    console.error('[API /try-read] Internal error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error.message,
    }, { status: 500 });
  }
}
