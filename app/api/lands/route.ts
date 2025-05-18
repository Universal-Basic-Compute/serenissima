import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_LANDS_TABLE = process.env.AIRTABLE_LANDS_TABLE || 'LANDS';

export async function GET(request: Request) {
  try {
    // Check if Airtable credentials are configured
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error('Airtable credentials not configured');
      return NextResponse.json(
        { error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }
    
    // Initialize Airtable
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get('owner');
    
    // Prepare filter formula
    let filterFormula = '';
    if (owner) {
      filterFormula = `{Owner} = '${owner}'`;
    }
    
    // Fetch lands from Airtable
    console.log('Fetching lands from Airtable...');
    const landsRecords = await base(AIRTABLE_LANDS_TABLE)
      .select({
        filterByFormula: filterFormula || ''
      })
      .all();
    
    console.log(`Fetched ${landsRecords.length} land records from Airtable`);
    
    // Transform records to a more usable format
    const lands = landsRecords.map(record => {
      // Parse position and coordinates if they're strings
      let position = record.get('Position');
      if (typeof position === 'string') {
        try {
          position = JSON.parse(position);
        } catch (e) {
          position = null;
        }
      }
      
      let coordinates = record.get('Coordinates');
      if (typeof coordinates === 'string') {
        try {
          coordinates = JSON.parse(coordinates);
        } catch (e) {
          coordinates = [];
        }
      }
      
      let center = record.get('Center');
      if (typeof center === 'string') {
        try {
          center = JSON.parse(center);
        } catch (e) {
          center = null;
        }
      }
      
      return {
        id: record.id,
        owner: record.get('Owner') || null,
        buildingPointsCount: record.get('BuildingPointsCount') || 0,
        historicalName: record.get('HistoricalName') || null,
        position,
        center,
        coordinates
      };
    });
    
    // Return the lands data
    return NextResponse.json({
      success: true,
      lands
    });
    
  } catch (error) {
    console.error('Error fetching lands:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lands', details: error.message },
      { status: 500 }
    );
  }
}
