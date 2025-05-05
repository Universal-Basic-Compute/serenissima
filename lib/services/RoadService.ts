import * as THREE from 'three';

export interface RoadData {
  id: string;
  points: { x: number; y: number; z: number }[];
  curvature: number;
  createdBy?: string;
  landId?: string;
  createdAt?: string;
}

/**
 * Service for managing road data persistence and retrieval
 */
export class RoadService {
  private static instance: RoadService;
  private roads: RoadData[] = [];
  private loading: boolean = false;
  private error: string | null = null;
  
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
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    // Load roads from local storage on initialization
    this.loadRoadsFromStorage();
  }
  
  /**
   * Save a new road
   * @param points The 3D points that define the road path
   * @param curvature The road curvature factor
   * @param userId Optional creator user ID
   * @param landId Optional associated land ID
   * @returns The saved road data
   */
  public saveRoad(
    points: THREE.Vector3[],
    curvature: number,
    userId?: string,
    landId?: string
  ): RoadData {
    const roadData: RoadData = {
      id: `road-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      points: this.convertPoints(points),
      curvature,
      createdBy: userId,
      landId,
      createdAt: new Date().toISOString()
    };
    
    this.roads.push(roadData);
    this.saveRoadsToStorage();
    console.log(`RoadService: Saved road ${roadData.id}`);
    
    return roadData;
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
   * @param id Road ID
   * @returns Road data or undefined if not found
   */
  public getRoadById(id: string): RoadData | undefined {
    return this.roads.find(road => road.id === id);
  }
  
  /**
   * Delete a road by ID
   * @param id Road ID
   * @returns True if road was deleted, false if not found
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
   * Update a road
   * @param id Road ID
   * @param updates Partial road data to update
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
    
    this.saveRoadsToStorage();
    console.log(`RoadService: Updated road ${id}`);
    
    return this.roads[roadIndex];
  }
  
  /**
   * Convert THREE.Vector3 points to plain objects for storage
   * @param points Array of THREE.Vector3 points
   * @returns Array of plain object points
   */
  public convertPoints(points: THREE.Vector3[]): { x: number; y: number; z: number }[] {
    return points.map(p => ({ x: p.x, y: p.y, z: p.z }));
  }
  
  /**
   * Convert plain object points to THREE.Vector3 points
   * @param points Array of plain object points
   * @returns Array of THREE.Vector3 points
   */
  public convertToVector3Points(points: { x: number; y: number; z: number }[]): THREE.Vector3[] {
    return points.map(p => new THREE.Vector3(p.x, p.y, p.z));
  }
  
  /**
   * Save roads to local storage
   */
  private saveRoadsToStorage(): void {
    try {
      localStorage.setItem('roads', JSON.stringify(this.roads));
    } catch (error) {
      console.error('Failed to save roads to storage:', error);
    }
  }
  
  /**
   * Load roads from local storage
   */
  private loadRoadsFromStorage(): void {
    try {
      const storedRoads = localStorage.getItem('roads');
      if (storedRoads) {
        this.roads = JSON.parse(storedRoads);
        console.log(`RoadService: Loaded ${this.roads.length} roads from storage`);
      }
    } catch (error) {
      console.error('Failed to load roads from storage:', error);
      this.roads = [];
    }
  }
  
  /**
   * Save a road to the server
   * @param roadId Road ID
   * @returns Promise resolving to true if successful
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
      console.log(`RoadService: Saved road ${roadId} to server`);
      
      return result.success;
    } catch (error) {
      console.error('Failed to save road to server:', error);
      return false;
    }
  }
  
  /**
   * Load roads from the server
   * @returns Promise resolving to array of road data
   */
  public async loadRoadsFromServer(): Promise<RoadData[]> {
    try {
      const response = await fetch('/api/get-roads');
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success && Array.isArray(result.roads)) {
        this.roads = result.roads;
        this.saveRoadsToStorage(); // Cache the server data locally
        console.log(`RoadService: Loaded ${this.roads.length} roads from server`);
        return this.roads;
      } else {
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      console.error('Failed to load roads from server:', error);
      return this.roads; // Return cached roads on error
    }
  }
  
  /**
   * Save a road to Airtable
   * @param roadId Road ID
   * @param landId Optional associated land ID
   * @param walletAddress Optional creator wallet address
   * @returns Promise resolving to the saved road data
   */
  public async saveRoadToAirtable(roadId: string, landId?: string, walletAddress?: string): Promise<any> {
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
        body: JSON.stringify({
          id: road.id,
          type: 'road',
          points: road.points,
          curvature: road.curvature,
          land_id: landId,
          user_id: walletAddress,
          created_at: road.createdAt
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log(`RoadService: Saved road ${roadId} to Airtable`);
      
      return result;
    } catch (error) {
      console.error('Failed to save road to Airtable:', error);
      throw error;
    }
  }
  
  /**
   * Load roads from Airtable
   * @returns Promise resolving to array of road data
   */
  public async loadRoadsFromAirtable(): Promise<RoadData[]> {
    try {
      const response = await fetch('/api/get-roads');
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success && Array.isArray(result.roads)) {
        // Transform the Airtable format to our RoadData format
        const transformedRoads: RoadData[] = result.roads.map((road: any) => {
          // Parse the points string if needed
          let points = road.points;
          if (typeof points === 'string') {
            try {
              points = JSON.parse(points);
            } catch (e) {
              console.error('Failed to parse road points:', e);
              points = [];
            }
          }
          
          return {
            id: road.id,
            points: points,
            curvature: road.curvature || 0.5,
            createdBy: road.owner,
            landId: road.land_id,
            createdAt: road.created_at
          };
        });
        
        this.roads = transformedRoads;
        this.saveRoadsToStorage(); // Cache the data locally
        console.log(`RoadService: Loaded ${this.roads.length} roads from Airtable`);
        return this.roads;
      } else {
        throw new Error('Invalid response format from Airtable');
      }
    } catch (error) {
      console.error('Failed to load roads from Airtable:', error);
      return this.roads; // Return cached roads on error
    }
  }
}
