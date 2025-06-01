import { NextResponse } from 'next/server';
import Airtable from 'airtable';
import { z } from 'zod'; // For validation

// Helper to convert a string to PascalCase
const stringToPascalCase = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/([-_][a-z])/ig, ($1) => $1.toUpperCase().replace('-', '').replace('_', ''))
    .replace(/^(.)/, ($1) => $1.toUpperCase());
};

// Helper function to convert all keys of an object to PascalCase (shallow)
const keysToPascalCase = (obj: Record<string, any>): Record<string, any> => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [stringToPascalCase(key), value])
  );
};

// Helper to convert a string to camelCase
const toCamelCase = (s: string) => {
  if (!s) return s;
  return s.replace(/([-_][a-z])/ig, ($1) => {
    return $1.toUpperCase()
      .replace('-', '')
      .replace('_', '');
  }).replace(/^([A-Z])/, (firstChar) => firstChar.toLowerCase());
};

// Helper function to convert all keys of an object to camelCase (shallow)
const normalizeKeysCamelCaseShallow = (obj: Record<string, any>): Record<string, any> => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  const newObj: Record<string, any> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      newObj[toCamelCase(key)] = obj[key]; // Only transform keys, not nested objects
    }
  }
  return newObj;
};


// Airtable Configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_ACTIVITIES_TABLE = process.env.AIRTABLE_ACTIVITIES_TABLE || 'ACTIVITIES';
const AIRTABLE_MESSAGES_TABLE = process.env.AIRTABLE_MESSAGES_TABLE || 'MESSAGES'; // Added for fetching thoughts

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  throw new Error('Airtable API key or Base ID is not configured in environment variables.');
}

const airtable = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
const activitiesTable = airtable(AIRTABLE_ACTIVITIES_TABLE);
const messagesTable = airtable(AIRTABLE_MESSAGES_TABLE); // Added messages table instance

// --- Zod Schemas for Validation ---
const PositionSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

const PathDataItemSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  type: z.string().optional(),
  nodeId: z.string().optional(),
  polygonId: z.string().optional(),
  transportMode: z.enum(["gondola", "walk"]).nullable().optional(),
});

const PathDataSchema = z.object({
  success: z.boolean(),
  path: z.array(PathDataItemSchema).optional(),
  timing: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    durationSeconds: z.number(),
    distanceMeters: z.number(),
  }).optional(),
  journey: z.array(z.any()).optional(), // Define more strictly if needed
  transporter: z.string().nullable().optional(),
});

const ResourceAmountSchema = z.object({
  ResourceId: z.string(), // Or Type
  Amount: z.number(),
});

const BaseActivityDetailsSchema = z.object({
  // Common fields, most are derived or set by server
});

const GotoActivityDetailsSchema = BaseActivityDetailsSchema.extend({
  toBuildingId: z.string(),
  // fromBuildingId is optional. If not provided, pathfinding might start from citizen's current location (needs citizen data access)
  // or this API could require it for explicit travel. For now, let's make it optional and handle logic.
  fromBuildingId: z.string().optional(), 
  notes: z.string().optional(),
  // pathData is removed from input, will be fetched internally
});

const ProductionActivityDetailsSchema = BaseActivityDetailsSchema.extend({
  buildingId: z.string(), // The building where production occurs (FromBuilding)
  recipe: z.object({ // Simplified recipe structure, expand as needed
    inputs: z.record(z.number()).optional(), // e.g., {"wood": 10, "iron_ore": 5}
    outputs: z.record(z.number()),
    craftMinutes: z.number(),
  }),
  notes: z.string().optional(),
});

const FetchResourceActivityDetailsSchema = BaseActivityDetailsSchema.extend({
  contractId: z.string().optional(), // Optional if generic fetch
  fromBuildingId: z.string().optional(), // Source building, optional for generic
  toBuildingId: z.string(), // Destination building (e.g., citizen's home or workshop)
  resourceId: z.string(), // Type of resource
  amount: z.number(),
  // pathData is removed from input, will be fetched internally if fromBuildingId is present
  notes: z.string().optional(),
});

const RestActivityDetailsSchema = BaseActivityDetailsSchema.extend({
  buildingId: z.string(), // Home or Inn
  locationType: z.enum(["home", "inn"]),
  durationHours: z.number().min(1).max(12), // Example duration
  notes: z.string().optional(),
});

const BidOnLandActivityDetailsSchema = BaseActivityDetailsSchema.extend({
  landId: z.string(),
  bidAmount: z.number().positive(),
  targetBuildingId: z.string(), // e.g., ID of a courthouse or town_hall
  fromBuildingId: z.string(),   // Starting point for travel
  notes: z.string().optional(),
});

const IdleActivityDetailsSchema = BaseActivityDetailsSchema.extend({
  durationHours: z.number().min(0.5).max(4),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

// Main Request Body Schema
const CreateActivityPayloadSchema = z.object({
  citizenUsername: z.string(),
  activityType: z.enum([
    // Traditional Activities
    "goto_work", "goto_home", "travel_to_inn", 
    "production", 
    "fetch_resource", 
    "rest", 
    "idle",
    "deliver_resource_batch",
    "eat_from_inventory", "eat_at_home", "eat_at_tavern",
    "secure_warehouse", "deliver_to_storage", "fetch_from_storage",
    "check_business_status", "fishing", "emergency_fishing",
    "goto_construction_site", "deliver_construction_materials", "construct_building",
    "leave_venice",
    // Strategic Actions as Activities
    "bid_on_land",
    "buy_available_land",
    "initiate_building_project",
    "adjust_land_lease_price",
    "adjust_building_rent_price",
    "manage_public_sell_contract",
    "modify_public_sell_price",
    "end_public_sell_contract",
    "manage_import_contract",
    "manage_public_storage_offer",
    "bid_on_building",
    "respond_to_building_bid",
    "withdraw_building_bid",
    "manage_markup_buy_contract",
    "manage_storage_query_contract",
    "adjust_business_wages",
    "manage_business_operation",
    "request_loan",
    "offer_loan",
    "withdraw_compute_tokens",
    "inject_compute_tokens",
    "send_message",
    "reply_to_message",
    "update_citizen_profile",
    "manage_guild_membership",
    "log_strategic_thought",
    "mark_notifications_read",
    "upload_coat_of_arms",
    "update_citizen_settings"
    // Add other valid activity/action types here
  ]),
  activityDetails: z.any(), // We'll validate this based on activityType. For actions, this will contain their specific parameters.
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  thought: z.string().optional(), // Made thought optional
  notes: z.string().optional(), // Formerly kinosReflection
});

// --- Main POST Handler ---
export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    // Normalize top-level keys to camelCase before Zod validation
    const normalizedRawBody = normalizeKeysCamelCaseShallow(rawBody);
    console.log("[API CreateActivity] Normalized Raw Body for Zod:", JSON.stringify(normalizedRawBody, null, 2));

    const validationResult = CreateActivityPayloadSchema.safeParse(normalizedRawBody);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request payload", details: validationResult.error.format() },
        { status: 400 }
      );
    }

    let { citizenUsername, activityType, activityDetails: rawActivityDetails, title, description, thought, notes } = validationResult.data;

    // Normalize activityDetails keys to camelCase before specific Zod schema validation
    const activityDetails = normalizeKeysCamelCaseShallow(rawActivityDetails || {});
    console.log("[API CreateActivity] Normalized ActivityDetails for specific Zod:", JSON.stringify(activityDetails, null, 2));
    
    // TODO: Implement security check: does the requester have authority for citizenUsername?
    // This might involve checking an API key associated with the AI agent.
    // For now, we assume the request is authorized.

    console.log(`[API CreateActivity] Received request for ${citizenUsername} to perform ${activityType}`);

    // Fetch latest thought if not provided or empty
    if (!thought) {
      console.log(`[API CreateActivity] Thought not provided for ${citizenUsername}. Fetching latest relevant log.`);
      try {
        const thoughtRecords = await messagesTable.select({
          filterByFormula: `AND({Sender} = '${citizenUsername}', OR({Type} = 'unguided_run_log', {Type} = 'autonomous_run_log'))`,
          sort: [{ field: 'CreatedAt', direction: 'desc' }],
          maxRecords: 1,
          fields: ['Content']
        }).firstPage();

        if (thoughtRecords && thoughtRecords.length > 0 && thoughtRecords[0].fields.Content) {
          thought = thoughtRecords[0].fields.Content as string;
          console.log(`[API CreateActivity] Using fetched thought for ${citizenUsername}: "${thought.substring(0, 50)}..."`);
        } else {
          console.log(`[API CreateActivity] No relevant thought log found for ${citizenUsername}. Using default.`);
          thought = "No specific thought provided for this action."; // Default if none found
        }
      } catch (e) {
        console.error(`[API CreateActivity] Error fetching thought for ${citizenUsername}:`, e);
        thought = "Error fetching thought; proceeding with default."; // Default on error
      }
    }

    const airtablePayload: Record<string, any> = {
      ActivityId: `${activityType}_${citizenUsername}_${Date.now()}`,
      Citizen: citizenUsername,
      Type: activityType,
      Status: "created", // All API-created activities start as 'created'
      CreatedAt: new Date().toISOString(),
      Title: title,
      Description: description,
      Thought: thought, // Use the potentially fetched or original thought
      Notes: notes, // Optional notes
    };

    // --- Specific Activity Type Logic & Validation ---
    // This is where you'd call refactored versions of your `try_create_..._activity` functions
    // or implement the logic to populate airtablePayload based on activityDetails.
    // For now, a simplified example:

    let specificDetailsValid = false;
    let startDate: Date = new Date(); // Default start date for non-travel activities
    let endDate: Date | null = null;   // Default end date for non-travel activities
    let internalPathData: any = null; // To store pathData if fetched

    // Helper function to fetch building position (simplified)
    // In a real scenario, this might call /api/buildings/:id or directly query Airtable if this API has DB access
    const getBuildingPosition = async (buildingId: string): Promise<{ lat: number; lng: number } | null> => {
        // This is a placeholder. Implement actual fetching logic.
        // For now, let's assume we can't fetch it here and it must be handled by the caller or a different service.
        // However, for the new design, this endpoint *needs* to resolve building positions.
        // This would typically involve an internal fetch or direct DB access.
        // For this example, we'll simulate a fetch.
        try {
            const buildingApiUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/buildings/${encodeURIComponent(buildingId)}`;
            const response = await fetch(buildingApiUrl);
            if (!response.ok) {
                console.warn(`[API CreateActivity] Failed to fetch position for building ${buildingId}: ${response.status}`);
                return null;
            }
            const data = await response.json();
            if (data.building && data.building.position) {
                return data.building.position; // Assuming position is {lat, lng}
            }
            console.warn(`[API CreateActivity] Position not found for building ${buildingId} in API response.`);
            return null;
        } catch (e) {
            console.error(`[API CreateActivity] Error fetching position for building ${buildingId}:`, e);
            return null;
        }
    };


    if (activityType === "rest") {
      const restDetails = RestActivityDetailsSchema.safeParse(activityDetails);
      if (restDetails.success) {
        airtablePayload.FromBuilding = restDetails.data.buildingId; // Assuming rest happens AT a building
        airtablePayload.ToBuilding = restDetails.data.buildingId;
        endDate = new Date(startDate.getTime() + restDetails.data.durationHours * 60 * 60 * 1000);
        // Notes from activityDetails are appended to the main Notes field if provided
        if (restDetails.data.notes) airtablePayload.Notes = `${airtablePayload.Notes ? airtablePayload.Notes + '\n' : ''}Details: ${restDetails.data.notes}`.trim();
        specificDetailsValid = true;
      } else {
         return NextResponse.json({ success: false, error: `Invalid details for activity type ${activityType}`, details: restDetails.error.format() }, { status: 400 });
      }
    } else if (activityType === "idle") {
      const idleDetails = IdleActivityDetailsSchema.safeParse(activityDetails);
      if (idleDetails.success) {
        endDate = new Date(startDate.getTime() + idleDetails.data.durationHours * 60 * 60 * 1000);
        if (idleDetails.data.reason) airtablePayload.Notes = `${airtablePayload.Notes ? airtablePayload.Notes + '\n' : ''}Reason: ${idleDetails.data.reason}`.trim();
        specificDetailsValid = true;
      } else {
        return NextResponse.json({ success: false, error: `Invalid details for activity type ${activityType}`, details: idleDetails.error.format() }, { status: 400 });
      }
    } else if (["goto_work", "goto_home", "travel_to_inn", "goto_construction_site"].includes(activityType)) {
      const gotoDetailsResult = GotoActivityDetailsSchema.safeParse(activityDetails);
      if (gotoDetailsResult.success) {
        const gotoData = gotoDetailsResult.data;
        airtablePayload.ToBuilding = gotoData.toBuildingId;
        if (gotoData.fromBuildingId) airtablePayload.FromBuilding = gotoData.fromBuildingId;
        
        // Internal Pathfinding
        const toPos = await getBuildingPosition(gotoData.toBuildingId);
        let fromPos = null;
        if (gotoData.fromBuildingId) {
            fromPos = await getBuildingPosition(gotoData.fromBuildingId);
        } else {
            // If fromBuildingId is not provided, we need citizen's current position.
            // This API doesn't have direct access to citizen's current position without another call.
            // For now, require fromBuildingId or assume AI handles "start from current pos" differently.
            // OR, this endpoint could fetch citizen's current position if fromBuildingId is null.
            // Let's assume for now if fromBuildingId is null, it's an error or needs client to handle.
            // A better approach: if fromBuildingId is null, the AI should have placed the citizen at the start of the path already.
            // This API would then expect a path if fromBuildingId is not given.
            // For simplicity now: if fromBuildingId is given, we pathfind.
            return NextResponse.json({ success: false, error: "fromBuildingId is required for server-side pathfinding in goto activities for now." }, { status: 400 });
        }

        if (!fromPos || !toPos) {
            return NextResponse.json({ success: false, error: "Could not determine start or end position for pathfinding." }, { status: 400 });
        }

        const transportApiUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/transport`;
        const transportResponse = await fetch(transportApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startPoint: fromPos, endPoint: toPos, startDate: new Date().toISOString() })
        });

        if (!transportResponse.ok) {
            const errorBody = await transportResponse.text();
            return NextResponse.json({ success: false, error: `Pathfinding failed: ${transportResponse.status} ${errorBody}` }, { status: 400 });
        }
        internalPathData = await transportResponse.json();
        if (!internalPathData.success || !internalPathData.path || !internalPathData.timing) {
            return NextResponse.json({ success: false, error: "Pathfinding did not return a valid path or timing.", details: internalPathData.error }, { status: 400 });
        }

        airtablePayload.Path = JSON.stringify(internalPathData.path);
        startDate = new Date(internalPathData.timing.startDate);
        endDate = new Date(internalPathData.timing.endDate);
        if (internalPathData.transporter) airtablePayload.Transporter = internalPathData.transporter;

        if (gotoData.notes) airtablePayload.Notes = `${airtablePayload.Notes ? airtablePayload.Notes + '\n' : ''}Details: ${gotoData.notes}`.trim();
        specificDetailsValid = true;
      } else {
        return NextResponse.json({ success: false, error: `Invalid details for activity type ${activityType}`, details: gotoDetailsResult.error.format() }, { status: 400 });
      }
    } else if (activityType === "production") {
        const prodDetails = ProductionActivityDetailsSchema.safeParse(activityDetails);
        if (prodDetails.success) {
            airtablePayload.FromBuilding = prodDetails.data.buildingId; // Production happens AT FromBuilding
            airtablePayload.Details = JSON.stringify({ recipe: prodDetails.data.recipe }); // Store recipe in Details
            endDate = new Date(startDate.getTime() + prodDetails.data.recipe.craftMinutes * 60 * 1000);
            if (prodDetails.data.notes) airtablePayload.Notes = `${airtablePayload.Notes ? airtablePayload.Notes + '\n' : ''}Details: ${prodDetails.data.notes}`.trim();
            specificDetailsValid = true;
        } else {
            return NextResponse.json({ success: false, error: `Invalid details for activity type ${activityType}`, details: prodDetails.error.format() }, { status: 400 });
        }
    } else if (activityType === "fetch_resource") {
        const fetchDetailsResult = FetchResourceActivityDetailsSchema.safeParse(activityDetails); // Renamed for clarity
        if (fetchDetailsResult.success) {
            const fetchData = fetchDetailsResult.data; // Use a new const for validated data
            airtablePayload.ContractId = fetchData.contractId;
            airtablePayload.FromBuilding = fetchData.fromBuildingId;
            airtablePayload.ToBuilding = fetchData.toBuildingId;
            airtablePayload.Resources = JSON.stringify([{ ResourceId: fetchData.resourceId, Amount: fetchData.amount }]);

            if (fetchData.fromBuildingId) { // Travel is involved
                const fromPos = await getBuildingPosition(fetchData.fromBuildingId);
                const toPos = await getBuildingPosition(fetchData.toBuildingId);

                if (!fromPos || !toPos) {
                    return NextResponse.json({ success: false, error: "Could not determine start or end position for fetch_resource pathfinding." }, { status: 400 });
                }
                const transportApiUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/transport`;
                const transportResponse = await fetch(transportApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ startPoint: fromPos, endPoint: toPos, startDate: new Date().toISOString() })
                });
                if (!transportResponse.ok) {
                    const errorBody = await transportResponse.text();
                    return NextResponse.json({ success: false, error: `Pathfinding for fetch_resource failed: ${transportResponse.status} ${errorBody}` }, { status: 400 });
                }
                internalPathData = await transportResponse.json();
                if (!internalPathData.success || !internalPathData.path || !internalPathData.timing) {
                     return NextResponse.json({ success: false, error: "Pathfinding for fetch_resource did not return a valid path or timing.", details: internalPathData.error }, { status: 400 });
                }
                airtablePayload.Path = JSON.stringify(internalPathData.path);
                startDate = new Date(internalPathData.timing.startDate);
                endDate = new Date(internalPathData.timing.endDate);
                if (internalPathData.transporter) airtablePayload.Transporter = internalPathData.transporter;
            } else {
                // No fromBuildingId, so it's an instant fetch or from current location (not handled by this API creating a path)
                // Default duration for non-travel fetch
                endDate = new Date(startDate.getTime() + 5 * 60 * 1000); // 5 min default
            }
            if (fetchData.notes) airtablePayload.Notes = `${airtablePayload.Notes ? airtablePayload.Notes + '\n' : ''}Details: ${fetchData.notes}`.trim();
            specificDetailsValid = true;
        } else {
            return NextResponse.json({ success: false, error: `Invalid details for activity type ${activityType}`, details: fetchDetailsResult.error.format() }, { status: 400 });
        }
    } else if (activityType === "bid_on_land") {
      const bidDetailsResult = BidOnLandActivityDetailsSchema.safeParse(activityDetails);
      if (bidDetailsResult.success) {
        const bidData = bidDetailsResult.data;
        airtablePayload.ToBuilding = bidData.targetBuildingId; // Travel to the target building
        airtablePayload.FromBuilding = bidData.fromBuildingId;
        
        // Store landId and bidAmount in Details for the processor
        airtablePayload.Details = JSON.stringify({ 
          landId: bidData.landId, 
          bidAmount: bidData.bidAmount,
          // The subsequent activity upon arrival will be 'submit_land_bid_offer'
          // This can be implicitly handled by processActivities.py based on Type and current location
          // or explicitly set here if needed by the processor.
          // For now, let's assume the processor for 'bid_on_land' when at 'ToBuilding' handles the bid submission.
        });

        const fromPos = await getBuildingPosition(bidData.fromBuildingId);
        const toPos = await getBuildingPosition(bidData.targetBuildingId);

        if (!fromPos || !toPos) {
            return NextResponse.json({ success: false, error: "Could not determine start or end position for bid_on_land pathfinding." }, { status: 400 });
        }

        const transportApiUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/transport`;
        const transportResponse = await fetch(transportApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startPoint: fromPos, endPoint: toPos, startDate: new Date().toISOString() })
        });

        if (!transportResponse.ok) {
            const errorBody = await transportResponse.text();
            return NextResponse.json({ success: false, error: `Pathfinding for bid_on_land failed: ${transportResponse.status} ${errorBody}` }, { status: 400 });
        }
        internalPathData = await transportResponse.json();
        if (!internalPathData.success || !internalPathData.path || !internalPathData.timing) {
            return NextResponse.json({ success: false, error: "Pathfinding for bid_on_land did not return a valid path or timing.", details: internalPathData.error }, { status: 400 });
        }

        airtablePayload.Path = JSON.stringify(internalPathData.path);
        startDate = new Date(internalPathData.timing.startDate);
        endDate = new Date(internalPathData.timing.endDate); // EndDate is arrival at targetBuildingId
        if (internalPathData.transporter) airtablePayload.Transporter = internalPathData.transporter;
        
        if (bidData.notes) airtablePayload.Notes = `${airtablePayload.Notes ? airtablePayload.Notes + '\n' : ''}Details: ${bidData.notes}`.trim();
        specificDetailsValid = true;
      } else {
        return NextResponse.json({ success: false, error: `Invalid details for activity type ${activityType}`, details: bidDetailsResult.error.format() }, { status: 400 });
      }
    }
    // ... Add more else if blocks for other activity types with their specific Zod schemas and payload mapping ...
    else {
      return NextResponse.json({ success: false, error: `Activity type '${activityType}' not yet fully supported by this direct creation endpoint or details invalid.` }, { status: 400 });
    }

    if (!specificDetailsValid) {
        // This case should be caught by individual type checks returning early.
        return NextResponse.json({ success: false, error: `Invalid or incomplete activityDetails for type ${activityType}.` }, { status: 400 });
    }

    airtablePayload.StartDate = startDate.toISOString();
    if (endDate) {
        airtablePayload.EndDate = endDate.toISOString();
    } else {
        // Handle activities that might not have a predefined end date or where it's set by processor
        // For now, let's default to a short duration if not set by specific logic.
        airtablePayload.EndDate = new Date(startDate.getTime() + 60 * 60 * 1000).toISOString(); // 1 hour default
    }
    
    // Remove undefined notes
    if (airtablePayload.Notes === undefined) delete airtablePayload.Notes;

    // --- Interrupt existing active activity before creating a new one ---
    const nowUtcIso = new Date().toISOString();
    const activeActivityFormula = `AND(
      {Citizen} = '${citizenUsername}',
      {StartDate} <= '${nowUtcIso}',
      {EndDate} >= '${nowUtcIso}',
      NOT(OR({Status} = 'processed', {Status} = 'failed', {Status} = 'interrupted'))
    )`;

    try {
      const existingActiveActivities = await activitiesTable.select({ filterByFormula: activeActivityFormula }).all();
      for (const activity of existingActiveActivities) {
        console.log(`[API CreateActivity] Interrupting existing active activity ${activity.id} for ${citizenUsername}.`);
        await activitiesTable.update(activity.id, {
          Status: "interrupted",
          Notes: `${activity.fields.Notes || ''}\nInterrupted at ${nowUtcIso} by new API-driven activity.`.trim()
        });
      }
    } catch (e) {
      console.error(`[API CreateActivity] Error trying to interrupt existing activities for ${citizenUsername}:`, e);
      // Decide if this should be a fatal error or just a warning. For now, log and continue.
    }
    // --- End of interruption logic ---

    console.log("[API CreateActivity] Final Airtable Payload:", JSON.stringify(airtablePayload, null, 2));
    const createdRecord = await activitiesTable.create(airtablePayload);

    return NextResponse.json({ 
        success: true, 
        message: `Activity '${activityType}' created successfully for ${citizenUsername}.`,
        activity: {
            id: createdRecord.id,
            ...keysToPascalCase(createdRecord.fields) // Return fields in PascalCase for consistency with Airtable
        }
    });

  } catch (error: any) {
    console.error('[API CreateActivity] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create activity' },
      { status: 500 }
    );
  }
}
