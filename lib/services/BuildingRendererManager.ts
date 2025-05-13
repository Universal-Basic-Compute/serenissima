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
  private eventSubscriptions: { unsubscribe: () => void }[] = [];
  
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
    // If already initialized with this scene, just return
    if (this.isInitialized && this.scene === scene) return;
    
    // If initialized with a different scene, clean up first
    if (this.isInitialized && this.scene !== scene) {
      this.cleanup();
    }
    
    this.scene = scene;
    this.rendererFactory = new BuildingRendererFactory({
      scene,
      positionManager: buildingPositionManager,
      cacheService: buildingCacheService
    });
    
    // Subscribe to building events
    this.subscribeToEvents();
    
    this.isInitialized = true;
    console.log('BuildingRendererManager initialized with scene');
  }
  
  /**
   * Subscribe to building-related events
   */
  private subscribeToEvents(): void {
    // Clear any existing subscriptions
    this.unsubscribeFromEvents();
    
    // Handle building placed events
    const buildingPlacedSubscription = eventBus.subscribe(EventTypes.BUILDING_PLACED, (data: any) => {
      if (data.refresh) {
        this.refreshBuildings();
      } else if (data.data) {
        this.renderBuilding(data.data);
      }
    });
    
    // Handle building removed events
    const buildingRemovedSubscription = eventBus.subscribe(EventTypes.BUILDING_REMOVED, (data: any) => {
      if (data.buildingId) {
        this.removeBuilding(data.buildingId);
      }
    });
    
    // Handle building updated events
    const buildingUpdatedSubscription = eventBus.subscribe(EventTypes.BUILDING_UPDATED, (data: any) => {
      if (data.building) {
        this.updateBuilding(data.building);
      }
    });
    
    // Store subscriptions for cleanup
    this.eventSubscriptions.push(
      buildingPlacedSubscription,
      buildingRemovedSubscription,
      buildingUpdatedSubscription
    );
    
    // Listen for custom events to ensure buildings are visible
    const handleEnsureBuildingsVisible = () => {
      console.log('BuildingRendererManager: Ensuring buildings are visible');
      this.refreshBuildings();
    };
    
    window.addEventListener('ensureBuildingsVisible', handleEnsureBuildingsVisible);
    
    // Store DOM event listener for cleanup
    this.eventSubscriptions.push({
      unsubscribe: () => {
        window.removeEventListener('ensureBuildingsVisible', handleEnsureBuildingsVisible);
      }
    });
  }
  
  /**
   * Unsubscribe from all events
   */
  private unsubscribeFromEvents(): void {
    this.eventSubscriptions.forEach(subscription => {
      subscription.unsubscribe();
    });
    this.eventSubscriptions = [];
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
      
      console.log(`Removed building ${buildingId}`);
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
      console.log('BuildingRendererManager: Refreshing buildings');
      
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
      
      console.log('BuildingRendererManager: Buildings refresh complete');
    } catch (error) {
      console.error('Error refreshing buildings:', error);
    }
  }
  
  /**
   * Get all building meshes
   */
  public getBuildingMeshes(): Map<string, THREE.Object3D> {
    return this.buildingMeshes;
  }
  
  /**
   * Check if a building exists
   */
  public hasBuildingMesh(buildingId: string): boolean {
    return this.buildingMeshes.has(buildingId);
  }
  
  /**
   * Get a building mesh by ID
   */
  public getBuildingMesh(buildingId: string): THREE.Object3D | undefined {
    return this.buildingMeshes.get(buildingId);
  }
  
  /**
   * Clean up resources
   */
  public cleanup(): void {
    if (!this.isInitialized) return;
    
    console.log('BuildingRendererManager: Cleaning up resources');
    
    // Unsubscribe from events
    this.unsubscribeFromEvents();
    
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
    this.scene = null;
    this.rendererFactory = null;
    
    console.log('BuildingRendererManager: Cleanup complete');
  }
}

// Export singleton instance
export const buildingRendererManager = BuildingRendererManager.getInstance();
