import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Helper function to check if two line segments intersect
function doLineSegmentsIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): boolean {
  // Calculate the direction of the lines
  const d1x = x2 - x1;
  const d1y = y2 - y1;
  const d2x = x4 - x3;
  const d2y = y4 - y3;

  // Calculate the determinant
  const det = d1x * d2y - d1y * d2x;
  
  // If determinant is zero, lines are parallel
  if (det === 0) return false;

  // Calculate the parameters for the intersection point
  const s = (d1x * (y1 - y3) - d1y * (x1 - x3)) / det;
  const t = (d2x * (y1 - y3) - d2y * (x1 - x3)) / det;

  // Check if the intersection point is within both line segments
  return s >= 0 && s <= 1 && t >= 0 && t <= 1;
}

// Debug logging function
function debugLog(message: string, ...args: any[]) {
  const DEBUG = true; // Set to false in production
  if (DEBUG) {
    console.log(`[TRANSPORT] ${message}`, ...args);
  }
}

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
  canalPoints?: BridgePoint[];
}

interface GraphNode {
  id: string;
  position: Point;
  type: 'building' | 'bridge' | 'centroid' | 'canal';
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
  
  // Extract all canal points for later use
  const allCanalPoints: {point: Point, id: string, polygonId: string}[] = [];
  for (const polygon of polygons) {
    if (polygon.canalPoints) {
      for (const point of polygon.canalPoints) {
        if (point.edge) {
          const pointId = point.id || `canal-${point.edge.lat}-${point.edge.lng}`;
          allCanalPoints.push({
            point: point.edge,
            id: pointId,
            polygonId: polygon.id
          });
        }
      }
    }
  }
  



  // Create a function to check if a line between two points intersects any land polygon
  const doesLineIntersectLand = (point1: Point, point2: Point): boolean => {
    // For each polygon, check if the line intersects any of its edges
    for (const polygon of polygons) {
      const coords = polygon.coordinates;
      if (!coords || coords.length < 3) continue;

      // Check if either point is inside the polygon (except for canal points)
      const isPoint1Canal = allCanalPoints.some(cp => 
        Math.abs(cp.point.lat - point1.lat) < 0.0001 && 
        Math.abs(cp.point.lng - point1.lng) < 0.0001
      );
      
      const isPoint2Canal = allCanalPoints.some(cp => 
        Math.abs(cp.point.lat - point2.lat) < 0.0001 && 
        Math.abs(cp.point.lng - point2.lng) < 0.0001
      );

      // If both points are canal points, they're valid connections
      if (isPoint1Canal && isPoint2Canal) {
        continue;
      }

      // Check if the line intersects any polygon edge
      for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
        const intersects = doLineSegmentsIntersect(
          point1.lng, point1.lat, 
          point2.lng, point2.lat,
          coords[j].lng, coords[j].lat, 
          coords[i].lng, coords[i].lat
        );
        
        if (intersects) {
          return true;
        }
      }
    }
    return false;
  };



  // Add nodes for each polygon's centroid, building points, bridge points, and canal points
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
    
    // Add canal point nodes
    if (polygon.canalPoints) {
      for (const point of polygon.canalPoints) {
        if (point.edge) {
          const pointId = point.id || `canal-${point.edge.lat}-${point.edge.lng}`;
          graph.nodes[pointId] = {
            id: pointId,
            position: point.edge,
            type: 'canal',
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
        
        // Skip canal-to-non-canal connections (canal points should only connect to other canal points)
        if ((node1.type === 'canal' && node2.type !== 'canal') || 
            (node1.type !== 'canal' && node2.type === 'canal')) {
          continue;
        }
        
        const distance = calculateDistance(node1.position, node2.position);
        
        // Calculate weight based on node types - water travel is twice as fast
        let weight = distance;
        
        // If both nodes are canal points, reduce the weight by half (making water travel twice as fast)
        if (node1.type === 'canal' && node2.type === 'canal') {
          weight = distance / 2;
        }
        
        // Add bidirectional edges
        graph.edges[node1.id].push({
          from: node1.id,
          to: node2.id,
          weight: weight
        });
        
        graph.edges[node2.id].push({
          from: node2.id,
          to: node1.id,
          weight: weight
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
  
  // Connect canal points across polygons, but only if they don't cross land
  const canalNodes = Object.values(graph.nodes).filter(node => node.type === 'canal');
  
  for (let i = 0; i < canalNodes.length; i++) {
    const canalNode1 = canalNodes[i];
    
    for (let j = 0; j < canalNodes.length; j++) {
      // Allow connections to all canal nodes, not just those with higher indices
      if (i === j) continue; // Skip self-connections
      
      const canalNode2 = canalNodes[j];
      
      // Skip if they're in the same polygon (already connected above)
      if (canalNode1.polygonId === canalNode2.polygonId) {
        continue;
      }
      
      // Calculate distance between canal points
      const distance = calculateDistance(canalNode1.position, canalNode2.position);
      
      // Increase maximum distance further and reduce minimum distance
      if (distance > 5 && distance < 500) {
        // Skip if the line between these points would cross land
        if (doesLineIntersectLand(canalNode1.position, canalNode2.position)) {
          continue;
        }
        
        // Water travel is twice as fast, so divide the weight by 2
        const weight = distance / 2;
        
        // Add bidirectional edges
        graph.edges[canalNode1.id].push({
          from: canalNode1.id,
          to: canalNode2.id,
          weight: weight
        });
        
        graph.edges[canalNode2.id].push({
          from: canalNode2.id,
          to: canalNode1.id,
          weight: weight
        });
      }
    }
  }
  
  return graph;
}

// Function to build canal network
function buildCanalNetwork(polygons: Polygon[]): Record<string, Point[]> {
  // Create a map of canal segments
  const canalNetwork: Record<string, Point[]> = {};

  // Extract all canal points
  const allCanalPoints: {point: Point, id: string, polygonId: string}[] = [];

  // First, collect all canal points
  for (const polygon of polygons) {
    if (polygon.canalPoints) {
      for (const point of polygon.canalPoints) {
        if (point.edge) {
          const pointId = point.id || `canal-${point.edge.lat}-${point.edge.lng}`;
          allCanalPoints.push({
            point: point.edge,
            id: pointId,
            polygonId: polygon.id
          });
        }
      }
    }
  }

  // Create a function to check if a line between two points intersects any land polygon
  const doesLineIntersectLand = (point1: Point, point2: Point): boolean => {
    // For each polygon, check if the line intersects any of its edges
    for (const polygon of polygons) {
      const coords = polygon.coordinates;
      if (!coords || coords.length < 3) continue;

      // Check if either point is inside the polygon (except for canal points)
      const isPoint1Canal = allCanalPoints.some(cp => 
        Math.abs(cp.point.lat - point1.lat) < 0.0001 && 
        Math.abs(cp.point.lng - point1.lng) < 0.0001
      );
      
      const isPoint2Canal = allCanalPoints.some(cp => 
        Math.abs(cp.point.lat - point2.lat) < 0.0001 && 
        Math.abs(cp.point.lng - point2.lng) < 0.0001
      );

      // If both points are canal points, they're valid connections
      if (isPoint1Canal && isPoint2Canal) {
        continue;
      }

      // Check if the line intersects any polygon edge
      for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
        const intersects = doLineSegmentsIntersect(
          point1.lng, point1.lat, 
          point2.lng, point2.lat,
          coords[j].lng, coords[j].lat, 
          coords[i].lng, coords[i].lat
        );
        
        if (intersects) {
          return true;
        }
      }
    }
    return false;
  };


  // For each polygon, create canal segments
  for (const polygon of polygons) {
    if (!polygon.canalPoints || polygon.canalPoints.length < 2) continue;

    // Get all canal points for this polygon
    const polygonCanalPoints = polygon.canalPoints
      .filter(p => p.edge)
      .map(p => ({
        point: p.edge,
        id: p.id || `canal-${p.edge.lat}-${p.edge.lng}`
      }));

    // Create segments between consecutive canal points
    for (let i = 0; i < polygonCanalPoints.length; i++) {
      for (let j = i + 1; j < polygonCanalPoints.length; j++) {
        const point1 = polygonCanalPoints[i];
        const point2 = polygonCanalPoints[j];

        // Skip if the line between these points would cross land
        if (doesLineIntersectLand(point1.point, point2.point)) {
          continue;
        }

        // Create a unique ID for this canal segment
        const segmentId = `canal-segment-${point1.id}-${point2.id}`;

        // Create a path between these two points
        canalNetwork[segmentId] = [point1.point, point2.point];
      }
    }
  }

  // Connect canal points across polygons, but only if they don't cross land
  for (let i = 0; i < allCanalPoints.length; i++) {
    const point1 = allCanalPoints[i];
    
    for (let j = 0; j < allCanalPoints.length; j++) {
      // Allow connections to all canal points, not just those with higher indices
      if (i === j) continue; // Skip self-connections
      
      const point2 = allCanalPoints[j];
      
      // Skip if they're in the same polygon (already handled above)
      if (point1.polygonId === point2.polygonId) continue;
      
      // Calculate distance
      const distance = calculateDistance(point1.point, point2.point);
      
      // Increase maximum distance further and reduce minimum distance
      if (distance > 5 && distance < 500) {
        // Skip if the line between these points would cross land
        if (doesLineIntersectLand(point1.point, point2.point)) {
          continue;
        }
        
        const segmentId = `canal-segment-cross-${point1.id}-${point2.id}`;
        canalNetwork[segmentId] = [point1.point, point2.point];
      }
    }
  }

  return canalNetwork;
}

// Function to enhance path with canal segments
function enhancePathWithCanalSegments(pathPoints: any[], canalNetwork: Record<string, Point[]>): any[] {
  const enhancedPath: any[] = [];

  // Add the starting point
  if (pathPoints.length > 0) {
    enhancedPath.push(pathPoints[0]);
  }

  // Process each segment of the path
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const point1 = pathPoints[i];
    const point2 = pathPoints[i + 1];

    // If both points are canal points, try to find a canal path between them
    if (point1.type === 'canal' && point2.type === 'canal' && point1.transportMode === 'gondola') {
      // Look for a canal segment that connects these points
      let canalSegmentFound = false;

      for (const [segmentId, segmentPoints] of Object.entries(canalNetwork)) {
        const startPoint = segmentPoints[0];
        const endPoint = segmentPoints[segmentPoints.length - 1];

        // Check if this segment connects our points (approximately)
        const threshold = 0.0001; // Small threshold for floating point comparison

        const startMatches =
          (Math.abs(startPoint.lat - point1.lat) < threshold &&
           Math.abs(startPoint.lng - point1.lng) < threshold) ||
          (Math.abs(startPoint.lat - point2.lat) < threshold &&
           Math.abs(startPoint.lng - point2.lng) < threshold);

        const endMatches =
          (Math.abs(endPoint.lat - point1.lat) < threshold &&
           Math.abs(endPoint.lng - point1.lng) < threshold) ||
          (Math.abs(endPoint.lat - point2.lat) < threshold &&
           Math.abs(endPoint.lng - point2.lng) < threshold);

        if (startMatches && endMatches) {
          // We found a canal segment that connects our points
          canalSegmentFound = true;

          // Add 2-3 intermediate points along the canal for a more natural curve
          const numPoints = 2 + Math.floor(Math.random() * 2); // 2 or 3 points
          
          for (let j = 1; j <= numPoints; j++) {
            const fraction = j / (numPoints + 1);
            // Add some randomness to the midpoint to create natural curves
            const jitter = 0.00005 * (Math.random() * 2 - 1);
            const midpoint = {
              lat: point1.lat + (point2.lat - point1.lat) * fraction + jitter,
              lng: point1.lng + (point2.lng - point1.lng) * fraction + jitter,
              type: 'canal',
              transportMode: 'gondola',
              isIntermediatePoint: true
            };
            enhancedPath.push(midpoint);
          }
          break;
        }
      }

      // If no canal segment was found, add intermediate points anyway for visual appeal
      if (!canalSegmentFound) {
        // Calculate distance between points
        const distance = calculateDistance(point1, point2);
        
        // If distance is significant, add more intermediate points
        const numPoints = distance > 50 ? 3 : 2;
        
        for (let j = 1; j <= numPoints; j++) {
          const fraction = j / (numPoints + 1);
          // Add some randomness to create natural curves
          const jitter = 0.00005 * (Math.random() * 2 - 1);
          const midpoint = {
            lat: point1.lat + (point2.lat - point1.lat) * fraction + jitter,
            lng: point1.lng + (point2.lng - point1.lng) * fraction + jitter,
            type: 'canal',
            transportMode: 'gondola',
            isIntermediatePoint: true
          };
          enhancedPath.push(midpoint);
        }
      }
    } else if (point1.transportMode === 'walking') {
      // For walking paths, we can add a single intermediate point for slight curves
      if (calculateDistance(point1, point2) > 30) { // Only for longer segments
        const midpoint = {
          lat: (point1.lat + point2.lat) / 2 + (Math.random() * 0.00002 - 0.00001),
          lng: (point1.lng + point2.lng) / 2 + (Math.random() * 0.00002 - 0.00001),
          type: point1.type,
          transportMode: 'walking',
          isIntermediatePoint: true
        };
        enhancedPath.push(midpoint);
      }
    }

    // Add the endpoint of this segment
    enhancedPath.push(point2);
  }

  return enhancedPath;
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

// Function to find multiple close nodes to a given point
function findCloseNodes(point: Point, graph: Graph, polygonId?: string, limit: number = 10): string[] {
  const nodes: {id: string, distance: number}[] = [];
  
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    // If polygonId is specified, only consider nodes in that polygon
    if (polygonId && node.polygonId !== polygonId) {
      continue;
    }
    
    const distance = calculateDistance(point, node.position);
    nodes.push({ id: nodeId, distance });
  }
  
  // Sort by distance and return the closest ones
  nodes.sort((a, b) => a.distance - b.distance);
  return nodes.slice(0, limit).map(node => node.id);
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

// Helper function to check if a point is near water
function isPointNearWater(point: Point, polygons: Polygon[]): boolean {
  const WATER_PROXIMITY_THRESHOLD = 30; // meters
  
  for (const polygon of polygons) {
    if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
      for (const canalPoint of polygon.canalPoints) {
        if (canalPoint.edge) {
          const distance = calculateDistance(point, canalPoint.edge);
          if (distance < WATER_PROXIMITY_THRESHOLD) {
            return true;
          }
        }
      }
    }
  }
  
  return false;
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

// Function to find a water-only path between two points
export async function findWaterOnlyPath(startPoint: Point, endPoint: Point): Promise<any> {
  try {
    console.log('Starting water-only path calculation from', startPoint, 'to', endPoint);
    
    // Load polygons and navigation graph
    const polygons = await loadPolygons();
    console.log(`Loaded ${polygons.length} polygons for water-only pathfinding`);
    
    // Build a specialized water-only graph
    const waterGraph: Graph = {
      nodes: {},
      edges: {}
    };
    
    // Extract all canal points for the water network
    const allCanalPoints: {point: Point, id: string, polygonId: string}[] = [];
    for (const polygon of polygons) {
      if (polygon.canalPoints) {
        for (const point of polygon.canalPoints) {
          if (point.edge) {
            const pointId = point.id || `canal-${point.edge.lat}-${point.edge.lng}`;
            allCanalPoints.push({
              point: point.edge,
              id: pointId,
              polygonId: polygon.id
            });
          }
        }
      }
    }
    
    console.log(`Found ${allCanalPoints.length} canal points across all polygons`);
    
    // Add nodes for all canal points
    for (const canalPoint of allCanalPoints) {
      waterGraph.nodes[canalPoint.id] = {
        id: canalPoint.id,
        position: canalPoint.point,
        type: 'canal',
        polygonId: canalPoint.polygonId
      };
      waterGraph.edges[canalPoint.id] = [];
    }
    
    console.log(`Created ${Object.keys(waterGraph.nodes).length} nodes in water graph`);
    
    // Create a function to check if a line between two points intersects any land polygon
    const doesLineIntersectLand = (point1: Point, point2: Point): boolean => {
      // For each polygon, check if the line intersects any of its edges
      for (const polygon of polygons) {
        const coords = polygon.coordinates;
        if (!coords || coords.length < 3) continue;

        // Check if the line intersects any polygon edge
        for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
          const intersects = doLineSegmentsIntersect(
            point1.lng, point1.lat, 
            point2.lng, point2.lat,
            coords[j].lng, coords[j].lat, 
            coords[i].lng, coords[i].lat
          );
          
          if (intersects) {
            return true;
          }
        }
      }
      return false;
    };
    
    // Connect canal points if they don't cross land
    let edgesCreated = 0;
    for (let i = 0; i < allCanalPoints.length; i++) {
      const canalPoint1 = allCanalPoints[i];
      
      for (let j = 0; j < allCanalPoints.length; j++) {
        if (i === j) continue; // Skip self-connections
        
        const canalPoint2 = allCanalPoints[j];
        
        // Calculate distance between canal points
        const distance = calculateDistance(canalPoint1.point, canalPoint2.point);
        
        // Only connect points within a reasonable distance (5-500 meters)
        if (distance > 5 && distance < 500) {
          // Skip if the line between these points would cross land
          if (doesLineIntersectLand(canalPoint1.point, canalPoint2.point)) {
            continue;
          }
          
          // Add bidirectional edges
          waterGraph.edges[canalPoint1.id].push({
            from: canalPoint1.id,
            to: canalPoint2.id,
            weight: distance / 2 // Water travel is twice as fast
          });
          
          edgesCreated++;
        }
      }
    }
    
    console.log(`Created ${edgesCreated} edges in water graph`);
    
    // Find the closest canal points to the start and end points
    const startNodeIds = findCloseNodes(startPoint, waterGraph, undefined, 10)
      .filter(id => waterGraph.nodes[id].type === 'canal');
    const endNodeIds = findCloseNodes(endPoint, waterGraph, undefined, 10)
      .filter(id => waterGraph.nodes[id].type === 'canal');
    
    console.log(`Found ${startNodeIds.length} potential start nodes and ${endNodeIds.length} potential end nodes`);
    
    if (startNodeIds.length === 0) {
      console.error('No canal points found near the start point:', startPoint);
      return {
        success: false,
        error: 'Could not find suitable canal points near the start point',
        debug: {
          startPoint,
          allCanalPoints: allCanalPoints.length,
          closestCanalPoint: allCanalPoints.length > 0 ? 
            calculateDistance(startPoint, allCanalPoints[0].point) : 'No canal points available'
        }
      };
    }
    
    if (endNodeIds.length === 0) {
      console.error('No canal points found near the end point:', endPoint);
      return {
        success: false,
        error: 'Could not find suitable canal points near the end point',
        debug: {
          endPoint,
          allCanalPoints: allCanalPoints.length,
          closestCanalPoint: allCanalPoints.length > 0 ? 
            calculateDistance(endPoint, allCanalPoints[0].point) : 'No canal points available'
        }
      };
    }
    
    // Try different combinations of start and end nodes
    let bestResult = null;
    let shortestDistance = Infinity;
    let pathsAttempted = 0;
    let pathsFound = 0;
    
    console.log(`Attempting to find paths between ${startNodeIds.length} start nodes and ${endNodeIds.length} end nodes`);
    
    for (const startNodeId of startNodeIds) {
      for (const endNodeId of endNodeIds) {
        pathsAttempted++;
        const result = findShortestPath(waterGraph, startNodeId, endNodeId);
        
        if (result) {
          pathsFound++;
          if (result.distance < shortestDistance) {
            bestResult = result;
            shortestDistance = result.distance;
            console.log(`Found better path with distance ${result.distance} from ${startNodeId} to ${endNodeId}`);
          }
        }
      }
    }
    
    console.log(`Attempted ${pathsAttempted} paths, found ${pathsFound} valid paths`);
    
    if (!bestResult) {
      console.error('No water path found between any combination of nodes');
      
      // Additional debugging: check if the graph is connected
      const connectedComponents = findConnectedComponents(waterGraph);
      console.log(`Graph has ${connectedComponents.length} connected components`);
      
      // Check if start and end nodes are in the same component
      const startNodeComponent = findComponentForNode(startNodeIds[0], connectedComponents);
      const endNodeComponent = findComponentForNode(endNodeIds[0], connectedComponents);
      
      console.log(`Start node is in component ${startNodeComponent}, end node is in component ${endNodeComponent}`);
      
      return {
        success: false,
        error: 'No water path found between the points',
        debug: {
          startNodeIds,
          endNodeIds,
          totalNodes: Object.keys(waterGraph.nodes).length,
          totalEdges: Object.values(waterGraph.edges).flat().length,
          connectedComponents: connectedComponents.length,
          startNodeComponent,
          endNodeComponent,
          pathsAttempted,
          pathsFound
        }
      };
    }
    
    // Convert node IDs to actual points for the response
    const pathPoints = bestResult.path.map(nodeId => {
      const node = waterGraph.nodes[nodeId];
      
      return {
        ...node.position,
        nodeId,
        type: node.type,
        polygonId: node.polygonId,
        transportMode: 'gondola' // All points are water transport
      };
    });
    
    console.log(`Final path has ${pathPoints.length} points`);
    
    // Enhance the path with intermediate points for smoother curves
    const enhancedPath = enhanceWaterPath(pathPoints);
    
    console.log(`Enhanced path has ${enhancedPath.length} points`);
    
    // Calculate the actual travel time based on distance
    let totalWaterDistance = 0;
    
    for (let i = 0; i < enhancedPath.length - 1; i++) {
      const point1 = enhancedPath[i];
      const point2 = enhancedPath[i + 1];
      const distance = calculateDistance(point1, point2);
      totalWaterDistance += distance;
    }
    
    // Assuming gondola speed of 10 km/h
    const waterTimeHours = totalWaterDistance / 1000 / 10;
    const totalTimeMinutes = Math.round(waterTimeHours * 60);
    
    console.log(`Total water distance: ${totalWaterDistance}m, estimated time: ${totalTimeMinutes} minutes`);
    
    return {
      success: true,
      path: enhancedPath,
      distance: totalWaterDistance,
      walkingDistance: 0,
      waterDistance: totalWaterDistance,
      estimatedTimeMinutes: totalTimeMinutes,
      waterOnly: true
    };
  } catch (error) {
    console.error('Error finding water-only path:', error);
    return {
      success: false,
      error: 'An error occurred while finding the water-only path',
      errorDetails: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    };
  }
}

// Function to enhance water paths with intermediate points
function enhanceWaterPath(pathPoints: any[]): any[] {
  const enhancedPath: any[] = [];
  
  // Add the starting point
  if (pathPoints.length > 0) {
    enhancedPath.push(pathPoints[0]);
  }
  
  // Process each segment of the path
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const point1 = pathPoints[i];
    const point2 = pathPoints[i + 1];
    
    // Calculate distance between points
    const distance = calculateDistance(point1, point2);
    
    // Add more intermediate points for longer segments
    const numPoints = distance > 50 ? 3 : 2;
    
    for (let j = 1; j <= numPoints; j++) {
      const fraction = j / (numPoints + 1);
      // Add some randomness to create natural curves
      const jitter = 0.00005 * (Math.random() * 2 - 1);
      const midpoint = {
        lat: point1.lat + (point2.lat - point1.lat) * fraction + jitter,
        lng: point1.lng + (point2.lng - point1.lng) * fraction + jitter,
        type: 'canal',
        transportMode: 'gondola',
        isIntermediatePoint: true
      };
      enhancedPath.push(midpoint);
    }
    
    // Add the endpoint of this segment
    enhancedPath.push(point2);
  }
  
  return enhancedPath;
}

// Main function to find the path between two points
async function findPath(startPoint: Point, endPoint: Point): Promise<any> {
  try {
    // Load polygons and navigation graph
    const polygons = await loadPolygons();
    
    // Check if both points are near canal points (water)
    const isStartNearWater = isPointNearWater(startPoint, polygons);
    const isEndNearWater = isPointNearWater(endPoint, polygons);
    
    // If both points are near water, use water-only pathfinding
    if (isStartNearWater && isEndNearWater) {
      debugLog('Both start and end points are near water, using water-only pathfinding');
      return findWaterOnlyPath(startPoint, endPoint);
    }
    
    const navGraph = await loadNavigationGraph();
    
    // Build the graph
    const graph = buildGraph(polygons);
    
    // Build the canal network
    const canalNetwork = buildCanalNetwork(polygons);
    
    // Find the polygons containing the start and end points
    const startPolygon = findPolygonContainingPoint(startPoint, polygons);
    const endPolygon = findPolygonContainingPoint(endPoint, polygons);
    
    // If either point is not within a polygon but both are near water, use water-only pathfinding
    if ((!startPolygon || !endPolygon) && isStartNearWater && isEndNearWater) {
      debugLog('Points not within polygons but both near water, using water-only pathfinding');
      return findWaterOnlyPath(startPoint, endPoint);
    }
    
    if (!startPolygon || !endPolygon) {
      return {
        success: false,
        error: 'Start or end point is not within any polygon'
      };
    }
    
    // Find the closest nodes to the start and end points
    debugLog(`Starting path finding from ${startPoint.lat},${startPoint.lng} to ${endPoint.lat},${endPoint.lng}`);
    debugLog(`Found ${Object.keys(graph.nodes).length} nodes and ${Object.values(graph.edges).flat().length} edges`);
    
    const startNodeIds = findCloseNodes(startPoint, graph, startPolygon.id, 10);
    const endNodeIds = findCloseNodes(endPoint, graph, endPolygon.id, 10);
    
    if (startNodeIds.length === 0 || endNodeIds.length === 0) {
      return {
        success: false,
        error: 'Could not find suitable nodes near the start or end points'
      };
    }
    
    // Try different combinations of start and end nodes
    let bestResult = null;
    let shortestDistance = Infinity;
    
    for (const startNodeId of startNodeIds) {
      for (const endNodeId of endNodeIds) {
        const result = findShortestPath(graph, startNodeId, endNodeId);
        
        if (result && result.distance < shortestDistance) {
          bestResult = result;
          shortestDistance = result.distance;
        }
      }
    }
    
    if (!bestResult) {
      debugLog('No path found with nodes in the same polygon, trying nodes from nearby polygons');
      
      // Try nodes from any polygon
      const startNodeIdsAny = findCloseNodes(startPoint, graph, undefined, 15);
      const endNodeIdsAny = findCloseNodes(endPoint, graph, undefined, 15);
      
      for (const startNodeId of startNodeIdsAny) {
        for (const endNodeId of endNodeIdsAny) {
          const result = findShortestPath(graph, startNodeId, endNodeId);
          
          if (result && result.distance < shortestDistance) {
            bestResult = result;
            shortestDistance = result.distance;
          }
        }
      }
    }
    
    if (!bestResult) {
      const nodeInfo = {
        startNodeIds,
        endNodeIds,
        startPolygon: startPolygon.id,
        endPolygon: endPolygon.id,
        totalNodes: Object.keys(graph.nodes).length,
        totalEdges: Object.values(graph.edges).flat().length,
        canalNodes: Object.values(graph.nodes).filter(n => n.type === 'canal').length
      };
      
      debugLog('No path found between any combination of nodes:', nodeInfo);
      
      return {
        success: false,
        error: 'No path found between the points',
        debug: nodeInfo
      };
    }
    
    // Use bestResult instead of result for the rest of the function
    const result = bestResult;
    
    // Convert node IDs to actual points for the response
    const pathPoints = result.path.map((nodeId, index) => {
      const node = graph.nodes[nodeId];
      
      // Determine transport mode between this node and the next
      let transportMode = 'walking';
      if (index < result.path.length - 1) {
        const nextNodeId = result.path[index + 1];
        const nextNode = graph.nodes[nextNodeId];
        
        if (node.type === 'canal' && nextNode.type === 'canal') {
          transportMode = 'gondola';
        }
      }
      
      return {
        ...node.position,
        nodeId,
        type: node.type,
        polygonId: node.polygonId,
        transportMode
      };
    });
    
    // Enhance the path with canal segments
    const enhancedPath = enhancePathWithCanalSegments(pathPoints, canalNetwork);
    
    // Calculate the actual travel time based on distance and mode
    let totalWalkingDistance = 0;
    let totalWaterDistance = 0;
    
    for (let i = 0; i < enhancedPath.length - 1; i++) {
      const point1 = enhancedPath[i];
      const point2 = enhancedPath[i + 1];
      const distance = calculateDistance(point1, point2);
      
      if (point1.transportMode === 'gondola') {
        totalWaterDistance += distance;
      } else {
        totalWalkingDistance += distance;
      }
    }
    
    // Assuming walking speed of 5 km/h and gondola speed of 10 km/h
    const walkingTimeHours = totalWalkingDistance / 1000 / 5;
    const waterTimeHours = totalWaterDistance / 1000 / 10;
    const totalTimeMinutes = (walkingTimeHours + waterTimeHours) * 60;
    
    return {
      success: true,
      path: enhancedPath,
      distance: totalWalkingDistance + totalWaterDistance,
      walkingDistance: totalWalkingDistance,
      waterDistance: totalWaterDistance,
      estimatedTimeMinutes: Math.round(totalTimeMinutes),
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

// Helper function to find connected components in the graph
function findConnectedComponents(graph: Graph): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];
  
  for (const nodeId in graph.nodes) {
    if (!visited.has(nodeId)) {
      const component: string[] = [];
      dfs(nodeId, component);
      components.push(component);
    }
  }
  
  function dfs(nodeId: string, component: string[]) {
    visited.add(nodeId);
    component.push(nodeId);
    
    for (const edge of graph.edges[nodeId] || []) {
      if (!visited.has(edge.to)) {
        dfs(edge.to, component);
      }
    }
  }
  
  return components;
}

// Helper function to find which component a node belongs to
function findComponentForNode(nodeId: string, components: string[][]): number {
  for (let i = 0; i < components.length; i++) {
    if (components[i].includes(nodeId)) {
      return i;
    }
  }
  return -1;
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
    let result = await findPath(startPoint, endPoint);
    
    // If regular pathfinding failed with "not within any polygon" error, try water-only pathfinding
    if (!result.success && result.error === 'Start or end point is not within any polygon') {
      console.log('Regular pathfinding failed, attempting water-only pathfinding as fallback');
      result = await findWaterOnlyPath(startPoint, endPoint);
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in transport route:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred while processing the request' },
      { status: 500 }
    );
  }
}
