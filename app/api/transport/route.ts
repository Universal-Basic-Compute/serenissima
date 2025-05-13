import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Simple priority queue implementation
class PriorityQueue<T> {
  private items: { element: T, priority: number }[] = [];

  enq(element: T, priority: number): void {
    this.items.push({ element, priority });
    // Sort by priority (lower values have higher priority)
    this.items.sort((a, b) => a.priority - b.priority);
  }

  deq(): T | undefined {
    if (this.isEmpty()) {
      return undefined;
    }
    return this.items.shift()?.element;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}

// Define types for our graph
interface Point {
  lat: number;
  lng: number;
}

interface BridgePoint {
  edge: Point;
  connection?: {
    targetPolygonId: string;
    targetPoint: Point;
    distance: number;
  };
  id?: string;
}

interface BuildingPoint {
  lat: number;
  lng: number;
  id?: string;
}

interface Polygon {
  id: string;
  coordinates: Point[];
  bridgePoints: BridgePoint[];
  buildingPoints: BuildingPoint[];
  centroid?: Point;
}

interface GraphNode {
  id: string;
  position: Point;
  type: 'building' | 'bridge' | 'centroid';
  polygonId: string;
}

interface GraphEdge {
  from: string;
  to: string;
  weight: number;
}

interface Graph {
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge[]>;
}

// Function to load all polygons
async function loadPolygons(): Promise<Polygon[]> {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const files = fs.readdirSync(dataDir).filter(file => 
      file.startsWith('polygon-') && file.endsWith('.json')
    );
    
    const polygons: Polygon[] = [];
    
    for (const file of files) {
      const filePath = path.join(dataDir, file);
      const data = fs.readFileSync(filePath, 'utf8');
      const polygon = JSON.parse(data);
      
      // Ensure the polygon has an id
      if (!polygon.id) {
        polygon.id = path.basename(file, '.json');
      }
      
      polygons.push(polygon);
    }
    
    return polygons;
  } catch (error) {
    console.error('Error loading polygons:', error);
    return [];
  }
}

// Function to load the navigation graph
async function loadNavigationGraph(): Promise<any> {
  try {
    const filePath = path.join(process.cwd(), 'data', 'navigation-graph.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading navigation graph:', error);
    return null;
  }
}

// Function to calculate distance between two points
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

// Function to build the graph from polygons
function buildGraph(polygons: Polygon[]): Graph {
  const graph: Graph = {
    nodes: {},
    edges: {}
  };
  
  // Add nodes for each polygon's centroid, building points, and bridge points
  for (const polygon of polygons) {
    // Add centroid node
    if (polygon.centroid) {
      const centroidId = `centroid-${polygon.id}`;
      graph.nodes[centroidId] = {
        id: centroidId,
        position: polygon.centroid,
        type: 'centroid',
        polygonId: polygon.id
      };
      graph.edges[centroidId] = [];
    }
    
    // Add building point nodes
    if (polygon.buildingPoints) {
      for (const point of polygon.buildingPoints) {
        const pointId = point.id || `building-${point.lat}-${point.lng}`;
        graph.nodes[pointId] = {
          id: pointId,
          position: { lat: point.lat, lng: point.lng },
          type: 'building',
          polygonId: polygon.id
        };
        graph.edges[pointId] = [];
      }
    }
    
    // Add bridge point nodes
    if (polygon.bridgePoints) {
      for (const point of polygon.bridgePoints) {
        if (point.edge) {
          const pointId = point.id || `bridge-${point.edge.lat}-${point.edge.lng}`;
          graph.nodes[pointId] = {
            id: pointId,
            position: point.edge,
            type: 'bridge',
            polygonId: polygon.id
          };
          graph.edges[pointId] = [];
        }
      }
    }
  }
  
  // Connect nodes within each polygon
  for (const polygon of polygons) {
    const polygonNodes = Object.values(graph.nodes).filter(node => node.polygonId === polygon.id);
    
    // Connect each node to every other node in the same polygon
    for (let i = 0; i < polygonNodes.length; i++) {
      const node1 = polygonNodes[i];
      
      for (let j = i + 1; j < polygonNodes.length; j++) {
        const node2 = polygonNodes[j];
        const distance = calculateDistance(node1.position, node2.position);
        
        // Add bidirectional edges
        graph.edges[node1.id].push({
          from: node1.id,
          to: node2.id,
          weight: distance
        });
        
        graph.edges[node2.id].push({
          from: node2.id,
          to: node1.id,
          weight: distance
        });
      }
    }
  }
  
  // Connect bridge points between polygons
  for (const polygon of polygons) {
    if (polygon.bridgePoints) {
      for (const bridgePoint of polygon.bridgePoints) {
        if (bridgePoint.connection && bridgePoint.edge) {
          const sourcePointId = bridgePoint.id || `bridge-${bridgePoint.edge.lat}-${bridgePoint.edge.lng}`;
          
          // Find the target polygon
          const targetPolygon = polygons.find(p => p.id === bridgePoint.connection?.targetPolygonId);
          
          if (targetPolygon) {
            // Find the corresponding bridge point in the target polygon
            const targetBridgePoint = targetPolygon.bridgePoints.find(bp => 
              bp.connection?.targetPolygonId === polygon.id &&
              bp.edge && 
              Math.abs(bp.edge.lat - bridgePoint.connection.targetPoint.lat) < 0.0001 &&
              Math.abs(bp.edge.lng - bridgePoint.connection.targetPoint.lng) < 0.0001
            );
            
            if (targetBridgePoint && targetBridgePoint.edge) {
              const targetPointId = targetBridgePoint.id || `bridge-${targetBridgePoint.edge.lat}-${targetBridgePoint.edge.lng}`;
              
              // Add bidirectional edges between the bridge points
              const distance = bridgePoint.connection.distance || 
                calculateDistance(bridgePoint.edge, bridgePoint.connection.targetPoint);
              
              graph.edges[sourcePointId].push({
                from: sourcePointId,
                to: targetPointId,
                weight: distance
              });
              
              // Ensure the target point has an edges array
              if (!graph.edges[targetPointId]) {
                graph.edges[targetPointId] = [];
              }
              
              graph.edges[targetPointId].push({
                from: targetPointId,
                to: sourcePointId,
                weight: distance
              });
            }
          }
        }
      }
    }
  }
  
  return graph;
}

// Function to find the closest node to a given point
function findClosestNode(point: Point, graph: Graph, polygonId?: string): string | null {
  let closestNode: string | null = null;
  let minDistance = Infinity;
  
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    // If polygonId is specified, only consider nodes in that polygon
    if (polygonId && node.polygonId !== polygonId) {
      continue;
    }
    
    const distance = calculateDistance(point, node.position);
    if (distance < minDistance) {
      minDistance = distance;
      closestNode = nodeId;
    }
  }
  
  return closestNode;
}

// Function to find the polygon containing a point
function findPolygonContainingPoint(point: Point, polygons: Polygon[]): Polygon | null {
  for (const polygon of polygons) {
    if (isPointInPolygon(point, polygon.coordinates)) {
      return polygon;
    }
  }
  return null;
}

// Function to check if a point is inside a polygon
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

// Dijkstra's algorithm to find the shortest path
function findShortestPath(graph: Graph, startNodeId: string, endNodeId: string): { path: string[], distance: number } | null {
  // Initialize distances with Infinity
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const visited: Set<string> = new Set();
  
  // Create a priority queue
  const queue = new PriorityQueue<string>();
  
  // Initialize all distances as Infinity
  for (const nodeId in graph.nodes) {
    distances[nodeId] = Infinity;
    previous[nodeId] = null;
  }
  
  // Distance from start to itself is 0
  distances[startNodeId] = 0;
  queue.enq(startNodeId, 0);
  
  while (!queue.isEmpty()) {
    const nodeId = queue.deq();
    if (!nodeId) break;
    
    // If we've reached the end node, we're done
    if (nodeId === endNodeId) {
      break;
    }
    
    // Skip if we've already processed this node
    if (visited.has(nodeId)) {
      continue;
    }
    
    visited.add(nodeId);
    
    // Process all neighbors
    for (const edge of graph.edges[nodeId] || []) {
      const neighbor = edge.to;
      const weight = edge.weight;
      
      // Calculate new distance
      const distance = distances[nodeId] + weight;
      
      // If we found a better path, update it
      if (distance < distances[neighbor]) {
        distances[neighbor] = distance;
        previous[neighbor] = nodeId;
        queue.enq(neighbor, distance);
      }
    }
  }
  
  // If end node is not reachable
  if (distances[endNodeId] === Infinity) {
    return null;
  }
  
  // Reconstruct the path
  const path: string[] = [];
  let current = endNodeId;
  
  while (current !== null) {
    path.unshift(current);
    current = previous[current] || null;
  }
  
  return {
    path,
    distance: distances[endNodeId]
  };
}

// Main function to find the path between two points
async function findPath(startPoint: Point, endPoint: Point): Promise<any> {
  try {
    // Load polygons and navigation graph
    const polygons = await loadPolygons();
    const navGraph = await loadNavigationGraph();
    
    // Build the graph
    const graph = buildGraph(polygons);
    
    // Find the polygons containing the start and end points
    const startPolygon = findPolygonContainingPoint(startPoint, polygons);
    const endPolygon = findPolygonContainingPoint(endPoint, polygons);
    
    if (!startPolygon || !endPolygon) {
      return {
        success: false,
        error: 'Start or end point is not within any polygon'
      };
    }
    
    // Find the closest nodes to the start and end points
    const startNodeId = findClosestNode(startPoint, graph, startPolygon.id);
    const endNodeId = findClosestNode(endPoint, graph, endPolygon.id);
    
    if (!startNodeId || !endNodeId) {
      return {
        success: false,
        error: 'Could not find suitable nodes near the start or end points'
      };
    }
    
    // Find the shortest path
    const result = findShortestPath(graph, startNodeId, endNodeId);
    
    if (!result) {
      return {
        success: false,
        error: 'No path found between the points'
      };
    }
    
    // Convert node IDs to actual points for the response
    const pathPoints = result.path.map(nodeId => {
      const node = graph.nodes[nodeId];
      return {
        ...node.position,
        nodeId,
        type: node.type,
        polygonId: node.polygonId
      };
    });
    
    return {
      success: true,
      path: pathPoints,
      distance: result.distance,
      startPolygon: startPolygon.id,
      endPolygon: endPolygon.id
    };
  } catch (error) {
    console.error('Error finding path:', error);
    return {
      success: false,
      error: 'An error occurred while finding the path'
    };
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Get start and end points from query parameters
    const startLat = parseFloat(searchParams.get('startLat') || '');
    const startLng = parseFloat(searchParams.get('startLng') || '');
    const endLat = parseFloat(searchParams.get('endLat') || '');
    const endLng = parseFloat(searchParams.get('endLng') || '');
    
    // Validate parameters
    if (isNaN(startLat) || isNaN(startLng) || isNaN(endLat) || isNaN(endLng)) {
      return NextResponse.json(
        { success: false, error: 'Invalid coordinates. Please provide valid startLat, startLng, endLat, and endLng parameters.' },
        { status: 400 }
      );
    }
    
    const startPoint = { lat: startLat, lng: startLng };
    const endPoint = { lat: endLat, lng: endLng };
    
    // Find the path
    const result = await findPath(startPoint, endPoint);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in transport route:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while processing the request' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Get start and end points from request body
    const { startPoint, endPoint } = body;
    
    // Validate parameters
    if (!startPoint || !endPoint || 
        typeof startPoint.lat !== 'number' || typeof startPoint.lng !== 'number' ||
        typeof endPoint.lat !== 'number' || typeof endPoint.lng !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid coordinates. Please provide valid startPoint and endPoint objects with lat and lng properties.' },
        { status: 400 }
      );
    }
    
    // Find the path
    const result = await findPath(startPoint, endPoint);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in transport route:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while processing the request' },
      { status: 500 }
    );
  }
}
