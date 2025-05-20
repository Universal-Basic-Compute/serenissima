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
    const citizen1Username = searchParams.get('citizen1');
    const citizen2Username = searchParams.get('citizen2');

    if (!citizen1Username || !citizen2Username) {
      return NextResponse.json(
        { success: false, error: 'Both citizen1 and citizen2 parameters are required' },
        { status: 400 }
      );
    }

    const safeCitizen1 = escapeAirtableString(citizen1Username);
    const safeCitizen2 = escapeAirtableString(citizen2Username);

    // Prepare filter formula
    // Looks for (Citizen1 = c1 AND Citizen2 = c2) OR (Citizen1 = c2 AND Citizen2 = c1)
    const filterFormula = `OR(
      AND({Citizen1} = '${safeCitizen1}', {Citizen2} = '${safeCitizen2}'),
      AND({Citizen1} = '${safeCitizen2}', {Citizen2} = '${safeCitizen1}')
    )`;

    console.log(`Fetching relationships with filter: ${filterFormula}`);

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
        type: relationship.get('Type'),
        strengthScore: relationship.get('StrengthScore'),
        sentiment: relationship.get('Sentiment'),
        status: relationship.get('Status'),
        startDate: relationship.get('StartDate'),
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
        message: `No direct relationship found between ${citizen1Username} and ${citizen2Username}`
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
