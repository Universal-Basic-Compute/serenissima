import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Helper to escape single quotes for Airtable formulas
function escapeAirtableValue(value: string): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  return value.replace(/'/g, "\\'");
}

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
    const url = new URL(request.url);

    const formulaParts: string[] = [];
    const loggableFilters: Record<string, string> = {};
    const reservedParams = ['limit', 'offset', 'sortField', 'sortDirection'];

    for (const [key, value] of url.searchParams.entries()) {
      if (reservedParams.includes(key.toLowerCase())) {
        continue;
      }
      const airtableField = key; // Assuming query param key IS the Airtable field name
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
    console.log('%c GET /api/lands request received', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    console.log('Query parameters (filters):', loggableFilters);
    if (filterByFormula) {
      console.log('Applying Airtable filter formula:', filterByFormula);
    }
    
    // Fetch lands from Airtable
    console.log('Fetching lands from Airtable...');
    const landsRecords = await base(AIRTABLE_LANDS_TABLE)
      .select({
        filterByFormula: filterByFormula
        // Add default sort if needed, e.g., by LandId
        // sort: [{ field: 'LandId', direction: 'asc' }]
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
      const landIdField = record.get('LandId');
      const landId = String(landIdField || recordId); // Use LandId if available, fall back to record ID, ensure string
        
      // Get polygon data using the LandId field
      const polygonData = polygonMap[landId] || {};
        
      if (Object.keys(polygonData).length === 0) {
        console.warn(`No polygon data found for land ${landId} (record ID: ${recordId})`);
      }
        
      // Get all fields from the record
      const fields = record._rawJson.fields;
        
      // Create a base object with de-capitalized field names
      const baseObject: Record<string, any> = {
        id: recordId,
        landId: landId
      };
        
      // Add all fields from Airtable with de-capitalized first letter
      for (const [key, value] of Object.entries(fields)) {
        // De-capitalize the first letter of the key
        const newKey = key.charAt(0).toLowerCase() + key.slice(1);
        baseObject[newKey] = value;
      }
        
      // Merge with polygon data, also with de-capitalized keys
      return {
        ...baseObject, // baseObject contains id (Airtable recordId) and landId (poly_123 style ID)
        polygonId: baseObject.landId, // Add polygonId, taking value from baseObject.landId (poly_123 style ID)
        // Override with processed values and polygon data
        owner: record.get('Owner') || null,
        buildingPointsCount: record.get('BuildingPointsCount') || 0,
        historicalName: record.get('HistoricalName') || polygonData.historicalName || null,
        englishName: record.get('EnglishName') || polygonData.englishName || null,
        coordinates: polygonData.coordinates || coordinates || [],
        center: center || polygonData.center || polygonData.centroid || null,
        buildingPoints: polygonData.buildingPoints || [],
        bridgePoints: polygonData.bridgePoints || [],
        canalPoints: polygonData.canalPoints || [],
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
