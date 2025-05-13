/**
 * @deprecated Use NavigationService instead which combines functionality from both navigation services
 */
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

/**
 * @deprecated Use NavigationService instead which combines functionality from both navigation services
 */
export class NavigationGraphService {
  private static instance: NavigationGraphService;
  private landNavigationGraph: NavigationGraph | null = null;
  private waterNavigationGraph: NavigationGraph | null = null;
  private loading: boolean = false;
  private error: string | null = null;
  
  /**
   * Get the singleton instance
   * @deprecated Use NavigationService.getInstance() instead
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
  private constructor() {
    console.warn('NavigationGraphService is deprecated. Use NavigationService instead.');
  }
  
  /**
   * Preload the navigation graphs from the server
   * @deprecated Use NavigationService.preloadNavigationGraphs() instead
   */
  public async preloadNavigationGraphs(): Promise<void> {
    console.warn('NavigationGraphService is deprecated. Use NavigationService instead.');
    
    // Import the NavigationService and delegate to it
    const { NavigationService } = await import('./NavigationService');
    return NavigationService.getInstance().preloadNavigationGraphs();
  }
  
  /**
   * Get the land navigation graph
   * @deprecated Use NavigationService.getLandNavigationGraph() instead
   */
  public getLandNavigationGraph(): NavigationGraph {
    console.warn('NavigationGraphService is deprecated. Use NavigationService instead.');
    
    // If we have a cached graph, return it
    if (this.landNavigationGraph) {
      return this.landNavigationGraph;
    }
    
    // Otherwise, create a minimal fallback
    return {
      metadata: { version: "fallback", nodeCount: 0, edgeCount: 0 },
      nodes: {},
      edges: {},
      enhanced: {}
    };
  }
  
  /**
   * Get the water navigation graph
   * @deprecated Use NavigationService.getWaterNavigationGraph() instead
   */
  public getWaterNavigationGraph(): NavigationGraph {
    console.warn('NavigationGraphService is deprecated. Use NavigationService instead.');
    
    // If we have a cached graph, return it
    if (this.waterNavigationGraph) {
      return this.waterNavigationGraph;
    }
    
    // Otherwise, create a minimal fallback
    return {
      metadata: { version: "fallback", nodeCount: 0, edgeCount: 0 },
      nodes: {},
      edges: {},
      enhanced: {},
      polygonToDocks: {}
    };
  }
  
  /**
   * Find a path between two polygons
   * @deprecated Use NavigationService.findPathBetweenPolygons() instead
   */
  public findPathBetweenPolygons(startPolygonId: string, endPolygonId: string): string[] {
    console.warn('NavigationGraphService is deprecated. Use NavigationService instead.');
    
    // Return empty path to encourage migration to NavigationService
    return [];
  }
  
  /**
   * Get bridge information for a path between polygons
   * @deprecated Use NavigationService.getBridgesForPath() instead
   */
  public getBridgesForPath(path: string[]): any[] {
    console.warn('NavigationGraphService is deprecated. Use NavigationService instead.');
    
    // Return empty array to encourage migration to NavigationService
    return [];
  }
  
  /**
   * Check if navigation graphs are loading
   * @deprecated Use NavigationService.isLoading() instead
   */
  public isLoading(): boolean {
    console.warn('NavigationGraphService is deprecated. Use NavigationService instead.');
    return false;
  }
  
  /**
   * Get any error that occurred during loading
   * @deprecated Use NavigationService.getError() instead
   */
  public getError(): string | null {
    console.warn('NavigationGraphService is deprecated. Use NavigationService instead.');
    return "NavigationGraphService is deprecated. Use NavigationService instead.";
  }
}
