import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get Airtable credentials
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_BUILDINGS_TABLE = process.env.AIRTABLE_BUILDINGS_TABLE || "BUILDINGS";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const buildingId = params.id;
    
    if (!buildingId) {
      return NextResponse.json(
        { success: false, error: 'Building ID is required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching building with ID: ${buildingId}`);
    
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
    
    // Connect to the Buildings table
    const base = Airtable.base(AIRTABLE_BASE_ID);
    
    // Query for the specific building
    const records = await base(AIRTABLE_BUILDINGS_TABLE)
      .select({
        filterByFormula: `{BuildingId} = '${buildingId}'`
      })
      .firstPage();
    
    if (!records || records.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Building not found' },
        { status: 404 }
      );
    }
    
    // Get the first matching record
    const record = records[0];
    
    // Map Airtable record to building object
    const building = {
      id: record.get('BuildingId'),
      type: record.get('Type'),
      land_id: record.get('Land'),
      variant: record.get('Variant'),
      position: record.get('Position'),
      rotation: record.get('Rotation'),
      owner: record.get('User'),
      created_at: record.get('CreatedTime'),
      created_by: record.get('CreatedBy'),
      lease_amount: record.get('LeaseAmount'),
      rent_amount: record.get('RentAmount'),
      occupant: record.get('Occupant')
    };
    
    return NextResponse.json({ success: true, building });
  } catch (error) {
    console.error('Error fetching building:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch building' },
      { status: 500 }
    );
  }
}
