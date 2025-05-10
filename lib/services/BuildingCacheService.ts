import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { BuildingData } from '../models/BuildingTypes';

/**
 * Service for caching building data and models
 * Improves performance by reducing redundant API calls and model loading
 */
export class BuildingCacheService {
  private buildingDataCache: Map<string, {data: BuildingData, timestamp: number}> = new Map();
  private modelCache: Map<string, THREE.Object3D> = new Map();
  private textureCache: Map<string, THREE.Texture> = new Map();
  private gltfLoader: GLTFLoader = new GLTFLoader();
  private cacheLifetime = 5 * 60 * 1000; // 5 minutes
  private textureLoader = new THREE.TextureLoader();

  /**
   * Get building data from cache or fetch from API
   * @param id Building ID
   * @returns Promise resolving to building data
   */
  public async getBuildingData(id: string): Promise<BuildingData> {
    const cached = this.buildingDataCache.get(id);
    if (cached && Date.now() - cached.timestamp < this.cacheLifetime) {
      return cached.data;
    }
    
    try {
      const response = await fetch(`/api/buildings/${id}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch building data: ${response.status}`);
      }
      
      const data = await response.json();
      const buildingData = data.building;
      
      // Cache the result
      this.buildingDataCache.set(id, {
        data: buildingData,
        timestamp: Date.now()
      });
      
      return buildingData;
    } catch (error) {
      console.error(`Error fetching building data for ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get building model from cache or load
   * @param type Building type
   * @param variant Building variant
   * @returns Promise resolving to THREE.Object3D
   */
  public async getBuildingModel(type: string, variant: string = 'model'): Promise<THREE.Object3D> {
    const cacheKey = `${type}-${variant}`;
    
    // Return cached model if available
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey).clone();
    }
    
    // Track failed paths to avoid repeated attempts
    const failedPaths = new Set<string>();
    
    // Define model paths with multiple fallback options
    const modelPaths = [
      `/assets/buildings/models/${type}/${variant}.glb`,  // Primary path with variant
      `/assets/buildings/models/${type}/model.glb`,       // Fallback to default variant
      `/models/buildings/${type}.glb`,                    // Legacy path
      `/models/buildings/default_building.glb`            // Ultimate fallback
    ];
    
    // Try each path in sequence until one works
    for (const modelPath of modelPaths) {
      // Skip paths we've already tried and failed
      if (failedPaths.has(modelPath)) continue;
      
      try {
        console.log(`Attempting to load model from: ${modelPath}`);
        
        // Load the model
        const gltf = await this.loadGLTF(modelPath);
        const model = gltf.scene.clone();
        
        // Cache the model for future use
        this.modelCache.set(cacheKey, model.clone());
        
        console.log(`Successfully loaded model from: ${modelPath}`);
        return model;
      } catch (error) {
        console.warn(`Failed to load model from ${modelPath}:`, error);
        // Mark this path as failed
        failedPaths.add(modelPath);
        // Continue to next path option
      }
    }
    
    // If all paths fail, create a fallback cube model and cache it
    console.error(`All model loading attempts failed for ${type}. Creating fallback.`);
    const fallbackModel = this.createFallbackModel(type);
    
    // Cache the fallback model to prevent future loading attempts
    this.modelCache.set(cacheKey, fallbackModel.clone());
    
    return fallbackModel;
  }
  
  /**
   * Load a GLTF model
   * @param path Path to the GLTF file
   * @returns Promise resolving to GLTF
   */
  private loadGLTF(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
      // Create a timeout to abort the request if it takes too long
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout loading model from ${path}`));
      }, 5000); // 5 second timeout
      
      this.gltfLoader.load(
        path,
        (gltf) => {
          clearTimeout(timeoutId);
          resolve(gltf);
        },
        undefined,
        (error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      );
    });
  }
  
  /**
   * Create a fallback model when loading fails
   * @param type Building type
   * @returns THREE.Object3D fallback model
   */
  private createFallbackModel(type: string): THREE.Object3D {
    // Create a more visible fallback cube model with a distinctive color
    const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5); // Smaller size (was 3)
    
    // Generate a deterministic color based on building type
    let hash = 0;
    for (let i = 0; i < type.length; i++) {
      hash = type.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = (hash & 0x00FFFFFF);
    
    const material = new THREE.MeshStandardMaterial({ 
      color: color, 
      emissive: 0x440044, // Add some emissive glow
      wireframe: false
    });
    const cube = new THREE.Mesh(geometry, material);
    
    // Add the cube to a group to match GLTF structure
    const group = new THREE.Group();
    group.add(cube);
    
    // Add a label to identify the building type
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(type, canvas.width/2, canvas.height/2);
      
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(0, 2, 0); // Position above the cube
      sprite.scale.set(3, 1.5, 1);
      group.add(sprite);
    }
    
    return group;
  }
  
  /**
   * Get texture from cache or load
   * @param path Texture path
   * @returns Promise resolving to THREE.Texture
   */
  public async getTexture(path: string): Promise<THREE.Texture> {
    if (this.textureCache.has(path)) {
      return this.textureCache.get(path);
    }
    
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        path,
        (texture) => {
          this.textureCache.set(path, texture);
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Clear all caches
   * Properly disposes of Three.js resources to prevent memory leaks
   */
  public clearCache(): void {
    // Clear building data cache
    this.buildingDataCache.clear();
    
    // Dispose of Three.js resources
    this.modelCache.forEach(model => {
      this.disposeObject(model);
    });
    this.modelCache.clear();
    
    // Dispose of textures
    this.textureCache.forEach(texture => {
      texture.dispose();
    });
    this.textureCache.clear();
    
    console.log('Building cache cleared');
  }
  
  /**
   * Recursively dispose of Three.js object and its children
   * @param object THREE.Object3D to dispose
   */
  private disposeObject(object: THREE.Object3D): void {
    if (object.children) {
      // Clone the children array to avoid modification during iteration
      const children = [...object.children];
      for (const child of children) {
        this.disposeObject(child);
      }
    }
    
    // Dispose of geometries and materials
    if (object instanceof THREE.Mesh) {
      if (object.geometry) {
        object.geometry.dispose();
      }
      
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => this.disposeMaterial(material));
        } else {
          this.disposeMaterial(object.material);
        }
      }
    }
  }
  
  /**
   * Dispose of a material and its textures
   * @param material THREE.Material to dispose
   */
  private disposeMaterial(material: THREE.Material): void {
    // Dispose of textures
    const properties = [
      'map', 'normalMap', 'specularMap', 'emissiveMap', 
      'metalnessMap', 'roughnessMap', 'bumpMap', 'displacementMap'
    ];
    
    for (const prop of properties) {
      if ((material as any)[prop]) {
        (material as any)[prop].dispose();
      }
    }
    
    material.dispose();
  }
}

// Create a singleton instance
const buildingCacheService = new BuildingCacheService();
export default buildingCacheService;
