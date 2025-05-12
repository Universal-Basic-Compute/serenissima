import * as THREE from 'three';
import { Polygon } from '../../components/PolygonViewer/types';

export interface PathNode {
  id: string;
  position: THREE.Vector3;
  connections: string[];
}

export interface Path {
  nodes: string[];
  distance: number;
  bridges: number;
  docks: number;
}

export class NavigationService {
  private static instance: NavigationService;
  private polygons: Polygon[] = [];
  private graph: Record<string, string[]> = {};
  private nodePositions: Record<string, THREE.Vector3> = {};

  private constructor() {}

  public static getInstance(): NavigationService {
    if (!NavigationService.instance) {
      NavigationService.instance = new NavigationService();
    }
    return NavigationService.instance;
  }

  public setPolygons(polygons: Polygon[]): void {
    this.polygons = polygons;
    this.buildNavigationGraph();
  }

  private buildNavigationGraph(): void {
    this.graph = {};
    this.nodePositions = {};

    // Initialize graph with empty adjacency lists for all polygons
    this.polygons.forEach(polygon => {
      this.graph[polygon.id] = [];

      // Store centroid position for path visualization
      if (polygon.centroid) {
        const position = new THREE.Vector3(
          polygon.centroid.lat,
          0,
          polygon.centroid.lng
        );
        this.nodePositions[polygon.id] = position;
      }
    });

    // Add bridge connections to the graph
    this.polygons.forEach(polygon => {
      if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
        polygon.bridgePoints.forEach(bridgePoint => {
          if (bridgePoint.connection && bridgePoint.connection.targetPolygonId) {
            const targetPolygonId = bridgePoint.connection.targetPolygonId;

            // Verify that the target polygon exists
            const targetPolygon = this.polygons.find(p => p.id === targetPolygonId);
            if (!targetPolygon) {
              console.warn(`Bridge from ${polygon.id} points to non-existent polygon
${targetPolygonId}`);
              return;
            }

            // Add bidirectional connection if not already present
            if (!this.graph[polygon.id].includes(targetPolygonId)) {
              this.graph[polygon.id].push(targetPolygonId);
            }

            // Ensure the target polygon exists in the graph
            if (!this.graph[targetPolygonId]) {
              this.graph[targetPolygonId] = [];
            }

            // Add the reverse connection if not already present
            if (!this.graph[targetPolygonId].includes(polygon.id)) {
              this.graph[targetPolygonId].push(polygon.id);
            }
          }
        });
      }
    });
  }

  public findShortestPath(start: string, end: string): string[] {
    if (start === end) {
      return [start];
    }

    // Use A* algorithm to find the shortest path
    const openSet: {id: string, fScore: number}[] = [];
    const closedSet = new Set<string>();
    const cameFrom: Record<string, string | null> = {};
    const gScore: Record<string, number> = {};
    const fScore: Record<string, number> = {};

    // Initialize all nodes with infinity scores
    for (const node in this.graph) {
      gScore[node] = Infinity;
      fScore[node] = Infinity;
      cameFrom[node] = null;
    }

    // The start node has zero distance from itself
    gScore[start] = 0;

    // The start node's f-score is just the heuristic distance to the end
    fScore[start] = this.heuristicDistance(start, end);

    // Add start node to the open set
    openSet.push({id: start, fScore: fScore[start]});

    // While there are nodes to explore
    while (openSet.length > 0) {
      // Sort the open set by f-score (lowest first)
      openSet.sort((a, b) => a.fScore - b.fScore);

      // Get the node with the lowest f-score
      const current = openSet.shift()!.id;

      // If we've reached the end, reconstruct and return the path
      if (current === end) {
        return this.reconstructPath(cameFrom, current);
      }

      // Mark current as visited
      closedSet.add(current);

      // Check all neighbors of current
      const neighbors = this.graph[current] || [];

      for (const neighbor of neighbors) {
        // Skip if we've already visited this neighbor
        if (closedSet.has(neighbor)) {
          continue;
        }

        // Calculate tentative g-score (cost from start to neighbor through current)
        const tentativeGScore = gScore[current] + 1;

        // Check if this neighbor is already in the open set
        const neighborInOpenSet = openSet.find(node => node.id === neighbor);

        if (!neighborInOpenSet) {
          // Discover a new node, add to open set
          openSet.push({id: neighbor, fScore: Infinity});
        } else if (tentativeGScore >= gScore[neighbor]) {
          // This is not a better path to the neighbor
          continue;
        }

        // This path to neighbor is the best so far, record it
        cameFrom[neighbor] = current;
        gScore[neighbor] = tentativeGScore;
        fScore[neighbor] = gScore[neighbor] + this.heuristicDistance(neighbor, end);

        // Update the f-score in the open set
        const index = openSet.findIndex(node => node.id === neighbor);
        if (index !== -1) {
          openSet[index].fScore = fScore[neighbor];
        }
      }
    }

    // If we get here, there's no path
    return [];
  }

  private heuristicDistance(polygonId1: string, polygonId2: string): number {
    // Find the polygons
    const polygon1 = this.polygons.find(p => p.id === polygonId1);
    const polygon2 = this.polygons.find(p => p.id === polygonId2);

    // If either polygon is not found, return a large value
    if (!polygon1 || !polygon2) {
      return 1000;
    }

    // Use centroids for distance calculation
    const centroid1 = polygon1.centroid;
    const centroid2 = polygon2.centroid;

    // If either centroid is missing, return a default value
    if (!centroid1 || !centroid2) {
      return 10;
    }

    // Calculate Euclidean distance between centroids
    const latDiff = centroid1.lat - centroid2.lat;
    const lngDiff = centroid1.lng - centroid2.lng;
    return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  }

  private reconstructPath(cameFrom: Record<string, string | null>, current: string): string[] {
    const path = [current];

    while (cameFrom[current]) {
      current = cameFrom[current]!;
      path.unshift(current);
    }

    return path;
  }

  public getNodePosition(nodeId: string): THREE.Vector3 | null {
    return this.nodePositions[nodeId] || null;
  }
}