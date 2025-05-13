import * as THREE from 'three';
import { DockService, DockData } from './services/DockService';

export class RoadCreationManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private points: THREE.Vector3[] = [];
  private snapDistance: number = 10;
  private curvature: number = 0.5;
  private dockConnectionPoints: THREE.Vector3[] = [];
  
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
  }
  
  /**
   * Update mouse position for raycasting
   */
  public updateMousePosition(clientX: number, clientY: number): void {
    // Convert mouse position to normalized device coordinates
    const rect = this.scene.userData?.renderer?.domElement.getBoundingClientRect();
    if (!rect) return;
    
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }
  
  /**
   * Handle click to add a point
   */
  public handleClick(): THREE.Vector3 | null {
    // Cast ray from mouse position
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Find intersection with ground plane
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    const intersected = this.raycaster.ray.intersectPlane(groundPlane, intersection);
    
    if (intersected) {
      // Check for snap points
      const snapPoint = this.findSnapPoint(intersection);
      const point = snapPoint || intersection;
      
      // Add point to list
      this.points.push(point.clone());
      
      return point;
    }
    
    return null;
  }
  
  /**
   * Find snap point for road placement
   */
  private findSnapPoint(position: THREE.Vector3): THREE.Vector3 | null {
    // Check for existing road points to snap to
    if (this.points.length > 0) {
      for (const point of this.points) {
        if (position.distanceTo(point) < this.snapDistance) {
          return point.clone();
        }
      }
    }
    
    // Check for dock connection points to snap to
    const dockSnapPoint = this.findDockSnapPoint(position);
    if (dockSnapPoint) {
      return dockSnapPoint;
    }
    
    return null;
  }
  
  /**
   * Find dock snap points asynchronously
   * This method can be called separately to pre-load dock snap points
   */
  public async loadDockSnapPoints(): Promise<void> {
    try {
      const dockService = DockService.getInstance();
      const docks = await dockService.getDocks();
      
      // Store dock connection points for later synchronous access
      this.dockConnectionPoints = [];
      
      for (const dock of docks) {
        if (dock.connectionPoints) {
          for (const point of dock.connectionPoints) {
            this.dockConnectionPoints.push(
              new THREE.Vector3(point.x, point.y, point.z)
            );
          }
        }
      }
    } catch (error) {
      console.error('Error loading dock snap points:', error);
    }
  }
  
  /**
   * Find the nearest dock connection point to snap to
   */
  private findDockSnapPoint(position: THREE.Vector3): THREE.Vector3 | null {
    try {
      // Use the pre-loaded dock connection points instead of fetching them synchronously
      if (this.dockConnectionPoints.length === 0) {
        return null;
      }
      
      // Find the closest dock connection point
      let closestPoint: THREE.Vector3 | null = null;
      let closestDistance = this.snapDistance;
      
      for (const point of this.dockConnectionPoints) {
        const distance = position.distanceTo(point);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPoint = point;
        }
      }
      
      return closestPoint ? closestPoint.clone() : null;
    } catch (error) {
      console.error('Error finding dock snap points:', error);
      return null;
    }
  }
  
  /**
   * Remove the last point
   */
  public removeLastPoint(): boolean {
    if (this.points.length > 0) {
      this.points.pop();
      return true;
    }
    return false;
  }
  
  /**
   * Set the curvature value
   */
  public setCurvature(value: number): void {
    this.curvature = Math.max(0, Math.min(1, value));
  }
  
  /**
   * Get all points
   */
  public getPoints(): THREE.Vector3[] {
    return [...this.points];
  }
  
  /**
   * Get the current snap point
   */
  public getSnapPoint(): THREE.Vector3 | null {
    // Cast ray from mouse position
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Find intersection with ground plane
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    const intersected = this.raycaster.ray.intersectPlane(groundPlane, intersection);
    
    if (intersected) {
      return this.findSnapPoint(intersection);
    }
    
    return null;
  }
  
  /**
   * Clear all points
   */
  public clearPoints(): void {
    this.points = [];
  }
  
  /**
   * Clean up resources
   */
  public dispose(): void {
    this.clearPoints();
  }
}
