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
    // Create a simple water plane
    const waterGeometry = new THREE.PlaneGeometry(
      this.width, 
      this.height,
      32, 32 // Higher resolution for better waves
    );
    
    // Create a simple material with a blue color
    const waterColor = this.getWaterColorForView();
    const waterMaterial = new THREE.MeshBasicMaterial({
      color: waterColor,
      transparent: true,
      opacity: 0.95, // Increased opacity to reduce transparency effects
      side: THREE.FrontSide
    });
    
    // Create the water mesh
    this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    this.waterMesh.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    this.waterMesh.position.y = -0.5; // Position closer to land to reduce gap
    this.waterMesh.renderOrder = -1; // Ensure water renders before land
    
    // Add to scene
    this.scene.add(this.waterMesh);
    console.log('Simple water plane added to scene at position y =', this.waterMesh.position.y);
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
    
    // Animate water by moving vertices
    const positions = (this.waterMesh.geometry as THREE.PlaneGeometry).attributes.position.array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      
      // Simple wave animation
      positions[i + 1] = Math.sin(x * 0.5 + this.time) * 0.2 + 
                         Math.cos(z * 0.5 + this.time * 0.8) * 0.2;
    }
    
    // Update geometry
    (this.waterMesh.geometry as THREE.PlaneGeometry).attributes.position.needsUpdate = true;
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
