import { NextResponse } from 'next/server';
import Airtable from 'airtable';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get Airtable credentials
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = "CITIZENS";

export async function GET() {
  try {
    console.log("Fetching coat of arms data from Citizens Airtable...");
    
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
    
    // Connect to the Citizens table
    const base = Airtable.base(AIRTABLE_BASE_ID);
    
    // Fetch all records from the Citizens table
    const records = await base(AIRTABLE_CITIZENS_TABLE).select().all();
    console.log(`Retrieved ${records.length} citizen records from Airtable`);
    
    // Extract coat of arms data from the records
    const coatOfArms: Record<string, string> = {};
    
    records.forEach(record => {
      const username = record.get('Username');
      const usernameString = username as string; // Cast username to string
      
      if (usernameString) {
        // Construct the URL based on the username and the desired production path
        // This ensures consistency and avoids issues with how paths might be stored in Airtable
        const desiredImageUrl = `https://backend.serenissima.ai/public_assets/images/coat-of-arms/${usernameString}.png`;
        coatOfArms[usernameString] = desiredImageUrl;
      }
    });
    
    console.log(`Constructed coat of arms URLs for ${Object.keys(coatOfArms).length} citizens`);
    
    // Return the coat of arms data
    return NextResponse.json({ coatOfArms });
  } catch (error) {
    console.error('Error fetching coat of arms data from Airtable:', error);
    return NextResponse.json(
      { error: 'Failed to fetch coat of arms data' },
      { status: 500 }
    );
  }
}
