import { BuildingData, BuildingPosition, LatLngPosition, ScenePosition } from '../models/BuildingTypes';
import buildingPositionManager from './BuildingPositionManager';

/**
 * Service for managing building data
 * Handles validation, normalization, and persistence of building data
 */
export class BuildingDataService {
  /**
   * Normalize building data to ensure consistency
   * @param building Raw building data
   * @returns Normalized BuildingData object
   */
  public normalizeBuilding(building: any): BuildingData {
    // Ensure we have an object to work with
    if (!building || typeof building !== 'object') {
      throw new Error('Invalid building data: not an object');
    }
    
    // First, validate and fix the building data using the BuildingPositionManager
    const fixedBuilding = buildingPositionManager.validateAndFixBuildingData(building);
    
    // Now proceed with normalization using the fixed data
    let position: BuildingPosition;
    
    if (typeof fixedBuilding.position === 'string') {
      try {
        const parsedPosition = JSON.parse(fixedBuilding.position);
        position = buildingPositionManager.validatePosition(parsedPosition) as BuildingPosition;
      } catch (error) {
        console.error('Error parsing position string:', error);
        // Default to center of Venice
        position = { lat: 45.4371, lng: 12.3358 };
      }
    } else if (fixedBuilding.position && typeof fixedBuilding.position === 'object') {
      position = buildingPositionManager.validatePosition(fixedBuilding.position) as BuildingPosition;
    } else {
      // Default position
      position = { lat: 45.4371, lng: 12.3358 };
    }
    
    // Ensure all required fields are present with defaults if needed
    return {
      id: fixedBuilding.id || `building-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: fixedBuilding.type || 'unknown',
      land_id: fixedBuilding.land_id || '',
      position: position,
      rotation: typeof fixedBuilding.rotation === 'number' ? fixedBuilding.rotation : 0,
      variant: fixedBuilding.variant || 'model',
      created_by: fixedBuilding.created_by || 'system',
      created_at: fixedBuilding.created_at || new Date().toISOString(),
      updated_at: fixedBuilding.updated_at || new Date().toISOString(),
      name: fixedBuilding.name || '',
      description: fixedBuilding.description || '',
      state: fixedBuilding.state || 'complete',
      constructionProgress: fixedBuilding.constructionProgress || 100,
      owner: fixedBuilding.owner || fixedBuilding.created_by || 'system'
    };
  }

  /**
   * Validate building data
   * @param building Building data to validate
   * @returns Boolean indicating if the building data is valid
   */
  public validateBuilding(building: any): boolean {
    // Check required fields
    if (!building) return false;
    if (!building.type) return false;
    if (!building.land_id) return false;
    
    // Validate position
    if (!building.position) return false;
    
    // If position is a string, try to parse it
    if (typeof building.position === 'string') {
      try {
        const parsedPosition = JSON.parse(building.position);
        if (!this.isValidPosition(parsedPosition)) return false;
      } catch (error) {
        return false;
      }
    } else if (!this.isValidPosition(building.position)) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Check if a position object is valid
   * @param position Position object to validate
   * @returns Boolean indicating if the position is valid
   */
  private isValidPosition(position: any): boolean {
    // Check for lat/lng format
    if (position.lat !== undefined && position.lng !== undefined) {
      const lat = parseFloat(position.lat.toString());
      const lng = parseFloat(position.lng.toString());
      return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    }
    
    // Check for x/z format
    if (position.x !== undefined && position.z !== undefined) {
      const x = parseFloat(position.x.toString());
      const z = parseFloat(position.z.toString());
      return !isNaN(x) && !isNaN(z);
    }
    
    return false;
  }
  
  /**
   * Save building data to the server
   * @param building Building data to save
   * @returns Promise resolving to the saved building data
   */
  public async saveBuilding(building: BuildingData): Promise<BuildingData> {
    // Normalize the building data before saving
    const normalizedBuilding = this.normalizeBuilding(building);
    
    // Validate the building data
    if (!this.validateBuilding(normalizedBuilding)) {
      throw new Error('Invalid building data');
    }
    
    try {
      const response = await fetch('/api/buildings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedBuilding),
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
   * Get all buildings
   * @param type Optional building type to filter by
   * @returns Promise resolving to an array of building data
   */
  public async getBuildings(type?: string): Promise<BuildingData[]> {
    try {
      const url = type ? `/api/buildings?type=${encodeURIComponent(type)}` : '/api/buildings';
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch buildings: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.buildings || !Array.isArray(data.buildings)) {
        throw new Error('Invalid response format');
      }
      
      // Normalize all buildings
      return data.buildings.map((building: any) => this.normalizeBuilding(building));
    } catch (error) {
      console.error('Error fetching buildings:', error);
      throw error;
    }
  }
  
  /**
   * Get a building by ID
   * @param id Building ID
   * @returns Promise resolving to building data or null if not found
   */
  public async getBuildingById(id: string): Promise<BuildingData | null> {
    try {
      const response = await fetch(`/api/buildings/${id}`);
      
      if (response.status === 404) {
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch building: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.building) {
        return null;
      }
      
      return this.normalizeBuilding(data.building);
    } catch (error) {
      console.error(`Error fetching building ${id}:`, error);
      throw error;
    }
  }
  
  /**
   * Delete a building
   * @param id Building ID
   * @returns Promise resolving to boolean indicating success
   */
  public async deleteBuilding(id: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/buildings/${id}`, {
        method: 'DELETE',
      });
      
      return response.ok;
    } catch (error) {
      console.error(`Error deleting building ${id}:`, error);
      throw error;
    }
  }
  
  /**
   * Update a building
   * @param id Building ID
   * @param updates Partial building data to update
   * @returns Promise resolving to updated building data
   */
  public async updateBuilding(id: string, updates: Partial<BuildingData>): Promise<BuildingData> {
    try {
      const response = await fetch(`/api/buildings/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update building: ${response.status}`);
      }
      
      const data = await response.json();
      return this.normalizeBuilding(data.building);
    } catch (error) {
      console.error(`Error updating building ${id}:`, error);
      throw error;
    }
  }
}

// Create a singleton instance
const buildingDataService = new BuildingDataService();
export default buildingDataService;
