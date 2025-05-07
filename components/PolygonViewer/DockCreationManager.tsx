import * as THREE from 'three';
import { WaterEdgeDetector } from './WaterEdgeDetector';
import { eventBus, EventTypes } from '@/lib/eventBus';

export interface DockCreationManagerProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  polygons: any[];
}

export class DockCreationManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private waterEdgeDetector: WaterEdgeDetector;
  private previewMesh: THREE.Mesh | null = null;
  private mousePosition: THREE.Vector2 = new THREE.Vector2();
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private previewPosition: THREE.Vector3 | null = null;
  private adjacentLandId: string | null = null;
  private rotation: number = 0;
  private active: boolean = true;

  constructor({ scene, camera, polygons }: DockCreationManagerProps) {
    this.scene = scene;
    this.camera = camera;
    this.waterEdgeDetector = new WaterEdgeDetector(scene, polygons);
    this.createPreviewMesh();
  }

  public updateMousePosition(clientX: number, clientY: number): void {
    // Calculate normalized device coordinates
    const canvas = this.camera.userData.canvas || document.querySelector('canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    this.mousePosition.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mousePosition.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.updatePreviewPosition();
  }

  public getPreviewPosition(): THREE.Vector3 | null {
    return this.previewPosition;
  }

  public getAdjacentLandId(): string | null {
    return this.adjacentLandId;
  }

  public updateRotation(rotation: number): void {
    this.rotation = rotation;
    if (this.previewMesh) {
      this.previewMesh.rotation.y = rotation;
    }
  }

  public setActive(active: boolean): void {
    this.active = active;
    if (this.previewMesh) {
      this.previewMesh.visible = active;
    }
  }

  public placeDock(): { position: THREE.Vector3, rotation: number, landId: string } | null {
    if (!this.previewPosition || !this.adjacentLandId) {
      return null;
    }

    return {
      position: this.previewPosition.clone(),
      rotation: this.rotation,
      landId: this.adjacentLandId
    };
  }

  public dispose(): void {
    if (this.previewMesh) {
      this.scene.remove(this.previewMesh);
      this.previewMesh.geometry.dispose();
      if (Array.isArray(this.previewMesh.material)) {
        this.previewMesh.material.forEach(m => m.dispose());
      } else if (this.previewMesh.material) {
        this.previewMesh.material.dispose();
      }
      this.previewMesh = null;
    }
  }

  private createPreviewMesh(): void {
    // Create a simple dock preview mesh
    const geometry = new THREE.BoxGeometry(5, 1, 10);
    const material = new THREE.MeshBasicMaterial({
      color: 0x8B4513, // Brown color for wood
      transparent: true,
      opacity: 0.7,
      wireframe: false
    });

    this.previewMesh = new THREE.Mesh(geometry, material);
    this.previewMesh.position.y = 0.5; // Slightly above water level
    this.previewMesh.visible = this.active;
    this.scene.add(this.previewMesh);
  }

  private updatePreviewPosition(): void {
    if (!this.active || !this.previewMesh) return;

    // Set up raycaster
    this.raycaster.setFromCamera(this.mousePosition, this.camera);

    // Find the nearest water edge
    const result = this.waterEdgeDetector.findNearestWaterEdge(this.raycaster);
    
    if (result.position && result.landId) {
      this.previewPosition = result.position;
      this.adjacentLandId = result.landId;
      
      // Update preview mesh position
      this.previewMesh.position.copy(result.position);
      this.previewMesh.position.y = 0.5; // Slightly above water level
      
      // Update rotation to face away from land
      if (result.normal) {
        // Calculate angle from normal vector
        const angle = Math.atan2(result.normal.x, result.normal.z);
        this.rotation = angle;
        this.previewMesh.rotation.y = angle;
      }
      
      // Make preview visible
      this.previewMesh.visible = true;
    } else {
      // No valid position found, hide preview
      this.previewPosition = null;
      this.adjacentLandId = null;
      this.previewMesh.visible = false;
    }
  }
}
