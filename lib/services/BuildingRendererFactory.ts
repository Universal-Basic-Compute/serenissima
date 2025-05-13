import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { InstancedMesh } from 'three';
import { InstancedBufferAttribute } from 'three';
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
  debug?: boolean;
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
  private loadingQueue: string[] = [];
  private loadingInProgress: Set<string> = new Set();
  private maxConcurrentLoads: number = 50; // Increased from 3 to 50 to allow more concurrent loads
  private loadingTimeout: number = 15000; // 15 second timeout for model loading
  private modelCache: Map<string, THREE.Object3D> = new Map();
  private pendingBuildings: Map<string, BuildingData> = new Map();
  private debug: boolean = false;
  
  // Instancing support
  private buildingInstances: Map<string, {
    mesh: THREE.InstancedMesh,
    count: number,
    instanceMap: Map<string, number>
  }> = new Map();
  private maxInstancesPerType = 1000; // Maximum instances per building type
  
  constructor(private options: BuildingRendererOptions) {
    this.gltfLoader = new GLTFLoader();
    this.debug = options.debug || false;
    
    // Check if model files exist
    this.checkModelFilesExist();
    
    // Preload common models
    this.preloadCommonModels();
  }
  
  /**
   * Debug function to check if model files exist in the public directory
   */
  private async checkModelFilesExist(): Promise<void> {
    if (!this.debug) return;
    
    this.logDebug(`Checking for model files in public directory...`);
    
    // Common building types to check
    const buildingTypes = ['market-stall', 'house', 'workshop', 'tavern', 'dock', 'warehouse', 'artisan-s-house'];
    const variants = ['model'];
    
    for (const type of buildingTypes) {
      for (const variant of variants) {
        const modelPath = this.getModelPath(type, variant);
        try {
          const response = await fetch(modelPath, { method: 'HEAD' });
          this.logDebug(`Model ${type}/${variant}: ${response.ok ? 'EXISTS' : 'MISSING'} (${response.status})`, 
            `background: ${response.ok ? '#00FF00' : '#FF0000'}; color: black; padding: 2px 5px; font-weight: bold;`);
          
          // Also check the old path for comparison
          const oldPath = `/models/buildings/${type}/${variant}.glb`;
          const oldResponse = await fetch(oldPath, { method: 'HEAD' });
          this.logDebug(`Old path ${type}/${variant}: ${oldResponse.ok ? 'EXISTS' : 'MISSING'} (${oldResponse.status})`, 
            `background: ${oldResponse.ok ? '#00FF00' : '#FF0000'}; color: black; padding: 2px 5px; font-weight: bold;`);
        } catch (error: unknown) {
          // Properly handle AbortError
          if (error instanceof Error && error.name === 'AbortError') {
            this.logDebug(`Request aborted for model ${type}/${variant} - this is normal during navigation`);
          } else {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`Error checking model ${type}/${variant}: ${errorMessage}`);
          }
        }
      }
    }
  }
  
  /**
   * Conditionally log debug messages
   */
  private logDebug(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`%c ${message}`, 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;', ...args);
    }
  }
  
  /**
   * Get the path to a building model
   * @param buildingType Type of building
   * @param variant Model variant
   * @returns Path to the model file
   */
  private getModelPath(buildingType: string, variant: string = 'model'): string {
    // Normalize building type to handle any case or format issues
    const normalizedType = buildingType.toLowerCase().trim()
      .replace(/\s+/g, '-')
      .replace(/'/g, '')
      .replace(/&/g, 'and');
    
    // Create the model path using the correct directory structure
    const modelPath = `/assets/buildings/models/${normalizedType}/${variant}.glb`;
    
    if (this.debug) {
      // Log the full URL for easier debugging
      const fullUrl = new URL(modelPath, window.location.origin).href;
      this.logDebug(`Model path for ${buildingType}/${variant}: ${modelPath}`);
      this.logDebug(`Full model URL: ${fullUrl}`);
    }
    
    return modelPath;
  }


  /**
   * Preload common building models to improve initial loading performance
   */
  private preloadCommonModels(): void {
    if (!this.debug) return;
    
    this.logDebug('Preloading common building models...');
    
    // List of common building types to preload
    const commonTypes = ['market-stall', 'house', 'workshop', 'tavern', 'artisan-s-house'];
    
    // Preload each model
    commonTypes.forEach(type => {
      const modelPath = this.getModelPath(type);
      this.gltfLoader.load(
        modelPath,
        (gltf) => {
          // Store in cache
          this.modelCache.set(`${type}_model`, gltf.scene.clone());
          this.logDebug(`Preloaded model for ${type}`);
        },
        undefined,
        (error: Error) => {
          console.warn(`Failed to preload model for ${type}: ${error.message}`);
        }
      );
    });
  }
  
  /**
   * Public debug method to check all model paths
   * Can be called from outside to diagnose model loading issues
   */
  public debugModelPaths(): void {
    console.log('%c Checking building model paths...', 'background: #FFFF00; color: black; padding: 2px 5px;');
    
    // Common building types to check
    const buildingTypes = ['market-stall', 'house', 'workshop', 'tavern', 'artisan-s-house'];
    
    buildingTypes.forEach(type => {
      const oldPath = `/models/buildings/${type}/model.glb`;
      const newPath = `/assets/buildings/models/${type}/model.glb`;
      
      // Check old path
      fetch(oldPath, { method: 'HEAD' })
        .then(response => {
          console.log(`%c Old path ${oldPath}: ${response.ok ? 'EXISTS' : 'MISSING'} (${response.status})`, 
            `background: ${response.ok ? '#00FF00' : '#FF0000'}; color: black; padding: 2px;`);
        })
        .catch(error => {
          if (error.name === 'AbortError') {
            console.log(`%c Old path ${oldPath}: Request aborted - this is normal during navigation`, 
              'background: #FFA500; color: black; padding: 2px;');
          } else {
            console.log(`%c Old path ${oldPath}: ERROR - ${error.message}`, 
              'background: #FF0000; color: white; padding: 2px;');
          }
        });
      
      // Check new path
      fetch(newPath, { method: 'HEAD' })
        .then(response => {
          console.log(`%c New path ${newPath}: ${response.ok ? 'EXISTS' : 'MISSING'} (${response.status})`, 
            `background: ${response.ok ? '#00FF00' : '#FF0000'}; color: black; padding: 2px;`);
        })
        .catch(error => {
          if (error.name === 'AbortError') {
            console.log(`%c New path ${newPath}: Request aborted - this is normal during navigation`, 
              'background: #FFA500; color: black; padding: 2px;');
          } else {
            console.log(`%c New path ${newPath}: ERROR - ${error.message}`, 
              'background: #FF0000; color: white; padding: 2px;');
          }
        });
    });
  }
  
  /**
   * Create a building at a specific building point
   * @param buildingData Building data including position, type, etc.
   * @param cost The cost in Ducats
   * @returns Promise resolving to the created building
   */
  public async createBuildingAtPoint(buildingData: any, cost: number): Promise<any> {
    try {
      // Validate required fields
      if (!buildingData.type) {
        throw new Error('Building type is required');
      }
      
      if (!buildingData.land_id) {
        throw new Error('Land ID is required');
      }
      
      if (!buildingData.position) {
        throw new Error('Position is required');
      }
      
      if (!buildingData.created_by) {
        throw new Error('Creator (wallet address) is required');
      }
      
      // Send to server using relative URL
      const response = await fetch(`/api/create-building-at-point`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...buildingData,
          walletAddress: buildingData.created_by,
          cost
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create building: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success || !result.building) {
        throw new Error(result.error || 'Failed to create building');
      }
      
      // Return the created building data
      return result.building;
    } catch (error) {
      console.error('Error creating building at point:', error);
      
      // For development, return mock data if API fails
      if (process.env.NODE_ENV === 'development') {
        console.warn('Returning mock building data for development');
        return {
          id: `building_${Date.now()}`,
          type: buildingData.type,
          land_id: buildingData.land_id,
          position: buildingData.position,
          rotation: buildingData.rotation || 0,
          variant: buildingData.variant || 'model',
          owner: buildingData.created_by,
          created_at: buildingData.created_at || new Date().toISOString()
        };
      }
      
      throw error;
    }
  }

  /**
   * Create a simplified version of the building for distant viewing
   * Uses instancing for better performance with many buildings
   */
  private createLowDetailModel(building: BuildingData): THREE.Object3D {
    // Get building size
    const size = this.getBuildingSizeByType(building.type);
    
    // Apply 2x reduction to low-detail models too
    const scaleFactor = 0.5;
    
    // Get position
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
    
    // Get color for this building type
    const color = this.getBuildingColorByType(building.type);
    
    // Create a group for the low-detail model
    const group = new THREE.Group();
    
    // Create a base for the building
    const baseGeometry = new THREE.BoxGeometry(
      size.width * 0.5 * scaleFactor, 
      size.height * 0.5 * scaleFactor, 
      size.depth * 0.5 * scaleFactor
    );
    const baseMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8
    });
    
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = size.height * 0.25 * scaleFactor; // Half the height
    group.add(base);
    
    // Add a roof for certain building types
    if (['house', 'tavern', 'workshop', 'church', 'palace'].includes(building.type)) {
      const roofGeometry = new THREE.ConeGeometry(
        size.width * 0.3 * scaleFactor, 
        size.height * 0.2 * scaleFactor, 
        4
      );
      const roofMaterial = new THREE.MeshBasicMaterial({
        color: 0x8B4513, // Brown color for roof
        transparent: true,
        opacity: 0.8
      });
      
      const roof = new THREE.Mesh(roofGeometry, roofMaterial);
      roof.position.y = size.height * 0.6 * scaleFactor; // Position on top of the base
      roof.rotation.y = Math.PI / 4; // Rotate 45 degrees
      
      group.add(roof);
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
      isLowDetail: true
    };
    
    return group;
  }

  /**
   * Get approximate building size based on type
   */
  private getBuildingSizeByType(type: string): {width: number, height: number, depth: number} {
    switch(type.toLowerCase()) {
      case 'market-stall':
        return {width: 1.5, height: 1.5, depth: 1.5};
      case 'dock':
        return {width: 3, height: 0.5, depth: 3};
      case 'house':
        return {width: 2, height: 2.5, depth: 2};
      case 'workshop':
        return {width: 2.5, height: 2, depth: 2.5};
      case 'warehouse':
        return {width: 3, height: 2, depth: 3};
      case 'tavern':
        return {width: 2.5, height: 2.5, depth: 2.5};
      case 'church':
        return {width: 3, height: 5, depth: 3};
      case 'palace':
        return {width: 4, height: 4, depth: 4};
      default:
        return {width: 2, height: 2, depth: 2};
    }
  }

  /**
   * Get building color based on type
   */
  private getBuildingColorByType(type: string): number {
    switch(type.toLowerCase()) {
      case 'market-stall':
        return 0xf5a442; // Orange
      case 'house':
        return 0xe8c39e; // Light tan for houses
      case 'workshop':
        return 0xc77f3f; // Brown for workshops
      case 'warehouse':
        return 0x8c7f5d; // Dark tan for warehouses
      case 'tavern':
        return 0xd4a76a; // Warm tan for taverns
      case 'church':
        return 0xf5f5f5; // White for churches
      case 'palace':
        return 0xf5e7c1; // Cream for palaces
      case 'dock':
        return 0x8b7355; // Wood brown for docks
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
    
    // Get building size based on type
    const size = this.getBuildingSizeByType(building.type);
    
    // Make the fallback cube even smaller - 1/10 of the original size
    const scaleFactor = 0.1; // 1/10 of the original size
    
    // Create a simple gray box with high transparency
    console.log(`Creating fallback box for building ${building.id} of type ${building.type}`);
    
    // Create a simple gray cube
    const baseGeometry = new THREE.BoxGeometry(
      size.width * scaleFactor, 
      size.height * scaleFactor, 
      size.depth * scaleFactor
    );
    
    // Use a gray color with high transparency
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x888888, // Gray color
      transparent: true,
      opacity: 0.3 // Very transparent
    });
    
    const box = new THREE.Mesh(baseGeometry, material);
    
    // Add the box to the group
    group.add(box);
    
    // No roof needed - just the single cube
    
    // Create a small text label to show the building type
    const canvas = document.createElement('canvas');
    canvas.width = 128; // Smaller canvas
    canvas.height = 32; // Smaller height
    const context = canvas.getContext('2d');
    
    if (context) {
      context.fillStyle = 'rgba(0, 0, 0, 0.5)'; // More transparent background
      context.fillRect(0, 0, 128, 32);
      context.font = 'bold 12px Arial'; // Smaller font
      context.fillStyle = 'white';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(building.type, 64, 16);
      
      const texture = new THREE.CanvasTexture(canvas);
      const labelMaterial = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true
      });
      
      const label = new THREE.Sprite(labelMaterial);
      // Position label just above the cube
      label.position.set(0, size.height * scaleFactor + 0.1, 0);
      label.scale.set(0.5, 0.125, 1); // Make the label smaller
      
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
   * Adjust model position to sit properly on the ground using raycasting
   */
  private adjustModelToGround(model: THREE.Object3D, building: BuildingData): void {
    // Create a bounding box for the model
    const boundingBox = new THREE.Box3().setFromObject(model);
    const modelSize = new THREE.Vector3();
    boundingBox.getSize(modelSize);
    
    // Create a raycaster to find the ground
    const raycaster = new THREE.Raycaster();
    
    // Cast multiple rays from different points on the model's base
    // to ensure we find the highest ground point
    const rayOrigins: THREE.Vector3[] = [];
    
    // Get the model's center position
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    
    // Create a grid of points on the base of the model
    const gridSize = 3; // 3x3 grid
    const halfWidth = modelSize.x / 2;
    const halfDepth = modelSize.z / 2;
    
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        const xPos = center.x - halfWidth + (x * modelSize.x / (gridSize - 1));
        const zPos = center.z - halfDepth + (z * modelSize.z / (gridSize - 1));
        
        // Create ray origin high above the model
        rayOrigins.push(new THREE.Vector3(xPos, 100, zPos));
      }
    }
    
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
    
    if (this.debug) {
      this.logDebug(`Found ${landMeshes.length} land meshes for ground detection`);
    }
    
    // Find the highest ground point
    let highestY = -Infinity;
    
    rayOrigins.forEach(origin => {
      // Set up the raycaster
      raycaster.set(origin, new THREE.Vector3(0, -1, 0));
      
      // Find intersections with land
      const intersects = raycaster.intersectObjects(landMeshes, true);
      
      if (intersects.length > 0) {
        // Get the Y position of the intersection
        const intersectionY = intersects[0].point.y;
        
        // Update highest Y if this is higher
        if (intersectionY > highestY) {
          highestY = intersectionY;
        }
      }
    });
    
    // If we found a ground point, adjust the model's position
    if (highestY !== -Infinity) {
      // Calculate the current bottom Y of the model
      const modelBottomY = boundingBox.min.y;
      
      // Calculate the adjustment needed
      const adjustment = highestY - modelBottomY;
      
      // Apply the adjustment
      model.position.y = highestY;
      
      if (this.debug) {
        this.logDebug(`Adjusted model ${building.id} to ground level. Adjustment: ${adjustment}`);
      }
    } else {
      // If no ground was found, use a default height of 0
      model.position.y = 0;
      
      if (this.debug) {
        this.logDebug(`No ground found for model ${building.id}, using default height of 0`);
      }
    }
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
   * Process the loading queue
   */
  private processLoadingQueue(): void {
    // Skip if we're at the concurrent loading limit
    if (this.loadingInProgress.size >= this.maxConcurrentLoads) return;
    
    // Get the next building ID from the queue
    const nextBuildingId = this.loadingQueue.shift();
    if (!nextBuildingId) return;
    
    // Mark as loading
    this.loadingInProgress.add(nextBuildingId);
    
    // Find the building data
    const building = this.pendingBuildings.get(nextBuildingId);
    if (!building) {
      this.loadingInProgress.delete(nextBuildingId);
      this.processLoadingQueue();
      return;
    }
    
    // Load the model
    this.loadBuildingModel(building)
      .finally(() => {
        // Remove from in-progress set
        this.loadingInProgress.delete(nextBuildingId);
        // Process next in queue
        this.processLoadingQueue();
      });
  }
  
  /**
   * Get the model position
   */
  private getModelPosition(building: BuildingData): THREE.Vector3 {
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
    
    // Find ground level
    const groundPosition = this.findGroundLevel(position);
    if (groundPosition) {
      position.y = groundPosition.y;
    }
    
    // Special handling for different building types
    if (building.type === 'market-stall') {
      position.y += 0.05;
    }
    
    return position;
  }
  
  /**
   * Configure a model for a specific building
   */
  private configureModel(model: THREE.Object3D, building: BuildingData): void {
    // First get the horizontal position
    const position = this.getModelPosition(building);
    
    // Scale the model down by 50% (2x smaller)
    model.scale.set(0.5, 0.5, 0.5);
    
    // Create a bounding box for the model to determine its dimensions
    const boundingBox = new THREE.Box3().setFromObject(model);
    const modelHeight = boundingBox.max.y - boundingBox.min.y;
    const modelBottomY = boundingBox.min.y;
    
    // Calculate the offset needed to place the bottom of the model at ground level
    const verticalOffset = -modelBottomY;
    
    // Position the model at the calculated position with the vertical offset
    model.position.copy(position);
    model.position.y += verticalOffset; // This ensures the bottom of the model is at ground level
    
    // Set rotation
    model.rotation.y = building.rotation || 0;
    
    // Add metadata
    model.userData = {
      buildingId: building.id,
      type: building.type,
      landId: building.land_id,
      owner: building.owner || building.created_by,
      position: building.position
    };
    
    // Configure for rendering
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
          color: 0xFFAA00 
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
    
    // Add to scene
    this.options.scene.add(model);
    
    // After adding to scene, perform a raycast to find the ground level
    this.adjustModelToGround(model, building);
  }
  
  /**
   * Load building model with caching
   */
  private async loadBuildingModel(building: BuildingData): Promise<THREE.Object3D> {
    // Create a cache key based on building type and variant
    const cacheKey = `${building.type}_${building.variant || 'model'}`;
    
    // Check if we have a cached model
    if (this.modelCache.has(cacheKey)) {
      // Clone the cached model
      const cachedModel = this.modelCache.get(cacheKey)!;
      const clonedModel = cachedModel.clone();
      
      // Position and configure the cloned model
      this.configureModel(clonedModel, building);
      
      return clonedModel;
    }
    
    // If not cached, load the model
    try {
      // Get the model path first so it's available in the catch block
      const modelPath = this.getModelPath(building.type, building.variant || 'model');
      
      if (this.debug) {
        this.logDebug(`Attempting to load model from: ${modelPath}`);
        
        // Add this to check if the file exists
        fetch(modelPath, { method: 'HEAD' })
          .then(response => {
            this.logDebug(`Model file check: ${response.ok ? 'EXISTS' : 'MISSING'} (${response.status})`);
          })
          .catch(error => {
            this.logDebug(`Error checking model file: ${error.message}`);
          });
      }
      
      // Create a low detail model to show while loading
      const tempModel = this.createLowDetailModel(building);
      this.options.scene.add(tempModel);
      
      // Load with timeout
      const gltf = await Promise.race([
        new Promise<GLTF>((resolve, reject) => {
          this.gltfLoader.load(
            modelPath,
            (gltf) => {
              if (this.debug) {
                this.logDebug(`Successfully loaded GLB for ${building.id} from ${modelPath}`);
              }
              resolve(gltf);
            },
            (progress) => {
              // Log loading progress for debugging
              if (this.debug && progress.lengthComputable) {
                const percentComplete = Math.round((progress.loaded / progress.total) * 100);
                this.logDebug(`Loading progress for ${building.id}: ${percentComplete}%`);
              }
            },
            reject
          );
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Model load timeout')), this.loadingTimeout)
        )
      ]);
      
      // Remove the temporary model
      this.options.scene.remove(tempModel);
      
      const model = gltf.scene;
      
      // Cache a clone of the base model before configuring
      this.modelCache.set(cacheKey, model.clone());
      
      // Configure the model for this specific building
      this.configureModel(model, building);
      
      return model;
    } catch (error) {
      console.warn(`Failed to load model for ${building.id} of type ${building.type}: ${error instanceof Error ? error.message : String(error)}`);
      
      // Get the model path again if needed for error reporting
      const modelPath = this.getModelPath(building.type, building.variant || 'model');
      console.warn(`Attempted to load from path: ${modelPath}`);
      
      // Try alternative model paths if the primary path fails
      try {
        // Try a fallback path with just the base type (e.g., "house" instead of "large-house")
        const baseType = building.type.split('-')[0];
        if (baseType && baseType !== building.type) {
          const fallbackPath = this.getModelPath(baseType, building.variant || 'model');
          console.log(`Trying fallback model path: ${fallbackPath}`);
          
          // Check if fallback file exists
          if (this.debug) {
            fetch(fallbackPath, { method: 'HEAD' })
              .then(response => {
                this.logDebug(`Fallback model check: ${response.ok ? 'EXISTS' : 'MISSING'} (${response.status})`);
              })
              .catch(error => {
                this.logDebug(`Error checking fallback model: ${error.message}`);
              });
          }
          
          const gltf = await this.gltfLoader.loadAsync(fallbackPath);
          const model = gltf.scene;
          
          // Cache and configure the model
          this.modelCache.set(cacheKey, model.clone());
          this.configureModel(model, building);
          
          return model;
        }
      } catch (fallbackError) {
        console.warn(`Fallback model also failed for ${building.id}: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      }
      
      // If all loading attempts fail, create a colored box model as fallback
      return this.createColoredBoxModel(building, this.getModelPosition(building));
    }
  }
  
  /**
   * Get distance to camera
   */
  private getDistanceToCamera(building: BuildingData): number {
    const camera = this.getCameraFromScene();
    if (!camera) return 100; // Default to a large distance if no camera
    
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
    
    return camera.position.distanceTo(position);
  }
  
  /**
   * Render a building
   * @param building Building data
   * @returns Promise resolving to THREE.Object3D
   */
  public async render(building: BuildingData): Promise<THREE.Object3D> {
    try {
      if (this.debug) {
        this.logDebug(`Rendering building ${building.id} of type ${building.type}`);
      }
      
      // Generate a unique ID for this building if not provided
      const buildingId = building.id || `building_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      // Store in pending buildings map
      this.pendingBuildings.set(buildingId, building);
      
      // Check camera distance to prioritize loading
      const distanceToCamera = this.getDistanceToCamera(building);
      
      // Create a low-detail model immediately for all buildings
      // This ensures something is visible while the detailed model loads
      const lowDetailModel = this.createLowDetailModel(building);
      this.scene.add(lowDetailModel);
      
      // For distant buildings, just return the low-detail model
      if (distanceToCamera > 150) {
        if (this.debug) {
          this.logDebug(`Building ${building.id} is distant (${distanceToCamera.toFixed(2)} units), using low detail model`);
        }
        return lowDetailModel;
      }
      
      // For closer buildings, add to loading queue with priority based on distance
      if (distanceToCamera < 50) {
        // High priority - add to front of queue
        this.loadingQueue.unshift(buildingId);
      } else {
        // Normal priority - add to end of queue
        this.loadingQueue.push(buildingId);
      }
      
      // Start processing the queue if not already in progress
      if (this.loadingInProgress.size < this.maxConcurrentLoads) {
        this.processLoadingQueue();
      }
      
      // Return the low-detail model immediately while the high-detail one loads
      return lowDetailModel;
    } catch (error) {
      console.error(`Error rendering building ${building.id}: ${error instanceof Error ? error.message : String(error)}`);
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
      if (building.type === 'market-stall') {
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
          color: 0xFFAA00 
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
    // Check if this is an instanced proxy
    if (mesh.userData && mesh.userData.isInstancedProxy) {
      const { instanceKey, instanceIndex, buildingId } = mesh.userData;
      
      // Get the instanced mesh data
      const instanceData = this.buildingInstances.get(instanceKey);
      if (instanceData) {
        // Remove this building from the instance map
        instanceData.instanceMap.delete(buildingId);
        
        // We don't actually remove the instance from the mesh,
        // but we could mark it as inactive by setting its scale to 0
        const matrix = new THREE.Matrix4();
        matrix.makeScale(0, 0, 0);
        instanceData.mesh.setMatrixAt(instanceIndex, matrix);
        instanceData.mesh.instanceMatrix.needsUpdate = true;
      }
    } else {
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
   * Clean up all resources including instanced meshes
   */
  public cleanup(): void {
    // Dispose of all instanced meshes
    for (const [key, instanceData] of this.buildingInstances.entries()) {
      this.options.scene.remove(instanceData.mesh);
      instanceData.mesh.geometry.dispose();
      if (Array.isArray(instanceData.mesh.material)) {
        instanceData.mesh.material.forEach(m => m.dispose());
      } else {
        instanceData.mesh.material.dispose();
      }
    }
    
    // Clear the map
    this.buildingInstances.clear();
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
  
  /**
   * Public debug method to check all model paths
   * Can be called from outside to diagnose model loading issues
   */
  public debugModelPaths(): void {
    console.log('%c Checking building model paths...', 'background: #FFFF00; color: black; padding: 2px 5px;');
    
    // Common building types to check
    const buildingTypes = ['market-stall', 'house', 'workshop', 'tavern', 'artisan-s-house'];
    
    buildingTypes.forEach(type => {
      const oldPath = `/models/buildings/${type}/model.glb`;
      const newPath = `/assets/buildings/models/${type}/model.glb`;
      
      // Check old path
      fetch(oldPath, { method: 'HEAD' })
        .then(response => {
          console.log(`%c Old path ${oldPath}: ${response.ok ? 'EXISTS' : 'MISSING'} (${response.status})`, 
            `background: ${response.ok ? '#00FF00' : '#FF0000'}; color: black; padding: 2px;`);
        })
        .catch(error => {
          console.log(`%c Old path ${oldPath}: ERROR - ${error.message}`, 
            'background: #FF0000; color: white; padding: 2px;');
        });
      
      // Check new path
      fetch(newPath, { method: 'HEAD' })
        .then(response => {
          console.log(`%c New path ${newPath}: ${response.ok ? 'EXISTS' : 'MISSING'} (${response.status})`, 
            `background: ${response.ok ? '#00FF00' : '#FF0000'}; color: black; padding: 2px;`);
        })
        .catch(error => {
          console.log(`%c New path ${newPath}: ERROR - ${error.message}`, 
            'background: #FF0000; color: white; padding: 2px;');
        });
    });
  }
  
  /**
   * Create a building at a specific building point
   * This is a convenience method that delegates to the universal renderer
   * @param buildingData Building data including position, type, etc.
   * @param cost The cost in Ducats
   * @returns Promise resolving to the created building
   */
  public async createBuildingAtPoint(buildingData: any, cost: number): Promise<any> {
    // Cast the universal renderer to access its createBuildingAtPoint method
    const renderer = this.universalRenderer as UniversalBuildingRenderer;
    return renderer.createBuildingAtPoint(buildingData, cost);
  }
}
