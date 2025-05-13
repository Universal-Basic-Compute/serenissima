import * as THREE from 'three';
import { eventBus, EventTypes } from '../eventBus';

// Import other dependencies
import { buildingRendererManager } from './BuildingRendererManager';

// Extend the EventTypes interface to include SCENE_BASE_RENDERED
declare module '../eventBus' {
  interface EventTypes {
    SCENE_BASE_RENDERED: string;
  }
}

// Define the SCENE_BASE_RENDERED event type
// This needs to be defined before it's used
EventTypes.SCENE_BASE_RENDERED = 'SCENE_BASE_RENDERED';

/**
 * SceneLayerManager
 * 
 * Manages the different layers of the 3D scene, ensuring that base layers
 * (water, land, and buildings) are only rendered once and persist across view changes.
 */
export class SceneLayerManager {
  private static instance: SceneLayerManager;
  private scene: THREE.Scene | null = null;
  private baseLayerInitialized: boolean = false;
  private buildingsInitialized: boolean = false;
  private viewLayers: Map<string, any> = new Map();
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): SceneLayerManager {
    if (!SceneLayerManager.instance) {
      SceneLayerManager.instance = new SceneLayerManager();
    }
    return SceneLayerManager.instance;
  }
  
  /**
   * Initialize the manager with a scene
   */
  public initialize(scene: THREE.Scene): void {
    // Validate scene before proceeding
    if (!scene || !scene.isScene) {
      console.error('SceneLayerManager: Invalid scene provided');
      return;
    }
    
    this.scene = scene;
    
    // Listen for base layer initialization
    const subscription = eventBus.subscribe(
      EventTypes.SCENE_BASE_RENDERED,
      (data) => {
        console.log('SceneLayerManager: Base layer event received', data);
        
        if (data.waterInitialized && data.landInitialized) {
          this.baseLayerInitialized = true;
          console.log('SceneLayerManager: Base layer (water and land) initialized');
        }
        
        if (data.buildingsInitialized) {
          this.buildingsInitialized = true;
          console.log('SceneLayerManager: Buildings layer initialized');
        }
      }
    );
    
    // Store subscription for cleanup
    this.viewLayers.set('baseLayerSubscription', subscription);
    
    console.log('SceneLayerManager: Initialized with scene');
  }
  
  /**
   * Check if the base layer is initialized
   */
  public isBaseLayerInitialized(): boolean {
    return this.baseLayerInitialized;
  }
  
  /**
   * Check if buildings are initialized
   */
  public areBuildingsInitialized(): boolean {
    return this.buildingsInitialized;
  }
  
  /**
   * Register a view-specific layer
   */
  public registerViewLayer(viewName: string, layer: any): void {
    this.viewLayers.set(viewName, layer);
  }
  
  /**
   * Get a view-specific layer
   */
  public getViewLayer(viewName: string): any {
    return this.viewLayers.get(viewName);
  }
  
  /**
   * Switch to a different view
   */
  public switchToView(viewName: string, options: { preserveLayers?: string[] } = {}): void {
    console.log(`SceneLayerManager: Switching to ${viewName} view`);
    
    // Get the layers that should be preserved
    const preserveLayers = options.preserveLayers || [];
    
    // Validate scene is still available
    if (!this.scene) {
      console.error('SceneLayerManager: Cannot switch view - scene is undefined');
      return;
    }
    
    // Instead of hiding all view layers, only hide non-persistent layers
    this.viewLayers.forEach((layer, name) => {
      // Skip base layers (land, water), preserved layers, and the current view
      if (name !== 'baseLayerSubscription' && 
          name !== viewName && 
          name !== 'land' && 
          name !== 'water' && 
          name !== 'buildings' && 
          !preserveLayers.includes(name) && 
          layer.setVisible) {
        layer.setVisible(false);
      }
    });
    
    // Show the requested view layer
    const viewLayer = this.viewLayers.get(viewName);
    if (viewLayer && viewLayer.setVisible) {
      viewLayer.setVisible(true);
    }
    
    // Ensure preserved layers remain visible
    preserveLayers.forEach(layerName => {
      const layer = this.viewLayers.get(layerName);
      if (layer && layer.setVisible) {
        layer.setVisible(true);
      }
    });
    
    // Buildings are always visible, but we may need to update their visibility
    // based on the view mode (e.g., in buildings view they should be highlighted)
    if (this.buildingsInitialized) {
      // Update building visibility based on view mode
      // In buildings view, we might want to highlight them or make them interactive
      const isBuildingsView = viewName === 'buildings';
      try {
        buildingRendererManager.setHighlightMode(isBuildingsView);
        
        // Ensure buildings are visible after view change
        setTimeout(() => {
          try {
            const buildingCount = buildingRendererManager.getBuildingMeshes().size;
            if (buildingCount === 0) {
              console.warn('SceneLayerManager: No buildings found after view change, refreshing...');
              buildingRendererManager.refreshBuildings();
            } else {
              console.log(`SceneLayerManager: Found ${buildingCount} buildings after view change`);
              
              // Force a scene update to ensure buildings are visible
              if (this.scene && this.scene.userData && this.scene.userData.renderer && this.scene.userData.camera) {
                this.scene.userData.renderer.render(this.scene, this.scene.userData.camera);
              }
            }
          } catch (error) {
            console.warn('Error checking building meshes:', error);
          }
        }, 500);
      } catch (error) {
        console.warn('Error updating building highlight mode:', error);
      }
    }
    
    // Emit view change event
    eventBus.emit(EventTypes.VIEW_MODE_CHANGED, { 
      viewMode: viewName, 
      preservedLayers: preserveLayers 
    });
  }
  
  /**
   * Ensure a specific layer is visible
   */
  public ensureLayerVisible(layerName: string): void {
    const layer = this.viewLayers.get(layerName);
    if (layer && layer.setVisible) {
      layer.setVisible(true);
      console.log(`SceneLayerManager: Ensured layer ${layerName} is visible`);
    } else {
      console.warn(`SceneLayerManager: Cannot make layer ${layerName} visible - not found or missing setVisible method`);
    }
  }
  
  /**
   * Clean up resources
   */
  public cleanup(): void {
    // Unsubscribe from events
    const baseLayerSubscription = this.viewLayers.get('baseLayerSubscription');
    if (baseLayerSubscription && baseLayerSubscription.unsubscribe) {
      baseLayerSubscription.unsubscribe();
    }
    
    // Clear view layers
    this.viewLayers.clear();
    this.baseLayerInitialized = false;
    this.buildingsInitialized = false;
    this.scene = null;
  }
}

// Export singleton instance
export const sceneLayerManager = SceneLayerManager.getInstance();
