import { NextResponse } from 'next/server';

interface Point {
  lat: number;
  lng: number;
}

interface Bridge {
  id: string;
  buildingId: string;
  type: string;
  position: Point;
  isConstructed: boolean;
  owner: string;
}

interface Polygon {
  id: string;
  coordinates: Point[];
  center?: Point;
  historicalName?: string;
  owner?: string;
}

interface LandGroup {
  groupId: string;
  lands: string[];
  bridges: string[];
  owner?: string; // If all lands in the group have the same owner
}

// Helper function to check if a point is inside a polygon
function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    
    const intersect = ((yi > point.lat) !== (yj > point.lat))
        && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Helper function to find which polygon contains a point
function findPolygonContainingPoint(point: Point, polygons: Polygon[]): Polygon | null {
  for (const polygon of polygons) {
    if (isPointInPolygon(point, polygon.coordinates)) {
      return polygon;
    }
  }
  return null;
}

// Helper function to calculate distance between two points
function calculateDistance(point1: Point, point2: Point): number {
  const R = 6371000; // Earth radius in meters
  const lat1 = point1.lat * Math.PI / 180;
  const lat2 = point2.lat * Math.PI / 180;
  const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
  const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;

  const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
          Math.cos(lat1) * Math.cos(lat2) *
          Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Function to build a graph of land connections via bridges
function buildLandConnectionGraph(polygons: Polygon[], bridges: Bridge[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  
  // Initialize graph with all polygons
  for (const polygon of polygons) {
    graph.set(polygon.id, new Set<string>());
  }
  
  // Add connections based on bridges
  for (const bridge of bridges) {
    // Skip bridges that aren't constructed
    if (!bridge.isConstructed) continue;
    
    // Find the polygons on either side of the bridge
    const bridgePosition = bridge.position;
    
    // We need to find the two closest polygons to this bridge
    // This is a simplification - in a real implementation, you might want to
    // use the actual bridge endpoints or more sophisticated logic
    
    // For each bridge, find the two closest polygons
    const polygonDistances: {polygon: Polygon, distance: number}[] = [];
    
    for (const polygon of polygons) {
      if (polygon.center) {
        const distance = calculateDistance(bridgePosition, polygon.center);
        polygonDistances.push({ polygon, distance });
      }
    }
    
    // Sort by distance
    polygonDistances.sort((a, b) => a.distance - b.distance);
    
    // Take the two closest polygons
    if (polygonDistances.length >= 2) {
      const polygon1 = polygonDistances[0].polygon;
      const polygon2 = polygonDistances[1].polygon;
      
      // Add bidirectional connection
      if (graph.has(polygon1.id)) {
        graph.get(polygon1.id)!.add(polygon2.id);
      }
      if (graph.has(polygon2.id)) {
        graph.get(polygon2.id)!.add(polygon1.id);
      }
    }
  }
  
  return graph;
}

// Function to find connected components (land groups) in the graph
function findConnectedComponents(graph: Map<string, Set<string>>): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];
  
  // DFS function to explore a component
  function dfs(node: string, component: string[]) {
    visited.add(node);
    component.push(node);
    
    const neighbors = graph.get(node) || new Set<string>();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, component);
      }
    }
  }
  
  // Find all connected components
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      const component: string[] = [];
      dfs(node, component);
      components.push(component);
    }
  }
  
  return components;
}

export async function GET(request: Request) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const includeUnconnected = searchParams.get('includeUnconnected') === 'true';
    const minGroupSize = parseInt(searchParams.get('minSize') || '1', 10);
    
    // Fetch all polygons
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const polygonsResponse = await fetch(`${baseUrl}/api/get-polygons`);
    if (!polygonsResponse.ok) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch polygons' },
        { status: 500 }
      );
    }
    const polygonsData = await polygonsResponse.json();
    const polygons: Polygon[] = polygonsData.polygons || [];
    
    // Fetch all bridges
    const bridgesResponse = await fetch(`${baseUrl}/api/bridges`);
    if (!bridgesResponse.ok) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch bridges' },
        { status: 500 }
      );
    }
    const bridgesData = await bridgesResponse.json();
    const bridges: Bridge[] = bridgesData.bridges || [];
    
    // Fetch land owners for additional information
    const landOwnersResponse = await fetch(`${baseUrl}/api/get-land-owners`);
    let landOwners: Record<string, string> = {};
    if (landOwnersResponse.ok) {
      const landOwnersData = await landOwnersResponse.json();
      if (landOwnersData.lands && Array.isArray(landOwnersData.lands)) {
        landOwners = landOwnersData.lands.reduce((acc: Record<string, string>, land: any) => {
          if (land.id && land.owner) {
            acc[land.id] = land.owner;
          }
          return acc;
        }, {});
      }
    }
    
    // Build the land connection graph
    const graph = buildLandConnectionGraph(polygons, bridges);
    
    // Find connected components (land groups)
    const components = findConnectedComponents(graph);
    
    // Create land groups with additional information
    const landGroups: LandGroup[] = components
      .filter(component => includeUnconnected || component.length >= minGroupSize)
      .map((component, index) => {
        // Find bridges that connect lands in this component
        const groupBridges: string[] = [];
        
        // For each pair of lands in the component, find bridges that connect them
        for (let i = 0; i < component.length; i++) {
          for (let j = i + 1; j < component.length; j++) {
            const land1 = component[i];
            const land2 = component[j];
            
            // Check if these lands are directly connected in the graph
            if (graph.get(land1)?.has(land2)) {
              // Find bridges that connect these lands
              for (const bridge of bridges) {
                if (!bridge.isConstructed) continue;
                
                const bridgePosition = bridge.position;
                const polygon1 = polygons.find(p => p.id === land1);
                const polygon2 = polygons.find(p => p.id === land2);
                
                if (polygon1 && polygon2 && polygon1.center && polygon2.center) {
                  const distToLand1 = calculateDistance(bridgePosition, polygon1.center);
                  const distToLand2 = calculateDistance(bridgePosition, polygon2.center);
                  
                  // If this bridge is close to both lands, it likely connects them
                  if (distToLand1 < 200 && distToLand2 < 200) {
                    groupBridges.push(bridge.buildingId);
                  }
                }
              }
            }
          }
        }
        
        // Check if all lands in the group have the same owner
        let groupOwner: string | undefined = undefined;
        if (component.length > 0) {
          const owners = new Set<string>();
          for (const landId of component) {
            const owner = landOwners[landId];
            if (owner) {
              owners.add(owner);
            }
          }
          
          if (owners.size === 1) {
            groupOwner = Array.from(owners)[0];
          }
        }
        
        return {
          groupId: `group_${index + 1}`,
          lands: component,
          bridges: [...new Set(groupBridges)], // Remove duplicates
          owner: groupOwner
        };
      });
    
    // Sort groups by size (largest first)
    landGroups.sort((a, b) => b.lands.length - a.lands.length);
    
    return NextResponse.json({
      success: true,
      landGroups,
      totalGroups: landGroups.length,
      totalLands: polygons.length,
      totalBridges: bridges.length,
      constructedBridges: bridges.filter(b => b.isConstructed).length
    });
  } catch (error) {
    console.error('Error in land-groups API:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while processing land groups' },
      { status: 500 }
    );
  }
}
