import * as THREE from 'three';

/**
 * Interface for road data
 */
export interface RoadData {
  id: string;
  points: { x: number; y: number; z: number }[];
  curvature: number;
  createdBy?: string;
  landId?: string;
  createdAt?: string;
}

/**
 * Service for managing road data
 * Handles persistence and retrieval of roads
 */
export class RoadService {
  private static instance: RoadService;
  private roads: RoadData[] = [];
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): RoadService {
    if (!RoadService.instance) {
      RoadService.instance = new RoadService();
    }
    return RoadService.instance;
  }
  
  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    // Load roads from local storage on initialization
    this.loadRoadsFromStorage();
  }
  
  /**
   * Save a new road
   * @param points - Array of 3D points defining the road
   * @param curvature - Road curvature value (0-1)
   * @param userId - Optional user ID of creator
   * @param landId - Optional land ID where road is placed
   * @returns The saved road data with generated ID
   * @throws {ServiceError} If saving fails
   */
  public saveRoad(
    points: THREE.Vector3[],
    curvature: number,
    userId?: string,
    landId?: string
  ): RoadData {
    try {
      // Generate a unique ID
      const id = `road_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      // Convert THREE.Vector3 points to plain objects for storage
      const serializedPoints = points.map(p => ({ 
        x: p.x, 
        y: p.y, 
        z: p.z 
      }));
      
      // Create the road data object
      const roadData: RoadData = {
        id,
        points: serializedPoints,
        curvature,
        createdBy: userId,
        landId,
        createdAt: new Date().toISOString()
      };
      
      // Add to in-memory collection
      this.roads.push(roadData);
      
      // Persist to storage
      this.saveRoadsToStorage();
      
      console.log(`RoadService: Saved road ${id} with ${points.length} points`);
      
      return roadData;
    } catch (error) {
      console.error('Failed to save road:', error);
      throw new Error('Failed to save road data');
    }
  }
  
  /**
   * Get all roads
   * @returns Array of road data
   */
  public getRoads(): RoadData[] {
    return [...this.roads];
  }
  
  /**
   * Get a road by ID
   * @param id - Road ID
   * @returns Road data or undefined if not found
   */
  public getRoadById(id: string): RoadData | undefined {
    return this.roads.find(road => road.id === id);
  }
  
  /**
   * Delete a road by ID
   * @param id - Road ID
   * @returns True if deleted, false if not found
   */
  public deleteRoad(id: string): boolean {
    const initialLength = this.roads.length;
    this.roads = this.roads.filter(road => road.id !== id);
    
    if (this.roads.length !== initialLength) {
      this.saveRoadsToStorage();
      console.log(`RoadService: Deleted road ${id}`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Update an existing road
   * @param id - Road ID
   * @param updates - Partial road data to update
   * @returns Updated road data or null if not found
   */
  public updateRoad(id: string, updates: Partial<RoadData>): RoadData | null {
    const roadIndex = this.roads.findIndex(road => road.id === id);
    
    if (roadIndex === -1) {
      return null;
    }
    
    // Update the road
    this.roads[roadIndex] = {
      ...this.roads[roadIndex],
      ...updates
    };
    
    // Persist changes
    this.saveRoadsToStorage();
    
    console.log(`RoadService: Updated road ${id}`);
    
    return this.roads[roadIndex];
  }
  
  /**
   * Convert Vector3 points to road data points
   * @param points - THREE.Vector3 points
   * @returns Plain object points
   */
  public convertPoints(points: THREE.Vector3[]): { x: number; y: number; z: number }[] {
    return points.map(p => ({ x: p.x, y: p.y, z: p.z }));
  }
  
  /**
   * Convert road data points to Vector3 points
   * @param points - Plain object points
   * @returns THREE.Vector3 points
   */
  public convertToVector3Points(points: { x: number; y: number; z: number }[]): THREE.Vector3[] {
    return points.map(p => new THREE.Vector3(p.x, p.y, p.z));
  }
  
  /**
   * Save roads to local storage
   * @private
   */
  private saveRoadsToStorage(): void {
    try {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('roads', JSON.stringify(this.roads));
      } else {
        console.log('RoadService: localStorage not available (server-side rendering)');
      }
    } catch (error) {
      console.error('Failed to save roads to storage:', error);
    }
  }
  
  /**
   * Load roads from local storage
   * @private
   */
  private loadRoadsFromStorage(): void {
    try {
      // Check if we're in a browser environment before accessing localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        const storedRoads = localStorage.getItem('roads');
        if (storedRoads) {
          this.roads = JSON.parse(storedRoads);
          console.log(`RoadService: Loaded ${this.roads.length} roads from storage`);
        }
      } else {
        // We're in a server environment, so just initialize with empty array
        this.roads = [];
        console.log('RoadService: localStorage not available (server-side rendering)');
      }
    } catch (error) {
      console.error('Failed to load roads from storage:', error);
      this.roads = []; // Ensure roads is initialized even if there's an error
    }
  }
  
  /**
   * Save road to server (API)
   * @param roadId - Road ID to save
   * @returns Promise resolving to success status
   */
  public async saveRoadToServer(roadId: string): Promise<boolean> {
    try {
      const road = this.getRoadById(roadId);
      if (!road) {
        throw new Error(`Road with ID ${roadId} not found`);
      }
      
      const response = await fetch('/api/save-road', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(road)
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log(`RoadService: Saved road ${roadId} to server`, result);
      
      return result.success;
    } catch (error) {
      console.error('Failed to save road to server:', error);
      return false;
    }
  }
  
  /**
   * Load roads from server (API)
   * @returns Promise resolving to loaded roads
   */
  public async loadRoadsFromServer(): Promise<RoadData[]> {
    try {
      const response = await fetch('/api/get-roads');
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success && Array.isArray(result.roads)) {
        // Update local roads
        this.roads = result.roads;
        this.saveRoadsToStorage();
        
        console.log(`RoadService: Loaded ${this.roads.length} roads from server`);
        return this.roads;
      } else {
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      console.error('Failed to load roads from server:', error);
      return this.roads; // Return local roads as fallback
    }
  }
}

// Export singleton instance
export default RoadService.getInstance();
