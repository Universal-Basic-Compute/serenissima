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
    
    // Load cloud texture
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      '/textures/cloud.png', // You'll need to add this texture to your public folder
      (texture) => {
        this.cloudTexture = texture;
        this.createClouds();
      }
    );
  }

  private createClouds() {
    if (!this.cloudTexture) return;
    
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
    
    // Create cloud planes
    const cloudMaterial = new THREE.MeshLambertMaterial({
      map: this.cloudTexture,
      transparent: true,
      opacity: 0.6
    });
    
    const size = Math.max(this.width, this.height) * 0.5;
    const height = size * 0.5;
    
    for (let i = 0; i < cloudCount; i++) {
      // Create a plane for each cloud
      const cloudSize = Math.random() * 20 + 20;
      const cloudGeometry = new THREE.PlaneGeometry(cloudSize, cloudSize);
      
      const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
      
      // Position clouds randomly in a large area above the scene
      cloud.position.set(
        (Math.random() - 0.5) * size * 2,
        height + Math.random() * 20,
        (Math.random() - 0.5) * size * 2
      );
      
      // Rotate clouds to face up
      cloud.rotation.x = -Math.PI / 2;
      
      // Add some random rotation for variety
      cloud.rotation.z = Math.random() * Math.PI * 2;
      
      // Scale randomly for variety
      const scale = Math.random() * 0.5 + 0.5;
      cloud.scale.set(scale, scale, scale);
      
      this.clouds.add(cloud);
      this.cloudParticles.push(cloud);
    }
    
    // Initially hide clouds
    this.setVisibility(false);
  }

  public update(time: number) {
    // Animate clouds slowly
    this.cloudParticles.forEach((cloud, i) => {
      // Gentle rotation
      cloud.rotation.z += 0.0001;
      
      // Gentle movement
      cloud.position.x += Math.sin(time * 0.0001 + i) * 0.01;
      cloud.position.z += Math.cos(time * 0.0001 + i * 0.5) * 0.01;
      
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
