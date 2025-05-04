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
    
    try {
      // Create a CloudFacade instance to handle all the functionality
      this.cloudFacade = new CloudFacade(scene, {
        width,
        height,
        performanceMode,
        visible: false // Start invisible by default
      });
    } catch (error) {
      console.error('Error initializing CloudFacade in deprecated CloudSystem:', error);
      // Create a fallback facade with error handling
      this.cloudFacade = new CloudFacade(scene || new THREE.Scene(), {
        width: width || 300,
        height: height || 300,
        performanceMode: true, // Use performance mode for fallback
        visible: false
      });
    }
  }

  /**
   * Update cloud animation
   * @param time Current animation time
   */
  public update(time: number): void {
    try {
      this.cloudFacade.update(time);
    } catch (error) {
      console.warn('Error updating deprecated CloudSystem:', error);
      // Silent fail to prevent application crashes
    }
  }

  /**
   * Set cloud visibility
   * @param visible Whether clouds should be visible
   */
  public setVisibility(visible: boolean): void {
    try {
      this.cloudFacade.setVisible(visible);
    } catch (error) {
      console.warn('Error setting visibility in deprecated CloudSystem:', error);
      // Silent fail to prevent application crashes
    }
  }

  /**
   * Update cloud quality settings
   * @param performanceMode Whether to use lower quality for better performance
   */
  public updateQuality(performanceMode: boolean): void {
    try {
      this.cloudFacade.setPerformanceMode(performanceMode);
    } catch (error) {
      console.warn('Error updating quality in deprecated CloudSystem:', error);
      // Silent fail to prevent application crashes
    }
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    try {
      this.cloudFacade.dispose();
    } catch (error) {
      console.warn('Error disposing deprecated CloudSystem:', error);
      // Silent fail to prevent application crashes
    }
  }
}
