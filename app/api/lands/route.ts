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
      
      // Get the Airtable record ID and the LandId field
      const recordId = record.id;
      const landId = record.get('LandId') || recordId; // Use LandId if available, fall back to record ID
      
      // Get polygon data using the LandId field
      const polygonData = polygonMap[landId] || {};
      
      if (Object.keys(polygonData).length === 0) {
        console.warn(`No polygon data found for land ${landId} (record ID: ${recordId})`);
      }
      
      // Merge land data with polygon data
      return {
        id: recordId,
        landId: landId, // Include the landId in the response
        owner: record.get('Owner') || null,
        buildingPointsCount: record.get('BuildingPointsCount') || 0,
        historicalName: record.get('HistoricalName') || polygonData.historicalName || null,
        englishName: record.get('EnglishName') || polygonData.englishName || null,
        historicalDescription: record.get('HistoricalDescription') || polygonData.historicalDescription || null,
        // Use polygon data for coordinates, building points, etc.
        coordinates: polygonData.coordinates || coordinates || [],
        center: center || polygonData.center || polygonData.centroid || null,
        buildingPoints: polygonData.buildingPoints || [],
        bridgePoints: polygonData.bridgePoints || [],
        canalPoints: polygonData.canalPoints || [],
        // Include any additional fields from the polygon data
        areaInSquareMeters: polygonData.areaInSquareMeters || record.get('AreaInSquareMeters') || null,
        nameConfidence: polygonData.nameConfidence || record.get('NameConfidence') || null
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
