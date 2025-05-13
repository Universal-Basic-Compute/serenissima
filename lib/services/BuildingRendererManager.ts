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
    
    // Ensure scene is set before anything else
    this.scene = scene;
    
    // Log to confirm scene is set
    console.log('BuildingRendererManager: Scene initialized', this.scene);
    
    this.rendererFactory = new BuildingRendererFactory({
      scene,
      positionManager: buildingPositionManager,
      cacheService: buildingCacheService,
      debug: true // Enable debug logging temporarily to diagnose model loading issues
    });

    // Debug model paths using the factory method
    this.rendererFactory.debugModelPaths();
  
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
    if (!this.isInitialized || !this.rendererFactory || !this.scene) {
      log.warn('BuildingRendererManager not initialized or scene is undefined');
      return null;
    }
    
    try {
      const startTime = performance.now();
      
      // Generate a unique ID for this building if not provided
      if (!building.id) {
        building.id = `building_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      }
      
      console.log(`Rendering building ${building.id} of type ${building.type} at position:`, 
        building.position instanceof THREE.Vector3 ? 
        `(${building.position.x}, ${building.position.y}, ${building.position.z})` : 
        JSON.stringify(building.position));
      
      // Get the appropriate renderer for this building type
      const renderer = this.rendererFactory.getRenderer(building.type);
      
      // Check if we already have a mesh for this building
      if (this.buildingMeshes.has(building.id)) {
        // Update existing mesh
        const existingMesh = this.buildingMeshes.get(building.id)!;
        
        // Check if the mesh is already in the scene
        let isInScene = false;
        this.scene?.traverse((object) => {
          if (object === existingMesh) {
            isInScene = true;
          }
        });
        
        // If the mesh is not in the scene, add it back
        if (!isInScene && this.scene) {
          this.scene.add(existingMesh);
          console.log(`Re-added existing building ${building.id} to scene`);
        } else {
          console.log(`Building ${building.id} already exists in scene, updating`);
        }
        
        renderer.update(building, existingMesh);
        
        // Track performance
        const endTime = performance.now();
        this.totalRenderTime += (endTime - startTime);
        this.renderCount++;
        
        return existingMesh;
      } else {
        // Create new mesh with a timeout to prevent hanging
        const meshPromise = renderer.render(building);
        
        // Add a timeout to prevent hanging on slow model loads
        const timeoutPromise = new Promise<null>((_, reject) => {
          setTimeout(() => reject(new Error('Building render timeout')), 15000);
        });
        
        // Race the promises
        const mesh = await Promise.race([meshPromise, timeoutPromise]);
        
        if (mesh) {
          // Before adding to scene, check again that scene exists
          if (!this.scene) {
            log.error(`Scene became undefined while rendering building ${building.id}`);
            return null;
          }
          
          // Store reference to the mesh
          this.buildingMeshes.set(building.id, mesh);
          
          // Track performance
          const endTime = performance.now();
          this.totalRenderTime += (endTime - startTime);
          this.renderCount++;
          
          return mesh;
        }
        return null;
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
   * Check if a building with the given ID already exists in the scene
   */
  public buildingExists(buildingId: string): boolean {
    return this.buildingMeshes.has(buildingId);
  }

  /**
   * Refresh all buildings
   */
  public async refreshBuildings(): Promise<void> {
    if (!this.isInitialized) {
      console.warn('BuildingRendererManager not initialized');
      return;
    }
    
    console.log('%c BuildingRendererManager: Refreshing buildings', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    
    try {
      // Fetch buildings from API with a timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch('/api/buildings', {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.warn(`Failed to fetch buildings: ${response.status} - continuing with existing buildings`);
        // Don't throw here, just continue with existing buildings
        return;
      }
      
      const data = await response.json();
      const buildings = data.buildings || [];
      
      console.log(`BuildingRendererManager: Fetched ${buildings.length} buildings from API`);
      
      // Track which buildings we've processed
      const processedBuildingIds = new Set<string>();
      
      // Sort buildings by distance to camera for priority loading
      const sortedBuildings = this.sortBuildingsByDistance(buildings);
      
      // Process each building with a higher limit on concurrent loads
      const concurrentLimit = 50; // Increased from 5 to 50
      const chunks = this.chunkArray(sortedBuildings, concurrentLimit);
      
      for (const chunk of chunks) {
        // Process each chunk in parallel
        await Promise.all(chunk.map(async (building) => {
          if (!building.id) return;
          
          // Skip if we've already processed this building in this refresh cycle
          if (processedBuildingIds.has(building.id)) return;
          
          processedBuildingIds.add(building.id);
          
          try {
            await this.renderBuilding(building);
          } catch (error) {
            log.warn(`Error rendering building ${building.id}:`, error);
          }
        }));
      }
      
      // Remove any meshes for buildings that no longer exist
      for (const [id, mesh] of this.buildingMeshes.entries()) {
        if (!processedBuildingIds.has(id)) {
          this.removeBuilding(id);
        }
      }
      
      console.log(`BuildingRendererManager: Refresh complete, now have ${this.buildingMeshes.size} buildings in scene`);
      
      // Force a scene update if possible to ensure buildings are visible
      if (this.scene && this.scene.userData && this.scene.userData.renderer && this.scene.userData.camera) {
        this.scene.userData.renderer.render(this.scene, this.scene.userData.camera);
      }
    } catch (error) {
      // Handle AbortError separately
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('Building refresh request timed out - continuing with existing buildings');
      } else {
        console.warn('Error refreshing buildings:', error);
      }
      
      // If the fetch failed, try to use any existing buildings data
      if (this.buildingMeshes.size === 0) {
        // Try to load some default buildings as fallback
        try {
          const fallbackBuildings = this.getFallbackBuildings();
          for (const building of fallbackBuildings) {
            await this.renderBuilding(building);
          }
        } catch (fallbackError) {
          console.warn('Error loading fallback buildings:', fallbackError);
        }
      }
    }
  }
  
  /**
   * Sort buildings by distance to camera
   */
  private sortBuildingsByDistance(buildings: BuildingData[]): BuildingData[] {
    if (!this.scene) return buildings;
    
    // Find camera
    let camera: THREE.Camera | null = null;
    this.scene.traverse((object) => {
      if (object instanceof THREE.Camera) {
        camera = object;
      }
    });
    
    if (!camera) return buildings;
    
    // Calculate distances
    const buildingsWithDistance = buildings.map(building => {
      let position: THREE.Vector3;
      
      if ('lat' in building.position && 'lng' in building.position) {
        position = buildingPositionManager.latLngToScenePosition(building.position);
      } else {
        position = new THREE.Vector3(
          building.position.x,
          building.position.y || 0,
          building.position.z
        );
      }
      
      const distance = camera!.position.distanceTo(position);
      
      return {
        building,
        distance
      };
    });
    
    // Sort by distance (closest first)
    buildingsWithDistance.sort((a, b) => a.distance - b.distance);
    
    // Return sorted buildings
    return buildingsWithDistance.map(item => item.building);
  }
  
  /**
   * Split array into chunks for batch processing
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
  
  /**
   * Get fallback buildings when API fails
   */
  private getFallbackBuildings(): BuildingData[] {
    return [
      {
        id: 'fallback_building_1',
        type: 'market-stall',
        land_id: 'fallback_land_1',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        variant: 'model',
        created_by: 'system',
        created_at: new Date().toISOString()
      },
      {
        id: 'fallback_building_2',
        type: 'house',
        land_id: 'fallback_land_2',
        position: { x: 5, y: 0, z: 5 },
        rotation: 0,
        variant: 'model',
        created_by: 'system',
        created_at: new Date().toISOString()
      }
    ];
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
   * Set highlight mode for buildings
   * 
   * @param highlight Whether to highlight buildings (used in buildings view)
   */
  public setHighlightMode(highlight: boolean): void {
    if (!this.isInitialized) return;
    
    console.log(`BuildingRendererManager: Setting highlight mode to ${highlight}`);
    
    // Check if we have any buildings
    if (this.buildingMeshes.size === 0) {
      console.warn('BuildingRendererManager: No buildings to highlight, refreshing...');
      this.refreshBuildings();
      return;
    }
    
    // Update all building meshes
    for (const [id, mesh] of this.buildingMeshes.entries()) {
      // Make sure the mesh is visible
      if (!mesh.visible) {
        console.log(`BuildingRendererManager: Building ${id} was invisible, making it visible`);
        mesh.visible = true;
      }
      
      // In highlight mode, we might want to:
      // 1. Make buildings more visible (e.g., brighter materials)
      // 2. Add outline effect
      // 3. Make them interactive
      
      // For now, just adjust the material properties
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          // Ensure the mesh is visible
          if (!child.visible) {
            child.visible = true;
          }
          
          if (child.material instanceof THREE.MeshStandardMaterial) {
            if (highlight) {
              // Store original values if not already stored
              if (!child.userData.originalEmissive) {
                child.userData.originalEmissive = child.material.emissive.clone();
                child.userData.originalEmissiveIntensity = child.material.emissiveIntensity;
              }
              
              // Make buildings slightly emissive in highlight mode
              child.material.emissive.set(0x333333);
              child.material.emissiveIntensity = 0.3;
            } else if (child.userData.originalEmissive) {
              // Restore original values
              child.material.emissive.copy(child.userData.originalEmissive);
              child.material.emissiveIntensity = child.userData.originalEmissiveIntensity;
            }
            
            child.material.needsUpdate = true;
          }
        }
      });
    }
    
    // Force a scene update if possible
    if (this.scene && this.scene.userData && this.scene.userData.renderer && this.scene.userData.camera) {
      this.scene.userData.renderer.render(this.scene, this.scene.userData.camera);
    }
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    if (!this.isInitialized) return;
    
    log.info('BuildingRendererManager: Cleaning up resources');
    
    // Unsubscribe from events
    this.unsubscribeFromEvents();
    
    // Don't remove building meshes, just mark as not initialized
    // This allows buildings to persist between view changes
    
    // Clear the scene reference first
    this.scene = null;
    this.isInitialized = false;
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
