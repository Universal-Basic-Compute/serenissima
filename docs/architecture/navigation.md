# Navigation Architecture

La Serenissima implements a comprehensive navigation system that allows characters and players to navigate through the city using both land and water routes. This document outlines the architecture, components, and data flow of the navigation system.

## System Overview

The navigation system follows a layered architecture with clear separation between data management, pathfinding algorithms, and visualization:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Navigation System                              │
└───────────────┬─────────────────────────────────────┬───────────────────┘
                │                                     │
┌───────────────▼───────────────┐     ┌───────────────▼───────────────────┐
│      Data Management          │     │      Pathfinding                  │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │   NavigationService     │  │     │  │     A* Algorithm           │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │  Navigation Graph Data  │  │     │  │  Directional Pathfinding   │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │   Bridge Connections    │  │     │  │     Path Optimization      │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
└───────────────────────────────┘     └────────────────────────────────────┘
                │                                     │
                │                                     │
┌───────────────▼─────────────────────────────────────▼───────────────────┐
│                         Visualization                                    │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  Path Display   │  │  Bridge Display │  │  Navigation Controls    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### NavigationService

The `NavigationService` is the central component that manages navigation data and provides pathfinding capabilities:

```typescript
export class NavigationService {
  // Singleton instance
  private static instance: NavigationService;
  
  // Data structures
  private polygons: Polygon[] = [];
  private graph: Record<string, string[]> = {};
  private nodePositions: Record<string, THREE.Vector3> = {};
  private landNavigationGraph: NavigationGraphData | null = null;
  private waterNavigationGraph: NavigationGraphData | null = null;
  
  // Public methods
  public static getInstance(): NavigationService;
  public setPolygons(polygons: BasePolygon[]): void;
  public preloadNavigationGraphs(): Promise<void>;
  public findShortestPath(start: string, end: string): string[];
  public findPathBetweenPolygons(startPolygonId: string, endPolygonId: string): string[];
  public getBridgesForPath(path: string[]): BridgeInfo[];
  public getLandNavigationGraph(): NavigationGraphData;
  public getWaterNavigationGraph(): NavigationGraphData;
  public getNodePosition(nodeId: string): THREE.Vector3 | null;
  public isLoading(): boolean;
  public getError(): string | null;
  
  // Private implementation methods
  private buildNavigationGraph(): void;
  private heuristicDistance(polygonId1: string, polygonId2: string): number;
  private reconstructPath(cameFrom: Record<string, string | null>, current: string): string[];
  private createFallbackNavigationGraphs(): void;
  private getPolygonCentroid(polygonData: any): {lat: number, lng: number} | null;
  private getPolygonBridges(polygonData: any): any[];
  private calculateDistance(point1: {lat: number, lng: number}, point2: {lat: number, lng: number}): number;
  private buildAdjacencyList(landGraph: NavigationGraphData): Record<string, string[]>;
  private findShortestPathAStar(graph: Record<string, string[]>, start: string, end: string): string[];
}
```

### Navigation Data Structures

The navigation system uses several key data structures:

1. **Polygon**: Represents a land parcel with bridge connections
   ```typescript
   interface Polygon extends BasePolygon {
     bridgePoints?: Array<{
       edge?: { lat: number; lng: number };
       connection?: {
         targetPolygonId?: string;
         targetPoint?: { lat: number; lng: number };
       };
     }>;
     dockPoints?: Array<{
       edge: { lat: number; lng: number };
       water: { lat: number; lng: number };
     }>;
   }
   ```

2. **NavigationGraphData**: Represents a pre-computed navigation graph
   ```typescript
   interface NavigationGraphData {
     metadata: {
       version: string;
       nodeCount: number;
       edgeCount: number;
     };
     nodes: Record<string, any>;
     edges: Record<string, any>;
     enhanced: Record<string, any>;
     polygonToDocks?: Record<string, any>;
   }
   ```

3. **BridgeInfo**: Represents bridge connection information
   ```typescript
   interface BridgeInfo {
     fromPolygonId: string;
     toPolygonId: string;
     bridgeData?: any;
     sourcePoint?: { lat: number; lng: number };
     targetPoint?: { lat: number; lng: number };
     isVirtual?: boolean;
   }
   ```

## Pathfinding Algorithms

The navigation system implements multiple pathfinding algorithms:

1. **A* Algorithm**: Used for finding the shortest path between two points
   - Optimized for performance with priority queue
   - Uses heuristic distance for better path finding
   - Handles disconnected graphs gracefully

2. **Directional Pathfinding**: Used for finding paths that follow a general direction
   - Uses a 180° cone to filter bridges in the direction of the destination
   - Falls back to standard A* when directional pathfinding fails
   - Optimized for natural-looking paths

## Navigation Graph Preloading

The system preloads navigation graph data for better performance:

1. **Land Navigation Graph**: Contains pre-computed paths between land parcels
2. **Water Navigation Graph**: Contains pre-computed paths for water transportation
3. **Fallback Mechanisms**: Creates minimal graphs when loading fails

## Bridge Information

The system provides detailed information about bridges along a path:

1. **Bridge Points**: Exact coordinates for bridge endpoints
2. **Virtual Bridges**: Handles cases where explicit bridge data is missing
3. **Bridge Metadata**: Historical names and descriptions for bridges

## Integration with Transport System

The navigation system integrates with the transport system:

1. **Land Transport**: Paths using bridges and roads
2. **Water Transport**: Paths using canals and docks
3. **Mixed Transport**: Paths combining land and water routes

## Error Handling

The navigation system implements robust error handling:

1. **Fallback Navigation Graphs**: Created when loading fails
2. **Path Finding Fallbacks**: Multiple algorithms with fallback mechanisms
3. **Error Reporting**: Comprehensive error reporting for debugging

## Future Extensions

The navigation system is designed for future expansion:

1. **Multi-modal Pathfinding**: Finding optimal paths combining different transportation modes
2. **Time-based Navigation**: Accounting for time of day in path selection
3. **Congestion Modeling**: Simulating traffic congestion on popular routes
4. **Seasonal Variations**: Accounting for seasonal changes in navigation options
5. **Character-specific Navigation**: Different path preferences for different character types
