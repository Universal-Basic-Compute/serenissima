import * as THREE from 'three';
import { BuildingRendererFactory } from './BuildingRendererFactory';
import buildingPositionManager from './BuildingPositionManager';
import buildingCacheService from './BuildingCacheService';
import { eventBus } from '../eventBus';
import { EventTypes } from '../eventTypes';
import { BuildingData } from '../models/BuildingTypes';
import { log } from '../logUtils';

/**
 * BuildingRendererManager
 * 
 * Centralized manager for building rendering that coordinates between
 * the BuildingRendererFactory and the scene. This follows the facade pattern
 * to provide a simpler interface for building rendering.
 * 
 * @class BuildingRendererManager
 * @singleton
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
   * 
   * @param scene The Three.js scene to render buildings in
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
    log.info('BuildingRendererManager initialized with scene');
    
    // Initialize performance monitoring
    this.initializePerformanceMonitoring();
  }
  
  /**
   * Initialize performance monitoring for building rendering
   * Tracks metrics like render time and memory usage
   */
  private initializePerformanceMonitoring(): void {
    // Set up performance monitoring
    this.lastRenderTime = performance.now();
    this.renderCount = 0;
    this.totalRenderTime = 0;
    
    // Log performance stats periodically
    if (typeof window !== 'undefined') {
      this.performanceInterval = window.setInterval(() => {
        if (this.renderCount > 0) {
          const averageRenderTime = this.totalRenderTime / this.renderCount;
          log.debug(`Building rendering performance: ${averageRenderTime.toFixed(2)}ms average (${this.renderCount} renders)`);
          
          // Reset counters
          this.renderCount = 0;
          this.totalRenderTime = 0;
        }
      }, 10000); // Log every 10 seconds
    }
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
  
  // Performance monitoring properties
  private lastRenderTime: number = 0;
  private renderCount: number = 0;
  private totalRenderTime: number = 0;
  private performanceInterval: number | null = null;
  
  /**
   * Render a single building
   * 
   * @param building Building data to render
   * @returns Promise resolving to the rendered mesh or null if rendering failed
   */
  public async renderBuilding(building: BuildingData): Promise<THREE.Object3D | null> {
    if (!this.isInitialized || !this.rendererFactory) {
      log.warn('BuildingRendererManager not initialized');
      return null;
    }
    
    try {
      const startTime = performance.now();
      
      // Get the appropriate renderer for this building type
      const renderer = this.rendererFactory.getRenderer(building.type);
      
      // Check if we already have a mesh for this building
      if (this.buildingMeshes.has(building.id)) {
        // Update existing mesh
        const existingMesh = this.buildingMeshes.get(building.id)!;
        renderer.update(building, existingMesh);
        
        // Track performance
        const endTime = performance.now();
        this.totalRenderTime += (endTime - startTime);
        this.renderCount++;
        
        return existingMesh;
      } else {
        // Create new mesh
        const mesh = await renderer.render(building);
        
        // Store reference to the mesh
        this.buildingMeshes.set(building.id, mesh);
        
        // Track performance
        const endTime = performance.now();
        this.totalRenderTime += (endTime - startTime);
        this.renderCount++;
        
        return mesh;
      }
    } catch (error) {
      log.error(`Error rendering building ${building.id}:`, error);
      
      // Try to create a fallback representation
      try {
        return this.createFallbackBuilding(building);
      } catch (fallbackError) {
        log.error(`Failed to create fallback for building ${building.id}:`, fallbackError);
        return null;
      }
    }
  }
  
  /**
   * Create a fallback representation for a building when normal rendering fails
   * 
   * @param building Building data
   * @returns A simple mesh representing the building
   */
  private createFallbackBuilding(building: BuildingData): THREE.Object3D {
    if (!this.scene) {
      throw new Error('Scene not initialized');
    }
    
    // Create a simple box as fallback
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff0000, // Red color to indicate error
      wireframe: true
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    
    // Position the mesh
    if (building.position) {
      if ('lat' in building.position && 'lng' in building.position) {
        // Convert lat/lng to scene position
        const scenePos = buildingPositionManager.latLngToScenePosition(building.position);
        mesh.position.copy(scenePos);
      } else {
        mesh.position.set(
          building.position.x,
          building.position.y || 0,
          building.position.z
        );
      }
    }
    
    // Set rotation
    mesh.rotation.y = building.rotation || 0;
    
    // Add metadata
    mesh.userData = {
      buildingId: building.id,
      type: building.type,
      isFallback: true
    };
    
    // Add to scene
    this.scene.add(mesh);
    
    // Add a label to indicate this is a fallback
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    
    if (context) {
      context.fillStyle = 'rgba(0, 0, 0, 0.7)';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.font = 'bold 20px Arial';
      context.fillStyle = 'white';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(`Error: ${building.type}`, canvas.width / 2, canvas.height / 2);
      
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(0, 3, 0); // Position above the box
      sprite.scale.set(5, 1.25, 1);
      
      mesh.add(sprite);
    }
    
    return mesh;
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
    
    log.info('BuildingRendererManager: Cleaning up resources');
    
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
    
    // Clear performance monitoring interval
    if (this.performanceInterval !== null && typeof window !== 'undefined') {
      window.clearInterval(this.performanceInterval);
      this.performanceInterval = null;
    }
    
    log.info('BuildingRendererManager: Cleanup complete');
  }
}

// Export singleton instance
export const buildingRendererManager = BuildingRendererManager.getInstance();
