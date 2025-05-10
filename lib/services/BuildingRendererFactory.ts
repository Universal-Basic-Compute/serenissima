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
   * Render a building
   * @param building Building data
   * @returns Promise resolving to THREE.Object3D
   */
  public async render(building: BuildingData): Promise<THREE.Object3D> {
    try {
      // Load the building model
      const model = await this.options.cacheService.getBuildingModel(building.type, building.variant);
      
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
      
      model.position.copy(position);
      // Change the y position to 1.2
      model.position.y = 1.2;
      
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
      
      model.position.copy(position);
      // Change the y position to 1.2
      model.position.y = 1.2;
      
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
