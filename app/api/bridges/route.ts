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
      
      // If bridge has a LandId, fetch the polygon data
      if (bridge.landId) {
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/polygons/${bridge.landId}`);
          
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
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching polygon data for bridge ${bridge.id}:`, error);
        }
      }
      
      // If we couldn't find links through the LandId, try to find by position
      if (links.length === 0 && bridge.position) {
        try {
          // Fetch all polygons
          const allPolygonsResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/get-polygons`);
          
          if (allPolygonsResponse.ok) {
            const allPolygonsData = await allPolygonsResponse.json();
            
            if (allPolygonsData.polygons && Array.isArray(allPolygonsData.polygons)) {
              // Find polygons that have this bridge position in their bridgePoints
              for (const polygon of allPolygonsData.polygons) {
                if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
                  const matchingBridgePoint = polygon.bridgePoints.find((bp: any) => {
                    if (!bp.edge || !bridge.position) return false;
                    
                    // Use a small threshold for floating point comparison
                    const threshold = 0.0001;
                    return Math.abs(bp.edge.lat - bridge.position.lat) < threshold && 
                           Math.abs(bp.edge.lng - bridge.position.lng) < threshold;
                  });
                  
                  if (matchingBridgePoint) {
                    // Add this polygon ID
                    if (polygon.id && !links.includes(polygon.id)) {
                      links.push(polygon.id);
                    }
                    
                    // Add the target polygon ID if available
                    if (matchingBridgePoint.connection && 
                        matchingBridgePoint.connection.targetPolygonId && 
                        !links.includes(matchingBridgePoint.connection.targetPolygonId)) {
                      links.push(matchingBridgePoint.connection.targetPolygonId);
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error finding polygons for bridge ${bridge.id} by position:`, error);
        }
      }
      
      // Return the enhanced bridge with links
      return {
        ...bridge,
        links: links.filter(Boolean) // Remove any null/undefined values
      };
    }));
    
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
