import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const RESOURCES_TABLE = process.env.AIRTABLE_RESOURCES_TABLE || 'RESOURCES'; // Assuming 'RESOURCES' is your table name

// Initialize Airtable
const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  Airtable.configure({ apiKey: AIRTABLE_API_KEY });
  return Airtable.base(AIRTABLE_BASE_ID);
};

// Utility function to convert field names to camelCase (optional, if your frontend expects camelCase)
function toCamelCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      result[camelKey] = obj[key];
    }
  }
  return result;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  const { username } = await context.params;

  if (!username) {
    return NextResponse.json({ success: false, error: 'Username parameter is missing' }, { status: 400 });
  }

  try {
    const base = initAirtable();
    const records = await base(RESOURCES_TABLE)
      .select({
        // Filter by AssetType = "citizen" and Asset = username
        filterByFormula: `AND({AssetType} = 'citizen', {Asset} = '${username}')`,
        // Select fields you want to return, e.g., Name, Quantity, Icon, etc.
        // If no fields are specified, all fields will be returned.
        // fields: ['Name', 'Quantity', 'Icon', 'Category', 'SubCategory', 'Description'] 
      })
      .all();

    const transports = records.map(record => {
      // Apply toCamelCase if needed, otherwise just return record.fields
      // return toCamelCase(record.fields); 
      return {
        id: record.id,
        ...record.fields // Assuming fields are already in a suitable case or frontend handles it
      };
    });

    return NextResponse.json({
      success: true,
      transports: transports,
    });

  } catch (error) {
    console.error(`Error fetching transports for citizen ${username}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { success: false, error: `Failed to fetch transports: ${errorMessage}` },
      { status: 500 }
    );
  }
}
