import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { WaterEdgeDetector } from './WaterEdgeDetector';

export class DockCreationManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private previewMesh: THREE.Object3D | null = null;
  private fallbackPreviewMesh: THREE.Mesh | null = null;
  private waterEdgeDetector: WaterEdgeDetector;
  private adjacentLandId: string | null = null;
  private renderer: THREE.WebGLRenderer;
  private currentEdge: { start: THREE.Vector3, end: THREE.Vector3 } | null = null;
  private modelLoader: GLTFLoader;
  private isModelLoaded: boolean = false;
  
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, polygons: any[]) {
    console.log('DockCreationManager: Initializing with', polygons.length, 'polygons');
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.waterEdgeDetector = new WaterEdgeDetector(polygons);
    this.modelLoader = new GLTFLoader();
    
    // Find the renderer from the scene's userData or from the canvas
    if (scene.userData?.renderer) {
      this.renderer = scene.userData.renderer;
      console.log('DockCreationManager: Found renderer in scene.userData');
    } else {
      // Try to find the renderer from the canvas
      const canvas = document.querySelector('canvas');
      if (canvas) {
        console.log('DockCreationManager: Found canvas element');
        // Try different ways to access the renderer
        if ((canvas as any).__renderer) {
          this.renderer = (canvas as any).__renderer;
          console.log('DockCreationManager: Found renderer in canvas.__renderer');
        } else if ((scene as any).userData?.canvas?.__renderer) {
          this.renderer = (scene as any).userData.canvas.__renderer;
          console.log('DockCreationManager: Found renderer in scene.userData.canvas.__renderer');
        } else {
          console.warn('DockCreationManager: No renderer found in canvas, creating temporary one');
          this.renderer = new THREE.WebGLRenderer({ antialias: true });
          this.renderer.setSize(window.innerWidth, window.innerHeight);
          this.renderer.domElement = canvas;
        }
      } else {
        console.warn('DockCreationManager: No canvas found, creating temporary one');
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = window.innerWidth;
        tempCanvas.height = window.innerHeight;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.domElement = tempCanvas;
      }
    }
    
    // Create fallback preview mesh immediately
    this.createFallbackPreviewMesh();
    
    // Load the 3D model for preview
    this.loadDockModel();
  }
  
  /**
   * Update mouse position for raycasting
   */
  public updateMousePosition(clientX: number, clientY: number): void {
    console.log('DockCreationManager: Updating mouse position to', clientX, clientY);
    
    try {
      // Convert mouse position to normalized device coordinates
      const rect = this.renderer.domElement.getBoundingClientRect();
      console.log('DockCreationManager: Renderer rect =', rect);
      
      // Check if we have valid dimensions
      if (rect.width > 0 && rect.height > 0) {
        this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        console.log('DockCreationManager: Normalized mouse coordinates =', this.mouse.x, this.mouse.y);
        
        // Update preview position
        this.updatePreviewPosition();
      } else {
        // Fallback for when rect dimensions are invalid
        console.warn('DockCreationManager: Invalid renderer rect dimensions, using fallback calculation');
        this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;
        
        // Update preview position
        this.updatePreviewPosition();
      }
    } catch (error) {
      console.error('DockCreationManager: Error updating mouse position:', error);
    }
  }
  
  /**
   * Get the current preview position (snapped to water edge)
   */
  public getPreviewPosition(): THREE.Vector3 | null {
    if (this.previewMesh) {
      return this.previewMesh.position.clone();
    } else if (this.fallbackPreviewMesh) {
      return this.fallbackPreviewMesh.position.clone();
    }
    return null;
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
   * Load the dock 3D model
   */
  private loadDockModel(): void {
    this.modelLoader.load(
      '/assets/buildings/models/public-dock/model.glb',
      (gltf) => {
        // Remove fallback mesh if it exists
        if (this.fallbackPreviewMesh) {
          this.scene.remove(this.fallbackPreviewMesh);
        }
        
        // Set up the model
        const model = gltf.scene;
        
        // Apply materials and settings
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // Make the material transparent for preview
            if (child.material) {
              child.material = child.material.clone();
              child.material.transparent = true;
              child.material.opacity = 0.7;
            }
          }
        });
        
        // Add to scene
        this.scene.add(model);
        this.previewMesh = model;
        this.previewMesh.visible = false;
        
        // Set flag
        this.isModelLoaded = true;
        
        // Update position if we already have a valid position
        if (this.currentEdge) {
          this.updatePreviewPosition();
        }
      },
      (progress) => {
        // Loading progress
        console.log(`Loading dock model: ${(progress.loaded / progress.total) * 100}%`);
      },
      (error) => {
        // Error handling
        console.error('Error loading dock model:', error);
        // Ensure fallback mesh is visible
        if (this.fallbackPreviewMesh) {
          this.fallbackPreviewMesh.visible = true;
        }
      }
    );
  }
  
  /**
   * Create a fallback preview mesh for the dock (used until the model loads)
   */
  private createFallbackPreviewMesh(): void {
    // Create a simple dock mesh for preview
    const geometry = new THREE.BoxGeometry(2, 0.2, 5);
    const material = new THREE.MeshBasicMaterial({
      color: 0x8B4513, // Brown color for wood
      transparent: true,
      opacity: 0.7
    });
    
    this.fallbackPreviewMesh = new THREE.Mesh(geometry, material);
    this.fallbackPreviewMesh.visible = false;
    this.scene.add(this.fallbackPreviewMesh);
  }
  
  /**
   * Update the preview position based on mouse position
   */
  private updatePreviewPosition(): void {
    console.log('DockCreationManager: Updating preview position');
    
    // Get the active preview mesh (either the model or fallback)
    const activeMesh = this.isModelLoaded ? this.previewMesh : this.fallbackPreviewMesh;
    if (!activeMesh) {
      console.log('DockCreationManager: No active mesh available');
      return;
    }
    
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
        activeMesh.position.copy(position);
        activeMesh.position.y = 0.1; // Slightly above water level
        activeMesh.visible = true;
        this.adjacentLandId = landId;
        this.currentEdge = edge;
        
        // If we have an edge, automatically align the dock perpendicular to it
        if (edge) {
          const direction = new THREE.Vector3().subVectors(edge.end, edge.start).normalize();
          const angle = Math.atan2(direction.z, direction.x);
          activeMesh.rotation.y = angle + Math.PI/2; // Perpendicular to edge
        }
        
        // Update material color to indicate valid placement
        if (!this.isModelLoaded && this.fallbackPreviewMesh && 
            this.fallbackPreviewMesh.material instanceof THREE.MeshBasicMaterial) {
          this.fallbackPreviewMesh.material.color.set(0x8B4513); // Brown for valid
          this.fallbackPreviewMesh.material.opacity = 0.7;
        } else if (this.isModelLoaded && this.previewMesh) {
          // For the model, we'll make it fully visible for valid placement
          this.previewMesh.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(mat => {
                  mat.opacity = 0.7;
                });
              } else {
                child.material.opacity = 0.7;
              }
            }
          });
        }
      } else {
        // Show preview at cursor but indicate invalid placement
        activeMesh.position.copy(intersection);
        activeMesh.position.y = 0.1;
        activeMesh.visible = true;
        this.adjacentLandId = null;
        this.currentEdge = null;
        
        // Update material color to indicate invalid placement
        if (!this.isModelLoaded && this.fallbackPreviewMesh && 
            this.fallbackPreviewMesh.material instanceof THREE.MeshBasicMaterial) {
          this.fallbackPreviewMesh.material.color.set(0xFF0000); // Red for invalid
          this.fallbackPreviewMesh.material.opacity = 0.5;
        } else if (this.isModelLoaded && this.previewMesh) {
          // For the model, we'll make it semi-transparent red for invalid placement
          this.previewMesh.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(mat => {
                  mat.opacity = 0.5;
                });
              } else {
                child.material.opacity = 0.5;
              }
            }
          });
        }
      }
    }
  }
  
  /**
   * Update the preview rotation
   */
  public updateRotation(rotation: number): void {
    if (this.isModelLoaded && this.previewMesh) {
      this.previewMesh.rotation.y = rotation;
    } else if (this.fallbackPreviewMesh) {
      this.fallbackPreviewMesh.rotation.y = rotation;
    }
  }
  
  /**
   * Generate connection points for the dock
   */
  public generateConnectionPoints(): { x: number; y: number; z: number }[] {
    // Get position and rotation from the active preview mesh
    const position = this.getPreviewPosition() || new THREE.Vector3();
    const rotation = this.isModelLoaded && this.previewMesh 
      ? this.previewMesh.rotation.y 
      : this.fallbackPreviewMesh?.rotation.y || 0;
    
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
    // Clean up the 3D model if loaded
    if (this.previewMesh) {
      this.scene.remove(this.previewMesh);
      
      // Dispose of geometries and materials
      this.previewMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) {
            child.geometry.dispose();
          }
          
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(material => material.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
      
      this.previewMesh = null;
    }
    
    // Clean up the fallback mesh
    if (this.fallbackPreviewMesh) {
      this.scene.remove(this.fallbackPreviewMesh);
      this.fallbackPreviewMesh.geometry.dispose();
      
      if (this.fallbackPreviewMesh.material) {
        if (Array.isArray(this.fallbackPreviewMesh.material)) {
          this.fallbackPreviewMesh.material.forEach(material => material.dispose());
        } else {
          this.fallbackPreviewMesh.material.dispose();
        }
      }
      
      this.fallbackPreviewMesh = null;
    }
  }
}
