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
  
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.waterEdgeDetector = new WaterEdgeDetector(scene);
    
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
   * Create the preview mesh for the dock
   */
  private createPreviewMesh(): void {
    // Create a simple dock mesh for preview
    const geometry = new THREE.BoxGeometry(10, 2, 20);
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
      const { position, landId } = this.waterEdgeDetector.findNearestWaterEdge(intersection);
      
      if (position) {
        // Update preview mesh position
        this.previewMesh.position.copy(position);
        this.previewMesh.visible = true;
        this.adjacentLandId = landId;
      } else {
        this.previewMesh.visible = false;
        this.adjacentLandId = null;
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
