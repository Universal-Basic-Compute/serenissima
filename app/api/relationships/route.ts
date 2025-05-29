import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_RELATIONSHIPS_TABLE = process.env.AIRTABLE_RELATIONSHIPS_TABLE || 'RELATIONSHIPS';

// Helper function to escape single quotes in strings for Airtable formulas
const escapeAirtableString = (str: string) => str.replace(/'/g, "\\'");

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

    // If no citizen parameters are provided, fetch the top 100 strongest relationships
    if (!citizen1Param && !citizen2Param) {
      console.log('Fetching top 100 strongest relationships');
      const records = await base(AIRTABLE_RELATIONSHIPS_TABLE)
        .select({
          sort: [{ field: 'StrengthScore', direction: 'desc' }],
          maxRecords: 100,
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

    const safeFirstUsername = escapeAirtableString(firstUsername);
    const safeSecondUsername = escapeAirtableString(secondUsername);

    // Prepare filter formula assuming Citizen1 field stores the alphabetically first username.
    // This relies on the convention that data in Airtable is stored with Citizen1 < Citizen2 alphabetically.
    const filterFormula = `AND({Citizen1} = '${safeFirstUsername}', {Citizen2} = '${safeSecondUsername}')`;

    console.log(`Fetching relationship for (${firstUsername}, ${secondUsername}) with filter: ${filterFormula}`);

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
