import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_RELATIONSHIPS_TABLE = process.env.AIRTABLE_RELATIONSHIPS_TABLE || 'RELATIONSHIPS';

// Helper function to escape single quotes in strings for Airtable formulas
const escapeAirtableValue = (str: string) => str.replace(/'/g, "\\'"); // Renamed for consistency

export async function GET(request: NextRequest) {
  try {
    // Get Airtable credentials from environment variables
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error('Airtable credentials not configured');
      return NextResponse.json(
        { success: false, error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }

    // Initialize Airtable
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const citizen1Param = searchParams.get('citizen1');
    const citizen2Param = searchParams.get('citizen2');
    const url = new URL(request.url); // For easier access to all searchParams

    // If no citizen parameters are provided, fetch relationships with dynamic filtering
    if (!citizen1Param && !citizen2Param) {
      const formulaParts: string[] = [];
      const loggableFilters: Record<string, string> = {};
      const reservedParamsList = ['limit', 'offset', 'sortField', 'sortDirection', 'citizen1', 'citizen2'];

      for (const [key, value] of url.searchParams.entries()) {
        if (reservedParamsList.includes(key.toLowerCase())) {
          continue;
        }
        const airtableField = key;
        loggableFilters[airtableField] = value;

        const numValue = parseFloat(value);
        if (!isNaN(numValue) && isFinite(numValue) && numValue.toString() === value) {
          formulaParts.push(`{${airtableField}} = ${value}`);
        } else if (value.toLowerCase() === 'true') {
          formulaParts.push(`{${airtableField}} = TRUE()`);
        } else if (value.toLowerCase() === 'false') {
          formulaParts.push(`{${airtableField}} = FALSE()`);
        } else {
          formulaParts.push(`{${airtableField}} = '${escapeAirtableValue(value)}'`);
        }
      }
      
      const filterByFormula = formulaParts.length > 0 ? `AND(${formulaParts.join(', ')})` : '';
      console.log('%c GET /api/relationships (general list) request received', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
      console.log('Query parameters (filters):', loggableFilters);
      if (filterByFormula) {
        console.log('Applying Airtable filter formula:', filterByFormula);
      }

      const records = await base(AIRTABLE_RELATIONSHIPS_TABLE)
        .select({
          filterByFormula: filterByFormula,
          sort: [{ field: 'StrengthScore', direction: 'desc' }], // Default sort
          maxRecords: 100, // Default limit for general queries
        })
        .all();

      const relationships = records.map(relationship => ({
        id: relationship.id,
        citizen1: relationship.get('Citizen1'),
        citizen2: relationship.get('Citizen2'),
        strengthScore: relationship.get('StrengthScore'),
        title: relationship.get('Title'),
        description: relationship.get('Description'),
        tier: relationship.get('Tier'),
        trustScore: relationship.get('TrustScore'),
        status: relationship.get('Status'),
        lastInteraction: relationship.get('LastInteraction'),
        notes: relationship.get('Notes'),
        createdAt: relationship.get('CreatedAt'),
      }));

      return NextResponse.json({
        success: true,
        relationships: relationships,
      });
    }

    // If one or both citizen parameters are provided, proceed with existing logic
    if (!citizen1Param || !citizen2Param) {
      return NextResponse.json(
        { success: false, error: 'Both citizen1 and citizen2 parameters are required if at least one is provided' },
        { status: 400 }
      );
    }

    // Determine alphabetical order for citizen usernames
    let firstUsername: string, secondUsername: string;
    if (citizen1Param.localeCompare(citizen2Param) <= 0) {
      firstUsername = citizen1Param;
      secondUsername = citizen2Param;
    } else {
      firstUsername = citizen2Param;
      secondUsername = citizen1Param;
    }

    const safeFirstUsername = escapeAirtableValue(firstUsername);
    const safeSecondUsername = escapeAirtableValue(secondUsername);

    // Prepare filter formula assuming Citizen1 field stores the alphabetically first username.
    // This relies on the convention that data in Airtable is stored with Citizen1 < Citizen2 alphabetically.
    const filterFormula = `AND({Citizen1} = '${safeFirstUsername}', {Citizen2} = '${safeSecondUsername}')`;

    console.log(`%c GET /api/relationships (specific pair) request received for ${firstUsername} & ${secondUsername}`, 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    console.log('Applying Airtable filter formula:', filterFormula);

    // Fetch relationships from Airtable
    const records = await base(AIRTABLE_RELATIONSHIPS_TABLE)
      .select({
        filterByFormula: filterFormula,
        maxRecords: 1 // We only need the first match
      })
      .all();

    if (records.length > 0) {
      const relationship = records[0];
      const responseData = {
        id: relationship.id,
        citizen1: relationship.get('Citizen1'),
        citizen2: relationship.get('Citizen2'),
        // type: relationship.get('Type'), // Champ retiré car inexistant dans Airtable
        strengthScore: relationship.get('StrengthScore'),
        title: relationship.get('Title'),
        description: relationship.get('Description'),
        tier: relationship.get('Tier'),
        trustScore: relationship.get('TrustScore'),
        status: relationship.get('Status'),
        lastInteraction: relationship.get('LastInteraction'),
        notes: relationship.get('Notes'),
        createdAt: relationship.get('CreatedAt'),
      };
      return NextResponse.json({
        success: true,
        relationship: responseData // Return a single relationship object
      });
    } else {
      return NextResponse.json({
        success: true,
        relationship: null, // No relationship found
        message: `No direct relationship found between ${citizen1Param} and ${citizen2Param}` // Use original params for message
      });
    }

  } catch (error) {
    console.error('Error in relationships endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process relationships request', details: error.message },
      { status: 500 }
    );
  }
}
