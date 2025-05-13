import { ServiceError, NotFoundError } from '../errors/ServiceErrors';

/**
 * Interface for dock connection point data
 */
export interface DockConnectionPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Interface for dock data
 */
export interface DockData {
  id: string;
  name: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  connectionPoints?: DockConnectionPoint[];
  createdBy?: string;
  createdAt?: string;
}

/**
 * Service for managing docks
 */
export class DockService {
  private static instance: DockService;
  private docks: DockData[] = [];
  
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
   * Private constructor for singleton pattern
   */
  private constructor() {}
  
  /**
   * Get all docks
   */
  public async getDocks(): Promise<DockData[]> {
    try {
      // In a real implementation, this would fetch from an API
      // For now, just return the cached docks
      return [...this.docks];
    } catch (error) {
      console.error('Error fetching docks:', error);
      throw new ServiceError('Failed to fetch docks');
    }
  }
  
  /**
   * Get a dock by ID
   */
  public async getDockById(id: string): Promise<DockData> {
    try {
      const dock = this.docks.find(d => d.id === id);
      if (!dock) {
        throw new NotFoundError('Dock', id);
      }
      return { ...dock };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      console.error('Error fetching dock:', error);
      throw new ServiceError(`Failed to fetch dock with ID: ${id}`);
    }
  }
  
  /**
   * Add a new dock
   */
  public async addDock(dockData: Omit<DockData, 'id'>): Promise<DockData> {
    try {
      const newDock: DockData = {
        ...dockData,
        id: `dock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString()
      };
      
      this.docks.push(newDock);
      return { ...newDock };
    } catch (error) {
      console.error('Error adding dock:', error);
      throw new ServiceError('Failed to add dock');
    }
  }
  
  /**
   * Update a dock
   */
  public async updateDock(id: string, dockData: Partial<DockData>): Promise<DockData> {
    try {
      const index = this.docks.findIndex(d => d.id === id);
      if (index === -1) {
        throw new NotFoundError('Dock', id);
      }
      
      const updatedDock = {
        ...this.docks[index],
        ...dockData,
        id // Ensure ID doesn't change
      };
      
      this.docks[index] = updatedDock;
      return { ...updatedDock };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      console.error('Error updating dock:', error);
      throw new ServiceError(`Failed to update dock with ID: ${id}`);
    }
  }
  
  /**
   * Delete a dock
   */
  public async deleteDock(id: string): Promise<void> {
    try {
      const index = this.docks.findIndex(d => d.id === id);
      if (index === -1) {
        throw new NotFoundError('Dock', id);
      }
      
      this.docks.splice(index, 1);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      console.error('Error deleting dock:', error);
      throw new ServiceError(`Failed to delete dock with ID: ${id}`);
    }
  }
}
