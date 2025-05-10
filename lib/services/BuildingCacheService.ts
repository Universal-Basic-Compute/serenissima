import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils';
import { BuildingData } from '../models/BuildingTypes';

// Add type declaration for window.__threeContext
declare global {
  interface Window {
    __threeContext?: {
      scene?: THREE.Scene;
      camera?: THREE.Camera;
    };
  }
  
  interface HTMLCanvasElement {
    __scene?: THREE.Scene;
    __camera?: THREE.Camera;
  }
}

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
        
        // Simplify the model to reduce polygon count
        const simplifiedModel = this.simplifyModel(model);
        
        // Cache the model for future use
        this.modelCache.set(cacheKey, simplifiedModel.clone());
        
        console.log(`Successfully loaded model from: ${modelPath}`);
        return simplifiedModel;
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
   * Simplify a model to reduce polygon count
   */
  private simplifyModel(model: THREE.Object3D): THREE.Object3D {
    // Clone the model to avoid modifying the original
    const simplified = model.clone();
    
    // Traverse all meshes and simplify their geometries
    simplified.traverse(object => {
      if (object instanceof THREE.Mesh) {
        // Skip if already simplified
        if (object.userData.simplified) return;
        
        // Simplify geometry if it has too many vertices
        if (object.geometry instanceof THREE.BufferGeometry) {
          const geometry = object.geometry;
          const vertexCount = geometry.attributes.position.count;
          
          if (vertexCount > 500) {
            try {
              // Use BufferGeometryUtils.mergeVertices to simplify
              // This reduces duplicate vertices
              const simplified = BufferGeometryUtils.mergeVertices(geometry);
              
              // If we have too many vertices, decimate further
              if (simplified.attributes.position.count > 200) {
                // Create a simpler geometry based on bounding box
                const bbox = new THREE.Box3().setFromObject(object);
                const size = new THREE.Vector3();
                bbox.getSize(size);
                
                // Replace with a box geometry
                const boxGeometry = new THREE.BoxGeometry(
                  size.x, size.y, size.z
                );
                
                object.geometry.dispose();
                object.geometry = boxGeometry;
              } else {
                object.geometry.dispose();
                object.geometry = simplified;
              }
              
              object.userData.simplified = true;
            } catch (error) {
              console.warn('Error simplifying geometry:', error);
            }
          }
        }
        
        // Simplify materials
        if (object.material) {
          if (Array.isArray(object.material)) {
            // Combine multiple materials into one
            const material = new THREE.MeshBasicMaterial({
              color: 0xCCCCCC,
              transparent: false
            });
            
            // Dispose old materials
            object.material.forEach(m => m.dispose());
            
            // Set new material
            object.material = material;
          } else if (object.material.map) {
            // Replace textured materials with simple colored materials
            const color = object.material.color ? object.material.color.getHex() : 0xCCCCCC;
            const newMaterial = new THREE.MeshBasicMaterial({
              color: color,
              transparent: false
            });
            
            // Dispose old material
            object.material.dispose();
            
            // Set new material
            object.material = newMaterial;
          }
        }
      }
    });
    
    return simplified;
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
    
    // Add metadata to the group to indicate this is a fallback model
    group.userData.isFallbackModel = true;
    
    // Add metadata to the group to indicate this is a fallback model
    group.userData.isFallbackModel = true;
    
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
   * Find the ground level at a position using raycasting with improved mesh detection
   * @param position Position to check
   * @returns Ground position or null if not found
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
    
    // Since this.options.scene might not be available, we need to find the scene another way
    // Try to get the scene from the global context
    let scene: THREE.Scene | null = null;
    
    if (typeof window !== 'undefined') {
      // Try to get scene from window.__threeContext
      if (window.__threeContext && window.__threeContext.scene) {
        scene = window.__threeContext.scene;
      }
      
      // If not found, try to get from canvas element
      if (!scene) {
        const canvas = document.querySelector('canvas');
        if (canvas && canvas.__scene) {
          scene = canvas.__scene;
        }
      }
    }
    
    // If we couldn't find a scene, return a default position
    if (!scene) {
      console.warn('No scene found for ground level detection, using default height');
      return new THREE.Vector3(position.x, 0, position.z);
    }
    
    // Find all land meshes in the scene
    const landMeshes: THREE.Object3D[] = [];
    scene.traverse(object => {
      // Include all meshes except those we want to exclude
      if (object instanceof THREE.Mesh && 
          !object.userData.buildingId && 
          !object.userData.isWater &&
          !object.userData.isCoatOfArms) {
        landMeshes.push(object);
      }
    });
    
    console.log(`Found ${landMeshes.length} potential land meshes for ground level detection`);
    
    // Find intersections with land
    const intersects = raycaster.intersectObjects(landMeshes, true); // true to check descendants
    
    // Log intersection results for debugging
    if (intersects.length > 0) {
      console.log(`Found ${intersects.length} intersections for position (${position.x}, ${position.y}, ${position.z})`);
      console.log(`First intersection at distance ${intersects[0].distance}, point: (${intersects[0].point.x}, ${intersects[0].point.y}, ${intersects[0].point.z})`);
      
      // If we found an intersection, return the point with a small offset
      const groundPoint = intersects[0].point.clone();
      // Add a small offset to prevent z-fighting
      groundPoint.y += 0.01;
      return groundPoint;
    } else {
      console.log(`No ground intersections found for position (${position.x}, ${position.y}, ${position.z})`);
      
      // If no intersection found, try with a larger ray
      const largerRaycaster = new THREE.Raycaster();
      largerRaycaster.set(rayOrigin, rayDirection);
      largerRaycaster.params.Mesh.threshold = 1.0; // Much larger threshold
      
      const largerIntersects = largerRaycaster.intersectObjects(landMeshes, true);
      if (largerIntersects.length > 0) {
        console.log(`Found intersection with larger threshold at distance ${largerIntersects[0].distance}`);
        const groundPoint = largerIntersects[0].point.clone();
        groundPoint.y += 0.01;
        return groundPoint;
      }
      
      // No intersection found even with larger threshold
      console.log(`No ground found, returning default height (0)`);
      return new THREE.Vector3(position.x, 0, position.z);
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
