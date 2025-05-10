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
}
