import * as THREE from 'three';

/**
 * CloudSystem - Manages cloud rendering in the 3D scene
 * 
 * This class follows the facade pattern to hide Three.js complexity
 * and provides a simple interface for cloud management.
 */
export class CloudSystem {
  private scene: THREE.Scene;
  private clouds: THREE.Group;
  private cloudParticles: THREE.Mesh[] = [];
  private cloudTexture: THREE.Texture | null = null;
  private isVisible: boolean = false;
  private width: number = 300;
  private height: number = 300;
  private performanceMode: boolean = false;
  private cloudMaterial: THREE.MeshBasicMaterial | null = null;
  private lastUpdateTime: number = 0;
  private updateInterval: number = 16; // Update every ~16ms (60fps)
  private isDisposed: boolean = false;

  /**
   * Create a new cloud system
   * 
   * @param options Configuration options for the cloud system
   */
  // Flag to track if system is in fallback mode
  private inFallbackMode: boolean = false;
  private recoveryAttempts: number = 0;
  private maxRecoveryAttempts: number = 3;
  private lastRecoveryTime: number = 0;
  private recoveryInterval: number = 30000; // 30 seconds between recovery attempts

  constructor(options: {
    scene: THREE.Scene;
    width?: number;
    height?: number;
    performanceMode?: boolean;
  }) {
    // Initialize required properties first to avoid "used before assigned" errors
    this.scene = new THREE.Scene(); // Default initialization
    this.clouds = new THREE.Group();
    
    try {
      // Now properly assign from options
      this.scene = options.scene;
      this.width = options.width ?? this.width;
      this.height = options.height ?? this.height;
      this.performanceMode = options.performanceMode ?? this.performanceMode;
      
      // Add error handling for scene addition
      try {
        this.scene.add(this.clouds);
      } catch (sceneError) {
        console.error('Error adding cloud group to scene:', sceneError);
        // Create a new scene as fallback if needed
        if (!this.scene) {
          console.warn('Creating fallback scene for clouds');
          this.scene = new THREE.Scene();
          this.scene.add(this.clouds);
          this.inFallbackMode = true;
        }
      }
      
      // Adjust update interval based on performance mode
      this.updateInterval = this.performanceMode ? 32 : 16; // 30fps in performance mode
      
      this.loadCloudTexture();
    } catch (error) {
      console.error('Critical error in CloudSystem constructor:', error);
      this.inFallbackMode = true;
      // Create minimal working state to prevent null references
      if (!this.scene) this.scene = new THREE.Scene();
      if (!this.clouds) this.clouds = new THREE.Group();
      this.scene.add(this.clouds);
    }
  }

  /**
   * Load cloud texture with comprehensive error handling
   * @private
   */
  private loadCloudTexture(): void {
    if (this.isDisposed) return;
    
    try {
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
        (progressEvent) => {
          // Optional progress tracking
          if (progressEvent.lengthComputable) {
            const percentComplete = Math.round((progressEvent.loaded / progressEvent.total) * 100);
            if (percentComplete % 25 === 0) { // Log at 25%, 50%, 75%, 100%
              console.log(`Cloud texture loading: ${percentComplete}%`);
            }
          }
        },
        (error) => {
          console.error('Error loading cloud texture:', error);
          this.tryFallbackTextures();
        }
      );
    } catch (error) {
      console.error('Error initiating texture loading:', error);
      this.tryFallbackTextures();
    }
  }

  /**
   * Try loading fallback textures in sequence
   * @private
   */
  private tryFallbackTextures(): void {
    if (this.isDisposed) return;
    
    try {
      // Try a fallback texture
      console.log('Trying fallback texture...');
      const textureLoader = new THREE.TextureLoader();
      
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
          this.createCanvasTexture();
        }
      );
    } catch (error) {
      console.error('Error loading fallback texture:', error);
      this.createCanvasTexture();
    }
  }

  /**
   * Create a simple canvas texture as last resort
   * @private
   */
  private createCanvasTexture(): void {
    if (this.isDisposed) return;
    
    try {
      console.log('Creating canvas texture as last resort');
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(64, 64, 60, 0, Math.PI * 2);
        ctx.fill();
        
        try {
          const canvasTexture = new THREE.CanvasTexture(canvas);
          this.cloudTexture = canvasTexture;
          this.createClouds();
        } catch (textureError) {
          console.error('Failed to create canvas texture:', textureError);
          this.inFallbackMode = true;
          // Create a minimal cloud representation
          this.createMinimalClouds();
        }
      } else {
        console.error('Failed to get 2D context from canvas');
        this.inFallbackMode = true;
        this.createMinimalClouds();
      }
    } catch (error) {
      console.error('Error creating canvas texture:', error);
      this.inFallbackMode = true;
      this.createMinimalClouds();
    }
  }

  /**
   * Create minimal clouds when all else fails
   * @private
   */
  private createMinimalClouds(): void {
    if (this.isDisposed) return;
    
    try {
      console.warn('Creating minimal clouds as emergency fallback');
      
      // Clean existing clouds
      this.cloudParticles.forEach(cloud => {
        if (cloud && this.clouds) this.clouds.remove(cloud);
      });
      this.cloudParticles = [];
      
      // Create a simple material without textures
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
        depthWrite: false
      });
      
      // Create just a few simple clouds
      const geometry = new THREE.PlaneGeometry(1, 1);
      
      for (let i = 0; i < 5; i++) {
        const cloud = new THREE.Mesh(geometry, material);
        cloud.scale.set(10, 10, 1);
        cloud.position.set(
          (Math.random() - 0.5) * 100,
          Math.random() * 20 + 30,
          (Math.random() - 0.5) * 100
        );
        this.clouds.add(cloud);
        this.cloudParticles.push(cloud);
      }
      
      console.log('Created minimal cloud fallback');
    } catch (error) {
      console.error('Failed to create minimal clouds:', error);
      // At this point, we give up on clouds but don't crash the application
    }
  }

  /**
   * Create cloud particles in the scene
   * @private
   */
  private createClouds(): void {
    if (this.isDisposed) return;
    
    try {
      // Skip if texture isn't loaded
      if (!this.cloudTexture) {
        console.log('Cannot create clouds: texture not loaded');
        return;
      }

      console.log('Creating cloud particles...');
      
      // Clean up existing clouds first
      try {
        this.cloudParticles.forEach(cloud => {
          if (cloud && this.clouds) {
            this.clouds.remove(cloud);
            if (cloud.geometry) cloud.geometry.dispose();
          }
        });
      } catch (cleanupError) {
        console.warn('Error cleaning up existing clouds:', cleanupError);
        // Continue anyway - we'll replace the array
      }
      
      this.cloudParticles = [];
      
      // Create fewer clouds in performance mode or fallback mode
      const cloudCount = this.inFallbackMode ? 5 : (this.performanceMode ? 10 : 20);
      
      try {
        // Create cloud material with proper transparency - reuse for all clouds
        this.cloudMaterial = new THREE.MeshBasicMaterial({
          map: this.cloudTexture,
          transparent: true,
          opacity: 0.7,
          depthWrite: false, // Important for proper transparency
          side: THREE.DoubleSide
        });
      } catch (materialError) {
        console.error('Error creating cloud material:', materialError);
        // Fallback to a simple material
        this.cloudMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.5,
          depthWrite: false
        });
        this.inFallbackMode = true;
      }
      
      // Create a shared geometry for better performance
      let baseGeometry: THREE.BufferGeometry;
      try {
        baseGeometry = new THREE.PlaneGeometry(1, 1);
      } catch (geometryError) {
        console.error('Error creating plane geometry:', geometryError);
        // Use a simpler geometry as fallback
        baseGeometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([
          -0.5, -0.5, 0,
           0.5, -0.5, 0,
           0.5,  0.5, 0,
          -0.5,  0.5, 0
        ]);
        baseGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        baseGeometry.setIndex([0, 1, 2, 0, 2, 3]);
        this.inFallbackMode = true;
      }
      
      // Track successful cloud creations
      let successCount = 0;
      const errorClouds: number[] = [];
      
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
          if (this.clouds) {
            this.clouds.add(cloud);
            this.cloudParticles.push(cloud);
            successCount++;
          } else {
            throw new Error('Cloud group is null');
          }
        } catch (error) {
          console.error(`Error creating cloud ${i}:`, error);
          errorClouds.push(i);
        }
      }
      
      console.log(`Created ${successCount}/${cloudCount} cloud particles successfully`);
      if (errorClouds.length > 0) {
        console.warn(`Failed to create clouds at indices: ${errorClouds.join(', ')}`);
      }
      
      // Make sure clouds are initially visible
      if (this.clouds) {
        this.clouds.visible = this.isVisible;
      }
      
      // Reset fallback mode if we were successful
      if (successCount > 0 && this.inFallbackMode) {
        console.log('Successfully recovered from fallback mode');
        this.inFallbackMode = false;
        this.recoveryAttempts = 0;
      }
    } catch (error) {
      console.error('Critical error in createClouds:', error);
      this.inFallbackMode = true;
      this.createMinimalClouds();
    }
  }

  /**
   * Update cloud positions and animations
   * @param time Current animation time
   */
  public update(time: number): void {
    if (this.isDisposed) return;
    
    try {
      // Skip updates if clouds aren't visible
      if (!this.isVisible) return;
      
      // Throttle updates based on performance mode
      if (time - this.lastUpdateTime < this.updateInterval) return;
      this.lastUpdateTime = time;
      
      // Check if we should attempt recovery from fallback mode
      if (this.inFallbackMode && 
          this.recoveryAttempts < this.maxRecoveryAttempts && 
          time - this.lastRecoveryTime > this.recoveryInterval) {
        
        this.lastRecoveryTime = time;
        this.recoveryAttempts++;
        console.log(`Attempting cloud system recovery (attempt ${this.recoveryAttempts}/${this.maxRecoveryAttempts})`);
        
        // Try to reload textures and recreate clouds
        this.loadCloudTexture();
        return; // Skip this update cycle
      }
      
      // Animate clouds slowly
      if (!this.cloudParticles || this.cloudParticles.length === 0) {
        // If we have no clouds but we're not in fallback mode, try to create them
        if (!this.inFallbackMode && this.cloudTexture) {
          console.log('No clouds found but texture exists, recreating clouds');
          this.createClouds();
        }
        return;
      }
      
      // Calculate movement factors once
      const timeScale = 0.0001;
      const movementScale = 0.005;
      
      // Track any errors during animation
      let errorCount = 0;
      
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
          errorCount++;
          // Only log every 10th error to avoid console spam
          if (errorCount % 10 === 1) {
            console.error(`Error animating cloud ${i} (showing 1/${errorCount} errors):`, error);
          }
          
          // Try to reset the cloud position if it's causing errors
          try {
            cloud.position.set(
              (Math.random() - 0.5) * this.width * 0.8,
              Math.random() * 20 + 30,
              (Math.random() - 0.5) * this.height * 0.8
            );
          } catch (resetError) {
            // If we can't even reset it, remove it from the array
            const index = this.cloudParticles.indexOf(cloud);
            if (index !== -1) {
              this.cloudParticles.splice(index, 1);
            }
          }
        }
      });
      
      // If we had too many errors, switch to fallback mode
      if (errorCount > this.cloudParticles.length / 2) {
        console.warn(`Too many cloud animation errors (${errorCount}/${this.cloudParticles.length}), switching to fallback mode`);
        this.inFallbackMode = true;
        this.createMinimalClouds();
      }
    } catch (error) {
      console.error('Critical error in cloud update:', error);
      // Don't try to recover here - just skip this update
    }
  }

  /**
   * Set cloud visibility
   * @param visible Whether clouds should be visible
   */
  public setVisibility(visible: boolean): void {
    if (this.isDisposed) return;
    if (this.isVisible === visible) return;
    
    try {
      this.isVisible = visible;
      
      if (this.clouds) {
        this.clouds.visible = visible;
        
        // Add debug logging
        console.log(`Cloud visibility set to: ${visible}`);
        
        // Force update of all cloud particles
        if (this.cloudParticles && this.cloudParticles.length > 0) {
          let successCount = 0;
          let errorCount = 0;
          
          this.cloudParticles.forEach(cloud => {
            if (cloud) {
              try {
                cloud.visible = visible;
                successCount++;
              } catch (error) {
                errorCount++;
                // Only log first few errors
                if (errorCount <= 3) {
                  console.warn(`Error setting cloud visibility: ${error}`);
                }
              }
            }
          });
          
          if (errorCount > 0) {
            console.warn(`Failed to set visibility on ${errorCount}/${this.cloudParticles.length} clouds`);
          }
          
          // If we couldn't set visibility on any clouds, try to recreate them
          if (successCount === 0 && this.cloudParticles.length > 0) {
            console.warn('Failed to set visibility on any clouds, attempting to recreate');
            this.createClouds();
          }
        } else if (visible && !this.inFallbackMode) {
          // If we're trying to show clouds but have none, try to create them
          console.log('No clouds to show, attempting to create clouds');
          if (this.cloudTexture) {
            this.createClouds();
          } else {
            this.loadCloudTexture();
          }
        }
      } else {
        console.warn('Cloud group is null, cannot set visibility');
        
        // Try to recreate the cloud group
        if (visible && !this.inFallbackMode) {
          console.log('Attempting to recreate cloud group');
          this.clouds = new THREE.Group();
          if (this.scene) {
            this.scene.add(this.clouds);
            
            // Try to recreate clouds
            if (this.cloudTexture) {
              this.createClouds();
            } else {
              this.loadCloudTexture();
            }
          }
        }
      }
    } catch (error) {
      console.error('Critical error setting cloud visibility:', error);
      // Don't crash the application
    }
  }

  /**
   * Update cloud quality settings
   * @param performanceMode Whether to use lower quality for better performance
   */
  public updateQuality(performanceMode: boolean): void {
    if (this.isDisposed) return;
    if (this.performanceMode === performanceMode) return;
    
    try {
      console.log(`Updating cloud quality: performanceMode=${performanceMode}`);
      this.performanceMode = performanceMode;
      this.updateInterval = performanceMode ? 32 : 16; // Update frequency based on performance mode
      
      // Only recreate clouds if they already exist and we're not in fallback mode
      if (this.cloudTexture && !this.inFallbackMode) {
        console.log('Recreating clouds with new quality settings');
        this.createClouds(); // Recreate clouds with new quality settings
      } else if (this.inFallbackMode) {
        console.log('In fallback mode, using minimal clouds regardless of quality setting');
        // In fallback mode, we always use minimal clouds
        this.createMinimalClouds();
      } else {
        console.log('No cloud texture available, cannot update quality');
      }
    } catch (error) {
      console.error('Error updating cloud quality:', error);
      // Switch to fallback mode if quality update fails
      this.inFallbackMode = true;
      this.createMinimalClouds();
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.isDisposed) return;
    
    try {
      console.log('Disposing cloud system resources');
      this.isDisposed = true;
      
      if (this.clouds && this.scene) {
        try {
          this.scene.remove(this.clouds);
        } catch (removeError) {
          console.warn('Error removing clouds from scene:', removeError);
        }
        
        // Dispose of all cloud geometries and materials
        if (this.cloudParticles && this.cloudParticles.length > 0) {
          let disposedGeometries = 0;
          
          this.cloudParticles.forEach(cloud => {
            try {
              if (cloud && cloud.geometry) {
                cloud.geometry.dispose();
                disposedGeometries++;
              }
            } catch (geometryError) {
              console.warn('Error disposing cloud geometry:', geometryError);
            }
          });
          
          console.log(`Disposed ${disposedGeometries}/${this.cloudParticles.length} cloud geometries`);
        }
        
        // Dispose of shared material
        if (this.cloudMaterial) {
          try {
            this.cloudMaterial.dispose();
            console.log('Disposed cloud material');
          } catch (materialError) {
            console.warn('Error disposing cloud material:', materialError);
          }
          this.cloudMaterial = null;
        }
        
        this.cloudParticles = [];
      }
      
      if (this.cloudTexture) {
        try {
          this.cloudTexture.dispose();
          console.log('Disposed cloud texture');
        } catch (textureError) {
          console.warn('Error disposing cloud texture:', textureError);
        }
        this.cloudTexture = null;
      }
      
      console.log('Cloud system disposed successfully');
    } catch (error) {
      console.error('Critical error during cloud system disposal:', error);
      // Ensure we mark as disposed even if there was an error
      this.isDisposed = true;
      this.cloudParticles = [];
      this.cloudMaterial = null;
      this.cloudTexture = null;
    }
  }
}
