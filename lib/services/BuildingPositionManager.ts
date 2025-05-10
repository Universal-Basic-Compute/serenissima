import * as THREE from 'three';
import { normalizeCoordinates } from '../../components/PolygonViewer/utils';
import { Coordinate } from '../../components/PolygonViewer/types';

/**
 * Service for managing building position transformations
 * Centralizes coordinate conversions between lat/lng and Three.js coordinates
 */
export class BuildingPositionManager {
  private bounds = {
    centerLat: 45.4371,
    centerLng: 12.3358,
    scale: 700, // Changed from 2000 to 700
    latCorrectionFactor: 0.7
  };

  /**
   * Convert lat/lng coordinates to Three.js scene position
   * @param position Latitude and longitude coordinates
   * @param height Optional height value (defaults to 1.2)
   * @returns THREE.Vector3 position in scene coordinates
   */
  public latLngToScenePosition(position: {lat: number, lng: number}, height: number = 1.2): THREE.Vector3 {
    // First, validate the input coordinates
    if (!position || typeof position.lat !== 'number' || typeof position.lng !== 'number' || 
        isNaN(position.lat) || isNaN(position.lng)) {
      console.error(`Invalid position data received:`, position);
      // Return a safe default position at the center of Venice
      return new THREE.Vector3(0, height, 0);
    }
    
    // Check for extreme values that might indicate an error in the input data
    if (Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180) {
      console.error(`Invalid lat/lng values detected: ${position.lat}, ${position.lng}. These coordinates are outside the valid range for Earth.`);
      // Return a safe default position at the center of Venice
      return new THREE.Vector3(0, height, 0);
    }
    
    // Check if the coordinates are too far from Venice (our expected area)
    // Venice is roughly at 45.4371, 12.3358
    const distanceFromVenice = Math.sqrt(
      Math.pow(position.lat - this.bounds.centerLat, 2) + 
      Math.pow(position.lng - this.bounds.centerLng, 2)
    );
    
    // If coordinates are more than ~50km from Venice (in degrees, roughly 0.5 degrees)
    if (distanceFromVenice > 0.5) {
      console.error(`Coordinates (${position.lat}, ${position.lng}) are too far from Venice. Distance: ${distanceFromVenice.toFixed(4)} degrees`);
      // Log additional information to help debug
      console.error(`Expected coordinates should be near: ${this.bounds.centerLat}, ${this.bounds.centerLng}`);
      // Return a safe default position at the center of Venice
      return new THREE.Vector3(0, height, 0);
    }
    
    // Use the same normalization function as the polygon renderer
    const normalizedCoord = normalizeCoordinates(
      [{ lat: position.lat, lng: position.lng }],
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    )[0];
    
    // Log the normalized coordinates for debugging
    console.log(`Input coordinates: lat=${position.lat}, lng=${position.lng}`);
    console.log(`Normalized coordinates: x=${normalizedCoord.x}, y=${normalizedCoord.y}`);
    
    // IMPORTANT: The normalizeCoordinates function returns {x, y} but we need {x, y, z} for THREE.Vector3
    // The y value from normalizeCoordinates should be mapped to z in THREE.js (y is up in THREE.js)
    return new THREE.Vector3(normalizedCoord.x, height, normalizedCoord.y);
  }

  /**
   * Convert Three.js scene position to lat/lng coordinates
   * @param position THREE.Vector3 position in scene coordinates
   * @returns Object with lat and lng properties
   */
  public scenePositionToLatLng(position: THREE.Vector3): {lat: number, lng: number} {
    // Reverse the normalization process
    const lng = this.bounds.centerLng + (position.x / this.bounds.scale);
    const lat = this.bounds.centerLat - (position.z / (this.bounds.scale * this.bounds.latCorrectionFactor));
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
  
  /**
   * Validate and fix building position data
   * @param building Building data to validate
   * @returns Fixed building data
   */
  public validateAndFixBuildingData(building: any): any {
    if (!building) return building;
    
    // Create a copy to avoid modifying the original
    const fixedBuilding = { ...building };
    
    // Check if position exists
    if (!fixedBuilding.position) {
      console.error(`Building ${fixedBuilding.id} has no position data, setting default position`);
      fixedBuilding.position = { lat: this.bounds.centerLat, lng: this.bounds.centerLng };
      return fixedBuilding;
    }
    
    // If position is a string, try to parse it
    if (typeof fixedBuilding.position === 'string') {
      try {
        fixedBuilding.position = JSON.parse(fixedBuilding.position);
      } catch (error) {
        console.error(`Error parsing position string for building ${fixedBuilding.id}:`, error);
        fixedBuilding.position = { lat: this.bounds.centerLat, lng: this.bounds.centerLng };
        return fixedBuilding;
      }
    }
    
    // Check if we have lat/lng or x/z coordinates
    if ('lat' in fixedBuilding.position && 'lng' in fixedBuilding.position) {
      // Validate lat/lng values
      const lat = parseFloat(fixedBuilding.position.lat.toString());
      const lng = parseFloat(fixedBuilding.position.lng.toString());
      
      if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        console.error(`Building ${fixedBuilding.id} has invalid lat/lng values: ${lat}, ${lng}`);
        fixedBuilding.position = { lat: this.bounds.centerLat, lng: this.bounds.centerLng };
      } else {
        // Check if coordinates are too far from Venice
        const distanceFromVenice = Math.sqrt(
          Math.pow(lat - this.bounds.centerLat, 2) + 
          Math.pow(lng - this.bounds.centerLng, 2)
        );
        
        if (distanceFromVenice > 0.5) {
          console.error(`Building ${fixedBuilding.id} coordinates (${lat}, ${lng}) are too far from Venice`);
          fixedBuilding.position = { lat: this.bounds.centerLat, lng: this.bounds.centerLng };
        } else {
          // Ensure values are numbers, not strings
          fixedBuilding.position = { lat, lng };
        }
      }
    } else if ('x' in fixedBuilding.position && 'z' in fixedBuilding.position) {
      // Validate x/z values
      const x = parseFloat(fixedBuilding.position.x.toString());
      const z = parseFloat(fixedBuilding.position.z.toString());
      
      if (isNaN(x) || isNaN(z) || Math.abs(x) > 500 || Math.abs(z) > 500) {
        console.error(`Building ${fixedBuilding.id} has invalid x/z values: ${x}, ${z}`);
        // Convert center lat/lng to x/z
        const centerX = 0;
        const centerZ = 0;
        fixedBuilding.position = { x: centerX, y: 5, z: centerZ };
      } else {
        // Ensure values are numbers, not strings
        fixedBuilding.position = { 
          x, 
          y: fixedBuilding.position.y !== undefined ? parseFloat(fixedBuilding.position.y.toString()) : 5,
          z 
        };
      }
    } else {
      console.error(`Building ${fixedBuilding.id} has unrecognized position format:`, fixedBuilding.position);
      fixedBuilding.position = { lat: this.bounds.centerLat, lng: this.bounds.centerLng };
    }
    
    return fixedBuilding;
  }
  
  /**
   * Ensure buildings are visible in the scene
   * @param scene THREE.Scene containing buildings
   */
  public ensureBuildingsVisible(scene: THREE.Scene): void {
    console.log('Ensuring buildings are visible...');
    
    // Find all buildings in the scene
    const buildings: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (object.userData && object.userData.buildingId) {
        buildings.push(object);
      }
    });
    
    console.log(`Found ${buildings.length} buildings in the scene`);
    
    if (buildings.length === 0) {
      console.warn('No buildings found in the scene');
      return;
    }
    
    // Remove existing debug markers first
    scene.traverse((object) => {
      if (object.userData && object.userData.isDebugMarker) {
        scene.remove(object);
      }
    });
    
    // Create a bounding box for all buildings
    const boundingBox = new THREE.Box3();
    buildings.forEach(building => {
      // Skip if building position is not defined
      if (!building.position) return;
      boundingBox.expandByObject(building);
    });
    
    // Log the bounding box
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    
    console.log('Building bounding box:', {
      center: center,
      size: size,
      min: boundingBox.min,
      max: boundingBox.max
    });
    
    // Add debug markers at the corners of the bounding box if needed
    if (process.env.NODE_ENV === 'development') {
      this.addDebugMarkers(scene, boundingBox);
    }
  }
  
  /**
   * Add debug markers at the corners of a bounding box
   * @param scene THREE.Scene to add markers to
   * @param boundingBox THREE.Box3 bounding box
   */
  private addDebugMarkers(scene: THREE.Scene, boundingBox: THREE.Box3): void {
    // Create a material for the markers
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    
    // Create a small sphere geometry for the markers
    const markerGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    
    // Create markers at each corner of the bounding box
    const corners = [
      new THREE.Vector3(boundingBox.min.x, boundingBox.min.y, boundingBox.min.z),
      new THREE.Vector3(boundingBox.min.x, boundingBox.min.y, boundingBox.max.z),
      new THREE.Vector3(boundingBox.min.x, boundingBox.max.y, boundingBox.min.z),
      new THREE.Vector3(boundingBox.min.x, boundingBox.max.y, boundingBox.max.z),
      new THREE.Vector3(boundingBox.max.x, boundingBox.min.y, boundingBox.min.z),
      new THREE.Vector3(boundingBox.max.x, boundingBox.min.y, boundingBox.max.z),
      new THREE.Vector3(boundingBox.max.x, boundingBox.max.y, boundingBox.min.z),
      new THREE.Vector3(boundingBox.max.x, boundingBox.max.y, boundingBox.max.z)
    ];
    
    // Add a marker at each corner
    corners.forEach(position => {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(position);
      marker.userData.isDebugMarker = true;
      scene.add(marker);
    });
    
    // Add a marker at the center
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    const centerMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    centerMarker.position.copy(center);
    centerMarker.userData.isDebugMarker = true;
    scene.add(centerMarker);
  }
}

// Create a singleton instance
const buildingPositionManager = new BuildingPositionManager();
export default buildingPositionManager;
