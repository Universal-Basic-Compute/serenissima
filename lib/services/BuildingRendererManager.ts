import * as THREE from 'three';
import { BuildingRendererFactory } from './BuildingRendererFactory';
import buildingPositionManager from './BuildingPositionManager';
import buildingCacheService from './BuildingCacheService';
import { eventBus } from '../eventBus';
import { EventTypes } from '../eventTypes';
import { BuildingData } from '../models/BuildingTypes';

/**
 * BuildingRendererManager
 * 
 * Centralized manager for building rendering that coordinates between
 * the BuildingRendererFactory and the scene. This follows the facade pattern
 * to provide a simpler interface for building rendering.
 */
export class BuildingRendererManager {
  private static instance: BuildingRendererManager;
  private scene: THREE.Scene | null = null;
  private rendererFactory: BuildingRendererFactory | null = null;
  private buildingMeshes: Map<string, THREE.Object3D> = new Map();
  private isInitialized: boolean = false;
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): BuildingRendererManager {
    if (!BuildingRendererManager.instance) {
      BuildingRendererManager.instance = new BuildingRendererManager();
    }
    return BuildingRendererManager.instance;
  }
  
  /**
   * Initialize the manager with a scene
   */
  public initialize(scene: THREE.Scene): void {
    if (this.isInitialized) return;
    
    this.scene = scene;
    this.rendererFactory = new BuildingRendererFactory({
      scene,
      positionManager: buildingPositionManager,
      cacheService: buildingCacheService
    });
    
    // Subscribe to building events
    this.subscribeToEvents();
    
    this.isInitialized = true;
    console.log('BuildingRendererManager initialized');
  }
  
  /**
   * Subscribe to building-related events
   */
  private subscribeToEvents(): void {
    // Handle building placed events
    eventBus.subscribe(EventTypes.BUILDING_PLACED, (data: any) => {
      if (data.refresh) {
        this.refreshBuildings();
      } else if (data.data) {
        this.renderBuilding(data.data);
      }
    });
    
    // Handle building removed events
    eventBus.subscribe(EventTypes.BUILDING_REMOVED, (data: any) => {
      if (data.buildingId) {
        this.removeBuilding(data.buildingId);
      }
    });
    
    // Handle building updated events
    eventBus.subscribe(EventTypes.BUILDING_UPDATED, (data: any) => {
      if (data.building) {
        this.updateBuilding(data.building);
      }
    });
  }
  
  /**
   * Render a single building
   */
  public async renderBuilding(building: BuildingData): Promise<THREE.Object3D | null> {
    if (!this.isInitialized || !this.rendererFactory) {
      console.warn('BuildingRendererManager not initialized');
      return null;
    }
    
    try {
      // Get the appropriate renderer for this building type
      const renderer = this.rendererFactory.getRenderer(building.type);
      
      // Check if we already have a mesh for this building
      if (this.buildingMeshes.has(building.id)) {
        // Update existing mesh
        const existingMesh = this.buildingMeshes.get(building.id)!;
        renderer.update(building, existingMesh);
        return existingMesh;
      } else {
        // Create new mesh
        const mesh = await renderer.render(building);
        
        // Store reference to the mesh
        this.buildingMeshes.set(building.id, mesh);
        return mesh;
      }
    } catch (error) {
      console.error(`Error rendering building ${building.id}:`, error);
      return null;
    }
  }
  
  /**
   * Update an existing building
   */
  public updateBuilding(building: BuildingData): void {
    if (!this.isInitialized || !this.rendererFactory) {
      console.warn('BuildingRendererManager not initialized');
      return;
    }
    
    if (this.buildingMeshes.has(building.id)) {
      const mesh = this.buildingMeshes.get(building.id)!;
      const renderer = this.rendererFactory.getRenderer(building.type);
      renderer.update(building, mesh);
    } else {
      // If the building doesn't exist, render it
      this.renderBuilding(building);
    }
  }
  
  /**
   * Remove a building
   */
  public removeBuilding(buildingId: string): void {
    if (!this.isInitialized || !this.rendererFactory) {
      console.warn('BuildingRendererManager not initialized');
      return;
    }
    
    if (this.buildingMeshes.has(buildingId)) {
      const mesh = this.buildingMeshes.get(buildingId)!;
      const buildingType = mesh.userData?.type || 'default';
      const renderer = this.rendererFactory.getRenderer(buildingType);
      
      // Dispose of the mesh
      renderer.dispose(mesh);
      
      // Remove from our tracking map
      this.buildingMeshes.delete(buildingId);
    }
  }
  
  /**
   * Refresh all buildings
   */
  public async refreshBuildings(): Promise<void> {
    if (!this.isInitialized) {
      console.warn('BuildingRendererManager not initialized');
      return;
    }
    
    try {
      // Fetch buildings from API
      const response = await fetch('/api/buildings');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch buildings: ${response.status}`);
      }
      
      const data = await response.json();
      const buildings = data.buildings || [];
      
      console.log(`BuildingRendererManager: Refreshing ${buildings.length} buildings`);
      
      // Track which buildings we've processed
      const processedBuildingIds = new Set<string>();
      
      // Process each building
      for (const building of buildings) {
        if (!building.id) continue;
        
        processedBuildingIds.add(building.id);
        await this.renderBuilding(building);
      }
      
      // Remove any meshes for buildings that no longer exist
      for (const [id, mesh] of this.buildingMeshes.entries()) {
        if (!processedBuildingIds.has(id)) {
          this.removeBuilding(id);
        }
      }
    } catch (error) {
      console.error('Error refreshing buildings:', error);
    }
  }
  
  /**
   * Clean up resources
   */
  public cleanup(): void {
    if (!this.isInitialized) return;
    
    // Remove all building meshes
    for (const [id, mesh] of this.buildingMeshes.entries()) {
      if (this.rendererFactory) {
        const buildingType = mesh.userData?.type || 'default';
        const renderer = this.rendererFactory.getRenderer(buildingType);
        renderer.dispose(mesh);
      }
    }
    
    this.buildingMeshes.clear();
    this.isInitialized = false;
  }
}

// Export singleton instance
export const buildingRendererManager = BuildingRendererManager.getInstance();
