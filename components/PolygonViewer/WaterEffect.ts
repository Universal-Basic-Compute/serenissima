import * as THREE from 'three';
import { ViewMode } from './types';

interface WaterEffectProps {
  scene: THREE.Scene;
  activeView: ViewMode;
  performanceMode: boolean;
  width: number;
  height: number;
}

export default class WaterEffect {
  private scene: THREE.Scene;
  private activeView: ViewMode;
  private performanceMode: boolean;
  private waterGeometry: THREE.PlaneGeometry;
  private waterMaterial: THREE.MeshStandardMaterial;
  private waterPlane: THREE.Mesh;
  private waterVertices: THREE.BufferAttribute;
  private waterVertexCount: number;
  private waterNormalMap: THREE.Texture;

  constructor({
    scene,
    activeView,
    performanceMode,
    width,
    height
  }: WaterEffectProps) {
    this.scene = scene;
    this.activeView = activeView;
    this.performanceMode = performanceMode;
    
    // Create textures
    const textureLoader = new THREE.TextureLoader();
    
    // Water textures
    this.waterNormalMap = textureLoader.load('https://threejs.org/examples/textures/waternormals.jpg');
    this.waterNormalMap.wrapS = this.waterNormalMap.wrapT = THREE.RepeatWrapping;
    this.waterNormalMap.repeat.set(10, 10);
    
    // Create water plane with animated normal map
    this.waterGeometry = new THREE.PlaneGeometry(
      width, 
      height, 
      performanceMode ? 8 : 20, 
      performanceMode ? 8 : 20
    );
    
    this.waterMaterial = new THREE.MeshStandardMaterial({ 
      color: activeView === 'transport' ? '#00aaff' : 
             activeView === 'land' ? '#3a7ca5' : // Deeper blue for land view
             '#0066cc', // Different blue for each view
      transparent: true,
      opacity: activeView === 'land' ? 0.8 : 0.7, // More opaque in land view
      metalness: 0.2,
      roughness: 0.1,
      normalMap: performanceMode ? null : this.waterNormalMap,
      normalScale: new THREE.Vector2(0.4, 0.4),
      envMapIntensity: 0.8,
      flatShading: performanceMode
    });
    
    this.waterPlane = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
    this.waterPlane.rotation.x = Math.PI / 2;
    this.waterPlane.position.y = -0.2;
    this.waterPlane.receiveShadow = true;
    this.scene.add(this.waterPlane);
    
    // Get vertices for animation
    this.waterVertices = this.waterGeometry.attributes.position as THREE.BufferAttribute;
    this.waterVertexCount = this.waterVertices.count;
  }
  
  public update(frameCount: number, performanceMode: boolean) {
    // Animate water normal map with less frequent updates
    const time = Date.now() * 0.0005; // Reduced animation speed
    
    // Only update normal map if it exists (not in performance mode)
    if (this.waterMaterial.normalMap) {
      this.waterMaterial.normalMap.offset.x = time * 0.05;
      this.waterMaterial.normalMap.offset.y = time * 0.05;
    }
    
    // Animate water waves much less frequently in performance mode
    const updateFrequency = performanceMode ? 10 : 3;
    if (this.waterVertices && frameCount % updateFrequency === 0) {
      // Process fewer vertices in performance mode
      const stride = performanceMode ? 6 : 2;
      for (let i = 0; i < this.waterVertexCount; i += stride) {
        const x = this.waterVertices.getX(i);
        const z = this.waterVertices.getZ(i);
        const waveHeight = 0.05; // Reduced wave height
        
        // Simpler wave calculation in performance mode
        const y = performanceMode 
          ? Math.sin(x * 0.2 + time) * waveHeight 
          : Math.sin(x * 0.3 + time) * Math.cos(z * 0.3 + time) * waveHeight;
          
        this.waterVertices.setY(i, y);
      }
      
      this.waterGeometry.attributes.position.needsUpdate = true;
    }
  }
  
  public cleanup() {
    // Remove water plane from scene and dispose of resources
    this.scene.remove(this.waterPlane);
    this.waterGeometry.dispose();
    this.waterMaterial.dispose();
    this.waterNormalMap.dispose();
  }
}
