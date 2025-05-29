import { NextResponse } from 'next/server';
import Airtable from 'airtable';
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
    
    // Configure Airtable
    Airtable.configure({
      apiKey: AIRTABLE_API_KEY
    });
    
    // Connect to the LANDS table
    const base = Airtable.base(AIRTABLE_BASE_ID);
    
    // Fetch all records from the LANDS table
    const records = await base(AIRTABLE_LANDS_TABLE).select().all();
    console.log(`Retrieved ${records.length} land records from Airtable`);
    
    // Extract income data from the records
    const incomeData = records
      .filter(record => record.get('LandId') && 
              (record.get('LastIncome') !== undefined || 
               record.get('LastIncome') !== null))
      .map(record => {
        // Get the building points count, default to 1 if not available to avoid division by zero
        const buildingPointsCount = Number(record.get('BuildingPointsCount')) || 1;
        
        // Calculate income per building point
        const rawIncome = Number(record.get('LastIncome')) || 0;
        const incomePerBuildingPoint = buildingPointsCount > 0 
          ? rawIncome / buildingPointsCount 
          : rawIncome;
        
        return {
          polygonId: record.get('LandId'),
          income: incomePerBuildingPoint,
          rawIncome: rawIncome,
          buildingPointsCount: buildingPointsCount
        };
      });
    
    console.log(`Extracted income data for ${incomeData.length} land parcels with building points normalization`);
    
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
