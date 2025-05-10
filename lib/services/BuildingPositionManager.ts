import * as THREE from 'three';

/**
 * Service for managing building position transformations
 * Centralizes coordinate conversions between lat/lng and Three.js coordinates
 */
export class BuildingPositionManager {
  private bounds = {
    centerLat: 45.4371,
    centerLng: 12.3358,
    scale: 100000,
    latCorrectionFactor: 0.7
  };

  /**
   * Convert lat/lng coordinates to Three.js scene position
   * @param position Latitude and longitude coordinates
   * @param height Optional height value (defaults to 5)
   * @returns THREE.Vector3 position in scene coordinates
   */
  public latLngToScenePosition(position: {lat: number, lng: number}, height: number = 5): THREE.Vector3 {
    // Check for extreme values that might indicate an error
    if (Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180) {
      console.warn(`Invalid lat/lng values detected: ${position.lat}, ${position.lng}. Using default position.`);
      return new THREE.Vector3(0, height, 0);
    }
    
    // Calculate relative position from center
    const x = (position.lng - this.bounds.centerLng) * this.bounds.scale;
    const z = -(position.lat - this.bounds.centerLat) * this.bounds.scale * this.bounds.latCorrectionFactor;
    
    // Check for extreme values in the result
    if (Math.abs(x) > 500 || Math.abs(z) > 500) {
      console.warn(`Extreme position values calculated: (${x}, ${height}, ${z}). Clamping to reasonable range.`);
      // Clamp to a reasonable range
      const clampedX = Math.max(-500, Math.min(500, x));
      const clampedZ = Math.max(-500, Math.min(500, z));
      return new THREE.Vector3(clampedX, height, clampedZ);
    }
    
    return new THREE.Vector3(x, height, z);
  }

  /**
   * Convert Three.js scene position to lat/lng coordinates
   * @param position THREE.Vector3 position in scene coordinates
   * @returns Object with lat and lng properties
   */
  public scenePositionToLatLng(position: THREE.Vector3): {lat: number, lng: number} {
    const lat = this.bounds.centerLat + (position.z / -this.bounds.scale / this.bounds.latCorrectionFactor);
    const lng = this.bounds.centerLng + (position.x / this.bounds.scale);
    return {lat, lng};
  }

  /**
   * Validate and normalize position data to ensure consistency
   * @param position Position data in various formats
   * @returns Normalized position data as either lat/lng or scene coordinates
   */
  public validatePosition(position: any): {lat: number, lng: number} | {x: number, y: number, z: number} {
    // Handle string input (JSON)
    if (typeof position === 'string') {
      try {
        position = JSON.parse(position);
      } catch (error) {
        console.error('Error parsing position string:', error);
        // Return default position as fallback
        return { lat: this.bounds.centerLat, lng: this.bounds.centerLng };
      }
    }
    
    // If position is not an object, return default
    if (!position || typeof position !== 'object') {
      console.warn('Invalid position format, using default');
      return { lat: this.bounds.centerLat, lng: this.bounds.centerLng };
    }
    
    // Handle lat/lng format
    if (position.lat !== undefined && position.lng !== undefined) {
      return {
        lat: parseFloat(position.lat.toString()),
        lng: parseFloat(position.lng.toString())
      };
    }
    
    // Handle x/z format (Three.js coordinates)
    if (position.x !== undefined && position.z !== undefined) {
      return {
        x: parseFloat(position.x.toString()),
        y: position.y !== undefined ? parseFloat(position.y.toString()) : 5,
        z: parseFloat(position.z.toString())
      };
    }
    
    // If no valid format detected, return default
    console.warn('Unrecognized position format, using default');
    return { lat: this.bounds.centerLat, lng: this.bounds.centerLng };
  }
  
  /**
   * Get the bounds configuration used for coordinate transformations
   * @returns The bounds configuration object
   */
  public getBounds() {
    return { ...this.bounds };
  }
}

// Create a singleton instance
const buildingPositionManager = new BuildingPositionManager();
export default buildingPositionManager;
