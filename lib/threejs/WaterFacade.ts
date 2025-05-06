import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { RenderingErrorType, RenderingErrorHandler } from '../errorHandling';
import { RaycastingUtils } from '../utils/RaycastingUtils';

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
  opacity?: number; // Add opacity parameter
  brightness?: number; // Add brightness parameter to control water reflections
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
  private landObjects: THREE.Object3D[] = [];
  private boundaryPoints: THREE.Vector3[] = [];
  private shorelineEffect: boolean = true;
  private shorelineIntensity: number = 5.0; // Increased to maximum for more dramatic shoreline effects
  private shorelineDistance: number = 18.0; // Increased distance for wider shoreline effect
  private opacity: number; // Add opacity property
  private brightness: number; // Add brightness property to control reflections

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
      : (options.color || 0x001020); // Deep, dark blue color
    this.distortionScale = options.distortionScale || this.getDefaultDistortionScale();
    this.flowDirection = {
      x: options.flowDirection?.x || 0,
      y: options.flowDirection?.y || 0
    };
    this.flowSpeed = options.flowSpeed || 0.3;
    this.opacity = options.opacity !== undefined ? options.opacity : 0.8; // Higher default opacity
    this.brightness = options.brightness !== undefined ? options.brightness : 0.3; // Lower default brightness for darker water
    
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
          // Get renderer from scene's userData or other appropriate source
          const renderer = this.scene.userData.renderer as THREE.WebGLRenderer;
          if (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy) {
            const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
            texture.anisotropy = maxAnisotropy;
          }
        }
      }, undefined, (error) => {
        console.error('Failed to load water texture:', error);
        throw error; // Will be caught by the outer try/catch
      });

      console.log('Creating water with color:', '#' + this.color.toString(16).padStart(6, '0'));
      
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
          fog: false,
          alpha: this.opacity // Add opacity parameter
        }
      );
      
      // Modify the water material to reduce brightness and reflections
      if (water.material instanceof THREE.ShaderMaterial) {
        // Add custom uniform for brightness control
        water.material.uniforms.brightness = { value: this.brightness };
        
        // Modify the fragment shader to apply brightness
        let fragmentShader = water.material.fragmentShader;
        
        // Add uniform declaration
        fragmentShader = fragmentShader.replace(
          'uniform float time;',
          'uniform float time;\nuniform float brightness;'
        );
        
        // Modify the final color calculation to reduce brightness
        fragmentShader = fragmentShader.replace(
          'gl_FragColor = vec4( color, alpha );',
          'gl_FragColor = vec4( color * brightness, alpha );'
        );
        
        // Apply the modified shader
        water.material.fragmentShader = fragmentShader;
        water.material.needsUpdate = true;
      }

      // Position water
      water.rotation.x = -Math.PI / 2;
      water.position.set(this.position.x, 0, this.position.z); // Ensure water is at exactly y=0
      
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
        opacity: this.opacity, // Use the opacity property
        side: THREE.DoubleSide
      });
      
      // Apply brightness to the material
      const colorObj = new THREE.Color(this.color);
      colorObj.multiplyScalar(this.brightness);
      waterMaterial.color = colorObj;
      
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
        opacity: this.opacity, // Use the opacity property
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
        // Periodically check and force update the water color (every ~5 seconds)
        if (Math.random() < 0.01) { // ~1% chance per frame
          if (this.water.material.uniforms.waterColor) {
            const currentColor = this.water.material.uniforms.waterColor.value;
            const targetColor = new THREE.Color(this.color);
            
            // Only log if color is different
            if (currentColor.r !== targetColor.r || 
                currentColor.g !== targetColor.g || 
                currentColor.b !== targetColor.b) {
              console.log('Correcting water color from:', 
                         '#' + Math.floor(currentColor.r * 255).toString(16).padStart(2, '0') +
                         Math.floor(currentColor.g * 255).toString(16).padStart(2, '0') +
                         Math.floor(currentColor.b * 255).toString(16).padStart(2, '0'),
                         'to:', '#' + this.color.toString(16).padStart(6, '0'));
              
              this.water.material.uniforms.waterColor.value = targetColor;
            }
          }
        }
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
        
        // Update shoreline effect if needed
        if (this.shorelineEffect && this.boundaryPoints.length > 0 && 
            this.water.material.userData.hasShorelineEffect) {
          // Periodically update boundary points to account for any moving land objects
          if (Math.random() < 0.01) { // ~1% chance per frame to update
            this.extractBoundaryPoints();
            this.water.material.uniforms.shorelinePoints.value = this.boundaryPoints;
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
   * Set water opacity
   * @param opacity New opacity value (0-1)
   */
  public setOpacity(opacity: number): void {
    if (this.isDisposed) return;
    
    try {
      this.opacity = Math.max(0, Math.min(1, opacity));
      
      if (this.water && this.water.material instanceof THREE.ShaderMaterial) {
        // Update alpha value in the shader
        if (this.water.material.uniforms['alpha']) {
          this.water.material.uniforms['alpha'].value = this.opacity;
        }
      } else if (this.water && this.water.material instanceof THREE.MeshBasicMaterial) {
        // Update fallback material opacity
        this.water.material.opacity = this.opacity;
      }
    } catch (error) {
      console.warn('Error updating water opacity:', error);
    }
  }
  
  /**
   * Set water brightness
   * @param brightness New brightness value (0-1)
   */
  public setBrightness(brightness: number): void {
    if (this.isDisposed) return;
    
    try {
      this.brightness = Math.max(0, Math.min(1, brightness));
      
      if (this.water && this.water.material instanceof THREE.ShaderMaterial) {
        // Update brightness value in the shader
        if (this.water.material.uniforms.brightness) {
          this.water.material.uniforms.brightness.value = this.brightness;
        }
      } else if (this.water && this.water.material instanceof THREE.MeshBasicMaterial) {
        // Update fallback material brightness
        const colorObj = new THREE.Color(this.color);
        colorObj.multiplyScalar(this.brightness);
        this.water.material.color = colorObj;
      }
    } catch (error) {
      console.warn('Error updating water brightness:', error);
    }
  }
  
  /**
   * Register land objects for shoreline effects
   * @param objects Array of land objects to consider for shoreline effects
   */
  public registerLandObjects(objects: THREE.Object3D[]): void {
    if (this.isDisposed) return;
    
    this.landObjects = objects;
    
    // Extract boundary points from land objects
    this.extractBoundaryPoints();
    
    // Update water shader with new boundary information
    this.updateShorelineEffect();
    
    // Force an update to apply changes immediately
    if (this.water && this.water.material instanceof THREE.ShaderMaterial) {
      this.water.material.needsUpdate = true;
    }
    
    console.log(`Registered ${objects.length} land objects for shoreline effect`);
  }

  /**
   * Extract boundary points from land objects
   * @private
   */
  private extractBoundaryPoints(): void {
    this.boundaryPoints = [];
    
    // Process each land object
    this.landObjects.forEach(object => {
      if (object instanceof THREE.Mesh && object.geometry) {
        try {
          // Get the vertices from the geometry
          const positions = object.geometry.getAttribute('position');
          
          if (positions) {
            // Sample more points along the boundary
            const boundaryIndices = this.findBoundaryIndices(object.geometry);
            
            // Convert local vertices to world space and add to boundary points
            for (let i = 0; i < boundaryIndices.length; i++) {
              const index = boundaryIndices[i];
              const vertex = new THREE.Vector3(
                positions.getX(index),
                positions.getY(index),
                positions.getZ(index)
              );
              
              // Transform to world space
              vertex.applyMatrix4(object.matrixWorld);
              
              // Increase tolerance to capture more boundary points
              // We want points at or very near water level
              if (Math.abs(vertex.y) < 0.5) {
                // Force y to exactly 0 to ensure intersection with water
                vertex.y = 0;
                this.boundaryPoints.push(vertex);
              }
            }
          }
        } catch (error) {
          console.warn('Error extracting boundary points:', error);
        }
      }
    });
    
    // Add additional interpolated points between existing points to increase density
    if (this.boundaryPoints.length > 1) {
      const interpolatedPoints: THREE.Vector3[] = [];
      
      for (let i = 0; i < this.boundaryPoints.length - 1; i++) {
        const p1 = this.boundaryPoints[i];
        const p2 = this.boundaryPoints[i + 1];
        
        // Add five interpolated points between consecutive points for higher density
        for (let t = 0.1; t < 1.0; t += 0.2) {
          interpolatedPoints.push(new THREE.Vector3(
            p1.x + (p2.x - p1.x) * t,
            0, // Force y to exactly 0
            p1.z + (p2.z - p1.z) * t
          ));
        }
      }
      
      // Add interpolated points to boundary points
      this.boundaryPoints = this.boundaryPoints.concat(interpolatedPoints);
    }
    
    console.log(`Extracted ${this.boundaryPoints.length} boundary points for shoreline effect`);
  }

  /**
   * Find boundary indices of a geometry (simplified version)
   * @private
   */
  private findBoundaryIndices(geometry: THREE.BufferGeometry): number[] {
    // Enhanced boundary detection to find actual edge vertices
    const indices: number[] = [];
    const positions = geometry.getAttribute('position');
    
    // If we have an index buffer, use it to find edges
    if (geometry.index) {
      const indexArray = geometry.index.array;
      const edgeMap = new Map<string, number>();
      
      // First pass: count occurrences of each edge
      for (let i = 0; i < indexArray.length; i += 3) {
        const a = indexArray[i];
        const b = indexArray[i + 1];
        const c = indexArray[i + 2];
        
        // Add all three edges of the triangle
        const addEdge = (v1: number, v2: number) => {
          const edgeKey = v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`;
          edgeMap.set(edgeKey, (edgeMap.get(edgeKey) || 0) + 1);
        };
        
        addEdge(a, b);
        addEdge(b, c);
        addEdge(c, a);
      }
      
      // Second pass: find edges that appear only once (boundary edges)
      const boundaryEdges = new Set<number>();
      
      for (const [edgeKey, count] of edgeMap.entries()) {
        if (count === 1) {
          // This is a boundary edge
          const [v1, v2] = edgeKey.split('-').map(Number);
          boundaryEdges.add(v1);
          boundaryEdges.add(v2);
        }
      }
      
      // Convert set to array
      indices.push(...Array.from(boundaryEdges));
    } else {
      // Fallback to sampling if no index buffer
      // For simplicity, we'll sample every Nth vertex with a higher sampling rate
      const samplingRate = Math.max(1, Math.floor(positions.count / 200));
      
      for (let i = 0; i < positions.count; i += samplingRate) {
        indices.push(i);
      }
    }
    
    // If we found very few indices, fall back to denser sampling
    if (indices.length < 20) {
      indices.length = 0;
      const samplingRate = Math.max(1, Math.floor(positions.count / 300));
      
      for (let i = 0; i < positions.count; i += samplingRate) {
        indices.push(i);
      }
    }
    
    return indices;
  }

  /**
   * Update water shader with shoreline effect
   * @private
   */
  private updateShorelineEffect(): void {
    if (this.isDisposed || !this.water || !this.shorelineEffect || this.boundaryPoints.length === 0) return;
    
    try {
      if (this.water.material instanceof THREE.ShaderMaterial) {
        const material = this.water.material;
        
        // Force update the water color in the shader uniforms
        if (material.uniforms.waterColor) {
          material.uniforms.waterColor.value = new THREE.Color(this.color);
          console.log('Explicitly setting water color in shader to:', 
                     '#' + this.color.toString(16).padStart(6, '0'));
        }
        
        // Check if we need to modify the shader
        if (!material.userData.hasShorelineEffect) {
          // Add custom uniforms for shoreline effect
          material.uniforms.shorelinePoints = { value: this.boundaryPoints };
          material.uniforms.shorelineIntensity = { value: this.shorelineIntensity };
          material.uniforms.shorelineDistance = { value: this.shorelineDistance };
          
          // Modify fragment shader to include shoreline effect
          const fragmentShader = material.fragmentShader;
          
          // Add uniform declarations
          let modifiedShader = fragmentShader.replace(
            'uniform float time;',
            'uniform float time;\nuniform float shorelineIntensity;\nuniform float shorelineDistance;\nuniform vec3 shorelinePoints[' + this.boundaryPoints.length + '];'
          );
          
          // Add shoreline calculation function
          modifiedShader = modifiedShader.replace(
            'void main() {',
            `
float calculateShorelineFactor(vec3 position) {
  float minDist = 1000.0;
  
  // Find distance to closest shoreline point
  for(int i = 0; i < ${this.boundaryPoints.length}; i++) {
    float dist = distance(position.xz, shorelinePoints[i].xz);
    minDist = min(minDist, dist);
  }
  
  // Calculate effect factor based on distance with a sharper falloff
  // Use a quadratic falloff for more natural appearance
  float factor = 1.0 - smoothstep(0.0, shorelineDistance, minDist * minDist / shorelineDistance);
  
  // Add some noise to the shoreline factor for more natural appearance
  float noise = sin(position.x * 0.5 + position.z * 0.7 + time * 0.3) * 0.15 + 0.15;
  
  // Enhance the factor with noise but ensure it still fades to zero at the distance
  return pow(factor, 0.8) * (1.0 + noise * factor);
}

void main() {`
          );
          
          // Modify wave calculation to include shoreline effect
          modifiedShader = modifiedShader.replace(
            'vec4 info = texture2D( mirrorSampler, coords );',
            `vec4 info = texture2D( mirrorSampler, coords );
            
// Apply enhanced shoreline effect
float shoreFactor = calculateShorelineFactor(vWorldPosition) * shorelineIntensity;
if (shoreFactor > 0.01) {
  // Increase wave height near shore - significantly enhanced
  info.r += shoreFactor * 0.8;
  
  // Add much more pronounced foam near shore
  info.g = mix(info.g, 1.0, shoreFactor * 0.98);
  
  // Add wave distortion near shore
  info.b = mix(info.b, 0.5, shoreFactor * 0.8);
  
  // Add stronger color variation near shore for visual emphasis
  reflectedColor = mix(reflectedColor, vec3(0.95, 0.98, 1.0), shoreFactor * 0.85);
  
  // Add additional foam patterns based on position and time - enhanced pattern
  float foamPattern = sin(vWorldPosition.x * 3.5 + time * 0.8) * sin(vWorldPosition.z * 3.5 + time * 1.0) * 0.5 + 0.5;
  info.g = mix(info.g, info.g * foamPattern, shoreFactor * 0.6);
}`
          );
          
          // Update the shader
          material.fragmentShader = modifiedShader;
          material.needsUpdate = true;
          
          // Mark as modified
          material.userData.hasShorelineEffect = true;
        } else {
          // Just update the uniform values
          material.uniforms.shorelinePoints.value = this.boundaryPoints;
          material.uniforms.shorelineIntensity.value = this.shorelineIntensity;
          material.uniforms.shorelineDistance.value = this.shorelineDistance;
        }
      }
    } catch (error) {
      console.error('Error updating shoreline effect:', error);
    }
  }

  /**
   * Set shoreline effect properties
   * @param enabled Whether shoreline effect is enabled
   * @param intensity Intensity of the shoreline effect (0-1)
   * @param distance Distance the effect extends from shore
   */
  public setShorelineEffect(enabled: boolean, intensity?: number, distance?: number): void {
    if (this.isDisposed) return;
    
    this.shorelineEffect = enabled;
    
    if (intensity !== undefined) {
      this.shorelineIntensity = Math.max(0, Math.min(5.0, intensity)); // Increased max intensity to 5.0 from 3.0
    }
    
    if (distance !== undefined) {
      this.shorelineDistance = Math.max(0.1, distance);
    }
    
    console.log(`Shoreline effect ${enabled ? 'enabled' : 'disabled'} with intensity: ${this.shorelineIntensity}, distance: ${this.shorelineDistance}`);
    
    // Update the effect if enabled
    if (enabled) {
      this.updateShorelineEffect();
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
    opacity: number; // Add opacity to state
    brightness: number; // Add brightness to state
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
      isOnScreen: this.isOnScreen,
      opacity: this.opacity, // Include opacity in returned state
      brightness: this.brightness // Include brightness in returned state
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
              if (uniform && uniform.value && typeof uniform.value === 'object') {
                uniform.value.dispose();
              }
            });
          }
        } else if (this.water.material instanceof THREE.MeshBasicMaterial) {
          // For fallback mode with basic material
          const material = this.water.material as THREE.MeshBasicMaterial;
          if (material.map) {
            material.map.dispose();
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
          if (uniform && uniform.value && typeof uniform.value === 'object') {
            uniform.value.dispose();
          }
        });
      }
    }
    
    // Clear references to help garbage collection
    this.water = null;
    this.clock = new THREE.Clock(); // Replace with empty clock instead of null
  }
}
