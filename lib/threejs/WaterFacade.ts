import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { RenderingErrorType, RenderingErrorHandler } from '../errorHandling';

/**
 * Interface for WaterFacade constructor options
 */
interface WaterFacadeProps {
  scene: THREE.Scene;
  size: number;
  quality?: 'high' | 'medium' | 'low';
}

/**
 * WaterFacade provides a simplified interface to Three.js water rendering
 * Following the facade pattern to hide Three.js complexity
 */
export class WaterFacade {
  private scene: THREE.Scene;
  private water: Water | null = null;
  private size: number;
  private clock: THREE.Clock;
  private quality: 'high' | 'medium' | 'low';
  private isDisposed: boolean = false;
  private errorHandler = RenderingErrorHandler.getInstance();

  /**
   * Create a new WaterFacade
   * @param options Configuration options
   */
  constructor({ scene, size, quality = 'medium' }: WaterFacadeProps) {
    this.scene = scene;
    this.size = size * 0.8; // Reduce the water size multiplier from 1.5 to 0.8
    this.clock = new THREE.Clock();
    this.quality = quality;
    
    try {
      // Create water
      this.water = this.createWater();
      this.scene.add(this.water);
      
      console.log('Water created with size:', this.size);
    } catch (error) {
      this.errorHandler.handleError({
        type: RenderingErrorType.MESH_CREATION,
        message: 'Failed to create water',
        originalError: error as Error,
        recoverable: true
      });
    }
  }

  /**
   * Create the water mesh
   * @returns Water mesh
   * @private
   */
  private createWater(): Water {
    try {
      // Water geometry - make it smaller
      const waterGeometry = new THREE.PlaneGeometry(this.size, this.size);

      // Water texture
      const textureLoader = new THREE.TextureLoader();
      const waterNormals = textureLoader.load('/textures/waternormals.jpg', (texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        // Increase repeat for more detailed waves in the smaller area
        texture.repeat.set(4, 4); // Reduced from 8 to 4 for the smaller area
      });

      // Water material - adjust colors for more blue appearance
      const water = new Water(
        waterGeometry,
        {
          textureWidth: this.getTextureSize(),
          textureHeight: this.getTextureSize(),
          waterNormals: waterNormals,
          sunDirection: new THREE.Vector3(0, 1, 0),
          sunColor: 0xffffff,
          waterColor: 0x0047ab, // Deep royal blue
          distortionScale: this.getDistortionScale(),
          fog: false
        }
      );

      // Position water - CRITICAL CHANGE: Position water MUCH lower than land
      water.rotation.x = -Math.PI / 2;
      water.position.y = -10; // Position water 10 units below origin (land is at 0.5)
      
      // Set render order to ensure water renders before land
      water.renderOrder = 0;
      
      return water;
    } catch (error) {
      this.errorHandler.handleError({
        type: RenderingErrorType.MESH_CREATION,
        message: 'Failed to create water mesh',
        originalError: error as Error,
        recoverable: false
      });
      
      // Create a fallback water plane as a last resort
      return this.createFallbackWater();
    }
  }

  /**
   * Create a simple fallback water plane when normal water creation fails
   * @returns Simple water mesh
   * @private
   */
  private createFallbackWater(): Water {
    console.warn('Creating fallback water plane');
    
    // Create a simple plane geometry
    const waterGeometry = new THREE.PlaneGeometry(this.size, this.size);
    
    // Create a simple blue material
    const waterMaterial = new THREE.MeshBasicMaterial({
      color: 0x0047ab,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    
    // Create a mesh with the geometry and material
    const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    
    // Position the water plane
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = -10;
    waterMesh.renderOrder = 0;
    
    // Create a minimal Water instance with the mesh
    const water = new Water(
      waterGeometry,
      {
        textureWidth: 256,
        textureHeight: 256,
        waterColor: 0x0047ab,
        distortionScale: 0,
        fog: false
      }
    );
    
    water.rotation.x = -Math.PI / 2;
    water.position.y = -10;
    water.renderOrder = 0;
    
    return water;
  }

  /**
   * Get texture size based on quality setting
   * @returns Texture size
   * @private
   */
  private getTextureSize(): number {
    switch (this.quality) {
      case 'high': return 1024;
      case 'medium': return 512;
      case 'low': return 256;
      default: return 512;
    }
  }

  /**
   * Get distortion scale based on quality setting
   * @returns Distortion scale
   * @private
   */
  private getDistortionScale(): number {
    switch (this.quality) {
      case 'high': return 3.5;
      case 'medium': return 3.0;
      case 'low': return 2.0;
      default: return 3.0;
    }
  }

  /**
   * Update water animation
   * Should be called in animation loop
   */
  public update(): void {
    if (this.isDisposed || !this.water) return;
    
    try {
      if (this.water.material instanceof THREE.ShaderMaterial) {
        // Update water animation - slow down for smaller area
        this.water.material.uniforms['time'].value += this.clock.getDelta() * 0.3;
      }
    } catch (error) {
      // Silent fail for animation updates
      console.warn('Error updating water animation:', error);
    }
  }

  /**
   * Set water quality
   * @param quality Quality level
   */
  public setQuality(quality: 'high' | 'medium' | 'low'): void {
    if (this.isDisposed || !this.water || this.quality === quality) return;
    
    this.quality = quality;
    
    try {
      // Update water properties based on quality
      if (this.water.material instanceof THREE.ShaderMaterial) {
        // Update distortion scale
        this.water.material.uniforms['distortionScale'].value = this.getDistortionScale();
      }
    } catch (error) {
      console.warn('Error updating water quality:', error);
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    
    if (this.water) {
      this.scene.remove(this.water);
      
      if (this.water.geometry) {
        this.water.geometry.dispose();
      }
      
      if (this.water.material) {
        if (Array.isArray(this.water.material)) {
          this.water.material.forEach(material => material.dispose());
        } else {
          this.water.material.dispose();
        }
      }
    }
  }
}
