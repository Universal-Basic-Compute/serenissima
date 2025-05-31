import { NextResponse } from 'next/server';
import Airtable from 'airtable';
import { bridgeService } from '@/lib/services/BridgeService';

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
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY, requestTimeout: 30000 }).base(AIRTABLE_BASE_ID);
    
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
              
                // Calculate orientation based on the polygon data
                if (matchingBridgePoint.edge && polygonData.coordinates && polygonData.coordinates.length > 0) {
                  // If the polygon has a center, use it to calculate orientation
                  if (polygonData.center) {
                    orientation = bridgeService.calculateBridgeOrientation(
                      matchingBridgePoint.edge,
                      polygonData.center
                    );
                  }
                  // If no center or center calculation fails, use the segment method
                  else {
                    orientation = bridgeService.calculateBridgeOrientationFromSegment(
                      matchingBridgePoint.edge,
                      polygonData.coordinates
                    );
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
// Now using the BridgeService for this functionality
