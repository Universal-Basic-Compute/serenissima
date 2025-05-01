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
    if (!this.cloudTexture) {
      console.error('Cannot create clouds: texture not loaded');
      return;
    }
    
    console.log('Creating cloud particles...');
    
    // Clear any existing clouds
    while (this.clouds.children.length > 0) {
      const cloud = this.clouds.children[0];
      if (cloud instanceof THREE.Mesh) {
        if (cloud.geometry) cloud.geometry.dispose();
        if (cloud.material && !Array.isArray(cloud.material)) {
          cloud.material.dispose();
        }
      }
      this.clouds.remove(cloud);
    }
    this.cloudParticles = [];
    
    // Determine number of clouds based on performance mode
    const cloudCount = this.performanceMode ? 15 : 30;
    
    // Create cloud planes with higher opacity
    const cloudMaterial = new THREE.MeshLambertMaterial({
      map: this.cloudTexture,
      transparent: true,
      opacity: 0.8, // Increased from 0.6 to 0.8
      depthWrite: false // Ensure clouds don't interfere with depth buffer
    });
    
    const size = Math.max(this.width, this.height) * 0.5;
    const height = size * 0.5;
    
    // Create clouds at different heights for more depth
    const heightLevels = [height, height + 10, height + 20];
    
    console.log(`Creating ${cloudCount} clouds at heights: ${heightLevels}`);
    
    for (let i = 0; i < cloudCount; i++) {
      // Create a plane for each cloud - make them larger
      const cloudSize = Math.random() * 30 + 30; // Increased from 20+20 to 30+30
      const cloudGeometry = new THREE.PlaneGeometry(cloudSize, cloudSize);
      
      const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial.clone());
      
      // Position clouds randomly in a large area above the scene
      // Choose a random height level
      const cloudHeight = heightLevels[Math.floor(Math.random() * heightLevels.length)];
      
      cloud.position.set(
        (Math.random() - 0.5) * size * 2,
        cloudHeight,
        (Math.random() - 0.5) * size * 2
      );
      
      // Rotate clouds to face up
      cloud.rotation.x = -Math.PI / 2;
      
      // Add some random rotation for variety
      cloud.rotation.z = Math.random() * Math.PI * 2;
      
      // Scale randomly for variety
      const scale = Math.random() * 0.5 + 0.8; // Increased base scale from 0.5 to 0.8
      cloud.scale.set(scale, scale, scale);
      
      // Add random opacity for more depth - but keep it higher
      (cloud.material as THREE.MeshLambertMaterial).opacity = 0.5 + Math.random() * 0.3; // Increased from 0.3+0.3 to 0.5+0.3
      
      this.clouds.add(cloud);
      this.cloudParticles.push(cloud);
    }
    
    console.log(`Created ${this.cloudParticles.length} cloud particles`);
    
    // Initially hide clouds
    this.setVisibility(false);
  }

  public update(time: number) {
    // Animate clouds slowly
    this.cloudParticles.forEach((cloud, i) => {
      // Gentle rotation
      cloud.rotation.z += 0.0001;
      
      // Gentle movement with unique patterns for each cloud
      cloud.position.x += Math.sin(time * 0.0001 + i * 0.1) * 0.01;
      cloud.position.z += Math.cos(time * 0.0001 + i * 0.05) * 0.01;
      
      // Subtle vertical movement for some clouds
      if (i % 3 === 0) {
        cloud.position.y += Math.sin(time * 0.00005 + i) * 0.005;
      }
      
      // Wrap around if clouds drift too far
      const limit = Math.max(this.width, this.height);
      if (cloud.position.x > limit) cloud.position.x = -limit;
      if (cloud.position.x < -limit) cloud.position.x = limit;
      if (cloud.position.z > limit) cloud.position.z = -limit;
      if (cloud.position.z < -limit) cloud.position.z = limit;
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
