import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_LANDS_TABLE = process.env.AIRTABLE_LANDS_TABLE || 'LANDS';

// Function to fetch polygon data from the get-polygons API
async function fetchPolygonData(): Promise<Record<string, any>> {
  try {
    console.log('Fetching polygon data from get-polygons API...');
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/get-polygons?essential=true`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch polygons: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Create a map of polygon ID to polygon data for quick lookup
    const polygonMap: Record<string, any> = {};
    if (data.polygons && Array.isArray(data.polygons)) {
      console.log(`Fetched ${data.polygons.length} polygons from get-polygons API`);
      data.polygons.forEach(polygon => {
        if (polygon.id) {
          polygonMap[polygon.id] = polygon;
        }
      });
    }
    
    return polygonMap;
  } catch (error) {
    console.error('Error fetching polygon data:', error);
    return {};
  }
}

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
    
    // Fetch polygon data
    const polygonMap = await fetchPolygonData();
    
    // Transform records to a more usable format and merge with polygon data
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
      
      // Get the land ID
      const landId = record.id;
      
      // Get polygon data for this land
      const polygonData = polygonMap[landId] || {};
      
      // Merge land data with polygon data
      return {
        id: landId,
        owner: record.get('Owner') || null,
        buildingPointsCount: record.get('BuildingPointsCount') || 0,
        historicalName: record.get('HistoricalName') || null,
        // Use land data if available, otherwise use polygon data
        position: position || polygonData.position,
        center: center || polygonData.center || polygonData.centroid,
        coordinates: coordinates || polygonData.coordinates || [],
        // Include additional polygon data
        buildingPoints: polygonData.buildingPoints || [],
        bridgePoints: polygonData.bridgePoints || [],
        canalPoints: polygonData.canalPoints || []
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
