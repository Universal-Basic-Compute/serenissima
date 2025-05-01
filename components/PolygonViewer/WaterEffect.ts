import * as THREE from 'three';
import { ViewMode } from './types';
import { Water } from 'three/examples/jsm/objects/Water.js';

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
  private water: Water;
  private waterGeometry: THREE.PlaneGeometry;
  private waterNormalMap: THREE.Texture;
  private waterDUDVMap: THREE.Texture;
  private width: number;
  private height: number;
  private sunPosition: THREE.Vector3;
  private sunDirection: THREE.Vector3;
  private waterFoam: THREE.Mesh | null = null;
  private foamTexture: THREE.Texture | null = null;
  private causticTextures: THREE.Texture[] = [];
  private causticLight: THREE.DirectionalLight | null = null;
  private causticIndex: number = 0;
  private causticMesh: THREE.Mesh | null = null;

  // Static texture loader and cache for water textures
  private static waterNormalMapTexture: THREE.Texture | null = null;
  private static waterDUDVMapTexture: THREE.Texture | null = null;
  private static foamTexture: THREE.Texture | null = null;
  private static textureLoader: THREE.TextureLoader | null = null;
  private static causticTextures: THREE.Texture[] | null = null;

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
    this.width = width;
    this.height = height;
    
    // Set up sun position for reflections
    this.sunPosition = new THREE.Vector3(50, 100, 50);
    this.sunDirection = new THREE.Vector3()
      .copy(this.sunPosition)
      .normalize();
    
    // Use shared texture loader or create one if it doesn't exist
    if (!WaterEffect.textureLoader) {
      WaterEffect.textureLoader = new THREE.TextureLoader();
      WaterEffect.textureLoader.setCrossOrigin('anonymous');
    }
    
    // Create a simple placeholder water plane initially
    this.waterGeometry = new THREE.PlaneGeometry(
      width, 
      height, 
      performanceMode ? 4 : 16
    );
    
    // Load textures with a delay to improve initial loading performance
    setTimeout(() => this.initializeWater(), 500);
  }
  
  private initializeWater() {
    // Load or use cached normal map
    if (!WaterEffect.waterNormalMapTexture) {
      WaterEffect.waterNormalMapTexture = WaterEffect.textureLoader!.load(
        'https://threejs.org/examples/textures/waternormals.jpg'
      );
      WaterEffect.waterNormalMapTexture.wrapS = THREE.RepeatWrapping;
      WaterEffect.waterNormalMapTexture.wrapT = THREE.RepeatWrapping;
    }
    this.waterNormalMap = WaterEffect.waterNormalMapTexture;
    
    // Load or use cached DUDV map (distortion)
    if (!WaterEffect.waterDUDVMapTexture) {
      WaterEffect.waterDUDVMapTexture = WaterEffect.textureLoader!.load(
        'https://threejs.org/examples/textures/waterdudv.jpg'
      );
      WaterEffect.waterDUDVMapTexture.wrapS = THREE.RepeatWrapping;
      WaterEffect.waterDUDVMapTexture.wrapT = THREE.RepeatWrapping;
    }
    this.waterDUDVMap = WaterEffect.waterDUDVMapTexture;
    
    // Create advanced water with reflections
    const waterOptions = {
      textureWidth: this.performanceMode ? 256 : 512,
      textureHeight: this.performanceMode ? 256 : 512,
      waterNormals: this.waterNormalMap,
      sunDirection: this.sunDirection,
      sunColor: 0xffffff,
      waterColor: this.getWaterColorForView(),
      distortionScale: 3.7,
      fog: this.scene.fog !== undefined,
      format: THREE.RGBAFormat
    };
    
    // Create the water mesh
    this.water = new Water(this.waterGeometry, waterOptions);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -0.2;
    
    // Add the water to the scene
    this.scene.add(this.water);
    
    // Load foam texture for wave crests
    if (!this.performanceMode) {
      this.loadFoamTexture();
      this.loadCausticTextures();
    }
  }
  
  private loadFoamTexture() {
    if (!WaterEffect.foamTexture) {
      WaterEffect.foamTexture = WaterEffect.textureLoader!.load(
        'https://threejs.org/examples/textures/foam.jpg',
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(20, 20);
          
          // Create foam mesh
          const foamGeometry = new THREE.PlaneGeometry(this.width, this.height);
          const foamMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          });
          
          this.waterFoam = new THREE.Mesh(foamGeometry, foamMaterial);
          this.waterFoam.rotation.x = -Math.PI / 2;
          this.waterFoam.position.y = -0.15; // Slightly above water
          this.scene.add(this.waterFoam);
          this.foamTexture = texture;
        }
      );
    } else {
      // Use cached foam texture
      const foamGeometry = new THREE.PlaneGeometry(this.width, this.height);
      const foamMaterial = new THREE.MeshBasicMaterial({
        map: WaterEffect.foamTexture,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      
      this.waterFoam = new THREE.Mesh(foamGeometry, foamMaterial);
      this.waterFoam.rotation.x = -Math.PI / 2;
      this.waterFoam.position.y = -0.15; // Slightly above water
      this.scene.add(this.waterFoam);
      this.foamTexture = WaterEffect.foamTexture;
    }
  }
  
  private loadCausticTextures() {
    // Load caustic textures for underwater light effects
    if (!WaterEffect.causticTextures) {
      WaterEffect.causticTextures = [];
      const causticCount = 16; // Number of caustic animation frames
      
      for (let i = 0; i < causticCount; i++) {
        const num = i < 10 ? `0${i}` : i;
        const url = `https://threejs.org/examples/textures/caustics/caustics_${num}.jpg`;
        
        const texture = WaterEffect.textureLoader!.load(url);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        WaterEffect.causticTextures.push(texture);
      }
      
      this.causticTextures = WaterEffect.causticTextures;
    } else {
      this.causticTextures = WaterEffect.causticTextures;
    }
    
    // Create caustic light
    this.causticLight = new THREE.DirectionalLight(0xffffff, 0.5);
    this.causticLight.position.set(0, 10, 0);
    this.causticLight.lookAt(0, 0, 0);
    this.scene.add(this.causticLight);
    
    // Create caustic projection mesh
    const causticGeometry = new THREE.PlaneGeometry(this.width, this.height);
    const causticMaterial = new THREE.MeshBasicMaterial({
      map: this.causticTextures[0],
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    this.causticMesh = new THREE.Mesh(causticGeometry, causticMaterial);
    this.causticMesh.rotation.x = -Math.PI / 2;
    this.causticMesh.position.y = -0.25; // Below water surface
    this.scene.add(this.causticMesh);
  }
  
  private getWaterColorForView(): number {
    switch (this.activeView) {
      case 'transport':
        return 0x00aaff;
      case 'land':
        return 0x3a7ca5;
      default:
        return 0x0066cc;
    }
  }
  
  public update(frameCount: number, performanceMode: boolean) {
    if (!this.water) return;
    
    // Update water shader time
    const waterUniforms = this.water.material.uniforms;
    if (waterUniforms.time) {
      waterUniforms.time.value += 1.0 / 60.0;
    }
    
    // Update foam texture animation
    if (this.waterFoam && this.foamTexture) {
      const time = Date.now() * 0.0005;
      this.foamTexture.offset.x = time * 0.05;
      this.foamTexture.offset.y = time * 0.08;
    }
    
    // Update caustics animation - change every 4 frames
    if (this.causticMesh && frameCount % 4 === 0) {
      this.causticIndex = (this.causticIndex + 1) % this.causticTextures.length;
      (this.causticMesh.material as THREE.MeshBasicMaterial).map = 
        this.causticTextures[this.causticIndex];
      
      // Pulse the caustic light intensity for more dynamic effect
      if (this.causticLight) {
        const pulseIntensity = 0.3 + 0.2 * Math.sin(frameCount * 0.05);
        this.causticLight.intensity = pulseIntensity;
      }
    }
    
    // Add Gerstner waves effect by modifying distortion scale
    if (waterUniforms.distortionScale) {
      const baseDistortion = 3.7;
      const waveVariation = Math.sin(frameCount * 0.01) * 0.5;
      waterUniforms.distortionScale.value = baseDistortion + waveVariation;
    }
  }
  
  public updateViewMode(activeView: ViewMode) {
    this.activeView = activeView;
    
    if (!this.water) return;
    
    // Update water color based on view mode
    const waterColor = this.getWaterColorForView();
    const waterUniforms = this.water.material.uniforms;
    
    if (waterUniforms.waterColor) {
      waterUniforms.waterColor.value.setHex(waterColor);
    }
    
    // Update opacity and other view-specific settings
    if (this.waterFoam) {
      (this.waterFoam.material as THREE.MeshBasicMaterial).opacity = 
        activeView === 'land' ? 0.3 : 0.2;
    }
    
    if (this.causticMesh) {
      (this.causticMesh.material as THREE.MeshBasicMaterial).opacity = 
        activeView === 'land' ? 0.4 : 0.3;
    }
  }

  public updateQuality(performanceMode: boolean) {
    this.performanceMode = performanceMode;
    
    if (!this.water) return;
    
    // Update water quality settings
    const waterUniforms = this.water.material.uniforms;
    
    // Adjust distortion scale based on performance mode
    if (waterUniforms.distortionScale) {
      waterUniforms.distortionScale.value = performanceMode ? 2.0 : 3.7;
    }
    
    // Show/hide foam and caustics based on performance mode
    if (this.waterFoam) {
      this.waterFoam.visible = !performanceMode;
    }
    
    if (this.causticMesh) {
      this.causticMesh.visible = !performanceMode;
    }
    
    if (this.causticLight) {
      this.causticLight.intensity = performanceMode ? 0 : 0.5;
    }
  }
  
  public cleanup() {
    // Remove water and related objects from scene
    if (this.water) {
      this.scene.remove(this.water);
      this.water.geometry.dispose();
      (this.water.material as THREE.Material).dispose();
    }
    
    if (this.waterFoam) {
      this.scene.remove(this.waterFoam);
      this.waterFoam.geometry.dispose();
      (this.waterFoam.material as THREE.Material).dispose();
    }
    
    if (this.causticMesh) {
      this.scene.remove(this.causticMesh);
      this.causticMesh.geometry.dispose();
      (this.causticMesh.material as THREE.Material).dispose();
    }
    
    if (this.causticLight) {
      this.scene.remove(this.causticLight);
    }
  }
}
