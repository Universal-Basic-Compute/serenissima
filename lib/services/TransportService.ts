import { CoordinateService } from './CoordinateService';
import { eventBus, EventTypes } from '../utils/eventBus';

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
  type?: string;
  polygonId?: string;
  transportMode?: string;
  isIntermediatePoint?: boolean;
}

interface BridgePoint {
  edge: Point;
  connection?: {
    targetPolygonId: string;
    targetPoint: Point;
    distance: number;
  };
  id?: string;
  isConstructed?: boolean;
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
  center?: Point;
  canalPoints?: BridgePoint[];
}

interface GraphNode {
  id: string;
  position: Point;
  type: 'building' | 'bridge' | 'center' | 'canal';
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

export class TransportService {
  private static instance: TransportService | null = null;
  private transportStartPoint: {lat: number, lng: number} | null = null;
  private transportEndPoint: {lat: number, lng: number} | null = null;
  private transportPath: any[] = [];
  private calculatingPath: boolean = false;
  private waterOnlyMode: boolean = false;
  private transportMode: boolean = false;
  private polygons: Polygon[] = [];
  private graph: Graph | null = null;
  private canalNetwork: Record<string, Point[]> = {};
  private polygonsLoaded: boolean = false;
  private initializationPromise: Promise<boolean> | null = null;
  private initializationAttempts: number = 0;
  private readonly MAX_INITIALIZATION_ATTEMPTS = 5;
  private pathfindingMode: 'all' | 'real' = 'real'; // Default to 'real' mode
  private waterGraph: {
    waterPoints: {
      id: string;
      position: {
        lat: number;
        lng: number;
      };
      connections: {
        targetId: string;
        intermediatePoints: any[];
        distance: number;
        id: string;
      }[];
    }[];
  } | null = null;
  
  // Static method for initialization
  public static initialize(): Promise<boolean> {
    if (!TransportService.instance) {
      TransportService.instance = new TransportService();
    }
    return TransportService.instance.initializeService();
  }

  // Method to get the singleton instance
  public static getInstance(): TransportService {
    if (!TransportService.instance) {
      TransportService.instance = new TransportService();
    }
    return TransportService.instance;
  }

  /**
   * Get the start point for transport
   */
  public getStartPoint(): {lat: number, lng: number} | null {
    return this.transportStartPoint;
  }

  /**
   * Get the end point for transport
   */
  public getEndPoint(): {lat: number, lng: number} | null {
    return this.transportEndPoint;
  }

  /**
   * Set transport start point
   */
  public setStartPoint(point: {lat: number, lng: number} | null): void {
    this.transportStartPoint = point;
    eventBus.emit(EventTypes.TRANSPORT_START_POINT_SET, point);
  }

  /**
   * Set transport end point
   */
  public setEndPoint(point: {lat: number, lng: number} | null): void {
    this.transportEndPoint = point;
    eventBus.emit(EventTypes.TRANSPORT_END_POINT_SET, point);
    
    // If we have both start and end points, calculate the route
    if (this.transportStartPoint && point) {
      this.calculateRoute(this.transportStartPoint, point, 'real');
    }
  }

  /**
   * Set pathfinding mode
   * @param mode 'all' to use all potential points, 'real' to only use constructed infrastructure
   */
  public setPathfindingMode(mode: 'all' | 'real'): void {
    if (this.pathfindingMode !== mode) {
      console.log(`Changing pathfinding mode from ${this.pathfindingMode} to ${mode}`);
      this.pathfindingMode = mode;
      
      // Rebuild the graph with the new mode if polygons are loaded
      if (this.polygonsLoaded && this.polygons.length > 0) {
        console.log('Rebuilding graph and network with new pathfinding mode');
        this.buildGraphAndNetwork();
      }
    }
  }

  /**
   * Get current pathfinding mode
   */
  public getPathfindingMode(): 'all' | 'real' {
    return this.pathfindingMode;
  }

  /**
   * Calculate transport route
   */
  public async calculateRoute(
    start: {lat: number, lng: number}, 
    end: {lat: number, lng: number},
    mode?: 'all' | 'real'
  ): Promise<void> {
    // If mode is provided, update the pathfinding mode
    if (mode) {
      this.setPathfindingMode(mode);
    }
    
    // Set calculating state to true to show loading indicator
    this.calculatingPath = true;
    eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATING, true);
    
    try {
      console.log('Calculating transport route from', start, 'to', end);
      
      // Try to ensure polygons are loaded
      if (!this.polygonsLoaded || this.polygons.length === 0) {
        console.log('Polygons not loaded yet, initializing service...');
        const success = await this.initializeService();
        
        if (!success) {
          console.error('Failed to initialize transport service for route calculation');
          console.error(`polygonsLoaded: ${this.polygonsLoaded}, polygons.length: ${this.polygons.length}`);
          console.error(`initializationAttempts: ${this.initializationAttempts}`);
          
          // Check if window.__polygonData exists
          if (typeof window !== 'undefined') {
            const windowPolygons = (window as any).__polygonData;
            console.log(`window.__polygonData exists: ${!!windowPolygons}`);
            if (windowPolygons) {
              console.log(`window.__polygonData is array: ${Array.isArray(windowPolygons)}`);
              console.log(`window.__polygonData length: ${Array.isArray(windowPolygons) ? windowPolygons.length : 'N/A'}`);
            }
          }
          
          // Emit error event
          eventBus.emit(EventTypes.TRANSPORT_ROUTE_ERROR, 'Failed to load polygon data');
          this.transportEndPoint = null;
          return;
        }
      }
      
      // Add this check to verify polygon data is available
      console.log(`Polygon data status: loaded=${this.polygonsLoaded}, count=${this.polygons.length}`);
      
      // Try local pathfinding if polygons are loaded
      if (this.polygons.length > 0) {
        const localResult = await this.findPath(start, end);
        
        if (localResult.success) {
          this.handleSuccessfulPathfinding(localResult);
          return;
        }
        
        // If local pathfinding failed with "not within any polygon" error, try water-only pathfinding
        if (localResult.error === 'Start or end point is not within any polygon') {
          console.log('Regular pathfinding failed, attempting water-only pathfinding as fallback');
          const waterResult = await this.findWaterOnlyPath(start, end);
          
          if (waterResult.success) {
            this.handleSuccessfulWaterPathfinding(waterResult);
            return;
          }
        }
      }
      
      // If local pathfinding failed or wasn't possible, fall back to API
      await this.tryApiPathfinding(start, end);
      
    } catch (error) {
      console.error('Error calculating transport route:', error);
      
      // If all else fails, dispatch error event and reset
      eventBus.emit(EventTypes.TRANSPORT_ROUTE_ERROR, {
        error: 'Error calculating route',
        detail: 'Please try again. ' + (error instanceof Error ? error.message : String(error)),
        severity: 'error'
      });
      this.transportEndPoint = null;
    } finally {
      // Set calculating state to false to hide loading indicator
      this.calculatingPath = false;
      eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATING, false);
    }
  }

  /**
   * Handle successful pathfinding result
   */
  private handleSuccessfulPathfinding(result: any): void {
    console.log('Transport route calculated locally:', result);
    this.transportPath = result.path;
    this.waterOnlyMode = !!result.waterOnly;
    
    // Emit event with the calculated path
    eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATED, {
      path: result.path,
      waterOnly: this.waterOnlyMode
    });
    
    // Create a custom event with the path data
    const routeEvent = new CustomEvent('TRANSPORT_ROUTE_CALCULATED', {
      detail: {
        path: result.path,
        waterOnly: this.waterOnlyMode
      }
    });
    
    // Dispatch the event
    window.dispatchEvent(routeEvent);
    
    // Log the event for debugging
    console.log('Dispatched TRANSPORT_ROUTE_CALCULATED event with path data:', {
      pathLength: result.path.length,
      firstPoint: result.path[0],
      lastPoint: result.path[result.path.length - 1]
    });
  }

  /**
   * Handle successful water pathfinding result
   */
  private handleSuccessfulWaterPathfinding(result: any): void {
    console.log('Water-only transport route calculated locally:', result);
    this.transportPath = result.path;
    this.waterOnlyMode = true;
    
    // Emit event with the calculated path
    eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATED, {
      path: result.path,
      waterOnly: true
    });
    
    // Create a custom event with the path data
    const routeEvent = new CustomEvent('TRANSPORT_ROUTE_CALCULATED', {
      detail: {
        path: result.path,
        waterOnly: true
      }
    });
    
    // Dispatch the event
    window.dispatchEvent(routeEvent);
  }

  /**
   * Try to find a path using the API
   */
  private async tryApiPathfinding(start: {lat: number, lng: number}, end: {lat: number, lng: number}): Promise<void> {
    // Determine if we're running in Node.js or browser environment
    const isNode = typeof window === 'undefined';
    
    // Set base URL depending on environment
    const baseUrl = isNode 
      ? (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
      : '';
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    try {
      const response = await fetch(`${baseUrl}/api/transport`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startPoint: start,
          endPoint: end
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error('API error:', response.status);
        eventBus.emit(EventTypes.TRANSPORT_ROUTE_ERROR, {
          error: 'Error calculating route',
          detail: 'Please try again. API error: ' + response.status,
          severity: 'error'
        });
        this.transportEndPoint = null;
        return;
      }
      
      const data = await response.json();
      console.log('Transport route calculated via API:', data);
      
      if (!data.success || !data.path) {
        await this.handleApiFailure(data, start, end, baseUrl);
        return;
      }
      
      this.transportPath = data.path;
      // Set water-only mode if the API indicates it's a water-only route
      this.waterOnlyMode = !!data.waterOnly;
      
      // Emit event with the calculated path
      eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATED, {
        path: data.path,
        waterOnly: this.waterOnlyMode
      });
      
      // Log the path data for debugging
      console.log(`Transport path calculated with ${data.path.length} points:`, {
        firstPoint: data.path[0],
        lastPoint: data.path[data.path.length - 1]
      });
      
      // Create a custom event with the path data
      const routeEvent = new CustomEvent('TRANSPORT_ROUTE_CALCULATED', {
        detail: {
          path: data.path,
          waterOnly: this.waterOnlyMode
        }
      });
      
      // Dispatch the event
      console.log('Dispatching TRANSPORT_ROUTE_CALCULATED event with path data');
      window.dispatchEvent(routeEvent);
      
      // Log the event for debugging
      console.log('Dispatched TRANSPORT_ROUTE_CALCULATED event with path data:', {
        pathLength: data.path.length,
        firstPoint: data.path[0],
        lastPoint: data.path[data.path.length - 1]
      });
    } catch (error) {
      console.error('Error in API request:', error);
      // Handle the error appropriately
      eventBus.emit(EventTypes.TRANSPORT_ROUTE_ERROR, {
        error: 'Error calculating route',
        detail: 'Please try again. ' + (error instanceof Error ? error.message : String(error)),
        severity: 'error'
      });
      this.transportEndPoint = null;
    }
  }

  /**
   * Handle API failure and try water-only pathfinding if appropriate
   */
  private async handleApiFailure(data: any, start: {lat: number, lng: number}, end: {lat: number, lng: number}, baseUrl: string): Promise<void> {
    console.error('Failed to calculate route:', data.error);
    
    // If the error is about points not being within polygons, try to use water-only pathfinding
    if (data.error === 'Start or end point is not within any polygon') {
      console.log('Points not within polygons, attempting water-only pathfinding');
      
      // Dispatch event instead of showing alert
      eventBus.emit(EventTypes.TRANSPORT_ROUTE_ERROR, {
        error: 'Points are not on land',
        detail: 'Attempting to find a water route...',
        severity: 'warning'
      });
      
      // Make a direct request to the water-only pathfinding endpoint with timeout
      const waterController = new AbortController();
      const waterTimeoutId = setTimeout(() => waterController.abort(), 15000); // 15 second timeout
      
      try {
        const waterResponse = await fetch(`${baseUrl}/api/transport/water-only`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startPoint: start,
            endPoint: end
          }),
          signal: waterController.signal
        });
        
        clearTimeout(waterTimeoutId);
        
        if (!waterResponse.ok) {
          this.handleWaterPathfindingFailure();
          return;
        }
        
        const waterData = await waterResponse.json();
        
        if (!waterData.success || !waterData.path) {
          this.handleWaterPathfindingFailure();
          return;
        }
        
        this.transportPath = waterData.path;
        this.waterOnlyMode = true;
        
        // Emit event with the calculated path
        eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATED, {
          path: waterData.path,
          waterOnly: true
        });
        
        // Create a custom event with the path data
        const routeEvent = new CustomEvent('TRANSPORT_ROUTE_CALCULATED', {
          detail: {
            path: waterData.path,
            waterOnly: true
          }
        });
        
        // Dispatch the event
        window.dispatchEvent(routeEvent);
      } catch (error) {
        console.error('Error fetching water-only path:', error);
        // Dispatch error event
        eventBus.emit(EventTypes.TRANSPORT_ROUTE_ERROR, {
          error: 'Error calculating water route',
          detail: 'Please try again. ' + (error instanceof Error ? error.message : String(error)),
          severity: 'error'
        });
        this.transportEndPoint = null;
      }
    } else {
      // For other errors, just show the error message
      eventBus.emit(EventTypes.TRANSPORT_ROUTE_ERROR, {
        error: 'No path could be found',
        detail: data.error || 'Unknown error',
        severity: 'error'
      });
      // Reset end point to allow trying again
      this.transportEndPoint = null;
    }
  }

  /**
   * Handle water pathfinding failure
   */
  private handleWaterPathfindingFailure(): void {
    // If we get here, water-only pathfinding failed
    // Dispatch event instead of showing alert
    eventBus.emit(EventTypes.TRANSPORT_ROUTE_ERROR, {
      error: 'No path could be found',
      detail: 'Could not find a water route',
      severity: 'error'
    });
    // Reset end point to allow trying again
    this.transportEndPoint = null;
  }

  /**
   * Reset transport state
   */
  public reset(): void {
    this.transportStartPoint = null;
    this.transportEndPoint = null;
    this.transportPath = [];
    this.calculatingPath = false;
    this.waterOnlyMode = false;
    
    // Emit reset event
    eventBus.emit(EventTypes.TRANSPORT_RESET, null);
  }
  
  /**
   * Set transport mode
   */
  public setTransportMode(active: boolean): void {
    this.transportMode = active;
    
    // Emit event
    eventBus.emit(EventTypes.TRANSPORT_MODE_CHANGED, { active });
  }
  
  /**
   * Get transport mode
   */
  public getTransportMode(): boolean {
    return this.transportMode;
  }
  
  /**
   * Handle point selection for transport
   */
  public handlePointSelected(point: {lat: number, lng: number}): void {
    if (!this.transportMode) return;
    
    if (!this.transportStartPoint) {
      this.setStartPoint(point);
    } else {
      this.setEndPoint(point);
    }
  }

  /**
   * Get current transport state
   */
  public getState(): {
    startPoint: {lat: number, lng: number} | null;
    endPoint: {lat: number, lng: number} | null;
    path: any[];
    calculatingPath: boolean;
    waterOnlyMode: boolean;
  } {
    return {
      startPoint: this.transportStartPoint,
      endPoint: this.transportEndPoint,
      path: this.transportPath,
      calculatingPath: this.calculatingPath,
      waterOnlyMode: this.waterOnlyMode
    };
  }

  /**
   * Get the current transport path
   */
  public getPath(): any[] {
    console.log(`Getting current transport path (${this.transportPath.length} points)`);
    return this.transportPath;
  }

  /**
   * Get the loaded water graph data
   */
  public getWaterGraphData(): { waterPoints: any[] } | null {
    return this.waterGraph;
  }

  /**
   * Calculate distance between two points in meters
   */
  public calculateDistance(point1: {lat: number, lng: number}, point2: {lat: number, lng: number}): number {
    return CoordinateService.calculateDistance(point1, point2);
  }

  /**
   * Load polygons for pathfinding
   */
  private async loadPolygons(): Promise<boolean> {
    try {
      console.log('Starting loadPolygons()...');
      
      // Determine if we're running in Node.js or browser environment
      const isNode = typeof window === 'undefined';
      
      // Set base URL depending on environment
      const baseUrl = isNode 
        ? (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
        : '';
      
      // First try to load from the API endpoint
      try {
        console.log(`Fetching polygons from API endpoint: ${baseUrl}/api/get-polygons`);
        
        // Add timeout handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.error('Fetch timeout after 10 seconds');
          controller.abort();
        }, 10000);
        
        const response = await fetch(`${baseUrl}/api/get-polygons`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        console.log(`API response status: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`API response data received:`, data);
          console.log(`Polygons property exists: ${!!data.polygons}, Type: ${typeof data.polygons}, Is Array: ${Array.isArray(data.polygons)}`);
          
          if (data.polygons && Array.isArray(data.polygons)) {
            console.log(`Polygons array length: ${data.polygons.length}`);
            
            if (data.polygons.length > 0) {
              console.log(`Successfully received ${data.polygons.length} polygons from API`);
            
              // Process the polygons
              const processedPolygons = this.processPolygons(data.polygons);
              
              if (processedPolygons.length > 0) {
                // Store the processed polygons
                this.polygons = processedPolygons;
                this.polygonsLoaded = true;
                
                // Build the graph and canal network
                this.buildGraphAndNetwork();
                
                return true;
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching from API endpoint:', error);
      }
      
      // If API endpoint failed, try to load using list-polygon-files and individual polygon endpoints
      console.log('API endpoint failed, trying to load using list-polygon-files endpoint');
      
      try {
        // Fetch the list of polygon files
        const filesResponse = await fetch(`${baseUrl}/api/list-polygon-files`);
        
        if (filesResponse.ok) {
          const filesData = await filesResponse.json();
          
          if (filesData.files && Array.isArray(filesData.files) && filesData.files.length > 0) {
            console.log(`Found ${filesData.files.length} polygon files`);
            
            // Collect all polygons by fetching individual polygon data
            const allPolygons: any[] = [];
            
            // Only process a subset of files to avoid overwhelming the browser
            const filesToProcess = filesData.files.slice(0, 100); // Process up to 100 files
            
            for (const file of filesToProcess) {
              try {
                // Extract polygon ID from filename (remove .json extension)
                const polygonId = file.replace('.json', '');
                
                // Fetch individual polygon data
                const polygonResponse = await fetch(`${baseUrl}/api/polygons/${polygonId}`);
                
                if (polygonResponse.ok) {
                  const polygonData = await polygonResponse.json();
                  
                  if (polygonData) {
                    allPolygons.push(polygonData);
                  }
                }
              } catch (error) {
                console.error(`Error loading polygon file ${file}:`, error);
              }
            }
            
            console.log(`Loaded ${allPolygons.length} polygons from individual endpoints`);
            
            if (allPolygons.length > 0) {
              // Process the polygons
              const processedPolygons = this.processPolygons(allPolygons);
              
              if (processedPolygons.length > 0) {
                // Store the processed polygons
                this.polygons = processedPolygons;
                this.polygonsLoaded = true;
                
                // Build the graph and canal network
                this.buildGraphAndNetwork();
                
                return true;
              }
            }
          }
        }
      } catch (error) {
        console.error('Error loading polygon files:', error);
      }
      
      // If all methods failed, try to load a specific polygon file directly
      console.log('Trying to load polygons.json directly');
      
      try {
        const directResponse = await fetch(`${baseUrl}/data/polygons/polygons.json`);
        
        if (directResponse.ok) {
          const directData = await directResponse.json();
          
          let polygonsArray: any[] = [];
          
          // Handle different file formats
          if (Array.isArray(directData)) {
            // File contains an array of polygons
            polygonsArray = directData;
          } else if (directData.polygons && Array.isArray(directData.polygons)) {
            // File contains an object with a polygons property
            polygonsArray = directData.polygons;
          }
          
          console.log(`Loaded ${polygonsArray.length} polygons directly from polygons.json`);
          
          if (polygonsArray.length > 0) {
            // Process the polygons
            const processedPolygons = this.processPolygons(polygonsArray);
            
            if (processedPolygons.length > 0) {
              // Store the processed polygons
              this.polygons = processedPolygons;
              this.polygonsLoaded = true;
              
              // Build the graph and canal network
              this.buildGraphAndNetwork();
              
              return true;
            }
          }
        }
      } catch (error) {
        console.error('Error loading polygons.json directly:', error);
      }
      
      console.error('All methods to load polygons failed');
      return false;
    } catch (error) {
      console.error('Error loading polygons for pathfinding:', error);
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      return false;
    }
  }

  /**
   * Process polygons to ensure they have the required properties
   */
  private processPolygons(polygons: any[]): Polygon[] {
    const processedPolygons = polygons.map((polygon: any) => {
      // Ensure the polygon has coordinates
      if (!polygon.coordinates || !Array.isArray(polygon.coordinates) || polygon.coordinates.length < 3) {
        console.warn(`Polygon ${polygon.id} has invalid coordinates, skipping`);
        return null;
      }
      
      // Ensure each coordinate has lat and lng properties
      const validCoordinates = polygon.coordinates.filter((coord: any) => 
        coord && typeof coord.lat === 'number' && typeof coord.lng === 'number'
      );
      
      if (validCoordinates.length < 3) {
        console.warn(`Polygon ${polygon.id} has insufficient valid coordinates, skipping`);
        return null;
      }
      
      // Process bridge points to ensure isConstructed is set correctly
      let bridgePoints = Array.isArray(polygon.bridgePoints) ? polygon.bridgePoints : [];
      bridgePoints = bridgePoints.map((point: any) => {
        if (!point.edge) return point;
        
        // Set isConstructed based on ID patterns if not already set
        const pointId = point.id || `bridge-${point.edge.lat}-${point.edge.lng}`;
        const isConstructed = !!point.isConstructed || 
                             pointId.includes('bridge-constructed') || 
                             pointId.includes('public_bridge') ||
                             pointId.startsWith('building_'); // Many bridges have building_ prefix
        
        return {
          ...point,
          isConstructed
        };
      });
      
      // Process canal points to ensure isConstructed is set correctly
      let canalPoints = Array.isArray(polygon.canalPoints) ? polygon.canalPoints : [];
      canalPoints = canalPoints.map((point: any) => {
        if (!point.edge) return point;
        
        // Set isConstructed based on ID patterns if not already set
        const pointId = point.id || `canal-${point.edge.lat}-${point.edge.lng}`;
        const isConstructed = !!point.isConstructed || 
                             pointId.includes('public_dock') || 
                             pointId.includes('dock-constructed') ||
                             pointId.startsWith('building_') || // Many docks have building_ prefix
                             pointId.startsWith('canal_');      // Many docks have canal_ prefix
        
        // Add debug logging for canal point construction status
        if (this.pathfindingMode === 'real' && !isConstructed) {
          console.log(`Canal point ${pointId} is not constructed and will be filtered in 'real' mode`);
        }
        
        return {
          ...point,
          isConstructed
        };
      });
      
      // Create a processed polygon with all required properties
      return {
        id: polygon.id,
        coordinates: validCoordinates,
        center: polygon.center || null,
        bridgePoints: bridgePoints,
        buildingPoints: Array.isArray(polygon.buildingPoints) ? polygon.buildingPoints : [],
        canalPoints: canalPoints
      };
    }).filter(Boolean); // Remove null entries
    
    console.log(`Processed ${processedPolygons.length} valid polygons out of ${polygons.length} total`);
    
    return processedPolygons;
  }

  /**
   * Build the graph and canal network
   */
  private async buildGraphAndNetwork(): Promise<void> {
    console.log(`Building graph from polygons (mode: ${this.pathfindingMode})...`);
    
    // Use the appropriate graph building method based on pathfinding mode
    if (this.pathfindingMode === 'real') {
      this.graph = await this.buildGraphReal(this.polygons);
    } else {
      this.graph = await this.buildGraph(this.polygons);
    }
    
    console.log(`Graph built with ${Object.keys(this.graph.nodes).length} nodes and ${Object.values(this.graph.edges).flat().length} edges`);
    
    console.log('Building canal network from polygons...');
    this.canalNetwork = this.buildCanalNetwork(this.polygons);
    console.log(`Canal network built with ${Object.keys(this.canalNetwork).length} segments`);
  }

  /**
   * Check if polygons are loaded
   */
  public isPolygonsLoaded(): boolean {
    return this.polygonsLoaded && this.polygons.length > 0;
  }

  /**
   * Direct initialization with polygon data
   * This method allows direct initialization from the IsometricViewer component
   */
  public initializeWithPolygonData(polygons: any[]): boolean {
    console.log(`Direct initialization with ${polygons?.length || 0} polygons`);
    
    try {
      if (!polygons || !Array.isArray(polygons) || polygons.length === 0) {
        console.error('Invalid polygon data provided for direct initialization');
        return false;
      }
      
      // Process the polygons
      const processedPolygons = this.processPolygons(polygons);
      
      if (processedPolygons.length === 0) {
        console.error('No valid polygons after processing');
        return false;
      }
      
      // Store the processed polygons
      this.polygons = processedPolygons;
      this.polygonsLoaded = true;
      
      // Build the graph and canal network
      this.buildGraphAndNetwork();
      
      console.log(`Successfully initialized transport service with ${processedPolygons.length} polygons`);
      return true;
    } catch (error) {
      console.error('Error in direct initialization:', error);
      return false;
    }
  }

  /**
   * Method to directly set polygons data
   */
  public async setPolygonsData(polygons: any[]): Promise<boolean> {
    try {
      console.log(`Setting polygons data directly with ${polygons?.length || 0} polygons`);
      
      // Check if polygons is null or undefined
      if (!polygons || !Array.isArray(polygons)) {
        console.error('Polygons data is null, undefined, or not an array');
        return false;
      }
      
      // Log the first polygon to help with debugging
      if (polygons.length > 0) {
        console.log('First polygon structure:', JSON.stringify(polygons[0]).substring(0, 200) + '...');
      } else {
        console.error('Polygons array is empty');
        return false;
      }
      
      // Process the polygons to ensure they have the required properties
      const processedPolygons = polygons.map((polygon: any, index: number) => {
        // Skip null or undefined polygons
        if (!polygon) {
          console.warn(`Skipping null or undefined polygon at index ${index}`);
          return null;
        }
        
        // Ensure the polygon has an ID
        const polygonId = polygon.id || `polygon-${Date.now()}-${index}`;
        
        // Ensure the polygon has coordinates
        if (!polygon.coordinates || !Array.isArray(polygon.coordinates)) {
          console.warn(`Polygon ${polygonId} has missing or invalid coordinates array`);
          return null;
        }
        
        if (polygon.coordinates.length < 3) {
          console.warn(`Polygon ${polygonId} has insufficient coordinates (${polygon.coordinates.length}), needs at least 3`);
          return null;
        }
        
        // Ensure each coordinate has lat and lng properties
        const validCoordinates = polygon.coordinates.filter((coord: any, coordIndex: number) => {
          if (!coord) {
            console.warn(`Null coordinate at index ${coordIndex} in polygon ${polygonId}`);
            return false;
          }
          
          // Check if lat and lng are valid numbers
          const hasValidLat = coord.lat !== undefined && 
                             typeof coord.lat === 'number' && 
                             !isNaN(coord.lat) && 
                             isFinite(coord.lat);
                             
          const hasValidLng = coord.lng !== undefined && 
                             typeof coord.lng === 'number' && 
                             !isNaN(coord.lng) && 
                             isFinite(coord.lng);
          
          if (!hasValidLat || !hasValidLng) {
            console.warn(`Invalid coordinate at index ${coordIndex} in polygon ${polygonId}:`, coord);
            return false;
          }
          
          return true;
        });
        
        if (validCoordinates.length < 3) {
          console.warn(`Polygon ${polygonId} has insufficient valid coordinates (${validCoordinates.length}), needs at least 3`);
          return null;
        }
        
        // Create a processed polygon with all required properties
        return {
          id: polygonId,
          coordinates: validCoordinates,
          center: polygon.center || null,
          bridgePoints: Array.isArray(polygon.bridgePoints) ? polygon.bridgePoints : [],
          buildingPoints: Array.isArray(polygon.buildingPoints) ? polygon.buildingPoints : [],
          canalPoints: Array.isArray(polygon.canalPoints) ? polygon.canalPoints : []
        };
      }).filter(Boolean); // Remove null entries
      
      console.log(`Processed ${processedPolygons.length} valid polygons out of ${polygons.length} total`);
      
      if (processedPolygons.length === 0) {
        console.error('No valid polygons after processing');
        return false;
      }
      
      // Store the processed polygons
      this.polygons = processedPolygons;
      this.polygonsLoaded = true;
      
      // Build the graph and canal network
      console.log('Building graph from polygons...');
      // Use the appropriate graph building method based on pathfinding mode
      if (this.pathfindingMode === 'real') {
        this.graph = await this.buildGraphReal(this.polygons);
      } else {
        this.graph = await this.buildGraph(this.polygons);
      }
      console.log(`Graph built with ${Object.keys(this.graph.nodes).length} nodes and ${Object.values(this.graph.edges).flat().length} edges`);
      
      console.log('Building canal network from polygons...');
      this.canalNetwork = this.buildCanalNetwork(this.polygons);
      console.log(`Canal network built with ${Object.keys(this.canalNetwork).length} segments`);
      
      console.log(`Successfully loaded ${this.polygons.length} polygons for pathfinding`);
      return true;
    } catch (error) {
      console.error('Error setting polygons data:', error);
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      return false;
    }
  }

  /**
   * Load water graph from watergraph.json
   */
  private async loadWaterGraph(): Promise<boolean> {
    try {
      console.log('Loading water graph from watergraph.json...');
      
      // Determine if we're running in Node.js or browser environment
      const isNode = typeof window === 'undefined';
      
      // Set base URL depending on environment
      const baseUrl = isNode 
        ? (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
        : '';
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('[TransportService] Timeout loading water graph after 30 seconds.');
        controller.abort();
      }, 30000); // 30 second timeout
      
      // Try multiple possible paths for the water graph file
      const pathsToTry = [
        `${baseUrl}/api/water-points`, // Try the API endpoint
        `${baseUrl}/api/water-graph`, // Try another possible API endpoint
        `${baseUrl}/watergraph.json` // Try root path
      ];
      
      let response = null;
      let successPath = '';
      
      // Try each path until one works
      for (const path of pathsToTry) {
        try {
          console.log(`Attempting to load water graph from: ${path}`);
          const tempResponse = await fetch(path, {
            signal: controller.signal
          });
          
          if (tempResponse.ok) {
            response = tempResponse;
            successPath = path;
            console.log(`Successfully loaded water graph from: ${path}`);
            break;
          }
        } catch (error) {
          console.warn(`Failed to load water graph from ${path}:`, error);
        }
      }
      
      clearTimeout(timeoutId);
      
      if (response && response.ok) {
        const data = await response.json();
        
        // Check if the response is from the API endpoint which might have a different structure
        let waterGraphData;
        if (successPath.includes('/api/water-points') && data.waterPoints) {
          // API response format
          waterGraphData = data;
        } else if (data && Array.isArray(data.waterPoints)) {
          // Direct JSON file format
          waterGraphData = data;
        } else if (Array.isArray(data)) {
          // Handle case where it's just an array of water points
          waterGraphData = { waterPoints: data };
        } else {
          console.error('Invalid water graph data format:', data);
          return false;
        }
        
        if (waterGraphData && waterGraphData.waterPoints && Array.isArray(waterGraphData.waterPoints)) {
          this.waterGraph = waterGraphData;
          console.log(`Successfully loaded water graph with ${waterGraphData.waterPoints.length} water points`);
          return true;
        } else {
          console.error('Invalid water graph data format');
          return false;
        }
      } else {
        console.error(`Failed to load water graph from any path`);
        
        // As a last resort, try to create a minimal water graph from the polygons' canal points
        if (this.polygons && this.polygons.length > 0) {
          console.log('Attempting to create a minimal water graph from polygon canal points');
          const minimalWaterGraph = this.createMinimalWaterGraph();
          if (minimalWaterGraph) {
            this.waterGraph = minimalWaterGraph;
            console.log(`Created minimal water graph with ${minimalWaterGraph.waterPoints.length} water points`);
            return true;
          }
        }
        
        return false;
      }
    } catch (error) {
      console.error('Error loading water graph:', error);
      return false;
    }
  }

  // Add this helper method to create a minimal water graph from polygon canal points
  private createMinimalWaterGraph(): { waterPoints: any[] } | null {
    try {
      if (!this.polygons || this.polygons.length === 0) {
        return null;
      }
      
      const waterPoints: any[] = [];
      const pointMap = new Map<string, any>();
      
      // Extract all canal points from polygons
      for (const polygon of this.polygons) {
        if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
          for (const canalPoint of polygon.canalPoints) {
            if (canalPoint.edge) {
              const id = `waterpoint_${canalPoint.edge.lat}_${canalPoint.edge.lng}`;
              
              if (!pointMap.has(id)) {
                const waterPoint = {
                  id,
                  position: {
                    lat: canalPoint.edge.lat,
                    lng: canalPoint.edge.lng
                  },
                  connections: []
                };
                
                waterPoints.push(waterPoint);
                pointMap.set(id, waterPoint);
              }
            }
          }
        }
      }
      
      // Create connections between nearby water points
      for (let i = 0; i < waterPoints.length; i++) {
        const point1 = waterPoints[i];
        
        for (let j = i + 1; j < waterPoints.length; j++) {
          const point2 = waterPoints[j];
          
          // Calculate distance
          const distance = this.calculateDistance(point1.position, point2.position);
          
          // Connect points that are within a reasonable distance
          if (distance < 500) {
            // Create a unique ID for this connection
            const connectionId = `waterroute_${
              ((point1.position.lat + point2.position.lat) / 2).toFixed(6)
            }_${
              ((point1.position.lng + point2.position.lng) / 2).toFixed(6)
            }`;
            
            // Add connection from point1 to point2
            point1.connections.push({
              targetId: point2.id,
              intermediatePoints: [],
              distance,
              id: connectionId
            });
            
            // Add connection from point2 to point1
            point2.connections.push({
              targetId: point1.id,
              intermediatePoints: [],
              distance,
              id: connectionId
            });
          }
        }
      }
      
      console.log(`Created minimal water graph with ${waterPoints.length} points and ${
        waterPoints.reduce((sum, point) => sum + point.connections.length, 0)
      } connections`);
      
      return { waterPoints };
    } catch (error) {
      console.error('Error creating minimal water graph:', error);
      return null;
    }
  }

  /**
   * Service initialization with retry logic
   */
  private async initializeService(): Promise<boolean> {
    // If we're already initializing, return the existing promise
    if (this.initializationPromise) {
      console.log('Transport service initialization already in progress, returning existing promise');
      return this.initializationPromise;
    }
    
    // Create a new initialization promise
    console.log('Creating new transport service initialization promise');
    this.initializationPromise = new Promise<boolean>(async (resolve) => {
      console.log('Initializing transport service...');
      
      // If polygons are already loaded, we're done
      if (this.polygonsLoaded && this.polygons.length > 0) {
        // Also ensure water graph is loaded
        if (!this.waterGraph) {
          console.log('Polygons loaded but water graph not loaded, loading water graph...');
          const waterGraphLoaded = await this.loadWaterGraph();
          console.log(`Water graph loading ${waterGraphLoaded ? 'succeeded' : 'failed'}`);
        }
        console.log(`Polygons already loaded (${this.polygons.length}), initialization complete`);
        resolve(true);
        return;
      }
      
      // First, try to get polygons from window.__polygonData
      if (typeof window !== 'undefined') {
        console.log('Checking for window.__polygonData...');
        const windowPolygons = (window as any).__polygonData;
        
        if (windowPolygons) {
          console.log(`Found window.__polygonData with type: ${typeof windowPolygons}`);
          if (Array.isArray(windowPolygons)) {
            console.log(`window.__polygonData is an array with ${windowPolygons.length} items`);
            
            if (windowPolygons.length > 0) {
              console.log('First polygon in window.__polygonData:', JSON.stringify(windowPolygons[0]).substring(0, 200) + '...');
              const success = this.setPolygonsData(windowPolygons);
              console.log(`Setting polygons data from window.__polygonData ${success ? 'succeeded' : 'failed'}`);
              if (success) {
                console.log('Successfully loaded polygons from window.__polygonData');
                this.polygonsLoaded = true;
              
                // Also load the water graph
                console.log('Loading water graph after polygon loading...');
                const waterGraphLoaded = await this.loadWaterGraph();
                console.log(`Water graph loading ${waterGraphLoaded ? 'succeeded' : 'failed'}`);
              
                resolve(true);
                return;
              } else {
                console.error('Failed to set polygons data from window.__polygonData');
              }
            } else {
              console.warn('window.__polygonData exists but is empty');
            }
          } else {
            console.warn(`window.__polygonData exists but is not an array: ${typeof windowPolygons}`);
          }
        } else {
          console.warn('window.__polygonData is not available');
        }
      } else {
        console.warn('window is not defined, running in non-browser environment');
      }
      
      // Try to load polygons with exponential backoff
      let success = false;
      this.initializationAttempts = 0;
      
      while (!success && this.initializationAttempts < this.MAX_INITIALIZATION_ATTEMPTS) {
        this.initializationAttempts++;
        
        // Calculate backoff time (100ms, 200ms, 400ms, 800ms, 1600ms)
        const backoffTime = Math.min(100 * Math.pow(2, this.initializationAttempts - 1), 5000);
        
        console.log(`Initialization attempt ${this.initializationAttempts} of ${this.MAX_INITIALIZATION_ATTEMPTS}`);
        
        // Try to load polygons
        console.log('Calling loadPolygons()...');
        success = await this.loadPolygons();
        console.log(`loadPolygons() returned ${success}`);
        
        if (success) {
          console.log(`Polygon loading succeeded with ${this.polygons.length} polygons, initialization complete`);
          break;
        }
        
        console.log(`Polygon loading failed, waiting ${backoffTime}ms before retry...`);
        await new Promise(r => setTimeout(r, backoffTime));
      }
      
      if (!success) {
        console.error(`Failed to load polygons after ${this.MAX_INITIALIZATION_ATTEMPTS} attempts`);
        resolve(false);
        return;
      }
      
      // Also load the water graph
      console.log('Loading water graph after polygon loading...');
      const waterGraphLoaded = await this.loadWaterGraph();
      console.log(`Water graph loading ${waterGraphLoaded ? 'succeeded' : 'failed'}`);
      
      resolve(success);
    });
    
    return this.initializationPromise;
  }

  /**
   * Helper to get land group ID for a polygon.
   */
  private async getLandGroupId(polygonId: string): Promise<string> {
    try {
      // Determine if we're running in Node.js or browser environment
      const isNode = typeof window === 'undefined';
      const baseUrl = isNode 
        ? (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
        : '';
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${baseUrl}/api/land-groups?includeUnconnected=true&minSize=1`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.landGroups && Array.isArray(data.landGroups)) {
          for (const group of data.landGroups) {
            if (group.lands && Array.isArray(group.lands) && group.lands.includes(polygonId)) {
              console.log(`Polygon ${polygonId} found in land group ${group.groupId}`);
              return group.groupId;
            }
          }
        }
      }
      console.warn(`Land group not found for polygon ${polygonId}, using polygonId as fallback.`);
    } catch (error) {
      console.error(`Error fetching land group for polygon ${polygonId}:`, error);
    }
    return polygonId; // Fallback to polygonId itself if group not found or error occurs
  }

  /**
   * Check if two points are in the same land group
   */
  private async arePointsInSameGroup(polygon1Id: string, polygon2Id: string): Promise<boolean> {
    try {
      // If they're the same polygon, they're in the same group
      if (polygon1Id === polygon2Id) {
        return true;
      }

      // Determine if we're running in Node.js or browser environment
      const isNode = typeof window === 'undefined';
      
      // Set base URL depending on environment
      const baseUrl = isNode 
        ? (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
        : '';
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${baseUrl}/api/land-groups?includeUnconnected=true&minSize=1`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.landGroups && Array.isArray(data.landGroups)) {
          // Check if both polygons are in the same group
          for (const group of data.landGroups) {
            if (group.lands && Array.isArray(group.lands)) {
              if (group.lands.includes(polygon1Id) && group.lands.includes(polygon2Id)) {
                console.log(`Polygons ${polygon1Id} and ${polygon2Id} are in the same land group: ${group.groupId}`);
                return true;
              }
            }
          }
          console.log(`Polygons ${polygon1Id} and ${polygon2Id} are in different land groups`);
          return false;
        }
      }
      
      // If we couldn't determine land groups, assume they're not in the same group
      console.warn('Could not determine land groups, assuming different groups');
      return false;
    } catch (error) {
      console.error('Error checking if points are in the same group:', error);
      // If there's an error, assume they're not in the same group
      return false;
    }
  }

  /**
   * Dijkstra's algorithm for water graph pathfinding
   */
  private findWaterGraphPath(startId: string, endId: string): string[] | null {
    if (!this.waterGraph || !this.waterGraph.waterPoints) {
      console.error('Water graph not loaded');
      return null;
    }
    
    // Create a map of water points by ID for quick lookup
    const waterPointsMap = new Map();
    for (const waterPoint of this.waterGraph.waterPoints) {
      waterPointsMap.set(waterPoint.id, waterPoint);
    }
    
    // Initialize distances with Infinity
    const distances: Record<string, number> = {};
    const previous: Record<string, string | null> = {};
    const visited: Set<string> = new Set();
    
    // Create a priority queue
    const queue = new PriorityQueue<string>();
    
    // Initialize all distances as Infinity
    for (const waterPoint of this.waterGraph.waterPoints) {
      distances[waterPoint.id] = Infinity;
      previous[waterPoint.id] = null;
    }
    
    // Distance from start to itself is 0
    distances[startId] = 0;
    queue.enq(startId, 0);
    
    while (!queue.isEmpty()) {
      const pointId = queue.deq();
      if (!pointId) break;
      
      // If we've reached the end point, we're done
      if (pointId === endId) {
        break;
      }
      
      // Skip if we've already processed this point
      if (visited.has(pointId)) {
        continue;
      }
      
      visited.add(pointId);
      
      // Get the current water point
      const currentPoint = waterPointsMap.get(pointId);
      if (!currentPoint) continue;
      
      // Process all connections
      for (const connection of currentPoint.connections) {
        const neighborId = connection.targetId;
        const weight = connection.distance;
        
        // Calculate new distance
        const distance = distances[pointId] + weight;
        
        // If we found a better path, update it
        if (distance < distances[neighborId]) {
          distances[neighborId] = distance;
          previous[neighborId] = pointId;
          queue.enq(neighborId, distance);
        }
      }
    }
    
    // If end point is not reachable
    if (distances[endId] === Infinity) {
      return null;
    }
    
    // Reconstruct the path
    const path: string[] = [];
    let current = endId;
    
    while (current !== null) {
      path.unshift(current);
      current = previous[current] || null;
    }
    
    return path;
  }

  /**
   * Preload polygons for pathfinding
   * This can be called during app initialization to ensure polygons are loaded
   */
  public async preloadPolygons(): Promise<boolean> {
    console.log('Preloading polygons for transport service...');
    return this.initializeService();
  }

  // Helper function to check if two line segments intersect
  private doLineSegmentsIntersect(
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

  // Function to build the graph from polygons
  private async buildGraph(polygons: Polygon[]): Promise<Graph> {
    const graph: Graph = {
      nodes: {},
      edges: {}
    };
    
    // Extract all canal points for later use
    const allCanalPoints: {point: Point, id: string, polygonId: string, isConstructed: boolean}[] = [];
    for (const polygon of polygons) {
      if (polygon.canalPoints) {
        for (const point of polygon.canalPoints) {
          if (point.edge) {
            const pointId = point.id || `canal-${point.edge.lat}-${point.edge.lng}`;
            // Check if this is a constructed dock
            const isConstructed = !!point.isConstructed || 
                                 (pointId.includes('public_dock') || pointId.includes('dock-constructed'));
            
            // In 'real' mode, only include constructed docks
            if (this.pathfindingMode === 'all' || isConstructed) {
              allCanalPoints.push({
                point: point.edge,
                id: pointId,
                polygonId: polygon.id,
                isConstructed
              });
            }
          }
        }
      }
    }

    // Create a function to check if a line between two points intersects any land polygon
    const doesLineIntersectLand = (point1: Point, point2: Point): boolean => {
      return this.doesLineIntersectLand(point1, point2, polygons);
    };

    // Add nodes for each polygon's center, building points, bridge points, and canal points
    for (const polygon of polygons) {
      // Add center node
      if (polygon.center) {
        const centerId = `center-${polygon.id}`;
        graph.nodes[centerId] = {
          id: centerId,
          position: polygon.center,
          type: 'center',
          polygonId: polygon.id
        };
        graph.edges[centerId] = [];
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
      
      // Add bridge point nodes - in 'real' mode, only include constructed bridges
      if (polygon.bridgePoints) {
        for (const point of polygon.bridgePoints) {
          if (point.edge) {
            const pointId = point.id || `bridge-${point.edge.lat}-${point.edge.lng}`;
            // Check if this is a constructed bridge
            const isConstructed = !!point.isConstructed || 
                                 (pointId.includes('bridge-constructed') || pointId.includes('public_bridge') ||
                                  pointId.startsWith('building_'));
          
            // In 'real' mode, only include constructed bridges
            if (this.pathfindingMode === 'all' || isConstructed) {
              // Add debug logging to see what's happening with bridge points
              console.log(`Adding bridge node ${pointId}, isConstructed: ${isConstructed}, mode: ${this.pathfindingMode}`);
            
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
    
      // Add canal point nodes - in 'real' mode, only include constructed docks
      if (polygon.canalPoints) {
        for (const point of polygon.canalPoints) {
          if (point.edge) {
            const pointId = point.id || `canal-${point.edge.lat}-${point.edge.lng}`;
            // Check if this is a constructed dock
            const isConstructed = !!point.isConstructed || 
                                 pointId.includes('public_dock') || 
                                 pointId.includes('dock-constructed') ||
                                 pointId.startsWith('building_') || 
                                 pointId.startsWith('canal_');
          
            // In 'real' mode, only include constructed docks
            if (this.pathfindingMode === 'all' || isConstructed) {
              // Add debug logging to see what's happening with canal points
              console.log(`Adding canal node ${pointId}, isConstructed: ${isConstructed}, mode: ${this.pathfindingMode}`);
            
              graph.nodes[pointId] = {
                id: pointId,
                position: point.edge,
                type: 'canal',
                polygonId: polygon.id
              };
              graph.edges[pointId] = [];
            } else {
              // Add debug logging for skipped canal points
              console.log(`Skipping canal node ${pointId} in 'real' mode because it's not constructed`);
            }
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
      
        // Ensure node1 has an edges array
        if (!graph.edges[node1.id]) {
          graph.edges[node1.id] = [];
        }
      
        for (let j = i + 1; j < polygonNodes.length; j++) {
          const node2 = polygonNodes[j];
        
          // Ensure node2 has an edges array
          if (!graph.edges[node2.id]) {
            graph.edges[node2.id] = [];
          }
        
          // Skip canal-to-non-canal connections (canal points should only connect to other canal points)
          if ((node1.type === 'canal' && node2.type !== 'canal') || 
              (node1.type !== 'canal' && node2.type === 'canal')) {
            continue;
          }
        
          const distance = this.calculateDistance(node1.position, node2.position);
        
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
          
            // Skip if this bridge is not constructed in 'real' mode
            const isConstructed = !!bridgePoint.isConstructed || 
                                 (sourcePointId.includes('bridge-constructed') || sourcePointId.includes('public_bridge'));
            
            if (this.pathfindingMode === 'real' && !isConstructed) {
              continue;
            }
            
            // Ensure the source point has an edges array
            if (!graph.edges[sourcePointId]) {
              continue; // Skip if the node doesn't exist in the graph
            }
          
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
              
                // Skip if the target node doesn't exist in the graph
                if (!graph.edges[targetPointId]) {
                  continue;
                }
              
                // Add bidirectional edges between the bridge points with lower weight to prioritize bridges
                const distance = bridgePoint.connection.distance || 
                  this.calculateDistance(bridgePoint.edge, bridgePoint.connection.targetPoint);
              
                // Use a lower weight for bridges to prioritize them in pathfinding
                const weight = distance * 0.5; // Make bridges more attractive for pathfinding
              
                graph.edges[sourcePointId].push({
                  from: sourcePointId,
                  to: targetPointId,
                  weight: weight
                });
              
                graph.edges[targetPointId].push({
                  from: targetPointId,
                  to: sourcePointId,
                  weight: weight
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
    
      // Ensure canalNode1 has an edges array
      if (!graph.edges[canalNode1.id]) {
        graph.edges[canalNode1.id] = [];
      }
    
      for (let j = 0; j < canalNodes.length; j++) {
        // Allow connections to all canal nodes, not just those with higher indices
        if (i === j) continue; // Skip self-connections
      
        const canalNode2 = canalNodes[j];
      
        // Ensure canalNode2 has an edges array
        if (!graph.edges[canalNode2.id]) {
          graph.edges[canalNode2.id] = [];
        }
      
        // Skip if they're in the same polygon (already connected above)
        if (canalNode1.polygonId === canalNode2.polygonId) {
          continue;
        }
      
        // Calculate distance between canal points
        const distance = this.calculateDistance(canalNode1.position, canalNode2.position);
      
        // Increase maximum distance further and reduce minimum distance
        if (distance > 5 && distance < 500) {
          // Skip if the line between these points would cross land
          if (this.doesLineIntersectLand(canalNode1.position, canalNode2.position, polygons)) {
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
    
    // Improve connections between canal points and other nodes
    // Connect canal points to nearby building points and bridge points
    const nonCanalNodes = Object.values(graph.nodes).filter(node => node.type !== 'canal');
    
    for (const canalNode of canalNodes) {
      // Ensure the canal node has an edges array
      if (!graph.edges[canalNode.id]) {
        graph.edges[canalNode.id] = [];
      }
      
      // Find nearby non-canal nodes (buildings, bridges, centers)
      for (const nonCanalNode of nonCanalNodes) {
        // Skip if they're in the same polygon (already connected above)
        if (canalNode.polygonId === nonCanalNode.polygonId) {
          continue;
        }
        
        // Calculate distance
        const distance = this.calculateDistance(canalNode.position, nonCanalNode.position);
        
        // Connect if they're close enough (30 meters)
        if (distance < 30) {
          // Skip if the line between these points would cross land
          if (this.doesLineIntersectLand(canalNode.position, nonCanalNode.position, polygons)) {
            continue;
          }
          
          // Add bidirectional edges with appropriate weights
          // Walking from canal to land should have normal weight
          graph.edges[canalNode.id].push({
            from: canalNode.id,
            to: nonCanalNode.id,
            weight: distance
          });
          
          // Ensure the non-canal node has an edges array
          if (!graph.edges[nonCanalNode.id]) {
            graph.edges[nonCanalNode.id] = [];
          }
          
          graph.edges[nonCanalNode.id].push({
            from: nonCanalNode.id,
            to: canalNode.id,
            weight: distance
          });
        }
      }
    }
    
    // Log the node types for debugging
    const nodeTypes = {};
    Object.values(graph.nodes).forEach(node => {
      nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
    });
    console.log('Graph node types after initial creation:', nodeTypes);
  
    return graph;
  }

  /**
   * Build a graph focused on real, constructed infrastructure
   * This is an optimized version for 'real' mode that focuses on buildings first
   */
  private async buildGraphReal(polygons: Polygon[]): Promise<Graph> {
    console.log('Building real infrastructure graph using API data...');
    const graph: Graph = {
      nodes: {},
      edges: {}
    };
    
    // Fetch bridges from API with retry logic and timeout
    let bridges: any[] = [];
    let bridgesFetched = false;
    let bridgeRetries = 0;
    const MAX_RETRIES = 3;
    
    while (!bridgesFetched && bridgeRetries < MAX_RETRIES) {
      try {
        // Determine if we're running in Node.js or browser environment
        const isNode = typeof window === 'undefined';
        
        // Set base URL depending on environment
        const baseUrl = isNode 
          ? (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
          : '';
        
        console.log(`Fetching bridges from API (attempt ${bridgeRetries + 1}): ${baseUrl}/api/bridges`);
        
        // Create abort controller for timeout
        const controller = new AbortController();
        let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
          console.log('Fetch timeout after 60 seconds for bridges');
          controller.abort();
          timeoutId = null;
        }, 60000); // 60 second timeout
        
        try {
          const bridgesResponse = await fetch(`${baseUrl}/api/bridges`, {
            headers: {
              'Content-Type': 'application/json',
              'Citizen-Agent': 'Transport-Service'
            },
            cache: 'no-store',
            signal: controller.signal
          });
          
          // Clear the timeout as soon as the response is received
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          if (bridgesResponse.ok) {
            const bridgesData = await bridgesResponse.json();
            if (bridgesData.success && Array.isArray(bridgesData.bridges)) {
              bridges = bridgesData.bridges;
              console.log(`Successfully fetched ${bridges.length} bridges from API`);
              bridgesFetched = true;
            } else {
              console.error('Invalid bridges data format:', bridgesData);
              bridgeRetries++;
            }
          } else {
            console.error(`Failed to fetch bridges: ${bridgesResponse.status} ${bridgesResponse.statusText}`);
            bridgeRetries++;
            // Add exponential backoff
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, bridgeRetries)));
          }
        } catch (error) {
          // Make sure to clear the timeout if there's an error
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          // Check if this is an abort error
          if (error instanceof Error && error.name === 'AbortError') {
            console.error('Fetch request for bridges was aborted due to timeout');
          } else {
            console.error('Error during fetch:', error);
          }
          
          throw error; // Re-throw to be caught by the outer catch
        }
      } catch (error) {
        console.error(`Error fetching bridges (attempt ${bridgeRetries + 1}):`, error);
        bridgeRetries++;
        // Add exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, bridgeRetries)));
      }
    }
    
    if (!bridgesFetched) {
      console.warn(`Failed to fetch bridges after ${MAX_RETRIES} attempts, proceeding with empty bridges array`);
    }
    
    // Fetch docks from API with retry logic and timeout
    let docks: any[] = [];
    let docksFetched = false;
    let dockRetries = 0;
    
    while (!docksFetched && dockRetries < MAX_RETRIES) {
      try {
        // Determine if we're running in Node.js or browser environment
        const isNode = typeof window === 'undefined';
        
        // Set base URL depending on environment
        const baseUrl = isNode 
          ? (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
          : '';
        
        console.log(`Fetching docks from API (attempt ${dockRetries + 1}): ${baseUrl}/api/docks`);
        
        // Create abort controller for timeout
        const controller = new AbortController();
        let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
          console.log('Fetch timeout after 30 seconds for docks');
          controller.abort();
          timeoutId = null;
        }, 30000); // 30 second timeout
        
        try {
          const docksResponse = await fetch(`${baseUrl}/api/docks`, {
            headers: {
              'Content-Type': 'application/json',
              'Citizen-Agent': 'Transport-Service'
            },
            cache: 'no-store',
            signal: controller.signal
          });
          
          // Clear the timeout as soon as the response is received
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          if (docksResponse.ok) {
            const docksData = await docksResponse.json();
            if (docksData.success && Array.isArray(docksData.docks)) {
              docks = docksData.docks;
              console.log(`Successfully fetched ${docks.length} docks from API`);
              docksFetched = true;
            } else {
              console.error('Invalid docks data format:', docksData);
              dockRetries++;
            }
          } else {
            console.error(`Failed to fetch docks: ${docksResponse.status} ${docksResponse.statusText}`);
            dockRetries++;
            // Add exponential backoff
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, dockRetries)));
          }
        } catch (error) {
          // Make sure to clear the timeout if there's an error
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          // Check if this is an abort error
          if (error instanceof Error && error.name === 'AbortError') {
            console.error('Fetch request for docks was aborted due to timeout');
          } else {
            console.error('Error during fetch:', error);
          }
          
          throw error; // Re-throw to be caught by the outer catch
        }
      } catch (error) {
        console.error(`Error fetching docks (attempt ${dockRetries + 1}):`, error);
        dockRetries++;
        // Add exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, dockRetries)));
      }
    }
    
    if (!docksFetched) {
      console.warn(`Failed to fetch docks after ${MAX_RETRIES} attempts, proceeding with empty docks array`);
    }
    
    // Extract building points from polygons
    const buildingPoints: {point: Point, id: string, polygonId: string}[] = [];
    const centers: {point: Point, id: string, polygonId: string}[] = [];
    
    // Extract centers and building points from polygons
    for (const polygon of polygons) {
      // Add center
      if (polygon.center) {
        const centerId = `center-${polygon.id}`;
        centers.push({
          point: polygon.center,
          id: centerId,
          polygonId: polygon.id
        });
      }
      
      // Add building points
      if (polygon.buildingPoints) {
        for (const point of polygon.buildingPoints) {
          const pointId = point.id || `building_${point.lat}-${point.lng}`;
          buildingPoints.push({
            point: { lat: point.lat, lng: point.lng },
            id: pointId,
            polygonId: polygon.id
          });
        }
      }
    }
    
    console.log(`Found ${buildingPoints.length} building points, ${bridges.length} bridges, ${docks.length} docks`);
    
    // Add all nodes to the graph
    // 1. Add building points
    for (const point of buildingPoints) {
      graph.nodes[point.id] = {
        id: point.id,
        position: point.point,
        type: 'building',
        polygonId: point.polygonId
      };
      graph.edges[point.id] = [];
    }
    
    // 2. Add bridges from API
    for (const bridge of bridges) {
      if (bridge.position && bridge.isConstructed) {
        const bridgeId = bridge.buildingId || `bridge_${bridge.position.lat}_${bridge.position.lng}`;
        graph.nodes[bridgeId] = {
          id: bridgeId,
          position: bridge.position,
          type: 'bridge',
          polygonId: bridge.landId || 'unknown'
        };
        graph.edges[bridgeId] = [];
      }
    }
    
    // 3. Add docks from API
    for (const dock of docks) {
      if (dock.position && dock.isConstructed) {
        const dockId = dock.buildingId || `dock_${dock.position.lat}_${dock.position.lng}`;
        graph.nodes[dockId] = {
          id: dockId,
          position: dock.position,
          type: 'canal',
          polygonId: dock.landId || 'unknown'
        };
        graph.edges[dockId] = [];
      }
    }
    
    // 4. Add centers
    for (const center of centers) {
      graph.nodes[center.id] = {
        id: center.id,
        position: center.point,
        type: 'center',
        polygonId: center.polygonId
      };
      graph.edges[center.id] = [];
    }
    
    // Connect nodes within each polygon
    // Group nodes by polygon for more efficient processing
    const nodesByPolygon: Record<string, string[]> = {};
    
    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      if (!nodesByPolygon[node.polygonId]) {
        nodesByPolygon[node.polygonId] = [];
      }
      nodesByPolygon[node.polygonId].push(nodeId);
    }
    
    // Connect nodes within each polygon
    for (const [polygonId, nodeIds] of Object.entries(nodesByPolygon)) {
      for (let i = 0; i < nodeIds.length; i++) {
        const node1Id = nodeIds[i];
        const node1 = graph.nodes[node1Id];
        
        for (let j = i + 1; j < nodeIds.length; j++) {
          const node2Id = nodeIds[j];
          const node2 = graph.nodes[node2Id];
          
          // Skip canal-to-non-canal connections (canal points should only connect to other canal points)
          if ((node1.type === 'canal' && node2.type !== 'canal') || 
              (node1.type !== 'canal' && node2.type === 'canal')) {
            continue;
          }
          
          const distance = this.calculateDistance(node1.position, node2.position);
          
          // Calculate weight based on node types - water travel is twice as fast
          let weight = distance;
          
          // If both nodes are canal points, reduce the weight by half (making water travel twice as fast)
          if (node1.type === 'canal' && node2.type === 'canal') {
            weight = distance / 2;
          }
          
          // Add bidirectional edges
          graph.edges[node1Id].push({
            from: node1Id,
            to: node2Id,
            weight: weight
          });
          
          graph.edges[node2Id].push({
            from: node2Id,
            to: node1Id,
            weight: weight
          });
        }
      }
    }
    
    // Connect bridges between polygons using the links property from the API
    for (const bridge of bridges) {
      if (bridge.position && bridge.isConstructed && bridge.links && bridge.links.length >= 2) {
        const bridgeId = bridge.buildingId || `bridge_${bridge.position.lat}_${bridge.position.lng}`;
        
        // Skip if the bridge node doesn't exist in the graph
        if (!graph.edges[bridgeId]) {
          continue;
        }
        
        // Connect this bridge to centers of the linked polygons
        for (const linkedPolygonId of bridge.links) {
          const centerId = `center-${linkedPolygonId}`;
          
          // Skip if the center node doesn't exist in the graph
          if (!graph.edges[centerId]) {
            continue;
          }
          
          // Calculate distance between bridge and center
          const centerNode = graph.nodes[centerId];
          const distance = this.calculateDistance(bridge.position, centerNode.position);
          
          // Use a lower weight for bridges to prioritize them in pathfinding
          const weight = distance * 0.5; // Make bridges more attractive for pathfinding
          
          // Add bidirectional edges
          graph.edges[bridgeId].push({
            from: bridgeId,
            to: centerId,
            weight: weight
          });
          
          graph.edges[centerId].push({
            from: centerId,
            to: bridgeId,
            weight: weight
          });
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
        const distance = this.calculateDistance(canalNode1.position, canalNode2.position);
        
        // Increase maximum distance further and reduce minimum distance
        if (distance > 5 && distance < 500) {
          // Skip if the line between these points would cross land
          if (this.doesLineIntersectLand(canalNode1.position, canalNode2.position, polygons)) {
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
    
    // Log the node types for debugging
    const nodeTypes = {};
    Object.values(graph.nodes).forEach(node => {
      nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
    });
    console.log('Real infrastructure graph node types:', nodeTypes);
    
    return graph;
  }

  /**
   * Debug function to get information about the graph
   * This is used by the debug endpoint
   */
  public async debugGraph(): Promise<any> {
    // Ensure graph is built
    if (!this.graph) {
      // Use the appropriate graph building method based on pathfinding mode
      if (this.pathfindingMode === 'real') {
        this.graph = await this.buildGraphReal(this.polygons);
      } else {
        this.graph = await this.buildGraph(this.polygons);
      }
    }
    
    // Count nodes by type
    const nodesByType: Record<string, number> = {};
    for (const node of Object.values(this.graph.nodes)) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }
    
    // Count edges
    const totalEdges = Object.values(this.graph.edges).reduce(
      (sum, edges) => sum + edges.length, 
      0
    );
    
    // Count connected components
    const components = this.findConnectedComponents(this.graph);
    
    // Log detailed information about bridge and canal points
    const bridgeNodes = Object.values(this.graph.nodes).filter(node => node.type === 'bridge');
    const canalNodes = Object.values(this.graph.nodes).filter(node => node.type === 'canal');
    
    console.log(`Debug: Found ${bridgeNodes.length} bridge nodes and ${canalNodes.length} canal nodes`);
    console.log(`Debug: Current pathfinding mode is ${this.pathfindingMode}`);
    
    if (bridgeNodes.length < 5) {
      console.log('Debug: Bridge nodes:', bridgeNodes);
    }
    
    if (canalNodes.length < 5) {
      console.log('Debug: Canal nodes:', canalNodes);
    }
    
    return {
      totalNodes: Object.keys(this.graph.nodes).length,
      totalEdges: totalEdges,
      nodesByType: nodesByType,
      connectedComponents: components.length,
      componentSizes: components.map(c => c.length),
      pathfindingMode: this.pathfindingMode,
      polygonsLoaded: this.polygonsLoaded,
      polygonCount: this.polygons.length,
      canalNetworkSegments: Object.keys(this.canalNetwork).length
    };
  }

  // Function to build canal network
  private buildCanalNetwork(polygons: Polygon[]): Record<string, Point[]> {
    // Create a map of canal segments
    const canalNetwork: Record<string, Point[]> = {};

    // Extract all canal points
    const allCanalPoints: {point: Point, id: string, polygonId: string, isConstructed: boolean}[] = [];

    // First, collect all canal points
    for (const polygon of polygons) {
      if (polygon.canalPoints) {
        for (const point of polygon.canalPoints) {
          if (point.edge) {
            const pointId = point.id || `canal-${point.edge.lat}-${point.edge.lng}`;
            // Check if this is a constructed dock
            const isConstructed = !!point.isConstructed || 
                                 (pointId.includes('public_dock') || pointId.includes('dock-constructed'));
            
            // In 'real' mode, only include constructed docks
            if (this.pathfindingMode === 'all' || isConstructed) {
              allCanalPoints.push({
                point: point.edge,
                id: pointId,
                polygonId: polygon.id,
                isConstructed
              });
            }
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
          const intersects = this.doLineSegmentsIntersect(
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
        const distance = this.calculateDistance(point1.point, point2.point);
        
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
  private enhancePathWithCanalSegments(pathPoints: any[], canalNetwork: Record<string, Point[]>): any[] {
    // This function is modified to no longer add artificial intermediate points.
    // It will return the original path points, as the start/end points are already handled.
    return pathPoints;
  }

  // Function to enhance water paths with intermediate points
  private enhanceWaterPath(pathPoints: any[]): any[] {
    // This function is modified to no longer add artificial intermediate points.
    // It will return the original path points.
    return pathPoints;
  }

  // Function to find the closest node to a given point
  private findClosestNode(point: Point, graph: Graph, polygonId?: string): string | null {
    let closestNode: string | null = null;
    let minDistance = Infinity;
    
    // First try to find nodes in the specified polygon
    if (polygonId) {
      for (const [nodeId, node] of Object.entries(graph.nodes)) {
        if (node.polygonId === polygonId) {
          const distance = this.calculateDistance(point, node.position);
          if (distance < minDistance) {
            minDistance = distance;
            closestNode = nodeId;
          }
        }
      }
      
      // If we found a node in the specified polygon, return it
      if (closestNode) {
        return closestNode;
      }
      
      // If not, log a warning and continue with all nodes
      console.warn(`No nodes found in polygon ${polygonId}, searching all nodes`);
    }
    
    // If no polygon specified or no nodes found in the specified polygon, search all nodes
    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      const distance = this.calculateDistance(point, node.position);
      if (distance < minDistance) {
        minDistance = distance;
        closestNode = nodeId;
      }
    }
    
    // If we still didn't find any nodes, log an error
    if (!closestNode) {
      console.error('No nodes found in the graph!');
    } else {
      console.log(`Found closest node ${closestNode} at distance ${minDistance}m`);
    }
    
    return closestNode;
  }

  // Function to find multiple close nodes to a given point
  private findCloseNodes(point: Point, graph: Graph, polygonId?: string, limit: number = 10): string[] {
    const nodes: {id: string, distance: number}[] = [];
    
    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      // If polygonId is specified, only consider nodes in that polygon
      if (polygonId && node.polygonId !== polygonId) {
        continue;
      }
      
      const distance = this.calculateDistance(point, node.position);
      nodes.push({ id: nodeId, distance });
    }
    
    // Sort by distance and return the closest ones
    nodes.sort((a, b) => a.distance - b.distance);
    return nodes.slice(0, limit).map(node => node.id);
  }

  // Function to find the polygon containing a point
  private findPolygonContainingPoint(point: Point, polygons: Polygon[]): Polygon | null {
    for (const polygon of polygons) {
      if (this.isPointInPolygon(point, polygon.coordinates)) {
        return polygon;
      }
    }
    return null;
  }

  // Function to check if a point is inside a polygon
  private isPointInPolygon(point: Point, polygon: Point[]): boolean {
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

  // Add a helper method to check if a point is a special point (canal or bridge)
  private isSpecialPoint(point: Point, polygons: Polygon[]): boolean {
    // Check if this point is a canal point or bridge point
    for (const polygon of polygons) {
      // Check canal points
      if (polygon.canalPoints) {
        for (const canalPoint of polygon.canalPoints) {
          if (canalPoint.edge && 
              Math.abs(canalPoint.edge.lat - point.lat) < 0.0001 && 
              Math.abs(canalPoint.edge.lng - point.lng) < 0.0001) {
            return true;
          }
        }
      }
      
      // Check bridge points
      if (polygon.bridgePoints) {
        for (const bridgePoint of polygon.bridgePoints) {
          if (bridgePoint.edge && 
              Math.abs(bridgePoint.edge.lat - point.lat) < 0.0001 && 
              Math.abs(bridgePoint.edge.lng - point.lng) < 0.0001) {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  // Helper method to check if a line intersects land
  private doesLineIntersectLand(point1: Point, point2: Point, polygons: Polygon[]): boolean {
    // For each polygon, check if the line intersects any of its edges
    for (const polygon of polygons) {
      const coords = polygon.coordinates;
      if (!coords || coords.length < 3) continue;

      // Check if either point is inside the polygon (except for canal points or bridge points)
      const isPoint1Special = this.isSpecialPoint(point1, polygons);
      const isPoint2Special = this.isSpecialPoint(point2, polygons);

      // If both points are special points (canal or bridge), they're valid connections
      if (isPoint1Special && isPoint2Special) {
        continue;
      }

      // Check if the line intersects any polygon edge
      for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
        const intersects = this.doLineSegmentsIntersect(
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
  }

  // Helper function to check if a point is near water
  private isPointNearWater(point: Point, polygons: Polygon[]): boolean {
    const WATER_PROXIMITY_THRESHOLD = 30; // meters
    
    for (const polygon of polygons) {
      if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
        for (const canalPoint of polygon.canalPoints) {
          if (canalPoint.edge) {
            const distance = this.calculateDistance(point, canalPoint.edge);
            if (distance < WATER_PROXIMITY_THRESHOLD) {
              return true;
            }
          }
        }
      }
    }
    
    return false;
  }

  // Add a helper method to check if a point is near a bridge
  private isPointNearBridge(point: Point, polygons: Polygon[]): boolean {
    const BRIDGE_PROXIMITY_THRESHOLD = 30; // meters
    
    for (const polygon of polygons) {
      if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
        for (const bridgePoint of polygon.bridgePoints) {
          if (bridgePoint.edge) {
            const distance = this.calculateDistance(point, bridgePoint.edge);
            if (distance < BRIDGE_PROXIMITY_THRESHOLD) {
              return true;
            }
          }
        }
      }
    }
    
    return false;
  }
  
  // Add a new method to find the nearest public dock
  private async findNearestPublicDock(point: Point, landGroupId?: string): Promise<any | null> {
    try {
      console.log(`Finding nearest public dock to ${point.lat},${point.lng}${landGroupId ? ` in land group ${landGroupId}` : ''}`);
      
      // Determine if we're running in Node.js or browser environment
      const isNode = typeof window === 'undefined';
      
      // Set base URL depending on environment
      const baseUrl = isNode 
        ? (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
        : '';
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      // Fetch all dock buildings
      const response = await fetch(`${baseUrl}/api/docks`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error(`Failed to fetch docks: ${response.status} ${response.statusText}`);
        return null;
      }
      
      const data = await response.json();
      
      if (!data.success || !Array.isArray(data.docks) || data.docks.length === 0) {
        console.error('No docks found in API response');
        return null;
      }
      
      console.log(`Found ${data.docks.length} docks in API response`);
      
      // Filter to only include constructed public docks
      let publicDocks = data.docks.filter(dock => 
        dock.isConstructed && 
        dock.position && 
        (dock.id?.includes('public_dock') || dock.type?.includes('public_dock'))
      );
      
      // If a land group ID is provided, filter docks to only include those in the same land group
      if (landGroupId) {
        // First, get the land groups data
        const landGroupsResponse = await fetch(`${baseUrl}/api/land-groups?includeUnconnected=true&minSize=1`, {
          signal: controller.signal
        });
        
        if (landGroupsResponse.ok) {
          const landGroupsData = await landGroupsResponse.json();
          if (landGroupsData.success && landGroupsData.landGroups) {
            // Find the land group that contains the specified landGroupId
            const targetGroup = landGroupsData.landGroups.find(group => 
              group.groupId === landGroupId || (group.lands && group.lands.includes(landGroupId))
            );
            
            if (targetGroup && targetGroup.lands) {
              console.log(`Filtering docks to land group ${targetGroup.groupId} with ${targetGroup.lands.length} lands`);
              
              // Filter docks to only include those in the same land group
              publicDocks = publicDocks.filter(dock => 
                dock.land_id && targetGroup.lands.includes(dock.land_id)
              );
              
              console.log(`Found ${publicDocks.length} public docks in the same land group`);
            }
          }
        }
      }
      
      if (publicDocks.length === 0) {
        console.warn('No suitable public docks found, trying all constructed docks');
        // If no public docks, try any constructed dock
        const constructedDocks = data.docks.filter(dock => 
          dock.isConstructed && dock.position
        );
        
        if (constructedDocks.length === 0) {
          console.warn('No constructed docks found');
          return null;
        }
        
        // Find the closest constructed dock
        let closestDock = null;
        let minDistance = Infinity;
        
        for (const dock of constructedDocks) {
          const distance = this.calculateDistance(point, dock.position);
          if (distance < minDistance) {
            minDistance = distance;
            closestDock = dock;
          }
        }
        
        console.log(`Found closest constructed dock at distance ${minDistance}m: ${closestDock.id}`);
        return closestDock;
      }
      
      // Find the closest public dock
      let closestDock = null;
      let minDistance = Infinity;
      
      for (const dock of publicDocks) {
        const distance = this.calculateDistance(point, dock.position);
        if (distance < minDistance) {
          minDistance = distance;
          closestDock = dock;
        }
      }
      
      console.log(`Found closest public dock at distance ${minDistance}m: ${closestDock.id}`);
      return closestDock;
    } catch (error) {
      console.error('Error finding nearest public dock:', error);
      return null;
    }
  }

  // Dijkstra's algorithm to find the shortest path
  private findShortestPath(graph: Graph, startNodeId: string, endNodeId: string): { path: string[], distance: number } | null {
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
        
        // Apply heuristic weights based on node types to prioritize infrastructure
        let adjustedWeight = weight;
        
        // Get node types
        const currentNode = graph.nodes[nodeId];
        const neighborNode = graph.nodes[neighbor];
        
        if (currentNode && neighborNode) {
          // Prioritize bridge connections
          if ((currentNode.type === 'bridge' && neighborNode.type === 'bridge') ||
              (currentNode.type === 'bridge' && neighborNode.type === 'center') ||
              (currentNode.type === 'center' && neighborNode.type === 'bridge')) {
            adjustedWeight *= 0.7; // Reduce weight to prioritize bridges
          }
          
          // Prioritize canal connections for water travel
          if (currentNode.type === 'canal' && neighborNode.type === 'canal') {
            adjustedWeight *= 0.5; // Reduce weight to prioritize water travel
          }
        }
        
        // Calculate new distance
        const distance = distances[nodeId] + adjustedWeight;
        
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

  // Helper function to find connected components in the graph
  private findConnectedComponents(graph: Graph): string[][] {
    const visited = new Set<string>();
    const components: string[][] = [];
    
    for (const nodeId in graph.nodes) {
      if (!visited.has(nodeId)) {
        const component: string[] = [];
        this.dfs(nodeId, component, visited, graph);
        components.push(component);
      }
    }
    
    return components;
  }

  // Helper DFS function for finding connected components
  private dfs(nodeId: string, component: string[], visited: Set<string>, graph: Graph) {
    visited.add(nodeId);
    component.push(nodeId);
    
    for (const edge of graph.edges[nodeId] || []) {
      if (!visited.has(edge.to)) {
        this.dfs(edge.to, component, visited, graph);
      }
    }
  }

  // Helper function to find which component a node belongs to
  private findComponentForNode(nodeId: string, components: string[][]): number {
    for (let i = 0; i < components.length; i++) {
      if (components[i].includes(nodeId)) {
        return i;
      }
    }
    return -1;
  }

  // Helper method to create a direct water path
  private createDirectWaterPath(startPoint: Point, endPoint: Point): any {
    console.log('Creating direct water path');
    
    // Calculate direct distance
    const directDistance = this.calculateDistance(startPoint, endPoint);
    
    // Create a direct path with intermediate points
    const numPoints = Math.max(2, Math.floor(directDistance / 200)); // More points for longer distances
    const directPath = [
      {
        ...startPoint,
        type: 'canal',
        polygonId: 'virtual',
        transportMode: 'gondola'
      }
    ];
    
    // Add intermediate points
    for (let i = 1; i <= numPoints; i++) {
      const fraction = i / (numPoints + 1);
      // Add some randomness to create natural curves
      const jitter = 0.00005 * (Math.random() * 2 - 1);
      directPath.push({
        lat: startPoint.lat + (endPoint.lat - startPoint.lat) * fraction + jitter,
        lng: startPoint.lng + (endPoint.lng - startPoint.lng) * fraction + jitter,
        type: 'canal',
        polygonId: 'virtual',
        transportMode: 'gondola',
        isIntermediatePoint: true
      });
    }
    
    // Add the end point
    directPath.push({
      ...endPoint,
      type: 'canal',
      polygonId: 'virtual',
      transportMode: 'gondola'
    });
    
    // Calculate time based on distance (gondola speed of 10 km/h)
    const timeHours = directDistance / 1000 / 10;
    const timeMinutes = Math.round(timeHours * 60);
    
    return {
      success: true,
      path: directPath,
      distance: directDistance,
      walkingDistance: 0,
      waterDistance: directDistance,
      estimatedTimeMinutes: timeMinutes,
      waterOnly: true,
      isDirectFallback: true,
      // Add the roundTrip path
      roundTrip: [...directPath, ...directPath.slice().reverse().slice(1)]
    };
  }

  // Helper method to add intermediate points between two points
  private addIntermediatePoints(
    path: any[], 
    startPoint: Point, 
    endPoint: Point, 
    transportMode: string,
    distance: number
  ): void {
    // This function is intentionally left blank to prevent adding artificial intermediate points.
    // The original logic added points to make paths appear more "natural".
    return;
  }

  // Function to find a water-only path between two points
  public async findWaterOnlyPath(startPoint: Point, endPoint: Point, mode?: 'all' | 'real'): Promise<any> {
    // If mode is provided, update the pathfinding mode
    if (mode) {
      this.setPathfindingMode(mode);
    }
    try {
      console.log(`Starting water-only path calculation from ${startPoint.lat},${startPoint.lng} to ${endPoint.lat},${endPoint.lng} (mode: ${this.pathfindingMode})`);
      
      // Ensure polygons and water graph are loaded
      if (!this.polygonsLoaded || !this.waterGraph) {
        console.log('Polygons or water graph not loaded yet, initializing service for water-only path...');
        const success = await this.initializeService();
        
        if (!success) {
          console.error('Failed to initialize transport service for water-only path');
          return {
            success: false,
            error: 'No data available for water-only pathfinding',
            details: 'Failed to initialize transport service'
          };
        }
      }
      
      // Ensure we have the water graph
      if (!this.waterGraph || !this.waterGraph.waterPoints || this.waterGraph.waterPoints.length === 0) {
        console.error('No water graph available for water-only pathfinding');
        return {
          success: false,
          error: 'No water graph available for water-only pathfinding',
          details: 'Water graph is empty or not loaded'
        };
      }
      
      console.log(`Using water graph with ${this.waterGraph.waterPoints.length} water points`);
      
      // STEP 1: Determine context for start and end points (land or water)
      const startPolygon = this.findPolygonContainingPoint(startPoint, this.polygons);
      const endPolygon = this.findPolygonContainingPoint(endPoint, this.polygons);

      // Segments of the full path
      const pathSegments: any[] = [];
      
      let effectiveStartForWaterNet: Point; // Point to connect to the water network (startPoint or a dock)
      let startDockRef: any = null;

      if (startPolygon) {
        // Start is on land, find dock and path to it
        console.log('Start point is on land. Finding nearest dock.');
        const startLandGroupId = await this.getLandGroupId(startPolygon.id);
        startDockRef = await this.findNearestPublicDock(startPoint, startLandGroupId);

        if (!startDockRef) {
          console.warn('No public dock found near start point for water-only path, falling back to direct water path.');
          return this.createDirectWaterPath(startPoint, endPoint);
        }
        effectiveStartForWaterNet = startDockRef.position;
        
        // Add path from startPoint to startDockRef.position
        pathSegments.push({ ...startPoint, type: 'center', transportMode: 'walking', polygonId: startPolygon.id });
        this.addIntermediatePoints(pathSegments, startPoint, startDockRef.position, 'walking', this.calculateDistance(startPoint, startDockRef.position));
        pathSegments.push({ ...startDockRef.position, type: 'building', buildingType: 'dock', buildingId: startDockRef.id, transportMode: 'walking', polygonId: startDockRef.land_id || startPolygon.id });
      } else {
        // Start is in water
        console.log('Start point is in water.');
        effectiveStartForWaterNet = startPoint;
        pathSegments.push({ ...startPoint, type: 'water', transportMode: 'gondola', polygonId: 'virtual' });
      }

      // Find closest water graph node to effectiveStartForWaterNet
      let closestStartWaterNode: any = null;
      let distToClosestStartWaterNode = Infinity;
      for (const wgNode of this.waterGraph.waterPoints) {
        const dist = this.calculateDistance(effectiveStartForWaterNet, wgNode.position);
        if (dist < distToClosestStartWaterNode) {
          distToClosestStartWaterNode = dist;
          closestStartWaterNode = wgNode;
        }
      }
      if (!closestStartWaterNode) {
        console.error('Could not find any water graph node near the effective start. Falling back to direct path.');
        return this.createDirectWaterPath(startPoint, endPoint);
      }
      
      // Add segment from effectiveStartForWaterNet to closestStartWaterNode.position
      const modeToWaterNodeStart = startPolygon ? 'walking' : 'gondola';
      this.addIntermediatePoints(pathSegments, effectiveStartForWaterNet, closestStartWaterNode.position, modeToWaterNodeStart, distToClosestStartWaterNode);
      pathSegments.push({ ...closestStartWaterNode.position, type: 'canal', transportMode: modeToWaterNodeStart, nodeId: closestStartWaterNode.id, polygonId: 'virtual' });

      // Similar logic for the end point
      let effectiveEndForWaterNet: Point;
      let endDockRef: any = null;

      if (endPolygon) {
        console.log('End point is on land. Finding nearest dock.');
        const endLandGroupId = await this.getLandGroupId(endPolygon.id);
        endDockRef = await this.findNearestPublicDock(endPoint, endLandGroupId);
        if (!endDockRef) {
          console.warn('No public dock found near end point for water-only path, falling back to direct water path.');
          return this.createDirectWaterPath(startPoint, endPoint);
        }
        effectiveEndForWaterNet = endDockRef.position;
      } else {
        console.log('End point is in water.');
        effectiveEndForWaterNet = endPoint;
      }

      let closestEndWaterNode: any = null;
      let distToClosestEndWaterNode = Infinity;
      for (const wgNode of this.waterGraph.waterPoints) {
        const dist = this.calculateDistance(effectiveEndForWaterNet, wgNode.position);
        if (dist < distToClosestEndWaterNode) {
          distToClosestEndWaterNode = dist;
          closestEndWaterNode = wgNode;
        }
      }
      if (!closestEndWaterNode) {
        console.error('Could not find any water graph node near the effective end. Falling back to direct path.');
        return this.createDirectWaterPath(startPoint, endPoint);
      }

      // Pathfind on waterGraph
      console.log(`Finding water graph path between ${closestStartWaterNode.id} and ${closestEndWaterNode.id}`);
      const waterGraphNodeIds = this.findWaterGraphPath(closestStartWaterNode.id, closestEndWaterNode.id);

      if (!waterGraphNodeIds || waterGraphNodeIds.length === 0) {
        console.warn('No path found on water graph. Attempting direct connection between closest water points or full fallback.');
        // Try direct path between closest water points as a simpler fallback
        // pathSegments already contains closestStartWaterNode.position
        this.addIntermediatePoints(pathSegments, closestStartWaterNode.position, closestEndWaterNode.position, 'gondola', this.calculateDistance(closestStartWaterNode.position, closestEndWaterNode.position)); // This is a NO-OP
        pathSegments.push({ ...closestEndWaterNode.position, type: 'canal', transportMode: 'gondola', nodeId: closestEndWaterNode.id, polygonId: 'virtual' }); // Main node
      } else {
        // Reconstruct path using waterGraphNodeIds and include intermediatePoints from watergraph.json
        // pathSegments already contains the position of waterGraphNodeIds[0] (closestStartWaterNode.position)
        for (let i = 0; i < waterGraphNodeIds.length - 1; i++) {
          const currentWaterNodeId = waterGraphNodeIds[i];
          const nextWaterNodeId = waterGraphNodeIds[i+1];

          const currentWaterNode = this.waterGraph.waterPoints.find(wp => wp.id === currentWaterNodeId);
          const nextWaterNode = this.waterGraph.waterPoints.find(wp => wp.id === nextWaterNodeId);

          if (currentWaterNode && nextWaterNode) {
            const connection = currentWaterNode.connections.find(conn => conn.targetId === nextWaterNodeId);
            if (connection && connection.intermediatePoints && connection.intermediatePoints.length > 0) {
              connection.intermediatePoints.forEach(ip => {
                pathSegments.push({
                  ...ip, // lat, lng
                  type: 'canal',
                  transportMode: 'gondola',
                  isIntermediatePoint: true, // Mark as intermediate
                  polygonId: 'virtual'
                });
              });
            }
            // Add the next main water node's position
            pathSegments.push({
              ...nextWaterNode.position,
              type: 'canal',
              transportMode: 'gondola',
              nodeId: nextWaterNode.id,
              polygonId: 'virtual'
              // isIntermediatePoint is undefined/false for main nodes
            });
          }
        }
      }
      
      // Add segment from the last point in pathSegments (which is closestEndWaterNode.position or equivalent) to effectiveEndForWaterNet
      const modeFromWaterNodeEnd = endPolygon ? 'walking' : 'gondola';
      // pathSegments already ends with closestEndWaterNode.position
      this.addIntermediatePoints(pathSegments, closestEndWaterNode.position, effectiveEndForWaterNet, modeFromWaterNodeEnd, distToClosestEndWaterNode);
      
      if (endPolygon) {
        pathSegments.push({ ...endDockRef.position, type: 'building', buildingType: 'dock', buildingId: endDockRef.id, transportMode: 'walking', polygonId: endDockRef.land_id || endPolygon.id });
        this.addIntermediatePoints(pathSegments, endDockRef.position, endPoint, 'walking', this.calculateDistance(endDockRef.position, endPoint));
        pathSegments.push({ ...endPoint, type: 'center', transportMode: 'walking', polygonId: endPolygon.id });
      } else {
        pathSegments.push({ ...endPoint, type: 'water', transportMode: 'gondola', polygonId: 'virtual' });
      }
      
      // Deduplicate the final path
      const fullPath = pathSegments.reduce((acc, current, index, arr) => {
        if (index === 0) {
          acc.push(current);
        } else {
          const prev = arr[index-1];
          if (!(Math.abs(current.lat - prev.lat) < 1e-7 && 
                Math.abs(current.lng - prev.lng) < 1e-7 &&
                current.transportMode === prev.transportMode &&
                current.type === prev.type )) {
            acc.push(current);
          } else {
            // If coordinates are identical but other properties differ, keep the current one if it's more specific (e.g. building type)
            if (current.buildingType && !prev.buildingType) {
                acc.pop(); // remove previous less specific point
                acc.push(current);
            } else if (current.nodeId && !prev.nodeId) {
                acc.pop();
                acc.push(current);
            } else if (current.isIntermediatePoint === true && prev.isIntermediatePoint !== true) {
                // If current is an intermediate point and previous wasn't (and coords are same), prefer current.
                acc.pop();
                acc.push(current);
            }
          }
        }
        return acc;
      }, []);
      
      // STEP 6: Calculate distances and time (using the new fullPath)
      let totalWalkingDistance = 0;
      let totalWaterDistance = 0;
      
      for (let i = 0; i < fullPath.length - 1; i++) {
        const point1 = fullPath[i];
        const point2 = fullPath[i + 1];
        const distance = this.calculateDistance(point1, point2);
        
        if (point1.transportMode === 'gondola') {
          totalWaterDistance += distance;
        } else {
          totalWalkingDistance += distance;
        }
      }
      
      // Calculate time based on distance (walking at 3.5 km/h, gondola at 10 km/h)
      const walkingTimeHours = totalWalkingDistance / 1000 / 3.5;
      const waterTimeHours = totalWaterDistance / 1000 / 10;
      const totalTimeMinutes = Math.round((walkingTimeHours + waterTimeHours) * 60);
      
      // Enhance the path with intermediate points for smoother visualization
      const enhancedPath = this.enhanceWaterPath(fullPath);
      
      return {
        success: true,
        path: enhancedPath,
        distance: totalWalkingDistance + totalWaterDistance,
        walkingDistance: totalWalkingDistance,
        waterDistance: totalWaterDistance,
        estimatedTimeMinutes: totalTimeMinutes,
        waterOnly: false,
        // Add the roundTrip path by reversing the path and combining
        roundTrip: [...enhancedPath, ...enhancedPath.slice().reverse().slice(1)]
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

  // Main function to find the path between two points
  public async findPath(startPoint: Point, endPoint: Point, mode?: 'all' | 'real'): Promise<any> {
    // If mode is provided, update the pathfinding mode
    if (mode) {
      this.setPathfindingMode(mode);
    }
    try {
      // Ensure polygons are loaded using the initialization service
      if (!this.polygonsLoaded) {
        console.log('Polygons not loaded yet, initializing service...');
        const success = await this.initializeService();
        
        if (!success) {
          console.error('Failed to initialize transport service');
          return {
            success: false,
            error: 'Failed to initialize transport service',
            details: 'Failed to initialize transport service'
          };
        }
      }
      
      if (this.polygons.length === 0) {
        console.error('No polygons available for pathfinding');
        return {
          success: false,
          error: 'No polygon data available for pathfinding',
          details: 'Polygon array is empty'
        };
      }
      
      // Find the polygons containing the start and end points
      const startPolygon = this.findPolygonContainingPoint(startPoint, this.polygons);
      const endPolygon = this.findPolygonContainingPoint(endPoint, this.polygons);
      
      // If either point is not within a polygon, use water-only pathfinding
      if (!startPolygon || !endPolygon) {
        console.log('Points not within polygons, using water-only pathfinding');
        return this.findWaterOnlyPath(startPoint, endPoint);
      }
      
      // Check if both points are in the same land group
      const sameGroup = await this.arePointsInSameGroup(startPolygon.id, endPolygon.id);
      
      // If they're in the same polygon, use land pathfinding
      if (startPolygon.id === endPolygon.id) {
        console.log('Points are in the same polygon, using land pathfinding');
        // Continue with existing land pathfinding...
      } 
      // If they're in the same land group, use land pathfinding
      else if (sameGroup) {
        console.log('Points are in the same land group, using land pathfinding');
        // Continue with existing land pathfinding...
      } 
      // Otherwise, use water pathfinding
      else {
        console.log('Points are in different land groups, using water pathfinding');
        return this.findWaterOnlyPath(startPoint, endPoint);
      }
      
      // Ensure graph is built
      if (!this.graph) {
        if (this.pathfindingMode === 'real') {
          this.graph = await this.buildGraphReal(this.polygons);
        } else {
          this.graph = await this.buildGraph(this.polygons);
        }
      }
      
      // Ensure canal network is built
      if (!this.canalNetwork || Object.keys(this.canalNetwork).length === 0) {
        this.canalNetwork = this.buildCanalNetwork(this.polygons);
      }
      
      // Find the closest nodes to the start and end points
      console.log(`Starting path finding from ${startPoint.lat},${startPoint.lng} to ${endPoint.lat},${endPoint.lng}`);
      console.log(`Found ${Object.keys(this.graph.nodes).length} nodes and ${Object.values(this.graph.edges).flat().length} edges`);
      
      const startNodeIds = this.findCloseNodes(startPoint, this.graph, startPolygon.id, 10);
      const endNodeIds = this.findCloseNodes(endPoint, this.graph, endPolygon.id, 10);
      
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
          const result = this.findShortestPath(this.graph, startNodeId, endNodeId);
          
          if (result && result.distance < shortestDistance) {
            bestResult = result;
            shortestDistance = result.distance;
          }
        }
      }
      
      if (!bestResult) {
        console.log('No path found with nodes in the same polygon, trying nodes from nearby polygons');
        
        // Try nodes from any polygon
        const startNodeIdsAny = this.findCloseNodes(startPoint, this.graph, undefined, 15);
        const endNodeIdsAny = this.findCloseNodes(endPoint, this.graph, undefined, 15);
        
        for (const startNodeId of startNodeIdsAny) {
          for (const endNodeId of endNodeIdsAny) {
            const result = this.findShortestPath(this.graph, startNodeId, endNodeId);
            
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
          totalNodes: Object.keys(this.graph.nodes).length,
          totalEdges: Object.values(this.graph.edges).flat().length,
          canalNodes: Object.values(this.graph.nodes).filter(n => n.type === 'canal').length
        };
        
        console.log('No path found between any combination of nodes:', nodeInfo);
        
        return {
          success: false,
          error: 'No path found between the specified points',
          details: 'Unable to find a valid path between the start and end points using available infrastructure'
        };
      }
      
      // Use bestResult instead of result for the rest of the function
      const result = bestResult;
      
      // Convert node IDs to actual points for the response
      const pathPoints = result.path.map((nodeId, index) => {
        const node = this.graph.nodes[nodeId];
        
        // Determine transport mode between this node and the next
        let transportMode = 'walking';
        if (index < result.path.length - 1) {
          const nextNodeId = result.path[index + 1];
          const nextNode = this.graph.nodes[nextNodeId];
          
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
      
      // Ensure the path starts with the exact start point and ends with the exact end point
      if (pathPoints.length > 0) {
        // Replace the first point with the exact start point
        pathPoints[0] = {
          ...startPoint,
          nodeId: pathPoints[0].nodeId,
          type: pathPoints[0].type,
          polygonId: pathPoints[0].polygonId,
          transportMode: pathPoints[0].transportMode
        };
        
        // Replace the last point with the exact end point
        pathPoints[pathPoints.length - 1] = {
          ...endPoint,
          nodeId: pathPoints[pathPoints.length - 1].nodeId,
          type: pathPoints[pathPoints.length - 1].type,
          polygonId: pathPoints[pathPoints.length - 1].polygonId,
          transportMode: pathPoints[pathPoints.length - 1].transportMode
        };
      }
      
      // Enhance the path with canal segments
      const enhancedPath = this.enhancePathWithCanalSegments(pathPoints, this.canalNetwork);
      
      // Handle the case when the path is too short or empty
      if (enhancedPath.length <= 1 && startPolygon && endPolygon && startPolygon.id === endPolygon.id) {
        console.log('Start and end points are in the same polygon but path is too short, creating direct path');
        
        // Calculate direct distance
        const directDistance = this.calculateDistance(startPoint, endPoint);
        
        // Create a direct path with intermediate points if needed
        const directPath = [];
        
        // Add start point
        directPath.push({
          ...startPoint,
          type: 'center',
          polygonId: startPolygon.id,
          transportMode: 'walking'
        });
        
        // Add intermediate points for longer distances
        if (directDistance > 20) {
          const numPoints = Math.max(1, Math.floor(directDistance / 50));
          for (let i = 1; i <= numPoints; i++) {
            const fraction = i / (numPoints + 1);
            // Add some randomness to create natural curves
            const jitter = 0.00002 * (Math.random() * 2 - 1);
            directPath.push({
              lat: startPoint.lat + (endPoint.lat - startPoint.lat) * fraction + jitter,
              lng: startPoint.lng + (endPoint.lng - startPoint.lng) * fraction + jitter,
              type: 'center',
              polygonId: startPolygon.id,
              transportMode: 'walking',
              isIntermediatePoint: true
            });
          }
        }
        
        // Add end point
        directPath.push({
          ...endPoint,
          type: 'center',
          polygonId: endPolygon.id,
          transportMode: 'walking'
        });
        
        // Calculate time based on distance (walking at 3.5 km/h)
        const timeHours = directDistance / 1000 / 3.5;
        const timeMinutes = Math.round(timeHours * 60);
        
        return {
          success: true,
          path: directPath,
          distance: directDistance,
          walkingDistance: directDistance,
          waterDistance: 0,
          estimatedTimeMinutes: timeMinutes,
          startPolygon: startPolygon.id,
          endPolygon: endPolygon.id,
          // Add the roundTrip path by reversing the path and combining
          roundTrip: [...directPath, ...directPath.slice().reverse().slice(1)]
        };
      }
      
      // Calculate the actual travel time based on distance and mode
      let totalWalkingDistance = 0;
      let totalWaterDistance = 0;
      
      for (let i = 0; i < enhancedPath.length - 1; i++) {
        const point1 = enhancedPath[i];
        const point2 = enhancedPath[i + 1];
        const distance = this.calculateDistance(point1, point2);
        
        if (point1.transportMode === 'gondola') {
          totalWaterDistance += distance;
        } else {
          totalWalkingDistance += distance;
        }
      }
      
      // Assuming walking speed of 3.5 km/h and gondola speed of 10 km/h
      const walkingTimeHours = totalWalkingDistance / 1000 / 3.5;
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
        endPolygon: endPolygon.id,
        // Add the roundTrip path by reversing the path and combining
        roundTrip: [...enhancedPath, ...enhancedPath.slice().reverse().slice(1)]
      };
    } catch (error) {
      console.error('Error finding path:', error);
      return {
        success: false,
        error: 'An error occurred while finding the path',
        errorDetails: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

// Export a singleton instance
export const transportService = new TransportService();
