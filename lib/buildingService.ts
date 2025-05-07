import * as THREE from 'three';
import { getApiBaseUrl } from './apiUtils';
import { eventBus } from './eventBus';
import { EventTypes } from './eventTypes';
import { getWalletAddress } from './walletUtils';

export interface DockData {
  id: string;
  landId: string;
  position: { x: number; y: number; z: number };
  rotation: number; // Rotation in radians
  connectionPoints: { x: number; y: number; z: number }[];
  createdBy: string;
  createdAt: string;
}

export class BuildingService {
  private static instance: BuildingService;
  
  /**
   * Get singleton instance
   */
  public static getInstance(): BuildingService {
    if (!BuildingService.instance) {
      BuildingService.instance = new BuildingService();
    }
    return BuildingService.instance;
  }
  
  /**
   * Get all buildings, optionally filtered by type
   */
  public async getBuildings(type?: string): Promise<any[]> {
    try {
      let url = `${getApiBaseUrl()}/api/buildings`;
      if (type) {
        url += `?type=${encodeURIComponent(type)}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch buildings: ${response.status}`);
      }
      
      const data = await response.json();
      return data.buildings || [];
    } catch (error) {
      console.error('Error fetching buildings:', error);
      throw error;
    }
  }
  
  /**
   * Get a building by ID
   */
  public async getBuildingById(id: string): Promise<any | null> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/buildings/${id}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch building: ${response.status}`);
      }
      
      const data = await response.json();
      return data.building || null;
    } catch (error) {
      console.error('Error fetching building:', error);
      throw error;
    }
  }
  
  /**
   * Save a building
   */
  public async saveBuilding(buildingData: any): Promise<any> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/buildings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildingData),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save building: ${response.status}`);
      }
      
      const data = await response.json();
      return data.building;
    } catch (error) {
      console.error('Error saving building:', error);
      throw error;
    }
  }
  
  /**
   * Create a new dock at the specified position
   */
  public async createDock(landId: string, position: THREE.Vector3, rotation: number): Promise<DockData> {
    // Validate user is admin
    const walletAddress = getWalletAddress();
    if (!walletAddress) {
      throw new Error('Wallet connection required');
    }
    
    // Get user profile from localStorage
    const userProfileStr = localStorage.getItem('userProfile');
    if (!userProfileStr) {
      throw new Error('User profile not found');
    }
    
    const userProfile = JSON.parse(userProfileStr);
    if (userProfile.username !== 'ConsiglioDeiDieci') {
      throw new Error('Only the Council of Ten can create docks');
    }
    
    // Generate connection points based on position and rotation
    const connectionPoints = this.generateDockConnectionPoints(position, rotation);
    
    // Create dock data
    const dockData: DockData = {
      id: this.generateUniqueId(),
      landId,
      position: { x: position.x, y: position.y, z: position.z },
      rotation,
      connectionPoints,
      createdBy: userProfile.username,
      createdAt: new Date().toISOString()
    };
    
    // Save to server
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/buildings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'dock',
          land_id: dockData.landId,
          position: dockData.position,
          rotation: dockData.rotation,
          connection_points: dockData.connectionPoints,
          created_by: dockData.createdBy
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save dock: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Update the dock data with the server-generated ID
      dockData.id = data.building.id;
      
      // Emit event for UI updates
      eventBus.emit(EventTypes.DOCK_PLACED, { 
        type: 'dock', 
        data: dockData 
      });
      
      return dockData;
    } catch (error) {
      console.error('Error saving dock:', error);
      throw error;
    }
  }
  
  /**
   * Get all docks
   */
  public async getDocks(): Promise<DockData[]> {
    try {
      const buildings = await this.getBuildings('dock');
      
      // Convert to DockData format
      return buildings.map(building => ({
        id: building.id,
        landId: building.land_id,
        position: building.position,
        rotation: building.rotation || 0,
        connectionPoints: building.connection_points || [],
        createdBy: building.created_by,
        createdAt: building.created_at
      }));
    } catch (error) {
      console.error('Error fetching docks:', error);
      throw error;
    }
  }
  
  /**
   * Get a dock by ID
   */
  public async getDockById(id: string): Promise<DockData | null> {
    try {
      const building = await this.getBuildingById(id);
      
      if (!building || building.type !== 'dock') {
        return null;
      }
      
      // Convert to DockData format
      return {
        id: building.id,
        landId: building.land_id,
        position: building.position,
        rotation: building.rotation || 0,
        connectionPoints: building.connection_points || [],
        createdBy: building.created_by,
        createdAt: building.created_at
      };
    } catch (error) {
      console.error('Error fetching dock:', error);
      throw error;
    }
  }
  
  /**
   * Generate the 3 connection points for a dock based on position and rotation
   */
  private generateDockConnectionPoints(position: THREE.Vector3, rotation: number): { x: number; y: number; z: number }[] {
    // Create a dock-aligned coordinate system
    const forward = new THREE.Vector3(Math.sin(rotation), 0, Math.cos(rotation));
    const right = new THREE.Vector3(Math.cos(rotation), 0, -Math.sin(rotation));
    
    // Define connection points relative to dock center
    // Point 1: Center back (land side)
    const point1 = new THREE.Vector3()
      .copy(position)
      .add(forward.clone().multiplyScalar(-10)); // 10 units back
    
    // Point 2: Left side
    const point2 = new THREE.Vector3()
      .copy(position)
      .add(forward.clone().multiplyScalar(5)) // 5 units forward
      .add(right.clone().multiplyScalar(-5)); // 5 units left
    
    // Point 3: Right side
    const point3 = new THREE.Vector3()
      .copy(position)
      .add(forward.clone().multiplyScalar(5)) // 5 units forward
      .add(right.clone().multiplyScalar(5)); // 5 units right
    
    // Convert to plain objects
    return [
      { x: point1.x, y: point1.y, z: point1.z },
      { x: point2.x, y: point2.y, z: point2.z },
      { x: point3.x, y: point3.y, z: point3.z }
    ];
  }
  
  /**
   * Generate a unique ID
   */
  private generateUniqueId(): string {
    return 'dock_' + Math.random().toString(36).substr(2, 9);
  }
}
