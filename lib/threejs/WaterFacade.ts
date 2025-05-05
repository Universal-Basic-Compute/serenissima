import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { RenderingErrorType, RenderingErrorHandler } from '../errorHandling';

/**
 * Interface for WaterFacade constructor options
 * Following the facade pattern to provide a clean interface
 */
export interface WaterFacadeProps {
  scene: THREE.Scene;
  size: number;
  quality?: 'high' | 'medium' | 'low';
  position?: { x?: number; y?: number; z?: number };
  color?: string | number;
  distortionScale?: number;
  flowDirection?: { x?: number; y?: number };
  flowSpeed?: number;
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
  private position: { x: number; y: number; z: number };
  private color: number;
  private distortionScale: number;
  private flowDirection: { x: number; y: number };
  private flowSpeed: number;
  private isDisposed: boolean = false;
  private errorHandler = RenderingErrorHandler.getInstance();
  private fallbackMode: boolean = false;

  /**
   * Create a new WaterFacade
   * @param options Configuration options
   */
  constructor(options: WaterFacadeProps) {
    this.scene = options.scene;
    this.size = options.size * 0.8; // Reduce the water size multiplier
    this.clock = new THREE.Clock();
    this.quality = options.quality || 'medium';
    this.position = {
      x: options.position?.x || 0,
      y: options.position?.y || -10, // Position water below land by default
      z: options.position?.z || 0
    };
    this.color = typeof options.color === 'string' 
      ? new THREE.Color(options.color).getHex() 
      : (options.color || 0x0047ab); // Deep royal blue default
    this.distortionScale = options.distortionScale || this.getDefaultDistortionScale();
    this.flowDirection = {
      x: options.flowDirection?.x || 0,
      y: options.flowDirection?.y || 0
    };
    this.flowSpeed = options.flowSpeed || 0.3;
    
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
      this.createFallbackWater();
    }
  }

  /**
   * Create the water mesh
   * @returns Water mesh
   * @private
   */
  private createWater(): Water {
    try {
      // Water geometry
      const waterGeometry = new THREE.PlaneGeometry(this.size, this.size);

      // Water texture
      const textureLoader = new THREE.TextureLoader();
      const waterNormals = textureLoader.load('/textures/waternormals.jpg', (texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        // Set repeat for wave detail
        texture.repeat.set(4, 4);
      }, undefined, (error) => {
        console.error('Failed to load water texture:', error);
        throw error; // Will be caught by the outer try/catch
      });

      // Water material
      const water = new Water(
        waterGeometry,
        {
          textureWidth: this.getTextureSize(),
          textureHeight: this.getTextureSize(),
          waterNormals: waterNormals,
          sunDirection: new THREE.Vector3(0, 1, 0),
          sunColor: 0xffffff,
          waterColor: this.color,
          distortionScale: this.distortionScale,
          fog: false
        }
      );

      // Position water
      water.rotation.x = -Math.PI / 2;
      water.position.set(this.position.x, this.position.y, this.position.z);
      
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
    this.fallbackMode = true;
    
    try {
      // Create a simple plane geometry
      const waterGeometry = new THREE.PlaneGeometry(this.size, this.size);
      
      // Create a simple blue material
      const waterMaterial = new THREE.MeshBasicMaterial({
        color: this.color,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
      });
      
      // Create a mesh with the geometry and material
      const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
      
      // Position the water plane
      waterMesh.rotation.x = -Math.PI / 2;
      waterMesh.position.set(this.position.x, this.position.y, this.position.z);
      waterMesh.renderOrder = 0;
      
      // Create a minimal Water instance with the mesh
      const water = new Water(
        waterGeometry,
        {
          textureWidth: 256,
          textureHeight: 256,
          waterColor: this.color,
          distortionScale: 0,
          fog: false
        }
      );
      
      water.rotation.x = -Math.PI / 2;
      water.position.set(this.position.x, this.position.y, this.position.z);
      water.renderOrder = 0;
      
      return water;
    } catch (error) {
      console.error('Failed to create even fallback water:', error);
      
      // Create an absolute minimal fallback - just a blue plane
      const waterGeometry = new THREE.PlaneGeometry(this.size, this.size);
      const waterMaterial = new THREE.MeshBasicMaterial({
        color: this.color,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
      });
      
      const simpleMesh = new THREE.Mesh(waterGeometry, waterMaterial);
      simpleMesh.rotation.x = -Math.PI / 2;
      simpleMesh.position.set(this.position.x, this.position.y, this.position.z);
      
      // We need to return a Water object, so we'll create a minimal one
      const minimalWater = new Water(
        waterGeometry,
        {
          textureWidth: 64,
          textureHeight: 64,
          waterColor: this.color,
          distortionScale: 0,
          fog: false
        }
      );
      
      minimalWater.rotation.x = -Math.PI / 2;
      minimalWater.position.set(this.position.x, this.position.y, this.position.z);
      
      return minimalWater;
    }
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
   * Get default distortion scale based on quality setting
   * @returns Distortion scale
   * @private
   */
  private getDefaultDistortionScale(): number {
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
   * @param deltaTime Optional delta time in seconds (if not provided, uses internal clock)
   */
  public update(deltaTime?: number): void {
    if (this.isDisposed || !this.water) return;
    
    try {
      if (this.water.material instanceof THREE.ShaderMaterial) {
        // Use provided deltaTime or get it from the clock
        const delta = deltaTime !== undefined ? deltaTime : this.clock.getDelta();
        
        // Update water animation
        this.water.material.uniforms['time'].value += delta * this.flowSpeed;
        
        // Update flow direction if needed
        if (this.flowDirection.x !== 0 || this.flowDirection.y !== 0) {
          // Some water implementations might have a flowDirection uniform
          if (this.water.material.uniforms['flowDirection']) {
            this.water.material.uniforms['flowDirection'].value.set(
              this.flowDirection.x, 
              this.flowDirection.y
            );
          }
        }
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
    if (this.isDisposed || this.quality === quality || this.fallbackMode) return;
    
    this.quality = quality;
    
    try {
      // Update water properties based on quality
      if (this.water && this.water.material instanceof THREE.ShaderMaterial) {
        // Update distortion scale
        this.water.material.uniforms['distortionScale'].value = this.getDefaultDistortionScale();
      }
    } catch (error) {
      console.warn('Error updating water quality:', error);
    }
  }

  /**
   * Set water color
   * @param color New color (hex string or number)
   */
  public setColor(color: string | number): void {
    if (this.isDisposed) return;
    
    try {
      // Convert string color to hex if needed
      this.color = typeof color === 'string' ? new THREE.Color(color).getHex() : color;
      
      if (this.water && this.water.material instanceof THREE.ShaderMaterial) {
        // Update water color
        this.water.material.uniforms['waterColor'].value = new THREE.Color(this.color);
      } else if (this.water && this.water.material instanceof THREE.MeshBasicMaterial) {
        // Update fallback material color
        this.water.material.color.set(this.color);
      }
    } catch (error) {
      console.warn('Error updating water color:', error);
    }
  }

  /**
   * Set water position
   * @param position New position
   */
  public setPosition(position: { x?: number; y?: number; z?: number }): void {
    if (this.isDisposed || !this.water) return;
    
    try {
      // Update position values
      if (position.x !== undefined) this.position.x = position.x;
      if (position.y !== undefined) this.position.y = position.y;
      if (position.z !== undefined) this.position.z = position.z;
      
      // Update water position
      this.water.position.set(this.position.x, this.position.y, this.position.z);
    } catch (error) {
      console.warn('Error updating water position:', error);
    }
  }

  /**
   * Set water size
   * @param size New size
   */
  public setSize(size: number): void {
    if (this.isDisposed || !this.water || this.size === size) return;
    
    try {
      // Store new size
      this.size = size * 0.8; // Apply the same multiplier as in constructor
      
      // Remove old water
      this.scene.remove(this.water);
      
      // Create new water with updated size
      this.water = this.createWater();
      this.scene.add(this.water);
    } catch (error) {
      console.warn('Error updating water size:', error);
    }
  }

  /**
   * Set water flow direction and speed
   * @param direction Flow direction vector
   * @param speed Flow speed
   */
  public setFlow(direction: { x?: number; y?: number }, speed?: number): void {
    if (this.isDisposed || this.fallbackMode) return;
    
    try {
      // Update flow direction
      if (direction.x !== undefined) this.flowDirection.x = direction.x;
      if (direction.y !== undefined) this.flowDirection.y = direction.y;
      
      // Update flow speed if provided
      if (speed !== undefined) this.flowSpeed = speed;
    } catch (error) {
      console.warn('Error updating water flow:', error);
    }
  }

  /**
   * Set water distortion scale
   * @param scale New distortion scale
   */
  public setDistortion(scale: number): void {
    if (this.isDisposed || this.fallbackMode) return;
    
    try {
      this.distortionScale = scale;
      
      if (this.water && this.water.material instanceof THREE.ShaderMaterial) {
        // Update distortion scale
        this.water.material.uniforms['distortionScale'].value = scale;
      }
    } catch (error) {
      console.warn('Error updating water distortion:', error);
    }
  }

  /**
   * Set water visibility
   * @param visible Visibility state
   */
  public setVisibility(visible: boolean): void {
    if (this.isDisposed || !this.water) return;
    
    try {
      this.water.visible = visible;
    } catch (error) {
      console.warn('Error updating water visibility:', error);
    }
  }

  /**
   * Get current water state
   * @returns Object with current water properties
   */
  public getState(): {
    size: number;
    quality: 'high' | 'medium' | 'low';
    position: { x: number; y: number; z: number };
    color: number;
    distortionScale: number;
    flowDirection: { x: number; y: number };
    flowSpeed: number;
    fallbackMode: boolean;
  } {
    return {
      size: this.size,
      quality: this.quality,
      position: { ...this.position },
      color: this.color,
      distortionScale: this.distortionScale,
      flowDirection: { ...this.flowDirection },
      flowSpeed: this.flowSpeed,
      fallbackMode: this.fallbackMode
    };
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
    
    // Clear references
    this.water = null;
  }
}
