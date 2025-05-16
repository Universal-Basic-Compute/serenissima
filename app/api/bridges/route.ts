import { NextResponse } from 'next/server';
import Airtable from 'airtable';

export async function GET(request: Request) {
  try {
    // Get Airtable credentials from environment variables
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_BUILDINGS_TABLE = process.env.AIRTABLE_BUILDINGS_TABLE || 'BUILDINGS';
    
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { success: false, error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }
    
    // Initialize Airtable
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    
    // Query buildings with bridge types
    const bridgeTypes = ['bridge', 'rialto_bridge'];
    const typeConditions = bridgeTypes.map(type => `{Type}='${type}'`).join(',');
    const formula = `OR(${typeConditions})`;
    
    // Fetch records from Airtable
    const records = await new Promise((resolve, reject) => {
      const allRecords: any[] = [];
      
      base(AIRTABLE_BUILDINGS_TABLE)
        .select({
          filterByFormula: formula
        })
        .eachPage(
          function page(records, fetchNextPage) {
            const processedRecords = records.map(record => {
              const fields = record.fields;
              
              // Process position data
              let position = null;
              try {
                if (fields.Position) {
                  position = JSON.parse(fields.Position);
                } else if (fields.Point) {
                  // Extract position from Point field (format: type_lat_lng)
                  const pointValue = String(fields.Point);
                  const parts = pointValue.split('_');
                  if (parts.length >= 3) {
                    const lat = parseFloat(parts[1]);
                    const lng = parseFloat(parts[2]);
                    
                    if (!isNaN(lat) && !isNaN(lng)) {
                      position = { lat, lng };
                    }
                  }
                }
              } catch (e) {
                console.error('Error parsing position:', e);
              }
              
              return {
                id: record.id,
                buildingId: fields.BuildingId || record.id,
                type: fields.Type || 'bridge',
                name: fields.Name || 'Bridge',
                position,
                owner: fields.Owner || 'ConsiglioDeiDieci',
                isConstructed: fields.IsConstructed === true || fields.IsConstructed === 'true',
                constructionDate: fields.ConstructionDate || null
              };
            });
            
            allRecords.push(...processedRecords);
            fetchNextPage();
          },
          function done(err) {
            if (err) {
              console.error('Error fetching bridges from Airtable:', err);
              reject(err);
            } else {
              resolve(allRecords);
            }
          }
        );
    });
    
    return NextResponse.json({
      success: true,
      bridges: records
    });
  } catch (error) {
    console.error('Error in bridges API:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while fetching bridges' },
      { status: 500 }
    );
  }
}
