import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { RenderingErrorType, RenderingErrorHandler } from '../errorHandling';

/**
 * Enum for water quality levels with more granular options
 */
export enum WaterQualityLevel {
  ULTRA = 'ultra',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  MINIMAL = 'minimal'
}

/**
 * Interface for WaterFacade constructor options
 * Following the facade pattern to provide a clean interface
 */
export interface WaterFacadeProps {
  scene: THREE.Scene;
  size: number;
  quality?: WaterQualityLevel | 'high' | 'medium' | 'low';
  position?: { x?: number; y?: number; z?: number };
  color?: string | number;
  distortionScale?: number;
  flowDirection?: { x?: number; y?: number };
  flowSpeed?: number;
  skipAnimationWhenOffscreen?: boolean;
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
  private quality: WaterQualityLevel;
  private updateInterval: number = 0; // ms between updates, 0 = every frame
  private lastUpdateTime: number = 0;
  private skipAnimationWhenOffscreen: boolean = true;
  private isOnScreen: boolean = true;
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
    // Convert string quality to enum if needed
    if (typeof options.quality === 'string') {
      switch (options.quality) {
        case 'ultra': this.quality = WaterQualityLevel.ULTRA; break;
        case 'high': this.quality = WaterQualityLevel.HIGH; break;
        case 'medium': this.quality = WaterQualityLevel.MEDIUM; break;
        case 'low': this.quality = WaterQualityLevel.LOW; break;
        case 'minimal': this.quality = WaterQualityLevel.MINIMAL; break;
        default: this.quality = WaterQualityLevel.MEDIUM;
      }
    } else {
      this.quality = options.quality || WaterQualityLevel.MEDIUM;
    }
    
    this.skipAnimationWhenOffscreen = options.skipAnimationWhenOffscreen !== false;
    
    // Set update interval based on quality
    this.updateQualitySettings();
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
      // Water geometry with detail level based on quality
      const segments = this.getGeometryDetail();
      const waterGeometry = new THREE.PlaneGeometry(this.size, this.size, segments, segments);

      // Water texture with optimizations based on quality
      const textureLoader = new THREE.TextureLoader();
      const waterNormals = textureLoader.load('/textures/waternormals.jpg', (texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        
        // Set repeat for wave detail - higher quality = more detailed waves
        const repeatFactor = this.getTextureRepeatFactor();
        texture.repeat.set(repeatFactor, repeatFactor);
        
        // Apply anisotropic filtering for higher quality levels
        if (this.quality === WaterQualityLevel.ULTRA || this.quality === WaterQualityLevel.HIGH) {
          const renderer = this.scene.renderer as THREE.WebGLRenderer;
          if (renderer && renderer.capabilities.getMaxAnisotropy) {
            const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
            texture.anisotropy = maxAnisotropy;
          }
        }
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
      water.position.set(this.position.x, 0, this.position.z); // Change y position to 0
      
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
      waterMesh.position.set(this.position.x, 0, this.position.z); // Change y position to 0
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
      minimalWater.position.set(this.position.x, 0, this.position.z); // Change y position to 0
      
      return minimalWater;
    }
  }

  /**
   * Get texture size based on quality setting
   * @returns Texture size
   * @private
   */
  /**
   * Update quality settings based on quality level
   * @private
   */
  private updateQualitySettings(): void {
    switch (this.quality) {
      case WaterQualityLevel.ULTRA:
        this.updateInterval = 0; // Update every frame
        break;
      case WaterQualityLevel.HIGH:
        this.updateInterval = 16; // ~60fps
        break;
      case WaterQualityLevel.MEDIUM:
        this.updateInterval = 33; // ~30fps
        break;
      case WaterQualityLevel.LOW:
        this.updateInterval = 66; // ~15fps
        break;
      case WaterQualityLevel.MINIMAL:
        this.updateInterval = 100; // ~10fps
        break;
      default:
        this.updateInterval = 33; // Default to medium
    }
  }

  /**
   * Get texture size based on quality setting
   * @returns Texture size
   * @private
   */
  private getTextureSize(): number {
    switch (this.quality) {
      case WaterQualityLevel.ULTRA: return 2048;
      case WaterQualityLevel.HIGH: return 1024;
      case WaterQualityLevel.MEDIUM: return 512;
      case WaterQualityLevel.LOW: return 256;
      case WaterQualityLevel.MINIMAL: return 128;
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
      case WaterQualityLevel.ULTRA: return 4.0;
      case WaterQualityLevel.HIGH: return 3.5;
      case WaterQualityLevel.MEDIUM: return 3.0;
      case WaterQualityLevel.LOW: return 2.0;
      case WaterQualityLevel.MINIMAL: return 1.0;
      default: return 3.0;
    }
  }
  
  /**
   * Get geometry detail level based on quality setting
   * @returns Number of segments for water geometry
   * @private
   */
  private getGeometryDetail(): number {
    switch (this.quality) {
      case WaterQualityLevel.ULTRA: return 256;
      case WaterQualityLevel.HIGH: return 128;
      case WaterQualityLevel.MEDIUM: return 64;
      case WaterQualityLevel.LOW: return 32;
      case WaterQualityLevel.MINIMAL: return 16;
      default: return 64;
    }
  }

  /**
   * Get texture repeat factor based on quality
   * @returns Repeat factor for texture
   * @private
   */
  private getTextureRepeatFactor(): number {
    switch (this.quality) {
      case WaterQualityLevel.ULTRA: return 6;
      case WaterQualityLevel.HIGH: return 4;
      case WaterQualityLevel.MEDIUM: return 3;
      case WaterQualityLevel.LOW: return 2;
      case WaterQualityLevel.MINIMAL: return 1;
      default: return 3;
    }
  }

  /**
   * Check if water is visible on screen
   * @returns True if water is visible
   * @private
   */
  private checkVisibility(): boolean {
    if (!this.water || !this.skipAnimationWhenOffscreen) return true;
    
    try {
      // Simple frustum check
      const camera = this.scene.userData.camera as THREE.Camera;
      if (camera) {
        const frustum = new THREE.Frustum();
        const matrix = new THREE.Matrix4().multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse
        );
        frustum.setFromProjectionMatrix(matrix);
        
        // Create a bounding box for the water
        const bbox = new THREE.Box3().setFromObject(this.water);
        return frustum.intersectsBox(bbox);
      }
    } catch (error) {
      // Silently fail and assume it's visible
      console.debug('Error checking water visibility:', error);
    }
    
    return true;
  }

  /**
   * Update water animation
   * Should be called in animation loop
   * @param deltaTime Optional delta time in seconds (if not provided, uses internal clock)
   */
  public update(deltaTime?: number): void {
    if (this.isDisposed || !this.water) return;
    
    // Check if we should skip this update based on interval
    const currentTime = performance.now();
    if (this.updateInterval > 0 && (currentTime - this.lastUpdateTime) < this.updateInterval) {
      return;
    }
    
    // Check if water is on screen
    if (this.skipAnimationWhenOffscreen) {
      this.isOnScreen = this.checkVisibility();
      if (!this.isOnScreen) return;
    }
    
    this.lastUpdateTime = currentTime;
    
    try {
      if (this.water.material instanceof THREE.ShaderMaterial) {
        // Use provided deltaTime or get it from the clock
        const delta = deltaTime !== undefined ? deltaTime : this.clock.getDelta();
        
        // Scale animation speed based on quality
        const speedFactor = this.getAnimationSpeedFactor();
        
        // Update water animation
        this.water.material.uniforms['time'].value += delta * this.flowSpeed * speedFactor;
        
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
   * Get animation speed factor based on quality
   * @returns Speed factor for animation
   * @private
   */
  private getAnimationSpeedFactor(): number {
    switch (this.quality) {
      case WaterQualityLevel.ULTRA: return 1.0;
      case WaterQualityLevel.HIGH: return 1.0;
      case WaterQualityLevel.MEDIUM: return 0.8;
      case WaterQualityLevel.LOW: return 0.6;
      case WaterQualityLevel.MINIMAL: return 0.4;
      default: return 0.8;
    }
  }

  /**
   * Set water quality
   * @param quality Quality level
   * @param recreate Whether to recreate the water mesh (more expensive but better quality change)
   */
  public setQuality(quality: WaterQualityLevel | 'high' | 'medium' | 'low', recreate: boolean = false): void {
    if (this.isDisposed || this.fallbackMode) return;
    
    // Convert string quality to enum if needed
    let qualityLevel: WaterQualityLevel;
    if (typeof quality === 'string') {
      switch (quality) {
        case 'ultra': qualityLevel = WaterQualityLevel.ULTRA; break;
        case 'high': qualityLevel = WaterQualityLevel.HIGH; break;
        case 'medium': qualityLevel = WaterQualityLevel.MEDIUM; break;
        case 'low': qualityLevel = WaterQualityLevel.LOW; break;
        case 'minimal': qualityLevel = WaterQualityLevel.MINIMAL; break;
        default: qualityLevel = WaterQualityLevel.MEDIUM;
      }
    } else {
      qualityLevel = quality;
    }
    
    // Skip if quality hasn't changed
    if (this.quality === qualityLevel) return;
    
    this.quality = qualityLevel;
    this.updateQualitySettings();
    
    try {
      if (recreate && this.water) {
        // Full recreation for major quality changes
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
        
        this.water = null;
        this.createWater();
      } else if (this.water && this.water.material instanceof THREE.ShaderMaterial) {
        // Simple update for minor quality changes
        const uniforms = this.water.material.uniforms;
        
        // Update distortion scale
        if (uniforms.distortionScale) {
          uniforms.distortionScale.value = this.getDefaultDistortionScale();
        }
        
        // Update texture repeat if possible
        if (uniforms.normalSampler && uniforms.normalSampler.value) {
          const repeatFactor = this.getTextureRepeatFactor();
          uniforms.normalSampler.value.repeat.set(repeatFactor, repeatFactor);
        }
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
   * Set whether to skip animation when water is offscreen
   * @param skip Whether to skip animation when offscreen
   */
  public setSkipAnimationWhenOffscreen(skip: boolean): void {
    this.skipAnimationWhenOffscreen = skip;
  }
  
  /**
   * Get current water state
   * @returns Object with current water properties
   */
  public getState(): {
    size: number;
    quality: WaterQualityLevel;
    position: { x: number; y: number; z: number };
    color: number;
    distortionScale: number;
    flowDirection: { x: number; y: number };
    flowSpeed: number;
    fallbackMode: boolean;
    updateInterval: number;
    skipAnimationWhenOffscreen: boolean;
    isOnScreen: boolean;
  } {
    return {
      size: this.size,
      quality: this.quality,
      position: { ...this.position },
      color: this.color,
      distortionScale: this.distortionScale,
      flowDirection: { ...this.flowDirection },
      flowSpeed: this.flowSpeed,
      fallbackMode: this.fallbackMode,
      updateInterval: this.updateInterval,
      skipAnimationWhenOffscreen: this.skipAnimationWhenOffscreen,
      isOnScreen: this.isOnScreen
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
        // Dispose of textures in the material
        if (this.water.material instanceof THREE.ShaderMaterial) {
          const uniforms = this.water.material.uniforms;
          if (uniforms) {
            // Dispose of all textures in uniforms
            Object.keys(uniforms).forEach(key => {
              const uniform = uniforms[key];
              if (uniform && uniform.value instanceof THREE.Texture) {
                uniform.value.dispose();
              }
            });
          }
        } else if (this.water.material instanceof THREE.MeshBasicMaterial) {
          // For fallback mode with basic material
          if (this.water.material.map) {
            this.water.material.map.dispose();
          }
        }
        
        // Dispose of the material itself
        if (Array.isArray(this.water.material)) {
          this.water.material.forEach(material => material.dispose());
        } else {
          this.water.material.dispose();
        }
      }
      
      // Dispose of any additional resources specific to Water
      if (this.water.userData && this.water.userData.waterUniforms) {
        const waterUniforms = this.water.userData.waterUniforms;
        Object.keys(waterUniforms).forEach(key => {
          const uniform = waterUniforms[key];
          if (uniform && uniform.value instanceof THREE.Texture) {
            uniform.value.dispose();
          }
        });
      }
    }
    
    // Clear references to help garbage collection
    this.water = null;
    this.clock = null;
  }
}
