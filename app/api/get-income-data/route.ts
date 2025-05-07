import { NextResponse } from 'next/server';
import { Table } from 'pyairtable';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get Airtable credentials
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_LANDS_TABLE = process.env.AIRTABLE_LANDS_TABLE || "LANDS";

/**
 * API endpoint to get income data for land parcels
 * 
 * @returns JSON response with income data for all land parcels
 */
export async function GET() {
  try {
    console.log("Fetching income data from LANDS Airtable...");
    
    // Initialize Airtable
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error("Missing Airtable credentials");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }
    
    // Connect to the LANDS table
    const lands_table = new Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_LANDS_TABLE);
    
    // Fetch all records from the LANDS table
    const records = await lands_table.all();
    console.log(`Retrieved ${records.length} land records from Airtable`);
    
    // Extract income data from the records
    const incomeData = records
      .filter(record => record.fields.LandId && 
              (record.fields.SimulatedIncome !== undefined || 
               record.fields.SimulatedIncome !== null))
      .map(record => ({
        polygonId: record.fields.LandId,
        income: record.fields.SimulatedIncome || 0
      }));
    
    console.log(`Extracted income data for ${incomeData.length} land parcels`);
    
    // Return the income data
    return NextResponse.json({ incomeData });
  } catch (error) {
    console.error('Error fetching income data from Airtable:', error);
    return NextResponse.json(
      { error: 'Failed to fetch income data' },
      { status: 500 }
    );
  }
}
