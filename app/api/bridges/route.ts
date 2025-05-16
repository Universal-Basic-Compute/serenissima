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
                constructionDate: fields.ConstructionDate || null,
                landId: fields.LandId || null // Store the LandId for later use
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
    
    // Enhance bridge data with polygon links
    const enhancedRecords = await Promise.all((records as any[]).map(async (bridge) => {
      // Initialize links array
      const links: string[] = [];
      let historicalName = bridge.name || 'Bridge';
      let englishName = bridge.name || 'Bridge';
      let historicalDescription = '';
      
      // If bridge has a LandId, fetch the polygon data
      if (bridge.landId) {
        try {
          // Get API base URL from environment variables, with a default fallback
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                        (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
            
          // Use URL constructor to ensure proper URL formatting
          const polygonUrl = new URL(`/api/polygons/${bridge.landId}`, baseUrl).toString();
          const response = await fetch(polygonUrl);
            
          if (response.ok) {
            const polygonData = await response.json();
            
            // Check if the polygon has bridgePoints with connection information
            if (polygonData.bridgePoints && Array.isArray(polygonData.bridgePoints)) {
              // Find the bridge point that matches this bridge's position
              const matchingBridgePoint = polygonData.bridgePoints.find((bp: any) => {
                if (!bp.edge || !bridge.position) return false;
                
                // Use a small threshold for floating point comparison
                const threshold = 0.0001;
                return Math.abs(bp.edge.lat - bridge.position.lat) < threshold && 
                       Math.abs(bp.edge.lng - bridge.position.lng) < threshold;
              });
              
              // If we found a matching bridge point with connection info, add the polygon IDs to links
              if (matchingBridgePoint && matchingBridgePoint.connection) {
                // Add the current polygon ID
                links.push(bridge.landId);
                
                // Add the target polygon ID
                if (matchingBridgePoint.connection.targetPolygonId) {
                  links.push(matchingBridgePoint.connection.targetPolygonId);
                }
                
                // Extract historical information if available
                if (matchingBridgePoint.connection.historicalName) {
                  historicalName = matchingBridgePoint.connection.historicalName;
                }
                
                if (matchingBridgePoint.connection.englishName) {
                  englishName = matchingBridgePoint.connection.englishName;
                }
                
                if (matchingBridgePoint.connection.historicalDescription) {
                  historicalDescription = matchingBridgePoint.connection.historicalDescription;
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching polygon data for bridge ${bridge.id}:`, error);
        }
      }
      
      // Return the enhanced bridge with links and historical information
      return {
        ...bridge,
        links: links.filter(Boolean), // Remove any null/undefined values
        historicalName,
        englishName,
        historicalDescription,
        distance: matchingBridgePoint && matchingBridgePoint.connection ? 
          matchingBridgePoint.connection.distance : 
          (links.length === 2 ? await calculateDistanceBetweenPolygons(links[0], links[1]) : null)
      };
    }));
    
    // Helper function to calculate distance between two polygons
    async function calculateDistanceBetweenPolygons(polygon1Id: string, polygon2Id: string): Promise<number | null> {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                      (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
        
        // Fetch both polygons
        const polygon1Response = await fetch(new URL(`/api/polygons/${polygon1Id}`, baseUrl).toString());
        const polygon2Response = await fetch(new URL(`/api/polygons/${polygon2Id}`, baseUrl).toString());
        
        if (!polygon1Response.ok || !polygon2Response.ok) {
          return null;
        }
        
        const polygon1 = await polygon1Response.json();
        const polygon2 = await polygon2Response.json();
        
        // Use centers if available
        if (polygon1.center && polygon2.center && 
            polygon1.center.lat && polygon1.center.lng && 
            polygon2.center.lat && polygon2.center.lng) {
          
          // Calculate distance using Haversine formula
          const R = 6371000; // Earth radius in meters
          const lat1 = polygon1.center.lat * Math.PI / 180;
          const lat2 = polygon2.center.lat * Math.PI / 180;
          const deltaLat = (polygon2.center.lat - polygon1.center.lat) * Math.PI / 180;
          const deltaLng = (polygon2.center.lng - polygon1.center.lng) * Math.PI / 180;
          
          const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          return R * c; // Distance in meters
        }
        
        return null;
      } catch (error) {
        console.error('Error calculating distance between polygons:', error);
        return null;
      }
    }

    return NextResponse.json({
      success: true,
      bridges: enhancedRecords
    });
  } catch (error) {
    console.error('Error in bridges API:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while fetching bridges' },
      { status: 500 }
    );
  }
}
