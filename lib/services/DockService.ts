import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import { eventBus, EventTypes } from '../eventBus';
import { getWalletAddress } from '../walletUtils';
import { getBackendBaseUrl as getApiBaseUrl } from '../apiUtils';

/**
 * Interface for dock data
 */
export interface DockData {
  id: string;
  landId: string;
  position: { x: number; y: number; z: number };
  rotation: number; // Rotation in radians
  connectionPoints?: { x: number; y: number; z: number }[];
  createdBy?: string;
  createdAt?: string;
  type: 'dock';
}

/**
 * Service for managing docks
 */
export class DockService {
  private static instance: DockService | null = null;
  private docks: Map<string, DockData> = new Map();
  private initialized: boolean = false;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): DockService {
    if (!DockService.instance) {
      DockService.instance = new DockService();
    }
    return DockService.instance;
  }

  /**
   * Initialize the service by loading docks from the server
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadDocksFromServer();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize DockService:', error);
      // Continue with empty docks map
      this.initialized = true;
    }
  }

  /**
   * Create a new dock
   * @param landId The ID of the land parcel
   * @param position The position of the dock
   * @param rotation The rotation of the dock in radians
   * @returns The created dock data
   */
  public async createDock(
    landId: string,
    position: THREE.Vector3,
    rotation: number
  ): Promise<DockData> {
    // Ensure the service is initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Get the current user's wallet address
    const walletAddress = getWalletAddress();
    if (!walletAddress) {
      throw new Error('User must be connected to create a dock');
    }

    // Create dock data
    const dockId = `dock-${uuidv4()}`;
    const now = new Date().toISOString();

    // Calculate connection points (simplified for now)
    const connectionPoints = this.calculateConnectionPoints(position, rotation);

    const dockData: DockData = {
      id: dockId,
      landId,
      position: { x: position.x, y: position.y, z: position.z },
      rotation,
      connectionPoints,
      createdBy: walletAddress,
      createdAt: now,
      type: 'dock'
    };

    // Save to local cache
    this.docks.set(dockId, dockData);

    // Save to server
    try {
      await this.saveDockToServer(dockData);
    } catch (error) {
      console.error('Failed to save dock to server:', error);
      // Continue with local data only
    }

    // Emit event
    eventBus.emit(EventTypes.DOCK_PLACED, {
      dockId,
      type: 'dock',
      data: dockData
    });

    return dockData;
  }

  /**
   * Get all docks
   * @returns Array of dock data
   */
  public async getDocks(): Promise<DockData[]> {
    // Ensure the service is initialized
    if (!this.initialized) {
      await this.initialize();
    }

    return Array.from(this.docks.values());
  }

  /**
   * Get a dock by ID
   * @param id The dock ID
   * @returns The dock data or null if not found
   */
  public async getDockById(id: string): Promise<DockData | null> {
    // Ensure the service is initialized
    if (!this.initialized) {
      await this.initialize();
    }

    return this.docks.get(id) || null;
  }

  /**
   * Delete a dock
   * @param id The dock ID
   * @returns True if the dock was deleted, false otherwise
   */
  public async deleteDock(id: string): Promise<boolean> {
    // Ensure the service is initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Check if dock exists
    if (!this.docks.has(id)) {
      return false;
    }

    // Get dock data for the event
    const dockData = this.docks.get(id);

    // Remove from local cache
    this.docks.delete(id);

    // Remove from server
    try {
      await this.deleteDockFromServer(id);
    } catch (error) {
      console.error('Failed to delete dock from server:', error);
      // Continue with local deletion only
    }

    // Emit event
    eventBus.emit(EventTypes.DOCK_DELETED, {
      dockId: id,
      data: dockData
    });

    return true;
  }

  /**
   * Update a dock
   * @param id The dock ID
   * @param updates The updates to apply
   * @returns The updated dock data or null if not found
   */
  public async updateDock(
    id: string,
    updates: Partial<DockData>
  ): Promise<DockData | null> {
    // Ensure the service is initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Check if dock exists
    if (!this.docks.has(id)) {
      return null;
    }

    // Get current dock data
    const currentDock = this.docks.get(id)!;

    // Create updated dock data
    const updatedDock: DockData = {
      ...currentDock,
      ...updates,
      id // Ensure ID doesn't change
    };

    // Save to local cache
    this.docks.set(id, updatedDock);

    // Save to server
    try {
      await this.saveDockToServer(updatedDock);
    } catch (error) {
      console.error('Failed to update dock on server:', error);
      // Continue with local update only
    }

    // Emit event
    eventBus.emit(EventTypes.DOCK_UPDATED, {
      dockId: id,
      data: updatedDock
    });

    return updatedDock;
  }

  /**
   * Get docks for a specific land parcel
   * @param landId The land ID
   * @returns Array of dock data for the land parcel
   */
  public async getDocksForLand(landId: string): Promise<DockData[]> {
    // Ensure the service is initialized
    if (!this.initialized) {
      await this.initialize();
    }

    return Array.from(this.docks.values()).filter(
      dock => dock.landId === landId
    );
  }

  /**
   * Calculate connection points for a dock based on position and rotation
   * @param position The position of the dock
   * @param rotation The rotation of the dock in radians
   * @returns Array of connection points
   */
  private calculateConnectionPoints(
    position: THREE.Vector3,
    rotation: number
  ): { x: number; y: number; z: number }[] {
    // Create a direction vector pointing in the direction of rotation
    const direction = new THREE.Vector3(
      Math.sin(rotation),
      0,
      Math.cos(rotation)
    );

    // Create a perpendicular vector for the width
    const perpendicular = new THREE.Vector3(
      Math.sin(rotation + Math.PI / 2),
      0,
      Math.cos(rotation + Math.PI / 2)
    );

    // Calculate connection points
    // For a dock, we'll have one connection point at the land side
    const landConnectionPoint = new THREE.Vector3()
      .copy(position)
      .add(direction.clone().multiplyScalar(5)); // 5 units in the direction of rotation

    // Add two more connection points at the sides
    const leftConnectionPoint = new THREE.Vector3()
      .copy(position)
      .add(perpendicular.clone().multiplyScalar(2)); // 2 units to the left

    const rightConnectionPoint = new THREE.Vector3()
      .copy(position)
      .add(perpendicular.clone().multiplyScalar(-2)); // 2 units to the right

    return [
      {
        x: landConnectionPoint.x,
        y: landConnectionPoint.y,
        z: landConnectionPoint.z
      },
      {
        x: leftConnectionPoint.x,
        y: leftConnectionPoint.y,
        z: leftConnectionPoint.z
      },
      {
        x: rightConnectionPoint.x,
        y: rightConnectionPoint.y,
        z: rightConnectionPoint.z
      }
    ];
  }

  /**
   * Load docks from the server
   */
  private async loadDocksFromServer(): Promise<void> {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/docks`);

      if (!response.ok) {
        throw new Error(`Failed to load docks: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Clear existing docks
      this.docks.clear();

      // Add docks from server
      if (data.docks && Array.isArray(data.docks)) {
        data.docks.forEach((dock: DockData) => {
          this.docks.set(dock.id, dock);
        });
      }

      console.log(`Loaded ${this.docks.size} docks from server`);
    } catch (error) {
      console.error('Error loading docks from server:', error);
      throw error;
    }
  }

  /**
   * Save a dock to the server
   * @param dockData The dock data to save
   */
  private async saveDockToServer(dockData: DockData): Promise<void> {
    try {
      const apiUrl = getApiBaseUrl();
      const response = await fetch(`${apiUrl}/api/docks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dockData)
      });

      if (!response.ok) {
        throw new Error(`Failed to save dock: ${response.status} ${response.statusText}`);
      }

      console.log(`Saved dock ${dockData.id} to server`);
    } catch (error) {
      console.error('Error saving dock to server:', error);
      throw error;
    }
  }

  /**
   * Delete a dock from the server
   * @param id The dock ID to delete
   */
  private async deleteDockFromServer(id: string): Promise<void> {
    try {
      const apiUrl = getApiBaseUrl();
      const response = await fetch(`${apiUrl}/api/docks/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`Failed to delete dock: ${response.status} ${response.statusText}`);
      }

      console.log(`Deleted dock ${id} from server`);
    } catch (error) {
      console.error('Error deleting dock from server:', error);
      throw error;
    }
  }
}

// Export a convenience function to get the service instance
export function getDockService(): DockService {
  return DockService.getInstance();
}
