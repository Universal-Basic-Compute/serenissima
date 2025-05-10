import * as THREE from 'three';
import { BuildingData, DockData } from '../models/BuildingTypes';
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
 * Default building renderer implementation
 */
class DefaultBuildingRenderer implements IBuildingRenderer {
  constructor(private options: BuildingRendererOptions) {}
  
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
   * Get building color based on type - to delete
   */
  private getBuildingColorByType(type: string): number {
    switch(type) {
      case 'market-stall':
        return 0xA52A2A; // Brown
      case 'dock':
        return 0x8B4513; // SaddleBrown
      case 'house':
        return 0xCD853F; // Peru
      default:
        return 0xD2B48C; // Tan
    }
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
      
      // Load the building model
      const model = await this.options.cacheService.getBuildingModel(building.type, building.variant);
      
      // Check if this is a fallback model and we should skip rendering it
      if (model.userData && model.userData.isFallbackModel) {
        console.log(`Skipping rendering of fallback model for ${building.id} of type ${building.type}`);
        
        // Create an empty group instead of using the fallback model
        const emptyGroup = new THREE.Group();
        
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
        
        // Copy the position
        emptyGroup.position.copy(position);
        
        // Set rotation
        emptyGroup.rotation.y = building.rotation || 0;
        
        // Add metadata to the model
        emptyGroup.userData = {
          buildingId: building.id,
          type: building.type,
          landId: building.land_id,
          owner: building.owner || building.created_by,
          position: building.position,
          isEmptyPlaceholder: true
        };
        
        // Add to scene
        this.options.scene.add(emptyGroup);
        
        return emptyGroup;
      }
      
      // Check if this is a fallback model and we should skip rendering it
      if (model.userData && model.userData.isFallbackModel) {
        console.log(`Skipping rendering of fallback model for ${building.id} of type ${building.type}`);
        
        // Create an empty group instead of using the fallback model
        const emptyGroup = new THREE.Group();
        
        // Copy the position
        emptyGroup.position.copy(position);
        emptyGroup.position.y = 0;
        
        // Set rotation
        emptyGroup.rotation.y = building.rotation || 0;
        
        // Add metadata to the model
        emptyGroup.userData = {
          buildingId: building.id,
          type: building.type,
          landId: building.land_id,
          owner: building.owner || building.created_by,
          position: building.position,
          isEmptyPlaceholder: true
        };
        
        // Add to scene
        this.options.scene.add(emptyGroup);
        
        return emptyGroup;
      }
      
      // Update position with ground level
      
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
      
      model.position.copy(position);
      
      // Set rotation
      model.rotation.y = building.rotation || 0;
      
      // Add metadata to the model
      model.userData = {
        buildingId: building.id,
        type: building.type,
        landId: building.land_id,
        owner: building.owner || building.created_by,
        position: building.position
      };
      
      // Remove any grid objects from the model
      model.traverse((child) => {
        // Check if the object is a grid or has grid in its name
        if (child.name && (child.name.includes('grid') || child.name.includes('Grid'))) {
          // Make the grid invisible
          child.visible = false;
        }
        
        // Enable shadows and configure materials for lighting
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
      });
      
      // Add to scene
      this.options.scene.add(model);
      
      return model;
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
 * Specialized renderer for dock buildings
 */
class DockRenderer implements IBuildingRenderer {
  constructor(private options: BuildingRendererOptions) {}
  
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
   * Render a dock
   * @param building Dock data
   * @returns Promise resolving to THREE.Object3D
   */
  public async render(building: BuildingData): Promise<THREE.Object3D> {
    try {
      // Load the dock model
      const model = await this.options.cacheService.getBuildingModel('dock', building.variant);
      
      // Set position
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
      
      // For docks, we want them slightly above water level
      // Find the water level at this position using raycasting
      const groundPosition = this.findGroundLevel(position);
      if (groundPosition) {
        // Use the detected ground height plus a small offset for docks
        position.y = groundPosition.y + 0.2;
      } else {
        // Fallback to default water level if detection fails
        position.y = 0.2; // Water level is typically at y=0
      }
      
      model.position.copy(position);
      
      // Set rotation
      model.rotation.y = building.rotation || 0;
      
      // Add metadata to the model
      model.userData = {
        buildingId: building.id,
        type: building.type,
        landId: building.land_id,
        owner: building.owner || building.created_by,
        position: building.position
      };
      
      // Remove any grid objects from the model
      model.traverse((child) => {
        // Check if the object is a grid or has grid in its name
        if (child.name && (child.name.includes('grid') || child.name.includes('Grid'))) {
          // Make the grid invisible
          child.visible = false;
        }
        
        // Enable shadows and configure materials for lighting
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
      });
      
      // Add connection points for docks
      if ((building as DockData).connectionPoints) {
        const connectionPoints = (building as DockData).connectionPoints;
        
        // Create visual indicators for connection points
        connectionPoints.forEach((point, index) => {
          const geometry = new THREE.SphereGeometry(0.2, 8, 8);
          const material = new THREE.MeshBasicMaterial({ color: 0x00AAFF });
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
      
      return model;
    } catch (error) {
      console.error(`Error rendering dock ${building.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Update a dock mesh
   * @param building Updated dock data
   * @param mesh Mesh to update
   */
  public update(building: BuildingData, mesh: THREE.Object3D): void {
    // Use the default update logic
    const defaultRenderer = new DefaultBuildingRenderer(this.options);
    defaultRenderer.update(building, mesh);
    
    // Additional dock-specific updates
    if ((building as DockData).connectionPoints) {
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
      const connectionPoints = (building as DockData).connectionPoints;
      
      connectionPoints.forEach((point, index) => {
        const geometry = new THREE.SphereGeometry(0.2, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0x00AAFF });
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
   * Dispose of a dock mesh
   * @param mesh Mesh to dispose
   */
  public dispose(mesh: THREE.Object3D): void {
    // Use the default dispose logic
    const defaultRenderer = new DefaultBuildingRenderer(this.options);
    defaultRenderer.dispose(mesh);
  }
}

/**
 * Specialized renderer for market stall buildings
 */
class MarketStallRenderer implements IBuildingRenderer {
  constructor(private options: BuildingRendererOptions) {}
  
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
   * Render a market stall
   * @param building Market stall data
   * @returns Promise resolving to THREE.Object3D
   */
  public async render(building: BuildingData): Promise<THREE.Object3D> {
    try {
      // Load the market stall model
      const model = await this.options.cacheService.getBuildingModel('market-stall', building.variant);
      
      // Set position
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
      
      // Find the ground level at this position using raycasting
      const groundPosition = this.findGroundLevel(position);
      if (groundPosition) {
        // Use the detected ground height plus a small offset for market stalls
        position.y = groundPosition.y + 0.05;
      } else {
        // Fallback to default height if detection fails
        position.y = 0.05;
      }
      
      model.position.copy(position);
      
      // Set rotation
      model.rotation.y = building.rotation || 0;
      
      // Add metadata to the model
      model.userData = {
        buildingId: building.id,
        type: building.type,
        landId: building.land_id,
        owner: building.owner || building.created_by,
        position: building.position
      };
      
      // Remove any grid objects from the model
      model.traverse((child) => {
        // Check if the object is a grid or has grid in its name
        if (child.name && (child.name.includes('grid') || child.name.includes('Grid'))) {
          // Make the grid invisible
          child.visible = false;
        }
      });
      
      // Add to scene
      this.options.scene.add(model);
      
      return model;
    } catch (error) {
      console.error(`Error rendering market stall ${building.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Update a market stall mesh
   * @param building Updated market stall data
   * @param mesh Mesh to update
   */
  public update(building: BuildingData, mesh: THREE.Object3D): void {
    // Use the default update logic
    const defaultRenderer = new DefaultBuildingRenderer(this.options);
    defaultRenderer.update(building, mesh);
  }
  
  /**
   * Dispose of a market stall mesh
   * @param mesh Mesh to dispose
   */
  public dispose(mesh: THREE.Object3D): void {
    // Use the default dispose logic
    const defaultRenderer = new DefaultBuildingRenderer(this.options);
    defaultRenderer.dispose(mesh);
  }
}

/**
 * Factory for creating building renderers
 */
export class BuildingRendererFactory {
  private renderers: Map<string, IBuildingRenderer> = new Map();
  private defaultRenderer: IBuildingRenderer;
  
  constructor(private options: BuildingRendererOptions) {
    // Create specialized renderers
    this.renderers.set('dock', new DockRenderer(options));
    this.renderers.set('market-stall', new MarketStallRenderer(options));
    // Add more specialized renderers as needed
    
    // Create default renderer
    this.defaultRenderer = new DefaultBuildingRenderer(options);
  }
  
  /**
   * Get a renderer for a building type
   * @param buildingType Building type
   * @returns Building renderer
   */
  public getRenderer(buildingType: string): IBuildingRenderer {
    return this.renderers.get(buildingType) || this.defaultRenderer;
  }
}
