/**
 * @deprecated This file is deprecated. Use lib/threejs/CloudFacade instead.
 * 
 * This file is kept for backward compatibility and will be removed in a future version.
 */
import * as THREE from 'three';
import { CloudFacade } from '../../lib/threejs/CloudFacade';

interface CloudSystemProps {
  scene: THREE.Scene;
  width: number;
  height: number;
  performanceMode: boolean;
}

/**
 * @deprecated Use CloudFacade from lib/threejs/CloudFacade instead
 */
export default class CloudSystem {
  private cloudFacade: CloudFacade;
  
  constructor({ scene, width, height, performanceMode }: CloudSystemProps) {
    console.warn('CloudSystem is deprecated. Use CloudFacade from lib/threejs/CloudFacade instead.');
    
    // Create a CloudFacade instance to handle all the functionality
    this.cloudFacade = new CloudFacade(scene, {
      width,
      height,
      performanceMode,
      visible: false // Start invisible by default
    });
  }

  /**
   * Update cloud animation
   * @param time Current animation time
   */
  public update(time: number): void {
    this.cloudFacade.update(time);
  }

  /**
   * Set cloud visibility
   * @param visible Whether clouds should be visible
   */
  public setVisibility(visible: boolean): void {
    this.cloudFacade.setVisible(visible);
  }

  /**
   * Update cloud quality settings
   * @param performanceMode Whether to use lower quality for better performance
   */
  public updateQuality(performanceMode: boolean): void {
    this.cloudFacade.setPerformanceMode(performanceMode);
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    this.cloudFacade.dispose();
  }
}
