import * as THREE from 'three';
import { ViewMode } from './types';

interface SimpleWaterProps {
  scene: THREE.Scene;
  activeView: ViewMode;
  performanceMode: boolean;
  width: number;
  height: number;
}

export default class SimpleWater {
  private scene: THREE.Scene;
  private activeView: ViewMode;
  private performanceMode: boolean;
  private width: number;
  private height: number;
  private waterMesh: THREE.Mesh | null = null;
  private time: number = 0;

  constructor({
    scene,
    activeView,
    performanceMode,
    width,
    height
  }: SimpleWaterProps) {
    this.scene = scene;
    this.activeView = activeView;
    this.performanceMode = performanceMode;
    this.width = width;
    this.height = height;
    
    // Create a simple water plane immediately
    this.createWater();
  }
  
  private createWater() {
    console.log('Creating enhanced water plane...');
    
    // Create a water plane with more segments for better wave animation
    const geometry = new THREE.PlaneGeometry(
      this.width * 4, // Double the size for better coverage
      this.height * 4, // Double the size for better coverage
      64, // Increase segments for smoother waves
      64
    );
    
    // Load water textures
    const textureLoader = new THREE.TextureLoader();
    
    // Load water normal map with better error handling
    const normalMap = textureLoader.load('/textures/waternormals.jpg', 
      (texture) => {
        console.log('Water normal map loaded successfully');
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(8, 8); // Increase repeat for more detailed waves
      },
      undefined,
      (error) => {
        console.error('Error loading water normal map:', error);
        // Create a fallback normal map
        this.createFallbackNormalMap();
      }
    );
    
    // Create a more advanced material for water
    const waterColor = new THREE.Color(this.getWaterColorForView());
    const material = new THREE.MeshStandardMaterial({
      color: waterColor,
      transparent: true,
      opacity: 0.95, // Increased opacity for better visibility
      side: THREE.DoubleSide,
      normalMap: normalMap,
      normalScale: new THREE.Vector2(0.5, 0.5), // Increase normal intensity
      metalness: 0.2,
      roughness: 0.4
    });
    
    // Create the water mesh
    this.waterMesh = new THREE.Mesh(geometry, material);
    
    // Position water at y=-0.05 (closer to the land which is at y=0.1)
    this.waterMesh.position.y = -0.05;
    
    // Rotate the water plane to be horizontal
    this.waterMesh.rotation.x = -Math.PI / 2;
    
    // Set render order to ensure water appears below land
    this.waterMesh.renderOrder = 5;
    
    // Add to scene
    this.scene.add(this.waterMesh);
    
    console.log('Enhanced water mesh created successfully');
  }
  
  // Add this method to create a fallback normal map
  private createFallbackNormalMap() {
    console.log('Creating fallback water normal map');
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Create a more complex wave pattern
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          // Create multiple overlapping sine waves for more realistic water
          const r = Math.floor(127 * Math.sin((x / canvas.width) * Math.PI * 10) + 127);
          const g = Math.floor(127 * Math.sin((y / canvas.height) * Math.PI * 10) + 127);
          const b = 255; // Full blue for normal map
          
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      
      const fallbackTexture = new THREE.CanvasTexture(canvas);
      fallbackTexture.wrapS = fallbackTexture.wrapT = THREE.RepeatWrapping;
      fallbackTexture.repeat.set(8, 8);
      
      // Apply to water mesh if it exists
      if (this.waterMesh) {
        const material = this.waterMesh.material as THREE.MeshPhysicalMaterial;
        material.normalMap = fallbackTexture;
        material.needsUpdate = true;
      }
    }
  }
  
  private getWaterColorForView(): number {
    switch (this.activeView) {
      case 'transport':
        return 0x4ac0ff; // Bright turquoise blue
      case 'resources':
        return 0x3a7d6d; // Darker teal for resources
      case 'markets':
        return 0x5d8aa8; // Steel blue for markets
      case 'governance':
        return 0x483d8b; // Dark slate blue for governance
      case 'land':
        return 0x1ec3d4; // Enhanced light sea green for tropical island feel
      default:
        return 0x0088cc; // Deeper turquoise
    }
  }
  
  public update(frameCount: number) {
    this.time += 0.01;
    
    // Skip if water mesh doesn't exist
    if (!this.waterMesh) return;
    
    // Get the material
    const material = this.waterMesh.material as THREE.MeshStandardMaterial;
    
    // Update normal map offset for wave animation
    if (material.normalMap) {
      // Create more complex wave motion with multiple frequencies
      material.normalMap.offset.x = Math.sin(this.time * 0.05) * 0.1 + this.time * 0.03;
      material.normalMap.offset.y = Math.cos(this.time * 0.04) * 0.1 + this.time * 0.02;
      
      // Vary normal scale for more dynamic waves
      const scale = 0.4 + Math.sin(this.time * 0.1) * 0.1;
      material.normalScale.set(scale, scale);
      
      // Slightly vary the water color over time for more realism
      const baseColor = new THREE.Color(this.getWaterColorForView());
      const r = baseColor.r + Math.sin(this.time * 0.1) * 0.02;
      const g = baseColor.g + Math.cos(this.time * 0.15) * 0.02;
      const b = baseColor.b + Math.sin(this.time * 0.2) * 0.02;
      material.color.setRGB(r, g, b);
      
      // Update material
      material.needsUpdate = true;
    }
    
    // Animate the water geometry for more pronounced waves
    if (this.waterMesh.geometry instanceof THREE.PlaneGeometry) {
      const positions = this.waterMesh.geometry.attributes.position.array;
      const count = positions.length / 3;
      
      for (let i = 0; i < count; i++) {
        const x = positions[i * 3];
        const z = positions[i * 3 + 2];
        
        // Create gentle waves with multiple frequencies
        positions[i * 3 + 1] = 
          Math.sin(x * 0.05 + this.time * 0.5) * 0.1 + 
          Math.cos(z * 0.05 + this.time * 0.3) * 0.1;
      }
      
      this.waterMesh.geometry.attributes.position.needsUpdate = true;
      this.waterMesh.geometry.computeVertexNormals();
    }
  }
  
  public updateViewMode(activeView: ViewMode) {
    this.activeView = activeView;
    
    // Update water color
    if (this.waterMesh) {
      const waterColor = this.getWaterColorForView();
      (this.waterMesh.material as THREE.MeshBasicMaterial).color.setHex(waterColor);
    }
  }
  
  public updateQuality(performanceMode: boolean) {
    this.performanceMode = performanceMode;
  }
  
  public cleanup() {
    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
      
      if (this.waterMesh.geometry) {
        this.waterMesh.geometry.dispose();
      }
      
      if (this.waterMesh.material) {
        (this.waterMesh.material as THREE.Material).dispose();
      }
    }
  }
}
