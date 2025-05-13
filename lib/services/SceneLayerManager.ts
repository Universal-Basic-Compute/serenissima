import * as THREE from 'three';
import { eventBus, EventTypes } from '../eventBus';

/**
 * SceneLayerManager
 * 
 * Manages the different layers of the 3D scene, ensuring that base layers
 * (water and land) are only rendered once and persist across view changes.
 */
export class SceneLayerManager {
  private static instance: SceneLayerManager;
  private scene: THREE.Scene | null = null;
  private baseLayerInitialized: boolean = false;
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
    this.scene = scene;
    
    // Listen for base layer initialization
    const subscription = eventBus.subscribe(
      EventTypes.SCENE_BASE_RENDERED,
      (data) => {
        console.log('SceneLayerManager: Base layer initialized', data);
        this.baseLayerInitialized = true;
      }
    );
    
    // Store subscription for cleanup
    this.viewLayers.set('baseLayerSubscription', subscription);
  }
  
  /**
   * Check if the base layer is initialized
   */
  public isBaseLayerInitialized(): boolean {
    return this.baseLayerInitialized;
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
  public switchToView(viewName: string): void {
    // Hide all view layers
    this.viewLayers.forEach((layer, name) => {
      if (name !== 'baseLayerSubscription' && name !== viewName && layer.setVisible) {
        layer.setVisible(false);
      }
    });
    
    // Show the requested view layer
    const viewLayer = this.viewLayers.get(viewName);
    if (viewLayer && viewLayer.setVisible) {
      viewLayer.setVisible(true);
    }
    
    // Emit view change event
    eventBus.emit(EventTypes.VIEW_MODE_CHANGED, { viewMode: viewName });
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
    this.scene = null;
  }
}

// Export singleton instance
export const sceneLayerManager = SceneLayerManager.getInstance();
