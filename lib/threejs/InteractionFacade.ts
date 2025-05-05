import * as THREE from 'three';
import { MutableRefObject } from 'react';

/**
 * A facade for Three.js interaction handling
 * Provides a simplified interface to raycasting and object selection
 */
export class InteractionFacade {
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private camera: THREE.PerspectiveCamera;
  private isDisposed: boolean = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
  }

  /**
   * Update mouse position for raycasting
   * @param clientX Mouse X position in client coordinates
   * @param clientY Mouse Y position in client coordinates
   */
  public updateMousePosition(clientX: number, clientY: number): void {
    if (this.isDisposed) return;

    // Calculate mouse position in normalized device coordinates (-1 to +1)
    this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;
  }

  /**
   * Cast a ray from the current mouse position and find intersections
   * @param objects Objects to check for intersections
   * @returns Array of intersections
   */
  public castRay(objects: THREE.Object3D[]): THREE.Intersection[] {
    if (this.isDisposed) return [];

    // Update the raycaster with the camera and mouse position
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Return intersections
    return this.raycaster.intersectObjects(objects, false);
  }

  /**
   * Find the first object ID that intersects with the ray
   * @param objectsMap Map of object IDs to Three.js objects
   * @returns The ID of the first intersected object, or null if none
   */
  public findIntersectedObjectId(objectsMap: Record<string, THREE.Object3D>): string | null {
    if (this.isDisposed) return null;

    // Filter visible objects
    const visibleObjects = Object.values(objectsMap).filter(obj => obj && obj.visible);
    
    // Cast ray
    const intersects = this.castRay(visibleObjects);
    
    // Find the first intersected object
    if (intersects.length > 0) {
      const intersectedObject = intersects[0].object;
      
      // Find the object ID from the map
      for (const [id, obj] of Object.entries(objectsMap)) {
        if (obj === intersectedObject) {
          return id;
        }
      }
    }
    
    return null;
  }

  /**
   * Increase raycaster precision temporarily for a second pass
   * @param objectsMap Map of object IDs to Three.js objects
   * @returns The ID of the first intersected object with increased precision, or null if none
   */
  public findIntersectedObjectIdWithIncreasedPrecision(objectsMap: Record<string, THREE.Object3D>): string | null {
    if (this.isDisposed) return null;

    // Save original precision values
    const originalLinePrecision = this.raycaster.params.Line?.threshold || 1;
    const originalPointsPrecision = this.raycaster.params.Points?.threshold || 1;
    
    try {
      // Increase precision
      this.raycaster.params.Line = { threshold: originalLinePrecision * 2 };
      this.raycaster.params.Points = { threshold: originalPointsPrecision * 2 };
      
      // Filter visible objects
      const visibleObjects = Object.values(objectsMap).filter(obj => obj && obj.visible);
      
      // Cast ray with increased precision
      const intersects = this.castRay(visibleObjects);
      
      // Find the first intersected object
      if (intersects.length > 0) {
        const intersectedObject = intersects[0].object;
        
        // Find the object ID from the map
        for (const [id, obj] of Object.entries(objectsMap)) {
          if (obj === intersectedObject) {
            return id;
          }
        }
      }
      
      return null;
    } finally {
      // Reset precision to original values
      this.raycaster.params.Line = { threshold: originalLinePrecision };
      this.raycaster.params.Points = { threshold: originalPointsPrecision };
    }
  }

  /**
   * Check if a point has moved significantly from a reference point
   * @param x Current X position
   * @param y Current Y position
   * @param refX Reference X position
   * @param refY Reference Y position
   * @param threshold Distance threshold
   * @returns True if the point has moved more than the threshold
   */
  public hasMovedSignificantly(
    x: number, 
    y: number, 
    refX: number, 
    refY: number, 
    threshold: number = 5
  ): boolean {
    const dx = Math.abs(x - refX);
    const dy = Math.abs(y - refY);
    return dx > threshold || dy > threshold;
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.isDisposed = true;
  }
}
