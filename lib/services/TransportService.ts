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
      this.calculateRoute(this.transportStartPoint, point);
    }
  }

  /**
   * Set pathfinding mode
   * @param mode 'all' to use all potential points, 'real' to only use constructed infrastructure
   */
  public setPathfindingMode(mode: 'all' | 'real'): void {
    this.pathfindingMode = mode;
    console.log(`Pathfinding mode set to: ${mode}`);
    
    // Rebuild the graph with the new mode
    if (this.polygonsLoaded && this.polygons.length > 0) {
      this.buildGraphAndNetwork();
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
    try {
      // Set calculating state to true to show loading indicator
      this.calculatingPath = true;
      eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATING, true);
      
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
          
          // Try API as fallback
          console.log('Trying API as fallback...');
        }
      }
      
      // Add this check to verify polygon data is available
      console.log(`Polygon data status: loaded=${this.polygonsLoaded}, count=${this.polygons.length}`);
      
      if (this.polygons.length > 0) {
        // Try local pathfinding
        const localResult = await this.findPath(start, end);
        
        if (localResult.success) {
          console.log('Transport route calculated locally:', localResult);
          this.transportPath = localResult.path;
          this.waterOnlyMode = !!localResult.waterOnly;
          
          // Emit event with the calculated path
          eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATED, {
            path: localResult.path,
            waterOnly: this.waterOnlyMode
          });
          return;
        }
        
        // If local pathfinding failed with "not within any polygon" error, try water-only pathfinding
        if (localResult.error === 'Start or end point is not within any polygon') {
          console.log('Regular pathfinding failed, attempting water-only pathfinding as fallback');
          const waterResult = await this.findWaterOnlyPath(start, end);
          
          if (waterResult.success) {
            console.log('Water-only transport route calculated locally:', waterResult);
            this.transportPath = waterResult.path;
            this.waterOnlyMode = true;
            
            // Emit event with the calculated path
            eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATED, {
              path: waterResult.path,
              waterOnly: true
            });
            return;
          }
        }
      }
      
      // Determine if we're running in Node.js or browser environment
      const isNode = typeof window === 'undefined';
      
      // Set base URL depending on environment
      const baseUrl = isNode 
        ? (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
        : '';
      
      // If local pathfinding failed or wasn't possible, fall back to API
      const response = await fetch(`${baseUrl}/api/transport`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startPoint: start,
          endPoint: end
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Transport route calculated via API:', data);
        
        if (data.success && data.path) {
          this.transportPath = data.path;
          // Set water-only mode if the API indicates it's a water-only route
          this.waterOnlyMode = !!data.waterOnly;
          
          // Emit event with the calculated path
          eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATED, {
            path: data.path,
            waterOnly: this.waterOnlyMode
          });
        } else {
          console.error('Failed to calculate route:', data.error);
          
          // If the error is about points not being within polygons, try to use water-only pathfinding
          if (data.error === 'Start or end point is not within any polygon') {
            console.log('Points not within polygons, attempting water-only pathfinding');
            
            // Show a message to the user
            alert('Points are not on land. Attempting to find a water route...');
            
            // Make a direct request to the water-only pathfinding endpoint
            const waterResponse = await fetch(`${baseUrl}/api/transport/water-only`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                startPoint: start,
                endPoint: end
              }),
            });
            
            if (waterResponse.ok) {
              const waterData = await waterResponse.json();
              
              if (waterData.success && waterData.path) {
                this.transportPath = waterData.path;
                this.waterOnlyMode = true;
                
                // Emit event with the calculated path
                eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATED, {
                  path: waterData.path,
                  waterOnly: true
                });
                return;
              }
            }
          }
          
          // If we get here, both regular and water-only pathfinding failed
          alert(`Could not find a route: ${data.error || 'Unknown error'}`);
          // Reset end point to allow trying again
          this.transportEndPoint = null;
          eventBus.emit(EventTypes.TRANSPORT_ROUTE_ERROR, data.error || 'Unknown error');
        }
      } else {
        console.error('API error:', response.status);
        alert('Error calculating route. Please try again.');
        this.transportEndPoint = null;
        eventBus.emit(EventTypes.TRANSPORT_ROUTE_ERROR, 'API error: ' + response.status);
      }
    } catch (error) {
      console.error('Error calculating transport route:', error);
      
      // Create a simple direct path as a last resort
      try {
        console.log('Attempting emergency direct path as last resort...');
        
        if (start && end) {
          // Calculate direct distance
          const directDistance = this.calculateDistance(start, end);
          
          // Create a simple direct path
          const directPath = [
            { ...start, type: 'centroid', transportMode: 'walking' },
            { ...end, type: 'centroid', transportMode: 'walking' }
          ];
          
          // Calculate time based on distance (walking at 5 km/h)
          const timeMinutes = Math.round((directDistance / 1000 / 5) * 60);
          
          console.log(`Created emergency direct path, distance: ${directDistance}m`);
          
          this.transportPath = directPath;
          
          // Emit event with the calculated path
          eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATED, {
            path: directPath,
            waterOnly: false,
            isEmergencyPath: true
          });
          
          return;
        }
      } catch (emergencyError) {
        console.error('Even emergency path creation failed:', emergencyError);
      }
      
      // If all else fails, show error and reset
      alert('Error calculating route. Please try again.');
      this.transportEndPoint = null;
      eventBus.emit(EventTypes.TRANSPORT_ROUTE_ERROR, error);
    } finally {
      // Set calculating state to false to hide loading indicator
      this.calculatingPath = false;
      eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATING, false);
    }
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
      
      // Create a processed polygon with all required properties
      return {
        id: polygon.id,
        coordinates: validCoordinates,
        centroid: polygon.centroid || null,
        bridgePoints: Array.isArray(polygon.bridgePoints) ? polygon.bridgePoints : [],
        buildingPoints: Array.isArray(polygon.buildingPoints) ? polygon.buildingPoints : [],
        canalPoints: Array.isArray(polygon.canalPoints) ? polygon.canalPoints : []
      };
    }).filter(Boolean); // Remove null entries
    
    console.log(`Processed ${processedPolygons.length} valid polygons out of ${polygons.length} total`);
    
    return processedPolygons;
  }

  /**
   * Build the graph and canal network
   */
  private buildGraphAndNetwork(): void {
    console.log('Building graph from polygons...');
    this.graph = this.buildGraph(this.polygons);
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
  public setPolygonsData(polygons: any[]): boolean {
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
          centroid: polygon.centroid || null,
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
      this.graph = this.buildGraph(this.polygons);
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
      }
      
      resolve(success);
    });
    
    return this.initializationPromise;
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
  private buildGraph(polygons: Polygon[]): Graph {
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
      
      // Add bridge point nodes - in 'real' mode, only include constructed bridges
      if (polygon.bridgePoints) {
        for (const point of polygon.bridgePoints) {
          if (point.edge) {
            const pointId = point.id || `bridge-${point.edge.lat}-${point.edge.lng}`;
            // Check if this is a constructed bridge
            const isConstructed = !!point.isConstructed || 
                                 (pointId.includes('bridge-constructed') || pointId.includes('public_bridge'));
            
            // In 'real' mode, only include constructed bridges
            if (this.pathfindingMode === 'all' || isConstructed) {
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
                                 (pointId.includes('public_dock') || pointId.includes('dock-constructed'));
            
            // In 'real' mode, only include constructed docks
            if (this.pathfindingMode === 'all' || isConstructed) {
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
          
            // Ensure the source point has an edges array
            if (!graph.edges[sourcePointId]) {
              graph.edges[sourcePointId] = [];
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
              
                // Ensure the target point has an edges array
                if (!graph.edges[targetPointId]) {
                  graph.edges[targetPointId] = [];
                }
              
                // Add bidirectional edges between the bridge points
                const distance = bridgePoint.connection.distance || 
                  this.calculateDistance(bridgePoint.edge, bridgePoint.connection.targetPoint);
              
                graph.edges[sourcePointId].push({
                  from: sourcePointId,
                  to: targetPointId,
                  weight: distance
                });
              
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
    
    return graph;
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
    const enhancedPath: any[] = [];

    // Always use the exact start point
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
              const midpoint: Point = {
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
          const distance = this.calculateDistance(point1, point2);
          
          // If distance is significant, add more intermediate points
          const numPoints = distance > 50 ? 3 : 2;
          
          for (let j = 1; j <= numPoints; j++) {
            const fraction = j / (numPoints + 1);
            // Add some randomness to create natural curves
            const jitter = 0.00005 * (Math.random() * 2 - 1);
            const midpoint: Point = {
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
        if (this.calculateDistance(point1, point2) > 30) { // Only for longer segments
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

      // Don't add the endpoint of this segment if it's the last point in the original path
      // (we'll add it separately at the end to ensure we use the exact end point)
      if (i < pathPoints.length - 2) {
        enhancedPath.push(point2);
      }
    }

    // Always use the exact end point
    if (pathPoints.length > 1) {
      enhancedPath.push(pathPoints[pathPoints.length - 1]);
    }

    return enhancedPath;
  }

  // Function to enhance water paths with intermediate points
  private enhanceWaterPath(pathPoints: any[]): any[] {
    const enhancedPath: any[] = [];
    
    // Always use the exact start point
    if (pathPoints.length > 0) {
      enhancedPath.push(pathPoints[0]);
    }
    
    // Process each segment of the path
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const point1 = pathPoints[i];
      const point2 = pathPoints[i + 1];
      
      // Calculate distance between points
      const distance = this.calculateDistance(point1, point2);
      
      // Add more intermediate points for longer segments
      const numPoints = distance > 50 ? 3 : 2;
      
      for (let j = 1; j <= numPoints; j++) {
        const fraction = j / (numPoints + 1);
        // Add some randomness to create natural curves
        const jitter = 0.00005 * (Math.random() * 2 - 1);
        const midpoint: Point = {
          lat: point1.lat + (point2.lat - point1.lat) * fraction + jitter,
          lng: point1.lng + (point2.lng - point1.lng) * fraction + jitter,
          type: 'canal',
          transportMode: 'gondola',
          isIntermediatePoint: true
        };
        enhancedPath.push(midpoint);
      }
      
      // Don't add the endpoint of this segment if it's the last point in the original path
      // (we'll add it separately at the end to ensure we use the exact end point)
      if (i < pathPoints.length - 2) {
        enhancedPath.push(point2);
      }
    }
    
    // Always use the exact end point
    if (pathPoints.length > 1) {
      enhancedPath.push(pathPoints[pathPoints.length - 1]);
    }
    
    return enhancedPath;
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

  // Helper method to check if a line intersects land
  private doesLineIntersectLand(point1: Point, point2: Point, polygons: Polygon[]): boolean {
    // For each polygon, check if the line intersects any of its edges
    for (const polygon of polygons) {
      const coords = polygon.coordinates;
      if (!coords || coords.length < 3) continue;

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

  // Function to find a water-only path between two points
  public async findWaterOnlyPath(startPoint: Point, endPoint: Point): Promise<any> {
    try {
      console.log(`Starting water-only path calculation from ${startPoint.lat},${startPoint.lng} to ${endPoint.lat},${endPoint.lng} (mode: ${this.pathfindingMode})`);
      
      // Ensure polygons are loaded using the initialization service
      if (!this.polygonsLoaded) {
        console.log('Polygons not loaded yet, initializing service for water-only path...');
        const success = await this.initializeService();
        
        if (!success) {
          console.error('Failed to initialize transport service for water-only path');
          return {
            success: false,
            error: 'No polygon data available for water-only pathfinding',
            details: 'Failed to initialize transport service'
          };
        }
      }
      
      if (this.polygons.length === 0) {
        console.error('No polygons available for water-only pathfinding');
        return {
          success: false,
          error: 'No polygon data available for water-only pathfinding',
          details: 'Polygon array is empty'
        };
      }
      
      console.log(`Loaded ${this.polygons.length} polygons for water-only pathfinding`);
      
      // Extract all canal points for the water network
      const allCanalPoints: {point: Point, id: string, polygonId: string, isConstructed: boolean}[] = [];
      for (const polygon of this.polygons) {
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
      
      console.log(`Found ${allCanalPoints.length} canal points across all polygons (mode: ${this.pathfindingMode})`);
      
      // Find the closest canal points to the start and end points
      let startCanalPoint = null;
      let endCanalPoint = null;
      let minStartDistance = Infinity;
      let minEndDistance = Infinity;
      
      for (const canalPoint of allCanalPoints) {
        const distanceToStart = this.calculateDistance(startPoint, canalPoint.point);
        const distanceToEnd = this.calculateDistance(endPoint, canalPoint.point);
        
        if (distanceToStart < minStartDistance) {
          minStartDistance = distanceToStart;
          startCanalPoint = canalPoint;
        }
        
        if (distanceToEnd < minEndDistance) {
          minEndDistance = distanceToEnd;
          endCanalPoint = canalPoint;
        }
      }
      
      // If we couldn't find canal points, create a direct path
      if (!startCanalPoint || !endCanalPoint) {
        console.log('No canal points found, creating direct water path');
        
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
      
      console.log(`Found closest canal points: start=${startCanalPoint.id}, end=${endCanalPoint.id}`);
      
      // Create a path with 3 segments:
      // 1. From start point to nearest canal point (walking)
      // 2. From start canal point to end canal point (gondola)
      // 3. From end canal point to end point (walking)
      
      // Calculate distances for each segment
      const startToCanal = this.calculateDistance(startPoint, startCanalPoint.point);
      const canalToCanal = this.calculateDistance(startCanalPoint.point, endCanalPoint.point);
      const canalToEnd = this.calculateDistance(endCanalPoint.point, endPoint);
      
      // Total distance
      const totalDistance = startToCanal + canalToCanal + canalToEnd;
      
      // Create the path
      const path = [];
      
      // Add start point (walking mode)
      path.push({
        ...startPoint,
        type: 'centroid',
        polygonId: 'virtual',
        transportMode: 'walking'
      });
      
      // Add intermediate points for the first segment if it's long enough (walking)
      if (startToCanal > 20) {
        const numPoints = Math.max(1, Math.floor(startToCanal / 100));
        for (let i = 1; i <= numPoints; i++) {
          const fraction = i / (numPoints + 1);
          // Add some randomness to create natural curves
          const jitter = 0.00002 * (Math.random() * 2 - 1);
          path.push({
            lat: startPoint.lat + (startCanalPoint.point.lat - startPoint.lat) * fraction + jitter,
            lng: startPoint.lng + (startCanalPoint.point.lng - startPoint.lng) * fraction + jitter,
            type: 'centroid',
            polygonId: 'virtual',
            transportMode: 'walking',
            isIntermediatePoint: true
          });
        }
      }
      
      // Add start canal point (transition from walking to gondola)
      path.push({
        ...startCanalPoint.point,
        type: 'canal',
        polygonId: startCanalPoint.polygonId,
        transportMode: 'gondola'
      });
      
      // Add intermediate points for the canal-to-canal segment (gondola)
      const numCanalPoints = Math.max(2, Math.floor(canalToCanal / 200));
      for (let i = 1; i <= numCanalPoints; i++) {
        const fraction = i / (numCanalPoints + 1);
        // Add some randomness to create natural curves
        const jitter = 0.00005 * (Math.random() * 2 - 1);
        path.push({
          lat: startCanalPoint.point.lat + (endCanalPoint.point.lat - startCanalPoint.point.lat) * fraction + jitter,
          lng: startCanalPoint.point.lng + (endCanalPoint.point.lng - startCanalPoint.point.lng) * fraction + jitter,
          type: 'canal',
          polygonId: 'virtual',
          transportMode: 'gondola',
          isIntermediatePoint: true
        });
      }
      
      // Add end canal point (still gondola)
      path.push({
        ...endCanalPoint.point,
        type: 'canal',
        polygonId: endCanalPoint.polygonId,
        transportMode: 'gondola'
      });
      
      // Add intermediate points for the last segment if it's long enough (walking)
      if (canalToEnd > 20) {
        const numPoints = Math.max(1, Math.floor(canalToEnd / 100));
        for (let i = 1; i <= numPoints; i++) {
          const fraction = i / (numPoints + 1);
          // Add some randomness to create natural curves
          const jitter = 0.00002 * (Math.random() * 2 - 1);
          path.push({
            lat: endCanalPoint.point.lat + (endPoint.lat - endCanalPoint.point.lat) * fraction + jitter,
            lng: endCanalPoint.point.lng + (endPoint.lng - endCanalPoint.point.lng) * fraction + jitter,
            type: 'centroid',
            polygonId: 'virtual',
            transportMode: 'walking',
            isIntermediatePoint: true
          });
        }
      }
      
      // Add end point (walking)
      path.push({
        ...endPoint,
        type: 'centroid',
        polygonId: 'virtual',
        transportMode: 'walking'
      });
      
      // Calculate time based on distance (walking at 5 km/h, gondola at 10 km/h)
      const walkingTimeHours = (startToCanal + canalToEnd) / 1000 / 5;
      const waterTimeHours = canalToCanal / 1000 / 10;
      const totalTimeMinutes = Math.round((walkingTimeHours + waterTimeHours) * 60);
      
      console.log(`Created water path with ${path.length} points, distance: ${totalDistance}m, time: ${totalTimeMinutes} minutes`);
      
      return {
        success: true,
        path: path,
        distance: totalDistance,
        walkingDistance: startToCanal + canalToEnd,
        waterDistance: canalToCanal,
        estimatedTimeMinutes: totalTimeMinutes,
        waterOnly: false,
        // Add the roundTrip path by reversing the path and combining
        roundTrip: [...path, ...path.slice().reverse().slice(1)]
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
  public async findPath(startPoint: Point, endPoint: Point): Promise<any> {
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
      
      // Check if both points are near canal points (water)
      const isStartNearWater = this.isPointNearWater(startPoint, this.polygons);
      const isEndNearWater = this.isPointNearWater(endPoint, this.polygons);
      
      // If both points are near water, use water-only pathfinding
      if (isStartNearWater && isEndNearWater) {
        console.log('Both start and end points are near water, using water-only pathfinding');
        return this.findWaterOnlyPath(startPoint, endPoint);
      }
      
      // Ensure graph is built
      if (!this.graph) {
        this.graph = this.buildGraph(this.polygons);
      }
      
      // Ensure canal network is built
      if (!this.canalNetwork || Object.keys(this.canalNetwork).length === 0) {
        this.canalNetwork = this.buildCanalNetwork(this.polygons);
      }
      
      // Find the polygons containing the start and end points
      const startPolygon = this.findPolygonContainingPoint(startPoint, this.polygons);
      const endPolygon = this.findPolygonContainingPoint(endPoint, this.polygons);
      
      // If either point is not within a polygon but both are near water, use water-only pathfinding
      if ((!startPolygon || !endPolygon) && isStartNearWater && isEndNearWater) {
        console.log('Points not within polygons but both near water, using water-only pathfinding');
        return this.findWaterOnlyPath(startPoint, endPoint);
      }
      
      if (!startPolygon || !endPolygon) {
        return {
          success: false,
          error: 'Start or end point is not within any polygon'
        };
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
        
        // Add this fallback code before returning the error:
        console.log('Attempting direct path fallback...');
        
        // Calculate direct distance
        const directDistance = this.calculateDistance(startPoint, endPoint);
        
        // Create a direct path with intermediate points
        const numPoints = Math.max(2, Math.min(5, Math.floor(directDistance / 100)));
        const directPath = [
          {
            ...startPoint,
            type: 'centroid',
            polygonId: startPolygon.id,
            transportMode: 'walking'
          }
        ];
        
        // Add intermediate points
        for (let i = 1; i <= numPoints; i++) {
          const fraction = i / (numPoints + 1);
          // Add some randomness to create natural curves
          const jitter = 0.00002 * (Math.random() * 2 - 1);
          directPath.push({
            lat: startPoint.lat + (endPoint.lat - startPoint.lat) * fraction + jitter,
            lng: startPoint.lng + (endPoint.lng - startPoint.lng) * fraction + jitter,
            type: 'centroid',
            polygonId: startPolygon.id,
            transportMode: 'walking',
            isIntermediatePoint: true
          });
        }
        
        // Add the end point
        directPath.push({
          ...endPoint,
          type: 'centroid',
          polygonId: endPolygon.id,
          transportMode: 'walking'
        });
        
        // Calculate time based on distance (walking at 5 km/h)
        const timeMinutes = Math.round((directDistance / 1000 / 5) * 60);
        
        console.log(`Created direct fallback path with ${directPath.length} points, distance: ${directDistance}m`);
        
        return {
          success: true,
          path: directPath,
          distance: directDistance,
          walkingDistance: directDistance,
          waterDistance: 0,
          estimatedTimeMinutes: timeMinutes,
          isFallbackPath: true,
          // Add the roundTrip path
          roundTrip: [...directPath, ...directPath.slice().reverse().slice(1)]
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
        
        // Calculate distance between start and end points
        const directDistance = this.calculateDistance(startPoint, endPoint);
        
        // If the points are not at the same location, create a direct path
        if (directDistance > 1) {
          // Create a direct path with intermediate points
          const numPoints = directDistance > 50 ? 3 : 2;
          const newPath = [
            // Start with the original start point
            {
              ...startPoint,
              type: 'centroid',
              polygonId: startPolygon.id,
              transportMode: 'walking'
            }
          ];
          
          // Add intermediate points
          for (let i = 1; i <= numPoints; i++) {
            const fraction = i / (numPoints + 1);
            // Add some randomness to create natural curves
            const jitter = 0.00002 * (Math.random() * 2 - 1);
            newPath.push({
              lat: startPoint.lat + (endPoint.lat - startPoint.lat) * fraction + jitter,
              lng: startPoint.lng + (endPoint.lng - startPoint.lng) * fraction + jitter,
              type: 'centroid',
              polygonId: startPolygon.id,
              transportMode: 'walking',
              isIntermediatePoint: true
            });
          }
          
          // Add the end point
          newPath.push({
            ...endPoint,
            type: 'centroid',
            polygonId: endPolygon.id,
            transportMode: 'walking'
          });
          
          // Replace the enhanced path with our new direct path
          return {
            success: true,
            path: newPath,
            distance: directDistance,
            walkingDistance: directDistance,
            waterDistance: 0,
            estimatedTimeMinutes: Math.round((directDistance / 1000 / 5) * 60), // Walking at 5 km/h
            startPolygon: startPolygon.id,
            endPolygon: endPolygon.id
          };
        }
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
