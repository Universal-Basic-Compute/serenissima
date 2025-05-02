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
    console.log('Creating simple water plane...');
    
    // Create a simple water plane with more segments for better appearance
    const geometry = new THREE.PlaneGeometry(
      this.width * 2, 
      this.height * 2,
      32, // Use fixed number of segments regardless of performance mode
      32
    );
    
    // Load water textures
    const textureLoader = new THREE.TextureLoader();
    
    // Load water normal map
    const normalMap = textureLoader.load('/textures/waternormals.jpg', (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(5, 5);
    });
    
    // Create a material for water with the appropriate color, higher opacity, and normal map
    const waterColor = new THREE.Color(this.getWaterColorForView());
    const material = new THREE.MeshStandardMaterial({
      color: waterColor,
      transparent: true,
      opacity: 0.9, // Increased opacity for better visibility
      side: THREE.DoubleSide,
      normalMap: normalMap,
      normalScale: new THREE.Vector2(0.3, 0.3), // Adjust normal intensity
      metalness: 0.1,
      roughness: 0.5
    });
    
    // Create the water mesh
    this.waterMesh = new THREE.Mesh(geometry, material);
    
    // Position water at y=-0.1 (below the land which is at y=0.1)
    this.waterMesh.position.y = -0.1;
    
    // Rotate the water plane to be horizontal
    this.waterMesh.rotation.x = -Math.PI / 2;
    
    // Set render order to ensure water appears below land
    this.waterMesh.renderOrder = 5;
    
    // Add to scene
    this.scene.add(this.waterMesh);
    
    console.log('Water mesh created successfully');
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
      material.normalMap.offset.x = this.time * 0.05;
      material.normalMap.offset.y = this.time * 0.03;
      
      // Vary normal scale slightly for more dynamic waves
      const scale = 0.3 + Math.sin(this.time * 0.2) * 0.05;
      material.normalScale.set(scale, scale);
      
      // Update material
      material.needsUpdate = true;
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
