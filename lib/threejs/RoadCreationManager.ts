import * as THREE from 'three';
import { RoadCreatorFacade } from './RoadCreatorFacade';

/**
 * Manages the road creation process and coordinates between UI and Three.js
 */
export class RoadCreationManager {
  private roadCreatorFacade: RoadCreatorFacade | null = null;
  private points: THREE.Vector3[] = [];
  private curvature: number = 0.5;
  private isPlacing: boolean = false;
  private snapPoint: THREE.Vector3 | null = null;
  private isDisposed: boolean = false;

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    this.roadCreatorFacade = new RoadCreatorFacade(scene, camera);
  }

  /**
   * Update mouse position for road creation
   */
  public updateMousePosition(clientX: number, clientY: number): void {
    if (this.isDisposed || !this.roadCreatorFacade) return;
    this.roadCreatorFacade.updateMousePosition(clientX, clientY);
    this.updateRoadPreview();
  }

  /**
   * Handle click to add a point to the road
   * @returns The new point if added, null otherwise
   */
  public handleClick(): THREE.Vector3 | null {
    if (this.isDisposed || !this.roadCreatorFacade) return null;
    
    // Find intersection with polygon meshes
    const intersectionPoint = this.roadCreatorFacade.findIntersection();
    
    if (intersectionPoint) {
      // Add point to the road
      this.points.push(intersectionPoint);
      
      // If this is the first point, start placing mode
      if (this.points.length === 1) {
        this.isPlacing = true;
      }
      
      // If we have at least 2 points, update the preview
      if (this.points.length >= 2) {
        this.roadCreatorFacade.createRoadMesh(this.points, this.curvature);
      }
      
      return intersectionPoint;
    }
    
    return null;
  }

  /**
   * Remove the last point from the road
   * @returns true if a point was removed, false otherwise
   */
  public removeLastPoint(): boolean {
    if (this.isDisposed || !this.roadCreatorFacade || this.points.length === 0) return false;
    
    this.points.pop();
    
    if (this.points.length >= 2) {
      // Update preview with remaining points
      this.roadCreatorFacade.createRoadMesh(this.points, this.curvature);
    }
    
    if (this.points.length === 0) {
      this.isPlacing = false;
    }
    
    return true;
  }

  /**
   * Update the road curvature
   */
  public setCurvature(value: number): void {
    if (this.isDisposed || !this.roadCreatorFacade) return;
    
    this.curvature = value;
    
    // Update the preview if we have points
    if (this.points.length >= 2) {
      this.roadCreatorFacade.createRoadMesh(this.points, this.curvature);
    }
  }

  /**
   * Get the current road points
   */
  public getPoints(): THREE.Vector3[] {
    return [...this.points];
  }

  /**
   * Get the current snap point (if any)
   */
  public getSnapPoint(): THREE.Vector3 | null {
    return this.snapPoint;
  }

  /**
   * Clear all road points
   */
  public clearPoints(): void {
    this.points = [];
    this.isPlacing = false;
  }

  /**
   * Update road preview when mouse moves
   */
  private updateRoadPreview(): void {
    if (!this.isPlacing || this.points.length === 0 || !this.roadCreatorFacade) return;
    
    // Find intersection with polygon meshes
    const intersectionPoint = this.roadCreatorFacade.findIntersection();
    
    if (intersectionPoint) {
      // Find snap point if available
      const snappedPoint = this.roadCreatorFacade.findSnapPoint(intersectionPoint, this.points);
      
      // Update snap point state for UI feedback
      this.snapPoint = snappedPoint;
      
      // Use the snapped point if available, otherwise use the intersection point
      const finalPoint = snappedPoint || intersectionPoint;
      
      // Create indicator at the current point
      this.roadCreatorFacade.createIndicatorMesh(finalPoint, !!snappedPoint);
      
      // Create a temporary array with the current points plus the mouse position
      const previewPoints = [...this.points, finalPoint];
      
      // Update the preview mesh if we have at least 2 points
      if (previewPoints.length >= 2) {
        this.roadCreatorFacade.createRoadMesh(previewPoints, this.curvature);
      }
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    
    if (this.roadCreatorFacade) {
      this.roadCreatorFacade.dispose();
      this.roadCreatorFacade = null;
    }
    
    this.points = [];
    this.snapPoint = null;
  }
}
