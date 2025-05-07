import * as THREE from 'three';
import { WaterEdgeDetector } from './WaterEdgeDetector';

export class DockCreationManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private previewMesh: THREE.Mesh | null = null;
  private waterEdgeDetector: WaterEdgeDetector;
  private adjacentLandId: string | null = null;
  private renderer: THREE.WebGLRenderer;
  private currentEdge: { start: THREE.Vector3, end: THREE.Vector3 } | null = null;
  
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, polygons: any[]) {
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.waterEdgeDetector = new WaterEdgeDetector(polygons);
    
    // Find the renderer from the scene's userData or create a temporary one
    this.renderer = scene.userData?.renderer || 
      new THREE.WebGLRenderer({ antialias: true });
    
    // Create preview mesh
    this.createPreviewMesh();
  }
  
  /**
   * Update mouse position for raycasting
   */
  public updateMousePosition(clientX: number, clientY: number): void {
    // Convert mouse position to normalized device coordinates
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update preview position
    this.updatePreviewPosition();
  }
  
  /**
   * Get the current preview position (snapped to water edge)
   */
  public getPreviewPosition(): THREE.Vector3 | null {
    if (!this.previewMesh) return null;
    return this.previewMesh.position.clone();
  }
  
  /**
   * Get the ID of the land adjacent to the dock
   */
  public getAdjacentLandId(): string | null {
    return this.adjacentLandId;
  }
  
  /**
   * Get the current edge the dock is placed on
   */
  public getCurrentEdge(): { start: THREE.Vector3, end: THREE.Vector3 } | null {
    return this.currentEdge;
  }
  
  /**
   * Create the preview mesh for the dock
   */
  private createPreviewMesh(): void {
    // Create a simple dock mesh for preview
    const geometry = new THREE.BoxGeometry(2, 0.2, 5);
    const material = new THREE.MeshBasicMaterial({
      color: 0x8B4513, // Brown color for wood
      transparent: true,
      opacity: 0.7
    });
    
    this.previewMesh = new THREE.Mesh(geometry, material);
    this.previewMesh.visible = false;
    this.scene.add(this.previewMesh);
  }
  
  /**
   * Update the preview position based on mouse position
   */
  private updatePreviewPosition(): void {
    if (!this.previewMesh) return;
    
    // Cast ray from mouse position
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Find intersection with water plane
    const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    const intersected = this.raycaster.ray.intersectPlane(waterPlane, intersection);
    
    if (intersected) {
      // Find nearest water edge and adjacent land
      const { position, landId, edge } = this.waterEdgeDetector.findNearestWaterEdge(intersection);
      
      if (position && landId) {
        // Update preview mesh position
        this.previewMesh.position.copy(position);
        this.previewMesh.position.y = 0.1; // Slightly above water level
        this.previewMesh.visible = true;
        this.adjacentLandId = landId;
        this.currentEdge = edge;
        
        // If we have an edge, automatically align the dock perpendicular to it
        if (edge) {
          const direction = new THREE.Vector3().subVectors(edge.end, edge.start).normalize();
          const angle = Math.atan2(direction.z, direction.x);
          this.previewMesh.rotation.y = angle + Math.PI/2; // Perpendicular to edge
        }
        
        // Update material color to indicate valid placement
        if (this.previewMesh.material instanceof THREE.MeshBasicMaterial) {
          this.previewMesh.material.color.set(0x8B4513); // Brown for valid
        }
      } else {
        // Show preview at cursor but indicate invalid placement
        this.previewMesh.position.copy(intersection);
        this.previewMesh.position.y = 0.1;
        this.previewMesh.visible = true;
        this.adjacentLandId = null;
        this.currentEdge = null;
        
        // Update material color to indicate invalid placement
        if (this.previewMesh.material instanceof THREE.MeshBasicMaterial) {
          this.previewMesh.material.color.set(0xFF0000); // Red for invalid
          this.previewMesh.material.opacity = 0.5;
        }
      }
    }
  }
  
  /**
   * Update the preview rotation
   */
  public updateRotation(rotation: number): void {
    if (this.previewMesh) {
      this.previewMesh.rotation.y = rotation;
    }
  }
  
  /**
   * Generate connection points for the dock
   */
  public generateConnectionPoints(): { x: number; y: number; z: number }[] {
    if (!this.previewMesh) return [];
    
    const position = this.previewMesh.position;
    const rotation = this.previewMesh.rotation.y;
    const points = [];
    
    // Front connection point (for roads connecting to the dock)
    points.push({
      x: position.x + Math.sin(rotation) * 2.5,
      y: position.y + 0.2,
      z: position.z + Math.cos(rotation) * 2.5
    });
    
    // Side connection points (for roads running alongside the dock)
    points.push({
      x: position.x + Math.sin(rotation + Math.PI/2) * 1,
      y: position.y + 0.2,
      z: position.z + Math.cos(rotation + Math.PI/2) * 1
    });
    
    points.push({
      x: position.x + Math.sin(rotation - Math.PI/2) * 1,
      y: position.y + 0.2,
      z: position.z + Math.cos(rotation - Math.PI/2) * 1
    });
    
    return points;
  }
  
  /**
   * Check if the current placement is valid
   */
  public isPlacementValid(): boolean {
    return this.adjacentLandId !== null && this.currentEdge !== null;
  }
  
  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.previewMesh) {
      this.scene.remove(this.previewMesh);
      this.previewMesh.geometry.dispose();
      (this.previewMesh.material as THREE.Material).dispose();
      this.previewMesh = null;
    }
  }
}
