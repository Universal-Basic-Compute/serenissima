export interface NavigationGraph {
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

export class NavigationGraphService {
  private static instance: NavigationGraphService;
  private landNavigationGraph: NavigationGraph | null = null;
  private waterNavigationGraph: NavigationGraph | null = null;
  private loading: boolean = false;
  private error: string | null = null;
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): NavigationGraphService {
    if (!NavigationGraphService.instance) {
      NavigationGraphService.instance = new NavigationGraphService();
    }
    return NavigationGraphService.instance;
  }
  
  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}
  
  /**
   * Preload the navigation graphs from the server
   */
  public async preloadNavigationGraphs(): Promise<void> {
    // Only run in browser
    if (typeof window === 'undefined') return;
    
    // Check if we already have the navigation graphs
    if (this.landNavigationGraph && this.waterNavigationGraph) return;
    
    // Check if they're already in the window object
    if ((window as any).__navigationGraph && (window as any).__waterNavigationGraph) {
      this.landNavigationGraph = (window as any).__navigationGraph;
      this.waterNavigationGraph = (window as any).__waterNavigationGraph;
      return;
    }
    
    this.loading = true;
    this.error = null;
    
    try {
      // Fetch the land navigation graph
      const landResponse = await fetch('/api/data/navigation-graph.json');
      if (!landResponse.ok) {
        throw new Error(`Failed to fetch land navigation graph: ${landResponse.status}`);
      }
      
      const landData = await landResponse.json();
      console.log('Preloaded land navigation graph:', landData.metadata);
      
      // Store in service and window for future use
      this.landNavigationGraph = landData;
      (window as any).__navigationGraph = landData;
      
      // Now fetch the water navigation graph
      try {
        const waterResponse = await fetch('/api/data/water-navigation-graph.json');
        if (waterResponse.ok) {
          const waterData = await waterResponse.json();
          console.log('Preloaded water navigation graph:', waterData.metadata);
          
          // Store in service and window for future use
          this.waterNavigationGraph = waterData;
          (window as any).__waterNavigationGraph = waterData;
        }
      } catch (waterError) {
        console.warn('Error fetching water navigation graph:', waterError);
        // Create a minimal fallback water navigation graph
        this.createFallbackWaterNavigationGraph();
      }
      
      this.loading = false;
    } catch (error) {
      console.warn('Error preloading navigation graphs:', error);
      
      // Create fallback navigation graphs
      this.createFallbackNavigationGraphs();
      
      this.loading = false;
      this.error = error instanceof Error ? error.message : String(error);
    }
  }
  
  /**
   * Get the land navigation graph
   */
  public getLandNavigationGraph(): NavigationGraph {
    if (!this.landNavigationGraph) {
      // Return a fallback if not loaded
      return this.createFallbackLandNavigationGraph();
    }
    return this.landNavigationGraph;
  }
  
  /**
   * Get the water navigation graph
   */
  public getWaterNavigationGraph(): NavigationGraph {
    if (!this.waterNavigationGraph) {
      // Return a fallback if not loaded
      return this.createFallbackWaterNavigationGraph();
    }
    return this.waterNavigationGraph;
  }
  
  /**
   * Find a path between two polygons that properly uses bridges
   * @param startPolygonId Starting polygon ID
   * @param endPolygonId Ending polygon ID
   * @returns Array of polygon IDs representing the path
   */
  public findPathBetweenPolygons(startPolygonId: string, endPolygonId: string): string[] {
    // Early return if start and end are the same
    if (startPolygonId === endPolygonId) {
      return [startPolygonId];
    }
    
    // Get the land navigation graph
    const landGraph = this.getLandNavigationGraph();
    
    // If we don't have a proper graph with nodes, return empty path
    if (!landGraph || !landGraph.enhanced || Object.keys(landGraph.enhanced).length === 0) {
      console.warn('No enhanced navigation graph available for path finding');
      return [];
    }
    
    // Build an adjacency list from the enhanced graph that specifically includes bridge connections
    const adjacencyList: Record<string, string[]> = {};
    
    // Initialize empty adjacency lists for all polygons
    Object.keys(landGraph.enhanced).forEach(nodeId => {
      if (nodeId.startsWith('polygon-')) {
        adjacencyList[nodeId] = [];
      }
    });
    
    // Add bridge connections to the adjacency list
    Object.entries(landGraph.enhanced).forEach(([nodeId, nodeData]) => {
      if (nodeId.startsWith('polygon-') && nodeData.bridges) {
        // For each bridge from this polygon
        nodeData.bridges.forEach((bridge: any) => {
          const targetPolygonId = bridge.targetPolygonId;
          
          // Verify the target polygon exists
          if (targetPolygonId && adjacencyList[targetPolygonId]) {
            // Add bidirectional connection if not already present
            if (!adjacencyList[nodeId].includes(targetPolygonId)) {
              adjacencyList[nodeId].push(targetPolygonId);
            }
            
            if (!adjacencyList[targetPolygonId].includes(nodeId)) {
              adjacencyList[targetPolygonId].push(nodeId);
            }
          }
        });
      }
    });
    
    // Implement A* algorithm to find the shortest path
    return this.findShortestPathAStar(adjacencyList, startPolygonId, endPolygonId);
  }
  
  /**
   * Get bridge information for a path between polygons
   * @param path Array of polygon IDs representing a path
   * @returns Array of bridge information objects
   */
  public getBridgesForPath(path: string[]): any[] {
    if (path.length < 2) return [];
    
    const landGraph = this.getLandNavigationGraph();
    if (!landGraph || !landGraph.enhanced) return [];
    
    const bridges: any[] = [];
    
    // For each consecutive pair of polygons in the path
    for (let i = 0; i < path.length - 1; i++) {
      const currentPolygonId = path[i];
      const nextPolygonId = path[i + 1];
      
      // Get the current polygon data from the enhanced graph
      const polygonData = landGraph.enhanced[currentPolygonId];
      
      if (polygonData && polygonData.bridges) {
        // Find bridges connecting to the next polygon
        const connectingBridges = polygonData.bridges.filter(
          (bridge: any) => bridge.targetPolygonId === nextPolygonId
        );
        
        if (connectingBridges.length > 0) {
          // Add the first bridge (or you could implement logic to choose the best bridge)
          bridges.push({
            fromPolygonId: currentPolygonId,
            toPolygonId: nextPolygonId,
            bridgeData: connectingBridges[0]
          });
        }
      }
    }
    
    return bridges;
  }
  
  /**
   * Check if navigation graphs are loading
   */
  public isLoading(): boolean {
    return this.loading;
  }
  
  /**
   * Get any error that occurred during loading
   */
  public getError(): string | null {
    return this.error;
  }
  
  /**
   * Create fallback navigation graphs
   */
  private createFallbackNavigationGraphs(): void {
    this.createFallbackLandNavigationGraph();
    this.createFallbackWaterNavigationGraph();
  }
  
  /**
   * Create a minimal fallback land navigation graph
   */
  private createFallbackLandNavigationGraph(): NavigationGraph {
    console.log('Creating fallback land navigation graph');
    const fallbackGraph: NavigationGraph = {
      metadata: { version: "fallback", nodeCount: 0, edgeCount: 0 },
      nodes: {},
      edges: {},
      enhanced: {}
    };
    
    // Store in service and window for future use
    this.landNavigationGraph = fallbackGraph;
    if (typeof window !== 'undefined') {
      (window as any).__navigationGraph = fallbackGraph;
    }
    
    return fallbackGraph;
  }
  
  /**
   * Create a minimal fallback water navigation graph
   */
  private createFallbackWaterNavigationGraph(): NavigationGraph {
    console.log('Creating fallback water navigation graph');
    const fallbackGraph: NavigationGraph = {
      metadata: { version: "fallback", nodeCount: 0, edgeCount: 0 },
      nodes: {},
      edges: {},
      enhanced: {},
      polygonToDocks: {}
    };
    
    // Store in service and window for future use
    this.waterNavigationGraph = fallbackGraph;
    if (typeof window !== 'undefined') {
      (window as any).__waterNavigationGraph = fallbackGraph;
    }
    
    return fallbackGraph;
  }
  
  // A* algorithm implementation
  private findShortestPathAStar(
    graph: Record<string, string[]>, 
    start: string, 
    end: string
  ): string[] {
    // Priority queue for A* - stores nodes with their priority (f-score)
    const openSet: {id: string, fScore: number}[] = [];
    
    // Set of visited nodes
    const closedSet = new Set<string>();
    
    // For each node, which node it can most efficiently be reached from
    const cameFrom: Record<string, string | null> = {};
    
    // For each node, the cost of getting from the start node to that node
    const gScore: Record<string, number> = {};
    
    // For each node, the total cost of getting from the start node to the goal by passing through that node
    const fScore: Record<string, number> = {};
    
    // Initialize all nodes with infinity scores
    for (const node in graph) {
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
      const neighbors = graph[current] || [];
      
      for (const neighbor of neighbors) {
        // Skip if we've already visited this neighbor
        if (closedSet.has(neighbor)) {
          continue;
        }
        
        // Calculate tentative g-score (cost from start to neighbor through current)
        // For simplicity, we're using 1 as the distance between any connected nodes
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
    console.log(`No path found from ${start} to ${end}`);
    return [];
  }
  
  // Reconstruct path from cameFrom map
  private reconstructPath(cameFrom: Record<string, string | null>, current: string): string[] {
    const path = [current];
    
    while (cameFrom[current]) {
      current = cameFrom[current]!;
      path.unshift(current);
    }
    
    return path;
  }
  
  // Simple heuristic distance function for A*
  private heuristicDistance(polygonId1: string, polygonId2: string): number {
    // For now, use a simple constant distance
    // In a real implementation, you would calculate the actual distance between polygon centroids
    return 1;
  }
}
