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

// Airtable Configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_ACTIVITIES_TABLE = process.env.AIRTABLE_ACTIVITIES_TABLE || 'ACTIVITIES';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  throw new Error('Airtable API key or Base ID is not configured in environment variables.');
}

const airtable = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
const activitiesTable = airtable(AIRTABLE_ACTIVITIES_TABLE);

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
  pathData: PathDataSchema, // Path must be pre-calculated by the AI
  // fromBuildingId is optional, if not provided, current citizen position is start
  fromBuildingId: z.string().optional(), 
  notes: z.string().optional(),
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
  pathData: PathDataSchema.optional(), // Required if fromBuildingId is specified
  notes: z.string().optional(),
});

const RestActivityDetailsSchema = BaseActivityDetailsSchema.extend({
  buildingId: z.string(), // Home or Inn
  locationType: z.enum(["home", "inn"]),
  durationHours: z.number().min(1).max(12), // Example duration
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
    "goto_work", "goto_home", "travel_to_inn", // Travel
    "production", 
    "fetch_resource", 
    "rest", 
    "idle",
    "deliver_resource_batch", // Could be complex, requires careful definition
    "eat_from_inventory", "eat_at_home", "eat_at_tavern",
    "secure_warehouse", "deliver_to_storage", "fetch_from_storage",
    "check_business_status", "fishing", "emergency_fishing",
    "goto_construction_site", "deliver_construction_materials", "construct_building",
    "leave_venice"
    // Add other valid activity types here
  ]),
  activityDetails: z.any(), // We'll validate this based on activityType
  kinosReflection: z.string().optional(),
});

// --- Main POST Handler ---
export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const validationResult = CreateActivityPayloadSchema.safeParse(rawBody);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request payload", details: validationResult.error.format() },
        { status: 400 }
      );
    }

    const { citizenUsername, activityType, activityDetails, kinosReflection } = validationResult.data;

    // TODO: Implement security check: does the requester have authority for citizenUsername?
    // This might involve checking an API key associated with the AI agent.
    // For now, we assume the request is authorized.

    log.info(`[API CreateActivity] Received request for ${citizenUsername} to perform ${activityType}`);

    const airtablePayload: Record<string, any> = {
      ActivityId: `${activityType}_${citizenUsername}_${Date.now()}`,
      Citizen: citizenUsername,
      Type: activityType,
      Status: "created", // All API-created activities start as 'created'
      CreatedAt: new Date().toISOString(),
      Notes: kinosReflection ? `AI Reflection: ${kinosReflection}` : undefined,
    };

    // --- Specific Activity Type Logic & Validation ---
    // This is where you'd call refactored versions of your `try_create_..._activity` functions
    // or implement the logic to populate airtablePayload based on activityDetails.
    // For now, a simplified example:

    let specificDetailsValid = false;
    let startDate: Date = new Date(); // Default start date
    let endDate: Date | null = null;   // Default end date

    if (activityType === "rest") {
      const restDetails = RestActivityDetailsSchema.safeParse(activityDetails);
      if (restDetails.success) {
        airtablePayload.FromBuilding = restDetails.data.buildingId; // Assuming rest happens AT a building
        airtablePayload.ToBuilding = restDetails.data.buildingId;
        endDate = new Date(startDate.getTime() + restDetails.data.durationHours * 60 * 60 * 1000);
        if (restDetails.data.notes) airtablePayload.Notes = `${airtablePayload.Notes || ''}\nDetails: ${restDetails.data.notes}`.trim();
        specificDetailsValid = true;
      } else {
         return NextResponse.json({ success: false, error: `Invalid details for activity type ${activityType}`, details: restDetails.error.format() }, { status: 400 });
      }
    } else if (activityType === "idle") {
      const idleDetails = IdleActivityDetailsSchema.safeParse(activityDetails);
      if (idleDetails.success) {
        endDate = new Date(startDate.getTime() + idleDetails.data.durationHours * 60 * 60 * 1000);
        if (idleDetails.data.reason) airtablePayload.Notes = `${airtablePayload.Notes || ''}\nReason: ${idleDetails.data.reason}`.trim();
        specificDetailsValid = true;
      } else {
        return NextResponse.json({ success: false, error: `Invalid details for activity type ${activityType}`, details: idleDetails.error.format() }, { status: 400 });
      }
    } else if (["goto_work", "goto_home", "travel_to_inn", "goto_construction_site"].includes(activityType)) {
      const gotoDetails = GotoActivityDetailsSchema.safeParse(activityDetails);
      if (gotoDetails.success) {
        airtablePayload.ToBuilding = gotoDetails.data.toBuildingId;
        airtablePayload.Path = JSON.stringify(gotoDetails.data.pathData.path); // Store the path array
        // StartDate and EndDate should come from pathData.timing
        if (gotoDetails.data.pathData.timing) {
            startDate = new Date(gotoDetails.data.pathData.timing.startDate);
            endDate = new Date(gotoDetails.data.pathData.timing.endDate);
        } else {
            // Fallback if timing is not in pathData (should be an error from AI side)
            return NextResponse.json({ success: false, error: "PathData must include timing for travel activities" }, { status: 400 });
        }
        if (gotoDetails.data.fromBuildingId) airtablePayload.FromBuilding = gotoDetails.data.fromBuildingId;
        if (gotoDetails.data.notes) airtablePayload.Notes = `${airtablePayload.Notes || ''}\nDetails: ${gotoDetails.data.notes}`.trim();
        specificDetailsValid = true;
      } else {
        return NextResponse.json({ success: false, error: `Invalid details for activity type ${activityType}`, details: gotoDetails.error.format() }, { status: 400 });
      }
    } else if (activityType === "production") {
        const prodDetails = ProductionActivityDetailsSchema.safeParse(activityDetails);
        if (prodDetails.success) {
            airtablePayload.FromBuilding = prodDetails.data.buildingId; // Production happens AT FromBuilding
            airtablePayload.Details = JSON.stringify({ recipe: prodDetails.data.recipe }); // Store recipe in Details
            endDate = new Date(startDate.getTime() + prodDetails.data.recipe.craftMinutes * 60 * 1000);
            if (prodDetails.data.notes) airtablePayload.Notes = `${airtablePayload.Notes || ''}\nDetails: ${prodDetails.data.notes}`.trim();
            specificDetailsValid = true;
        } else {
            return NextResponse.json({ success: false, error: `Invalid details for activity type ${activityType}`, details: prodDetails.error.format() }, { status: 400 });
        }
    } else if (activityType === "fetch_resource") {
        const fetchDetails = FetchResourceActivityDetailsSchema.safeParse(activityDetails);
        if (fetchDetails.success) {
            airtablePayload.ContractId = fetchDetails.data.contractId;
            airtablePayload.FromBuilding = fetchDetails.data.fromBuildingId;
            airtablePayload.ToBuilding = fetchDetails.data.toBuildingId;
            airtablePayload.Resources = JSON.stringify([{ ResourceId: fetchDetails.data.resourceId, Amount: fetchDetails.data.amount }]); // Standardize to Resources field
            if (fetchDetails.data.pathData && fetchDetails.data.pathData.path) {
                airtablePayload.Path = JSON.stringify(fetchDetails.data.pathData.path);
                 if (fetchDetails.data.pathData.timing) {
                    startDate = new Date(fetchDetails.data.pathData.timing.startDate);
                    endDate = new Date(fetchDetails.data.pathData.timing.endDate);
                } else if (fetchDetails.data.fromBuildingId) { // Path implies travel
                     return NextResponse.json({ success: false, error: "PathData must include timing for travel-based fetch_resource" }, { status: 400 });
                }
            } else if (fetchDetails.data.fromBuildingId) { // Travel implied by FromBuilding but no path
                 return NextResponse.json({ success: false, error: "PathData is required for fetch_resource if FromBuilding is specified" }, { status: 400 });
            }
            // If no FromBuildingId and no PathData, it's a generic fetch (e.g. from market, path determined by processor)
            // or an instant fetch if already at location (processor would handle this).
            // For API creation, if it's not instant, path should be provided.
            // If it's meant to be instant (e.g. already at source), EndDate might be very soon.
            if (!endDate && !fetchDetails.data.fromBuildingId) { // Assume short duration if no travel
                endDate = new Date(startDate.getTime() + 5 * 60 * 1000); // 5 min default
            }
            if (fetchDetails.data.notes) airtablePayload.Notes = `${airtablePayload.Notes || ''}\nDetails: ${fetchDetails.data.notes}`.trim();
            specificDetailsValid = true;
        } else {
            return NextResponse.json({ success: false, error: `Invalid details for activity type ${activityType}`, details: fetchDetails.error.format() }, { status: 400 });
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
````

**2. Update `components/Documentation/ApiReference.tsx`**

Add documentation for the new endpoint.

````tsx
components/Documentation/ApiReference.tsx
<<<<<<< SEARCH
              <li><a href="#transport-get-water-graph" className="text-amber-600 hover:underline text-sm">GET /api/get-water-graph</a></li>
              <li><a href="#transport-get-activities" className="text-amber-600 hover:underline text-sm">GET /api/activities</a></li>
            </ul>
          </li>
          <li><a href="#economy" className="text-amber-700 hover:underline">Economy & Finance</a>
