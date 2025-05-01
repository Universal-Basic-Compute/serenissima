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

  // Static texture loader and cache for water normal map
  private static waterNormalMapTexture: THREE.Texture | null = null;
  private static textureLoader: THREE.TextureLoader | null = null;

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
    
    // Use shared texture loader or create one if it doesn't exist
    if (!WaterEffect.textureLoader) {
      WaterEffect.textureLoader = new THREE.TextureLoader();
      WaterEffect.textureLoader.setCrossOrigin('anonymous');
    }
    
    // Start with a simple water plane without normal map
    this.waterGeometry = new THREE.PlaneGeometry(
      width, 
      height, 
      performanceMode ? 4 : 8, // Start with fewer segments
      performanceMode ? 4 : 8
    );
    
    this.waterMaterial = new THREE.MeshStandardMaterial({ 
      color: activeView === 'transport' ? '#00aaff' : 
             activeView === 'land' ? '#3a7ca5' : // Deeper blue for land view
             '#0066cc', // Different blue for each view
      transparent: true,
      opacity: activeView === 'land' ? 0.8 : 0.7, // More opaque in land view
      metalness: 0.2,
      roughness: 0.1,
      normalMap: null, // Start without normal map
      flatShading: performanceMode
    });
    
    this.waterPlane = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
    this.waterPlane.rotation.x = Math.PI / 2;
    this.waterPlane.position.y = -0.2;
    this.waterPlane.receiveShadow = false; // Start without shadows
    this.scene.add(this.waterPlane);
    
    // Get vertices for animation
    this.waterVertices = this.waterGeometry.attributes.position as THREE.BufferAttribute;
    this.waterVertexCount = this.waterVertices.count;
    
    // Load water normal map with a delay
    setTimeout(() => {
      if (!performanceMode) {
        // Use cached texture or load it if not available
        if (!WaterEffect.waterNormalMapTexture) {
          WaterEffect.waterNormalMapTexture = WaterEffect.textureLoader!.load(
            'https://threejs.org/examples/textures/waternormals.jpg',
            () => {
              // Configure texture once loaded
              WaterEffect.waterNormalMapTexture!.wrapS = 
              WaterEffect.waterNormalMapTexture!.wrapT = THREE.RepeatWrapping;
              WaterEffect.waterNormalMapTexture!.repeat.set(10, 10);
              
              // Apply to material
              this.waterNormalMap = WaterEffect.waterNormalMapTexture!;
              this.waterMaterial.normalMap = this.waterNormalMap;
              this.waterMaterial.normalScale = new THREE.Vector2(0.4, 0.4);
              this.waterMaterial.needsUpdate = true;
              
              // Enhance water geometry
              this.scene.remove(this.waterPlane);
              this.waterGeometry.dispose();
              
              this.waterGeometry = new THREE.PlaneGeometry(
                width, 
                height, 
                performanceMode ? 8 : 20, 
                performanceMode ? 8 : 20
              );
              
              this.waterPlane = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
              this.waterPlane.rotation.x = Math.PI / 2;
              this.waterPlane.position.y = -0.2;
              this.waterPlane.receiveShadow = true;
              this.scene.add(this.waterPlane);
              
              // Update vertices reference
              this.waterVertices = this.waterGeometry.attributes.position as THREE.BufferAttribute;
              this.waterVertexCount = this.waterVertices.count;
            }
          );
        } else {
          // Use existing texture
          this.waterNormalMap = WaterEffect.waterNormalMapTexture;
          this.waterMaterial.normalMap = this.waterNormalMap;
          this.waterMaterial.normalScale = new THREE.Vector2(0.4, 0.4);
          this.waterMaterial.needsUpdate = true;
          this.waterPlane.receiveShadow = true;
        }
      }
    }, 1500); // Delay normal map loading by 1.5 seconds
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
  
  public updateViewMode(activeView: ViewMode) {
    this.activeView = activeView;
    
    // Update water material based on view mode
    this.waterMaterial.color.set(
      activeView === 'transport' ? '#00aaff' : 
      activeView === 'land' ? '#3a7ca5' : // Deeper blue for land view
      '#0066cc' // Different blue for buildings view
    );
    
    // Update opacity based on view mode
    this.waterMaterial.opacity = activeView === 'land' ? 0.8 : 0.7;
    
    // Update material to apply changes
    this.waterMaterial.needsUpdate = true;
  }

  public updateQuality(performanceMode: boolean) {
    this.performanceMode = performanceMode;
    
    // Update normal map based on performance mode
    this.waterMaterial.normalMap = performanceMode ? null : this.waterNormalMap;
    
    // Update material to apply changes
    this.waterMaterial.needsUpdate = true;
  }
  
  public cleanup() {
    // Remove water plane from scene and dispose of resources
    this.scene.remove(this.waterPlane);
    this.waterGeometry.dispose();
    this.waterMaterial.dispose();
    
    // Only dispose of the normal map if it exists
    if (this.waterNormalMap) {
      this.waterNormalMap.dispose();
    }
  }
}
