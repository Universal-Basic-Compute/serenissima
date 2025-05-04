import * as THREE from 'three';

/**
 * CloudFacade - A facade for cloud rendering in Three.js
 * 
 * This class provides a simplified interface for cloud management,
 * hiding the complexity of Three.js implementation details.
 */
export class CloudFacade {
  private scene: THREE.Scene;
  private cloudSystem: CloudSystem | null = null;
  private isVisible: boolean = false;
  private performanceMode: boolean = false;
  private width: number;
  private height: number;

  /**
   * Create a new cloud facade
   * 
   * @param scene The Three.js scene
   * @param options Configuration options
   */
  constructor(scene: THREE.Scene, options: {
    width?: number;
    height?: number;
    visible?: boolean;
    performanceMode?: boolean;
  } = {}) {
    this.scene = scene;
    this.width = options.width || 300;
    this.height = options.height || 300;
    this.isVisible = options.visible || false;
    this.performanceMode = options.performanceMode || false;
    
    this.initialize();
  }

  /**
   * Initialize the cloud system
   * @private
   */
  private initialize(): void {
    try {
      // Create the internal cloud system
      this.cloudSystem = new CloudSystem({
        scene: this.scene,
        width: this.width,
        height: this.height,
        performanceMode: this.performanceMode
      });
      
      // Set initial visibility
      this.setVisible(this.isVisible);
    } catch (error) {
      console.error('Failed to initialize cloud system:', error);
      this.cloudSystem = null;
    }
  }

  /**
   * Set cloud visibility
   * 
   * @param visible Whether clouds should be visible
   */
  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    
    if (this.cloudSystem) {
      this.cloudSystem.setVisibility(visible);
    }
  }

  /**
   * Get current visibility state
   * 
   * @returns Whether clouds are currently visible
   */
  public isCurrentlyVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Set performance mode
   * 
   * @param enabled Whether to enable performance mode (lower quality)
   */
  public setPerformanceMode(enabled: boolean): void {
    this.performanceMode = enabled;
    
    if (this.cloudSystem) {
      this.cloudSystem.updateQuality(enabled);
    }
  }

  /**
   * Update cloud animation
   * 
   * @param time Current animation time
   */
  public update(time: number): void {
    if (this.cloudSystem) {
      this.cloudSystem.update(time);
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.cloudSystem) {
      this.cloudSystem.dispose();
      this.cloudSystem = null;
    }
  }
}

/**
 * Internal CloudSystem implementation
 * @private
 */
class CloudSystem {
  private scene: THREE.Scene;
  private clouds: THREE.Group;
  private cloudParticles: THREE.Mesh[] = [];
  private cloudTexture: THREE.Texture | null = null;
  private isVisible: boolean = false;
  private width: number;
  private height: number;
  private performanceMode: boolean;
  private cloudMaterial: THREE.MeshBasicMaterial | null = null;
  private lastUpdateTime: number = 0;
  private updateInterval: number = 16; // Update every ~16ms (60fps)
  private isDisposed: boolean = false;

  constructor(options: {
    scene: THREE.Scene;
    width?: number;
    height?: number;
    performanceMode?: boolean;
  }) {
    this.scene = options.scene;
    this.width = options.width || 300;
    this.height = options.height || 300;
    this.performanceMode = options.performanceMode || false;
    this.clouds = new THREE.Group();
    this.scene.add(this.clouds);
    
    // Adjust update interval based on performance mode
    this.updateInterval = this.performanceMode ? 32 : 16; // 30fps in performance mode
    
    // Load cloud texture with better error handling
    const textureLoader = new THREE.TextureLoader();
    console.log('Loading cloud texture from /textures/cloud.png');
    textureLoader.load(
      '/textures/cloud.png',
      (texture) => {
        console.log('Cloud texture loaded successfully');
        this.cloudTexture = texture;
        this.createClouds();
      },
      undefined,
      (error) => {
        console.error('Error loading cloud texture:', error);
        // Try a fallback texture
        console.log('Trying fallback texture...');
        textureLoader.load(
          'https://threejs.org/examples/textures/sprites/circle.png',
          (fallbackTexture) => {
            console.log('Fallback texture loaded');
            this.cloudTexture = fallbackTexture;
            this.createClouds();
          },
          undefined,
          (fallbackError) => {
            console.error('Error loading fallback texture:', fallbackError);
            // Create a simple canvas texture as last resort
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = 'white';
              ctx.beginPath();
              ctx.arc(64, 64, 60, 0, Math.PI * 2);
              ctx.fill();
              const canvasTexture = new THREE.CanvasTexture(canvas);
              this.cloudTexture = canvasTexture;
              this.createClouds();
            }
          }
        );
      }
    );
  }

  private createClouds(): void {
    if (this.isDisposed) return;
    
    // Skip if texture isn't loaded
    if (!this.cloudTexture) {
      console.log('Cannot create clouds: texture not loaded');
      return;
    }

    console.log('Creating cloud particles...');
    
    // Clean up existing clouds first
    this.cloudParticles.forEach(cloud => {
      this.clouds.remove(cloud);
      if (cloud.geometry) cloud.geometry.dispose();
    });
    this.cloudParticles = [];
    
    // Create fewer clouds in performance mode
    const cloudCount = this.performanceMode ? 10 : 20;
    
    // Create cloud material with proper transparency - reuse for all clouds
    this.cloudMaterial = new THREE.MeshBasicMaterial({
      map: this.cloudTexture,
      transparent: true,
      opacity: 0.7,
      depthWrite: false, // Important for proper transparency
      side: THREE.DoubleSide
    });
    
    // Create a shared geometry for better performance
    const baseGeometry = new THREE.PlaneGeometry(1, 1);
    
    // Create cloud planes at various positions
    for (let i = 0; i < cloudCount; i++) {
      try {
        // Create a simple plane for each cloud
        const size = Math.random() * 20 + 10;
        const cloud = new THREE.Mesh(baseGeometry, this.cloudMaterial);
        
        // Scale the cloud instead of creating new geometries
        cloud.scale.set(size, size, 1);
        
        // Position clouds randomly in a large area
        const spread = Math.max(this.width, this.height) * 0.8;
        cloud.position.set(
          (Math.random() - 0.5) * spread,
          Math.random() * 20 + 30, // Height between 30-50 units
          (Math.random() - 0.5) * spread
        );
        
        // Random rotation
        cloud.rotation.z = Math.random() * Math.PI * 2;
        
        // Add to cloud group
        this.clouds.add(cloud);
        this.cloudParticles.push(cloud);
      } catch (error) {
        console.error(`Error creating cloud ${i}:`, error);
      }
    }
    
    console.log(`Created ${this.cloudParticles.length} cloud particles`);
    
    // Make sure clouds are initially visible
    this.clouds.visible = this.isVisible;
  }

  public update(time: number): void {
    if (this.isDisposed) return;
    
    // Skip updates if clouds aren't visible
    if (!this.isVisible) return;
    
    // Throttle updates based on performance mode
    if (time - this.lastUpdateTime < this.updateInterval) return;
    this.lastUpdateTime = time;
    
    // Animate clouds slowly
    if (!this.cloudParticles || this.cloudParticles.length === 0) return;
    
    // Calculate movement factors once
    const timeScale = 0.0001;
    const movementScale = 0.005;
    
    this.cloudParticles.forEach((cloud, i) => {
      if (!cloud) return;
      
      try {
        // Gentle rotation - reduced frequency
        if (i % 2 === 0) {
          cloud.rotation.z += 0.00002;
        }
        
        // Gentle movement with unique patterns for each cloud
        cloud.position.x += Math.sin(time * timeScale + i * 0.1) * movementScale;
        cloud.position.z += Math.cos(time * timeScale + i * 0.05) * movementScale;
        
        // Subtle vertical movement for some clouds - only every third cloud
        if (i % 3 === 0) {
          cloud.position.y += Math.sin(time * 0.00005 + i) * 0.001;
        }
        
        // Wrap around if clouds drift too far - only check when needed
        const limit = Math.max(this.width, this.height);
        if (Math.abs(cloud.position.x) > limit) {
          cloud.position.x = -Math.sign(cloud.position.x) * limit;
        }
        if (Math.abs(cloud.position.z) > limit) {
          cloud.position.z = -Math.sign(cloud.position.z) * limit;
        }
      } catch (error) {
        console.error(`Error animating cloud ${i}:`, error);
      }
    });
  }

  public setVisibility(visible: boolean): void {
    if (this.isDisposed) return;
    if (this.isVisible === visible) return;
    
    this.isVisible = visible;
    this.clouds.visible = visible;
    
    // Add debug logging
    console.log(`Cloud visibility set to: ${visible}`);
    
    // Force update of all cloud particles
    this.cloudParticles.forEach(cloud => {
      if (cloud) {
        cloud.visible = visible;
      }
    });
  }

  public updateQuality(performanceMode: boolean): void {
    if (this.isDisposed) return;
    if (this.performanceMode === performanceMode) return;
    
    this.performanceMode = performanceMode;
    this.updateInterval = performanceMode ? 32 : 16; // Update frequency based on performance mode
    
    // Only recreate clouds if they already exist
    if (this.cloudTexture) {
      this.createClouds(); // Recreate clouds with new quality settings
    }
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    
    if (this.clouds) {
      this.scene.remove(this.clouds);
      
      // Dispose of all cloud geometries and materials
      this.cloudParticles.forEach(cloud => {
        if (cloud.geometry) cloud.geometry.dispose();
      });
      
      // Dispose of shared material
      if (this.cloudMaterial) {
        this.cloudMaterial.dispose();
        this.cloudMaterial = null;
      }
      
      this.cloudParticles = [];
    }
    
    if (this.cloudTexture) {
      this.cloudTexture.dispose();
      this.cloudTexture = null;
    }
  }
}
