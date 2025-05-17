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
                  // Ensure Position is a string before parsing
                  const positionStr = String(fields.Position);
                  position = JSON.parse(positionStr);
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
      let matchingBridgePoint = null; // Declare variable at this scope
      let orientation = 0; // Default orientation in radians

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
              matchingBridgePoint = polygonData.bridgePoints.find((bp: any) => {
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
              
                // Calculate orientation based on the polygon segment
                if (matchingBridgePoint.edge && polygonData.coordinates && polygonData.coordinates.length > 0) {
                  // Find the closest segment to the bridge point
                  const bridgePoint = matchingBridgePoint.edge;
                  let closestSegmentStart = null;
                  let closestSegmentEnd = null;
                  let minDistance = Infinity;
                
                  // Loop through polygon coordinates to find the closest segment
                  for (let i = 0; i < polygonData.coordinates.length; i++) {
                    const start = polygonData.coordinates[i];
                    const end = polygonData.coordinates[(i + 1) % polygonData.coordinates.length];
                  
                    // Calculate distance from bridge point to this segment
                    const distance = distanceToSegment(
                      bridgePoint.lat, bridgePoint.lng,
                      start.lat, start.lng,
                      end.lat, end.lng
                    );
                  
                    if (distance < minDistance) {
                      minDistance = distance;
                      closestSegmentStart = start;
                      closestSegmentEnd = end;
                    }
                  }
                
                  // If we found the closest segment, calculate orientation perpendicular to it
                  if (closestSegmentStart && closestSegmentEnd) {
                    // Calculate segment direction
                    const dx = closestSegmentEnd.lng - closestSegmentStart.lng;
                    const dy = closestSegmentEnd.lat - closestSegmentStart.lat;
                  
                    // Calculate angle of the segment
                    const segmentAngle = Math.atan2(dy, dx);
                  
                    // Perpendicular angle is segment angle + 90 degrees (π/2 radians)
                    orientation = segmentAngle + Math.PI/2;
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching polygon data for bridge ${bridge.id}:`, error);
        }
      }
  
      // Return the enhanced bridge with links, historical information, and orientation
      return {
        ...bridge,
        links: links.filter(Boolean), // Remove any null/undefined values
        historicalName,
        englishName,
        historicalDescription,
        orientation, // Add the calculated orientation
        distance: matchingBridgePoint && matchingBridgePoint.connection ? 
          matchingBridgePoint.connection.distance : 
          null
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

// Helper function to calculate distance from a point to a line segment
function distanceToSegment(
  pointLat: number, pointLng: number,
  startLat: number, startLng: number,
  endLat: number, endLng: number
): number {
  // Convert to Cartesian coordinates for simplicity
  // This is an approximation that works for small distances
  const scale = Math.cos(pointLat * Math.PI / 180);
  const x = pointLng * scale;
  const y = pointLat;
  const x1 = startLng * scale;
  const y1 = startLat;
  const x2 = endLng * scale;
  const y2 = endLat;
  
  // Calculate squared length of segment
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  
  // If segment is a point, return distance to the point
  if (l2 === 0) return Math.sqrt((x - x1) * (x - x1) + (y - y1) * (y - y1));
  
  // Calculate projection of point onto line containing segment
  const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / l2));
  
  // Calculate closest point on segment
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  
  // Return distance to closest point
  return Math.sqrt((x - projX) * (x - projX) + (y - projY) * (y - projY));
}
