// This file is deprecated and will be removed in a future update
// Please use lib/threejs/WaterFacade.ts directly

import * as THREE from 'three';
import { WaterFacade, WaterQualityLevel } from '../../lib/threejs/WaterFacade';

// Re-export the WaterFacade and WaterQualityLevel for backward compatibility
export { WaterFacade, WaterQualityLevel };

/**
 * @deprecated Use WaterFacade directly instead
 */
export class SimpleWater {
  private waterFacade: WaterFacade | null = null;

  /**
   * @deprecated Use WaterFacade directly instead
   */
  constructor(scene: THREE.Scene, size: number, quality: WaterQualityLevel = WaterQualityLevel.LOW) {
    console.warn('SimpleWater class is deprecated. Please use WaterFacade directly.');
    
    // Create water with simplified settings
    this.waterFacade = new WaterFacade({
      scene: scene,
      size: size,
      quality: quality,
      position: { y: -0.5 },
      color: 0x001020, // Deep, dark blue color
      distortionScale: 2.0, // Lower distortion for better performance
      flowDirection: { x: 0.03, y: 0.03 },
      flowSpeed: 0.2,
      skipAnimationWhenOffscreen: true,
      opacity: 0.9,
      brightness: 0.25
    });
  }

  /**
   * @deprecated Use WaterFacade.update() directly
   */
  public update(deltaTime: number): void {
    if (this.waterFacade) {
      this.waterFacade.update(deltaTime);
    }
  }

  /**
   * @deprecated Use WaterFacade.setQuality() directly
   */
  public setQuality(quality: WaterQualityLevel): void {
    if (this.waterFacade) {
      this.waterFacade.setQuality(quality);
    }
  }

  /**
   * @deprecated Use WaterFacade.dispose() directly
   */
  public dispose(): void {
    if (this.waterFacade) {
      this.waterFacade.dispose();
      this.waterFacade = null;
    }
  }
}
