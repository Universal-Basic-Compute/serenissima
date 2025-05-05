import * as THREE from 'three';
import { WaterFacade, WaterQualityLevel } from '../../lib/threejs/WaterFacade';

/**
 * Creates and manages water for the 3D scene
 */
export class Water {
  private waterFacade: WaterFacade | null = null;
  private scene: THREE.Scene;
  private size: number;
  private quality: WaterQualityLevel;

  /**
   * Create a new Water instance
   * @param scene The THREE.Scene to add water to
   * @param size The size of the water plane
   * @param quality The quality level for water rendering
   */
  constructor(scene: THREE.Scene, size: number, quality: WaterQualityLevel = WaterQualityLevel.MEDIUM) {
    this.scene = scene;
    this.size = size;
    this.quality = quality;
    this.initialize();
  }

  /**
   * Initialize the water
   */
  private initialize(): void {
    try {
      // Create water with the updated deeper blue color (0x00142a)
      this.waterFacade = new WaterFacade({
        scene: this.scene,
        size: this.size,
        quality: this.quality,
        position: { y: -0.5 }, // Position slightly below land
        color: 0x00142a, // Deep rich blue color
        distortionScale: 4.5, // Further increased for more dramatic waves
        flowDirection: { x: 0.05, y: 0.05 },
        flowSpeed: 0.35, // Slightly increased flow speed
        skipAnimationWhenOffscreen: true,
        opacity: 0.98 // Almost fully opaque for maximum visibility
      });

      console.log('Water initialized successfully');
    } catch (error) {
      console.error('Failed to initialize water:', error);
    }
  }

  /**
   * Update water animation
   * @param deltaTime Delta time in seconds
   */
  public update(deltaTime: number): void {
    if (this.waterFacade) {
      this.waterFacade.update(deltaTime);
    }
  }

  /**
   * Set water quality
   * @param quality New quality level
   */
  public setQuality(quality: WaterQualityLevel): void {
    this.quality = quality;
    if (this.waterFacade) {
      this.waterFacade.setQuality(quality);
    }
  }

  /**
   * Register land objects for shoreline effects
   * @param objects Array of land objects
   */
  public registerLandObjects(objects: THREE.Object3D[]): void {
    if (this.waterFacade) {
      this.waterFacade.registerLandObjects(objects);
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.waterFacade) {
      this.waterFacade.dispose();
      this.waterFacade = null;
    }
  }
}
