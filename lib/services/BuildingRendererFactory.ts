import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BuildingData } from '../models/BuildingTypes';
import buildingPositionManager from './BuildingPositionManager';
import buildingCacheService from './BuildingCacheService';

/**
 * Options for building renderers
 */
interface BuildingRendererOptions {
  scene: THREE.Scene;
  positionManager: typeof buildingPositionManager;
  cacheService: typeof buildingCacheService;
}

/**
 * Interface for building renderers
 */
export interface IBuildingRenderer {
  render(building: BuildingData): Promise<THREE.Object3D>;
  update(building: BuildingData, mesh: THREE.Object3D): void;
  dispose(mesh: THREE.Object3D): void;
}

/**
 * Universal building renderer implementation
 */
class UniversalBuildingRenderer implements IBuildingRenderer {
  private gltfLoader: GLTFLoader;
  
  constructor(private options: BuildingRendererOptions) {
    this.gltfLoader = new GLTFLoader();
  }
  
  /**
   * Get the path to a building model
   * @param buildingType Type of building
   * @param variant Model variant
   * @returns Path to the model file
   */
  private getModelPath(buildingType: string, variant: string = 'model'): string {
    // Normalize building type to handle any case or format issues
    const normalizedType = buildingType.toLowerCase().trim().replace(/\s+/g, '-');
    
    // Add logging to debug model paths
    const modelPath = `/models/buildings/${normalizedType}/${variant}.glb`;
    console.log(`Model path for ${buildingType}/${variant}: ${modelPath}`);
    
    return modelPath;
  }
  
  /**
   * Create a simplified version of the building for distant viewing
   */
  private createLowDetailModel(building: BuildingData): THREE.Object3D {
    // Create a simple box geometry instead of loading the full model
    const size = this.getBuildingSizeByType(building.type);
    const geometry = new THREE.BoxGeometry(size.width, size.height, size.depth);
    const material = new THREE.MeshBasicMaterial({ 
      color: this.getBuildingColorByType(building.type),
      transparent: true,
      opacity: 0.8
    });
    
    const model = new THREE.Mesh(geometry, material);
    
    // Set position
    let position: THREE.Vector3;
    if ('lat' in building.position && 'lng' in building.position) {
      position = this.options.positionManager.latLngToScenePosition(building.position);
    } else {
      position = new THREE.Vector3(
        building.position.x,
        building.position.y || 0,
        building.position.z
      );
    }
    
    // Find the ground level at this position
    const groundPosition = this.findGroundLevel(position);
    if (groundPosition) {
      position.y = groundPosition.y;
    }
    
    model.position.copy(position);
    model.rotation.y = building.rotation || 0;
    
    // Add metadata
    model.userData = {
      buildingId: building.id,
      type: building.type,
      landId: building.land_id,
      owner: building.owner || building.created_by,
      position: building.position,
      isLowDetail: true
    };
    
    return model;
  }

  /**
   * Get approximate building size based on type - to refactor
   */
  private getBuildingSizeByType(type: string): {width: number, height: number, depth: number} {
    switch(type) {
      case 'market-stall':
        return {width: 2, height: 2, depth: 2};
      case 'dock':
        return {width: 4, height: 1, depth: 4};
      case 'house':
        return {width: 3, height: 4, depth: 3};
      default:
        return {width: 2.5, height: 3, depth: 2.5};
    }
  }

  /**
   * Get building color based on type
   */
  private getBuildingColorByType(type: string): number {
    switch(type.toLowerCase()) {
      case 'market-stall':
        return 0xf5a442; // Orange
      case 'dock':
        return 0x4287f5; // Blue
      case 'house':
        return 0x42f54e; // Green
      case 'workshop':
        return 0xf54242; // Red
      case 'warehouse':
        return 0x8c42f5; // Purple
      case 'tavern':
        return 0xf5d442; // Yellow
      case 'church':
        return 0xf5f5f5; // White
      case 'palace':
        return 0xf542a7; // Pink
      default:
        return 0xD2B48C; // Tan (default)
    }
  }
  
  /**
   * Create a colored box model as a fallback
   */
  private createColoredBoxModel(building: BuildingData, position: THREE.Vector3): THREE.Object3D {
    // Create a group to hold our objects
    const group = new THREE.Group();
    
    // Create a box with a color based on building type
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const color = this.getBuildingColorByType(building.type);
    const material = new THREE.MeshStandardMaterial({ 
      color: color,
      roughness: 0.7,
      metalness: 0.2
    });
    
    const box = new THREE.Mesh(geometry, material);
    box.castShadow = true;
    box.receiveShadow = true;
    
    // Add the box to the group
    group.add(box);
    
    // Create a text label to show the building type
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    
    if (context) {
      context.fillStyle = 'rgba(0, 0, 0, 0.8)';
      context.fillRect(0, 0, 256, 64);
      context.font = 'bold 24px Arial';
      context.fillStyle = 'white';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(building.type, 128, 32);
      
      const texture = new THREE.CanvasTexture(canvas);
      const labelMaterial = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true
      });
      
      const label = new THREE.Sprite(labelMaterial);
      label.position.set(0, 2, 0);
      label.scale.set(2, 0.5, 1);
      
      // Add the label to the group
      group.add(label);
    }
    
    // Position the group
    group.position.copy(position);
    group.rotation.y = building.rotation || 0;
    
    // Add metadata
    group.userData = {
      buildingId: building.id,
      type: building.type,
      landId: building.land_id,
      owner: building.owner || building.created_by,
      position: building.position,
      isFallbackModel: true
    };
    
    // Add to scene
    this.options.scene.add(group);
    
    return group;
  }
  
  /**
   * Find the ground level at a position using raycasting
   */
  private findGroundLevel(position: THREE.Vector3): THREE.Vector3 | null {
    // Create a raycaster
    const raycaster = new THREE.Raycaster();
    
    // Set the ray origin high above the position
    const rayOrigin = new THREE.Vector3(position.x, 100, position.z);
    
    // Set the ray direction downward
    const rayDirection = new THREE.Vector3(0, -1, 0);
    rayDirection.normalize();
    
    // Set up the raycaster with increased precision
    raycaster.set(rayOrigin, rayDirection);
    
    // Increase precision for mesh detection
    raycaster.params.Mesh.threshold = 0.1;
    
    // Find all land meshes in the scene
    const landMeshes: THREE.Object3D[] = [];
    this.options.scene.traverse(object => {
      // Include all meshes except those we want to exclude
      if (object instanceof THREE.Mesh && 
          !object.userData.buildingId && 
          !object.userData.isWater &&
          !object.userData.isCoatOfArms) {
        landMeshes.push(object);
      }
    });
    
    // Find intersections with land
    const intersects = raycaster.intersectObjects(landMeshes, true); // true to check descendants
    
    if (intersects.length > 0) {
      // If we found an intersection, return the point with a small offset
      const groundPoint = intersects[0].point.clone();
      // Add a small offset to prevent z-fighting
      groundPoint.y += 0.01;
      return groundPoint;
    }
    
    // If no intersection found, return null
    return null;
  }

  /**
   * Get camera from scene
   */
  private getCameraFromScene(): THREE.Camera | null {
    if (typeof window === 'undefined') return null;
    
    // Try to get camera from window.__threeContext
    if (window.__threeContext && window.__threeContext.camera) {
      return window.__threeContext.camera;
    }
    
    // Try to get camera from canvas element
    const canvas = document.querySelector('canvas');
    if (canvas && canvas.__camera) {
      return canvas.__camera;
    }
    
    return null;
  }
  
  /**
   * Render a building
   * @param building Building data
   * @returns Promise resolving to THREE.Object3D
   */
  public async render(building: BuildingData): Promise<THREE.Object3D> {
    try {
      console.log(`Rendering building ${building.id} of type ${building.type}`);
      
      // Get camera position to determine distance
      const camera = this.getCameraFromScene();
      
      // Calculate building position
      let position: THREE.Vector3;
      
      if ('lat' in building.position && 'lng' in building.position) {
        position = this.options.positionManager.latLngToScenePosition(building.position);
      } else {
        position = new THREE.Vector3(
          building.position.x,
          building.position.y || 0,
          building.position.z
        );
      }
      
      // Calculate distance to camera
      const distanceToCamera = camera ? 
        camera.position.distanceTo(position) : 0;
      
      // Use low detail model for distant buildings (more than 50 units away)
      if (distanceToCamera > 50) {
        return this.createLowDetailModel(building);
      }
      
      // Try to load the actual GLB model
      try {
        const modelPath = this.getModelPath(building.type, building.variant || 'model');
        console.log(`Attempting to load model from: ${modelPath}`);
        
        // Create a low detail model to show while loading
        const tempModel = this.createLowDetailModel(building);
        this.options.scene.add(tempModel);
        
        // Load the GLB model
        const gltf = await new Promise<GLTF>((resolve, reject) => {
          this.gltfLoader.load(
            modelPath,
            resolve,
            (xhr) => {
              console.log(`${building.id} model ${Math.round(xhr.loaded / xhr.total * 100)}% loaded`);
            },
            (error) => {
              // Check if this is a 404 error
              if (error instanceof Error && error.message && error.message.includes('404')) {
                console.warn(`Model not found for ${building.id} at ${modelPath} (404) - using fallback`);
              } else {
                console.error(`Error loading model for ${building.id}:`, error);
              }
              reject(error);
            }
          );
        });
        
        // Remove the temporary model
        this.options.scene.remove(tempModel);
        
        // Get the model from the GLTF scene
        const model = gltf.scene;
        
        // Find the ground level at this position using raycasting
        const groundPosition = this.findGroundLevel(position);
        if (groundPosition) {
          // Use the detected ground height
          console.log(`Found ground at height ${groundPosition.y} for building ${building.id}`);
          position.y = groundPosition.y;
        } else {
          // Fallback to default ground level if detection fails
          console.log(`No ground found for building ${building.id}, using default height (0)`);
          position.y = 0;
        }
        
        // Set position and rotation
        model.position.copy(position);
        model.rotation.y = building.rotation || 0;
        
        // Add metadata to the model
        model.userData = {
          buildingId: building.id,
          type: building.type,
          landId: building.land_id,
          owner: building.owner || building.created_by,
          position: building.position
        };
        
        // Configure model for better rendering
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.needsUpdate = true;
              child.material.roughness = 0.7;
              child.material.metalness = 0.3;
              child.material.emissive.set(0x202020);
              // Ensure materials are properly configured for shadows
              child.material.transparent = false; // Disable transparency for better shadows
              child.material.depthWrite = true;   // Ensure depth is written
            }
          }
          
          // Hide any grid objects in the model
          if (child.name && (child.name.includes('grid') || child.name.includes('Grid'))) {
            child.visible = false;
          }
        });
        
        // Add connection points if they exist
        if (building.connectionPoints && building.connectionPoints.length > 0) {
          building.connectionPoints.forEach((point, index) => {
            const geometry = new THREE.SphereGeometry(0.2, 8, 8);
            const material = new THREE.MeshBasicMaterial({ 
              color: building.type === 'dock' ? 0x00AAFF : 0xFFAA00 
            });
            const sphere = new THREE.Mesh(geometry, material);
            
            sphere.position.set(point.x, point.y, point.z);
            sphere.userData = {
              type: 'connection-point',
              index
            };
            
            model.add(sphere);
          });
        }
        
        // Special handling for different building types
        if (building.type === 'dock') {
          // Position docks slightly above water level
          model.position.y += 0.2;
        } else if (building.type === 'market-stall') {
          // Position market stalls slightly above ground
          model.position.y += 0.05;
        }
        
        // Add to scene
        this.options.scene.add(model);
        
        console.log(`Successfully loaded and added model for building ${building.id}`);
        return model;
      } catch (error) {
        // Check if this is a 404 error and log as warning instead of error
        if (error instanceof Error && error.message && error.message.includes('404')) {
          console.warn(`Model not found for ${building.id}, using colored box instead`);
        } else {
          console.error(`Failed to load GLB model for ${building.id}, using colored box instead:`, error);
        }
      
        // If GLB loading fails, create a colored box with a label
        return this.createColoredBoxModel(building, position);
      }
    } catch (error) {
      console.error(`Error rendering building ${building.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Update a building mesh
   * @param building Updated building data
   * @param mesh Mesh to update
   */
  public update(building: BuildingData, mesh: THREE.Object3D): void {
    // Update position if needed
    if (building.position) {
      let position: THREE.Vector3;
      
      if ('lat' in building.position && 'lng' in building.position) {
        position = this.options.positionManager.latLngToScenePosition(building.position);
      } else {
        position = new THREE.Vector3(
          building.position.x,
          building.position.y || 5,
          building.position.z
        );
      }
      
      mesh.position.copy(position);
      
      // Special handling for different building types
      if (building.type === 'dock') {
        // Position docks slightly above water level
        mesh.position.y += 0.2;
      } else if (building.type === 'market-stall') {
        // Position market stalls slightly above ground
        mesh.position.y += 0.05;
      }
    }
    
    // Update rotation if needed
    if (building.rotation !== undefined) {
      mesh.rotation.y = building.rotation;
    }
    
    // Update metadata
    mesh.userData = {
      ...mesh.userData,
      buildingId: building.id,
      type: building.type,
      landId: building.land_id,
      owner: building.owner || building.created_by,
      position: building.position
    };
    
    // Update connection points if they exist
    if (building.connectionPoints) {
      // Remove existing connection points
      mesh.children = mesh.children.filter(child => {
        if (child.userData && child.userData.type === 'connection-point') {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            } else if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            }
          }
          return false;
        }
        return true;
      });
      
      // Add updated connection points
      building.connectionPoints.forEach((point, index) => {
        const geometry = new THREE.SphereGeometry(0.2, 8, 8);
        const material = new THREE.MeshBasicMaterial({ 
          color: building.type === 'dock' ? 0x00AAFF : 0xFFAA00 
        });
        const sphere = new THREE.Mesh(geometry, material);
        
        sphere.position.set(point.x, point.y, point.z);
        sphere.userData = {
          type: 'connection-point',
          index
        };
        
        mesh.add(sphere);
      });
    }
  }
  
  /**
   * Dispose of a building mesh
   * @param mesh Mesh to dispose
   */
  public dispose(mesh: THREE.Object3D): void {
    // Remove from scene
    this.options.scene.remove(mesh);
    
    // Dispose of geometries and materials
    mesh.traverse((child) => {
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
  }
}

/**
 * Factory for creating building renderers
 */
export class BuildingRendererFactory {
  private universalRenderer: IBuildingRenderer;
  
  constructor(private options: BuildingRendererOptions) {
    // Create universal renderer that handles all building types
    this.universalRenderer = new UniversalBuildingRenderer(options);
  }
  
  /**
   * Get a renderer for a building type
   * @param buildingType Building type
   * @returns Building renderer
   */
  public getRenderer(buildingType: string): IBuildingRenderer {
    return this.universalRenderer;
  }
}
