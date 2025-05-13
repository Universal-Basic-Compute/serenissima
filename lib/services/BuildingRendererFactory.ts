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
  private sceneReady: boolean = false;
  
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
  }
  
  /**
   * Debug function to check if model files exist in the public directory
   */
  private async checkModelFilesExist(): Promise<void> {
    if (!this.debug) return;
    
    this.logDebug(`Checking for model files in public directory...`);
    
    // Common building types to check
    const buildingTypes = ['market-stall', 'house', 'workshop', 'tavern', 'dock'];
    const variants = ['model'];
    
    for (const type of buildingTypes) {
      for (const variant of variants) {
        const modelPath = this.getModelPath(type, variant);
        try {
          const response = await fetch(modelPath, { method: 'HEAD' });
          this.logDebug(`Model ${type}/${variant}: ${response.ok ? 'EXISTS' : 'MISSING'} (${response.status})`, 
            `background: ${response.ok ? '#00FF00' : '#FF0000'}; color: black; padding: 2px 5px; font-weight: bold;`);
        } catch (error) {
          console.warn(`Error checking model ${type}/${variant}: ${error.message}`);
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
    
    // Create the model path
    const modelPath = `/models/buildings/${normalizedType}/${variant}.glb`;
    
    if (this.debug) {
      // Log the full URL for easier debugging
      const fullUrl = new URL(modelPath, window.location.origin).href;
      this.logDebug(`Model path for ${buildingType}/${variant}: ${modelPath}`);
      this.logDebug(`Full model URL: ${fullUrl}`);
    }
    
    return modelPath;
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
    
    // Create a key for the instanced mesh based on building type
    const instanceKey = building.type;
    
    // Check if we already have an instanced mesh for this building type
    if (!this.buildingInstances.has(instanceKey)) {
      // Create a new instanced mesh for this building type
      const geometry = new THREE.BoxGeometry(size.width/4, size.height/4, size.depth/4);
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.8
      });
      
      // Create an instanced mesh with capacity for many buildings of this type
      const instancedMesh = new THREE.InstancedMesh(
        geometry, 
        material, 
        this.maxInstancesPerType
      );
      instancedMesh.count = 0; // Start with 0 instances
      instancedMesh.frustumCulled = true; // Enable frustum culling
      
      // Add to scene
      this.options.scene.add(instancedMesh);
      
      // Store in our map
      this.buildingInstances.set(instanceKey, {
        mesh: instancedMesh,
        count: 0,
        instanceMap: new Map() // Map building IDs to instance indices
      });
    }
    
    // Get the instanced mesh data
    const instanceData = this.buildingInstances.get(instanceKey)!;
    
    // Check if this building already has an instance
    if (instanceData.instanceMap.has(building.id)) {
      // Update existing instance
      const instanceIndex = instanceData.instanceMap.get(building.id)!;
      
      // Create matrix for this instance
      const matrix = new THREE.Matrix4();
      matrix.setPosition(position);
      
      // Apply rotation
      const rotationMatrix = new THREE.Matrix4();
      rotationMatrix.makeRotationY(building.rotation || 0);
      matrix.multiply(rotationMatrix);
      
      // Update the instance matrix
      instanceData.mesh.setMatrixAt(instanceIndex, matrix);
      instanceData.mesh.instanceMatrix.needsUpdate = true;
      
      // Update the instance color
      instanceData.mesh.setColorAt(instanceIndex, new THREE.Color(color));
      if (instanceData.mesh.instanceColor) {
        instanceData.mesh.instanceColor.needsUpdate = true;
      }
      
      // Create a proxy object that represents this instance
      const proxy = new THREE.Object3D();
      proxy.position.copy(position);
      proxy.rotation.y = building.rotation || 0;
      proxy.userData = {
        buildingId: building.id,
        type: building.type,
        landId: building.land_id,
        owner: building.owner || building.created_by,
        position: building.position,
        isLowDetail: true,
        isInstancedProxy: true,
        instanceIndex: instanceIndex,
        instanceKey: instanceKey
      };
      
      return proxy;
    } else {
      // Add a new instance
      const instanceIndex = instanceData.count;
      
      // Check if we've reached the maximum instances
      if (instanceIndex >= this.maxInstancesPerType) {
        console.warn(`Maximum instances reached for building type ${building.type}`);
        
        // Fall back to a regular mesh
        const geometry = new THREE.BoxGeometry(size.width/4, size.height/4, size.depth/4);
        const material = new THREE.MeshBasicMaterial({ 
          color: color,
          transparent: true,
          opacity: 0.8
        });
        
        const model = new THREE.Mesh(geometry, material);
        model.position.copy(position);
        model.rotation.y = building.rotation || 0;
        
        model.userData = {
          buildingId: building.id,
          type: building.type,
          landId: building.land_id,
          owner: building.owner || building.created_by,
          position: building.position,
          isLowDetail: true
        };
        
        this.options.scene.add(model);
        return model;
      }
      
      // Create matrix for this instance
      const matrix = new THREE.Matrix4();
      matrix.setPosition(position);
      
      // Apply rotation
      const rotationMatrix = new THREE.Matrix4();
      rotationMatrix.makeRotationY(building.rotation || 0);
      matrix.multiply(rotationMatrix);
      
      // Set the instance matrix
      instanceData.mesh.setMatrixAt(instanceIndex, matrix);
      instanceData.mesh.instanceMatrix.needsUpdate = true;
      
      // Set the instance color
      instanceData.mesh.setColorAt(instanceIndex, new THREE.Color(color));
      if (instanceData.mesh.instanceColor) {
        instanceData.mesh.instanceColor.needsUpdate = true;
      }
      
      // Increment the instance count
      instanceData.count++;
      instanceData.mesh.count = instanceData.count;
      
      // Map this building ID to its instance index
      instanceData.instanceMap.set(building.id, instanceIndex);
      
      // Create a proxy object that represents this instance
      const proxy = new THREE.Object3D();
      proxy.position.copy(position);
      proxy.rotation.y = building.rotation || 0;
      proxy.userData = {
        buildingId: building.id,
        type: building.type,
        landId: building.land_id,
        owner: building.owner || building.created_by,
        position: building.position,
        isLowDetail: true,
        isInstancedProxy: true,
        instanceIndex: instanceIndex,
        instanceKey: instanceKey
      };
      
      return proxy;
    }
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
      case 'workshop':
        return {width: 3, height: 3, depth: 3};
      case 'warehouse':
        return {width: 4, height: 3, depth: 4};
      case 'tavern':
        return {width: 3, height: 3, depth: 3};
      case 'church':
        return {width: 4, height: 6, depth: 4};
      case 'palace':
        return {width: 5, height: 6, depth: 5};
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
    
    // Create a box with a color based on building type, but make it 50% smaller (0.5 instead of 1)
    console.log(`%c Creating fallback box for building ${building.id} of type ${building.type}`, 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5); // Changed from 1,1,1 to 0.5,0.5,0.5 (50% smaller)
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
      label.position.set(0, 1, 0); // Position slightly lower due to smaller box
      label.scale.set(1.5, 0.4, 1); // Scale down label to match smaller box
      
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
    // Position the model
    const position = this.getModelPosition(building);
    model.position.copy(position);
    
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
      const modelPath = this.getModelPath(building.type, building.variant || 'model');
      
      if (this.debug) {
        this.logDebug(`Attempting to load model from: ${modelPath}`);
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
            undefined,
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
      console.warn(`Failed to load model for ${building.id} of type ${building.type}: ${error.message}`);
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
   * Set scene ready state
   * @param ready Whether the scene is ready for rendering buildings
   */
  public setSceneReady(ready: boolean): void {
    this.sceneReady = ready;
    
    // If scene is now ready and we have pending buildings, render them
    if (this.sceneReady && this.pendingBuildings.size > 0) {
      console.log(`Scene is ready, rendering ${this.pendingBuildings.size} pending buildings`);
      this.processLoadingQueue();
    }
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
      
      // If scene is not ready yet, just store the building and return a placeholder
      if (!this.sceneReady) {
        console.log(`Scene not ready yet, queuing building ${buildingId} for later rendering`);
        
        // Return a simple invisible placeholder
        const placeholder = new THREE.Object3D();
        placeholder.visible = false;
        placeholder.userData = {
          buildingId: buildingId,
          isPendingRender: true
        };
        return placeholder;
      }
      
      // Check camera distance to prioritize loading
      const distanceToCamera = this.getDistanceToCamera(building);
      
      // Create a low-detail model immediately for very distant buildings
      // Increased distance threshold from 50 to 150 to show more detailed models
      if (distanceToCamera > 150) {
        if (this.debug) {
          this.logDebug(`Building ${building.id} is distant (${distanceToCamera.toFixed(2)} units), using low detail model`);
        }
        return this.createLowDetailModel(building);
      }
      
      // For closer buildings, add to loading queue with priority based on distance
      // Increased distance threshold from 20 to 50 for high priority loading
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
      
      // Return a low-detail model immediately while the high-detail one loads
      return this.createLowDetailModel(building);
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
