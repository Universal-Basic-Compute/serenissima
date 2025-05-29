import { BuildingPosition, LatLngPosition, ScenePosition } from '../models/BuildingTypes';

/**
 * Service for managing building positions
 * Handles validation, conversion, and normalization of building positions
 */
class BuildingPositionManager {
  /**
   * Validate and fix building data
   * @param building Raw building data
   * @returns Fixed building data
   */
  public validateAndFixBuildingData(building: any): any {
    if (!building) {
      return {
        type: 'unknown',
        land_id: '',
        position: { lat: 45.4371, lng: 12.3358 },
        rotation: 0
      };
    }

    // Create a copy to avoid modifying the original
    const fixedBuilding = { ...building };

    // Fix position if needed
    if (!fixedBuilding.position) {
      fixedBuilding.position = { lat: 45.4371, lng: 12.3358 };
    } else if (typeof fixedBuilding.position === 'string') {
      try {
        fixedBuilding.position = JSON.parse(fixedBuilding.position);
      } catch (error) {
        console.error('Error parsing position string:', error);
        fixedBuilding.position = { lat: 45.4371, lng: 12.3358 };
      }
    }

    // Ensure rotation is a number
    if (typeof fixedBuilding.rotation !== 'number') {
      fixedBuilding.rotation = parseFloat(fixedBuilding.rotation) || 0;
    }

    return fixedBuilding;
  }

  /**
   * Validate a position object
   * @param position Position to validate
   * @returns Validated position or default position if invalid
   */
  public validatePosition(position: any): BuildingPosition {
    // Default position (Venice center)
    const defaultPosition: LatLngPosition = { lat: 45.4371, lng: 12.3358 };

    if (!position || typeof position !== 'object') {
      return defaultPosition;
    }

    // Check for lat/lng format
    if (position.lat !== undefined && position.lng !== undefined) {
      const lat = parseFloat(String(position.lat));
      const lng = parseFloat(String(position.lng));
      
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
    
    // Check for x/z format (3D scene coordinates)
    if (position.x !== undefined && position.z !== undefined) {
      const x = parseFloat(String(position.x));
      const z = parseFloat(String(position.z));
      const y = parseFloat(String(position.y || 0));
      
      if (!isNaN(x) && !isNaN(z) && !isNaN(y)) {
        return { x, y, z };
      }
    }
    
    return defaultPosition;
  }

  /**
   * Convert a LatLng position to a Scene position
   * @param latLng LatLng position
   * @returns Scene position
   */
  public latLngToScene(latLng: LatLngPosition): ScenePosition {
    // This is a simplified conversion - in a real app you'd use proper map projection
    const x = (latLng.lng - 12.3358) * 10000;
    const z = (latLng.lat - 45.4371) * 10000;
    return { x, y: 0, z };
  }

  /**
   * Convert a Scene position to a LatLng position
   * @param scene Scene position
   * @returns LatLng position
   */
  public sceneToLatLng(scene: ScenePosition): LatLngPosition {
    // This is a simplified conversion - in a real app you'd use proper map projection
    const lng = scene.x / 10000 + 12.3358;
    const lat = scene.z / 10000 + 45.4371;
    return { lat, lng };
  }

  /**
   * Check if a position is a LatLng position
   * @param position Position to check
   * @returns Boolean indicating if the position is a LatLng position
   */
  public isLatLngPosition(position: BuildingPosition): position is LatLngPosition {
    return 'lat' in position && 'lng' in position;
  }

  /**
   * Check if a position is a Scene position
   * @param position Position to check
   * @returns Boolean indicating if the position is a Scene position
   */
  public isScenePosition(position: BuildingPosition): position is ScenePosition {
    return 'x' in position && 'z' in position;
  }
}

// Create a singleton instance
const buildingPositionManager = new BuildingPositionManager();
export default buildingPositionManager;
