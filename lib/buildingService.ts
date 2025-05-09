import * as THREE from 'three';

export interface DockConnectionPoint {
  x: number;
  y: number;
  z: number;
}

export interface DockData {
  id: string;
  connectionPoints: DockConnectionPoint[];
  // Add other properties as needed
}

export class BuildingService {
  private static instance: BuildingService;
  private docks: DockData[] = [];
  
  private constructor() {}
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): BuildingService {
    if (!BuildingService.instance) {
      BuildingService.instance = new BuildingService();
    }
    return BuildingService.instance;
  }
  
  /**
   * Get all docks
   */
  public getDocks(): DockData[] {
    return this.docks;
  }
  
  /**
   * Fetch docks from API
   */
  public async fetchDocks(): Promise<DockData[]> {
    try {
      // Implementation would go here to fetch from API
      // For now, return empty array
      this.docks = [];
      return this.docks;
    } catch (error) {
      console.error('Error fetching docks:', error);
      return [];
    }
  }
}
