import * as THREE from 'three';

interface CloudSystemProps {
  scene: THREE.Scene;
  width: number;
  height: number;
  performanceMode: boolean;
}

export default class CloudSystem {
  private scene: THREE.Scene;
  private clouds: THREE.Group;
  private cloudParticles: THREE.Mesh[] = [];
  private cloudTexture: THREE.Texture | null = null;
  private isVisible: boolean = false;
  private width: number;
  private height: number;
  private performanceMode: boolean;

  constructor({ scene, width, height, performanceMode }: CloudSystemProps) {
    this.scene = scene;
    this.width = width;
    this.height = height;
    this.performanceMode = performanceMode;
    this.clouds = new THREE.Group();
    this.scene.add(this.clouds);
    
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
          }
        );
      }
    );
  }

  private createClouds() {
    // Skip if texture isn't loaded
    if (!this.cloudTexture) {
      console.log('Cannot create clouds: texture not loaded');
      return;
    }

    console.log('Creating cloud particles...');
    
    // Create fewer clouds in performance mode
    const cloudCount = this.performanceMode ? 15 : 30;
    
    // Create cloud material with proper transparency
    const cloudMaterial = new THREE.MeshBasicMaterial({
      map: this.cloudTexture,
      transparent: true,
      opacity: 0.7,
      depthWrite: false, // Important for proper transparency
      side: THREE.DoubleSide
    });
    
    // Create cloud planes at various positions
    for (let i = 0; i < cloudCount; i++) {
      // Create a simple plane for each cloud
      const size = Math.random() * 20 + 10;
      const cloudGeometry = new THREE.PlaneGeometry(size, size);
      const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
      
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
    }
    
    console.log(`Created ${this.cloudParticles.length} cloud particles`);
    
    // Make sure clouds are initially visible
    this.clouds.visible = this.isVisible;
  }

  public update(time: number) {
    // Animate clouds slowly
    if (!this.cloudParticles || this.cloudParticles.length === 0) return;
    
    this.cloudParticles.forEach((cloud, i) => {
      if (!cloud) return;
      
      try {
        // Gentle rotation
        cloud.rotation.z += 0.00005;
        
        // Gentle movement with unique patterns for each cloud
        cloud.position.x += Math.sin(time * 0.0001 + i * 0.1) * 0.005;
        cloud.position.z += Math.cos(time * 0.0001 + i * 0.05) * 0.005;
        
        // Subtle vertical movement for some clouds
        if (i % 3 === 0) {
          cloud.position.y += Math.sin(time * 0.00005 + i) * 0.002;
        }
        
        // Wrap around if clouds drift too far
        const limit = Math.max(this.width, this.height);
        if (cloud.position.x > limit) cloud.position.x = -limit;
        if (cloud.position.x < -limit) cloud.position.x = limit;
        if (cloud.position.z > limit) cloud.position.z = -limit;
        if (cloud.position.z < -limit) cloud.position.z = limit;
      } catch (error) {
        console.error(`Error animating cloud ${i}:`, error);
      }
    });
  }

  public setVisibility(visible: boolean) {
    if (this.isVisible === visible) return;
    
    this.isVisible = visible;
    this.clouds.visible = visible;
  }

  public updateQuality(performanceMode: boolean) {
    if (this.performanceMode === performanceMode) return;
    
    this.performanceMode = performanceMode;
    this.createClouds(); // Recreate clouds with new quality settings
  }

  public cleanup() {
    if (this.clouds) {
      this.scene.remove(this.clouds);
      
      // Dispose of all cloud geometries and materials
      this.cloudParticles.forEach(cloud => {
        if (cloud.geometry) cloud.geometry.dispose();
        if (cloud.material && !Array.isArray(cloud.material)) {
          cloud.material.dispose();
        }
      });
      
      this.cloudParticles = [];
    }
    
    if (this.cloudTexture) {
      this.cloudTexture.dispose();
      this.cloudTexture = null;
    }
  }
}
