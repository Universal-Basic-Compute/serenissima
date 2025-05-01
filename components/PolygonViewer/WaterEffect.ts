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
  private sunReflection: THREE.Mesh | null = null;

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
    
    // Initialize water immediately instead of with delay
    this.initializeWater();
  }
  
  // Add method to create a sun reflection
  private createSunReflection() {
    // Create a circular highlight that will represent the sun's reflection
    const reflectionGeometry = new THREE.CircleGeometry(15, 32);
    const reflectionMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffee,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    this.sunReflection = new THREE.Mesh(reflectionGeometry, reflectionMaterial);
    this.sunReflection.rotation.x = -Math.PI / 2;
    this.sunReflection.position.set(50, -0.1, 50); // Position based on sun direction
    this.scene.add(this.sunReflection);
  }
  
  // Add method for Gerstner waves
  private applyGerstnerWaves(time: number) {
    if (!this.water) return;
    
    const waterUniforms = this.water.material.uniforms;
    
    // Base distortion
    const baseDistortion = 8.0;
    
    // Multiple wave frequencies for more complex patterns
    const wave1 = Math.sin(time * 0.1) * 1.5;
    const wave2 = Math.cos(time * 0.2) * 0.8;
    const wave3 = Math.sin(time * 0.05) * 1.2;
    
    // Combine waves for a more natural effect
    const combinedWaves = wave1 + wave2 + wave3;
    
    // Apply to distortion scale
    if (waterUniforms.distortionScale) {
      waterUniforms.distortionScale.value = baseDistortion + combinedWaves;
    }
    
    // Also modify the normal map scale for more variation
    if (waterUniforms.size) {
      const baseSize = 4.0;
      const sizeVariation = Math.sin(time * 0.03) * 0.5;
      waterUniforms.size.value = baseSize + sizeVariation;
    }
  }
  
  private initializeWater() {
    // Use lower resolution textures in performance mode
    const textureSize = this.performanceMode ? 256 : 512; // Reduced from 1024
    
    // Load or use cached normal map
    if (!WaterEffect.waterNormalMapTexture) {
      WaterEffect.waterNormalMapTexture = WaterEffect.textureLoader!.load(
        this.performanceMode ? 
          'https://threejs.org/examples/textures/waternormals_small.jpg' : 
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
      textureWidth: this.performanceMode ? 128 : 512, // Reduced from 256/1024
      textureHeight: this.performanceMode ? 128 : 512,
      waterNormals: this.waterNormalMap,
      sunDirection: this.sunDirection,
      sunColor: 0xffffff,
      waterColor: 0x001e0f, // Darker blue-green color for better contrast
      distortionScale: 3.0, // Reduced distortion
      fog: this.scene.fog !== undefined,
      format: THREE.RGBAFormat
    };
    
    // Increase water geometry size to ensure it covers the entire scene
    this.waterGeometry = new THREE.PlaneGeometry(
      this.width * 2, 
      this.height * 2, 
      this.performanceMode ? 2 : 8
    );
    
    // Create the water mesh
    this.water = new Water(this.waterGeometry, waterOptions);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -0.2; // Lower water level to avoid z-fighting with land
    
    // Add the water to the scene
    this.scene.add(this.water);
    
    // Load foam texture for wave crests
    if (!this.performanceMode) {
      this.loadFoamTexture();
      this.loadCausticTextures();
      this.createSunReflection();
    }
  }
  
  private loadFoamTexture() {
    if (!WaterEffect.foamTexture) {
      WaterEffect.foamTexture = WaterEffect.textureLoader!.load(
        'https://threejs.org/examples/textures/foam.jpg',
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(40, 40);
          
          // Create foam mesh with ZERO opacity - effectively disabling it
          const foamGeometry = new THREE.PlaneGeometry(this.width * 1.2, this.height * 1.2);
          const foamMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0, // Set to 0 to completely hide the foam
            blending: THREE.NoBlending, // Change blending mode
            depthWrite: false
          });
          
          this.waterFoam = new THREE.Mesh(foamGeometry, foamMaterial);
          this.waterFoam.rotation.x = -Math.PI / 2;
          this.waterFoam.position.y = -0.15;
          this.scene.add(this.waterFoam);
          this.foamTexture = texture;
        }
      );
    } else {
      // Use cached foam texture but with zero opacity
      const foamGeometry = new THREE.PlaneGeometry(this.width * 1.2, this.height * 1.2);
      const foamMaterial = new THREE.MeshBasicMaterial({
        map: WaterEffect.foamTexture,
        transparent: true,
        opacity: 0, // Set to 0 to completely hide the foam
        blending: THREE.NoBlending, // Change blending mode
        depthWrite: false
      });
      
      this.waterFoam = new THREE.Mesh(foamGeometry, foamMaterial);
      this.waterFoam.rotation.x = -Math.PI / 2;
      this.waterFoam.position.y = -0.15;
      this.scene.add(this.waterFoam);
      this.foamTexture = WaterEffect.foamTexture;
    }
  }
  
  private loadCausticTextures() {
    // Load caustic textures for underwater light effects
    if (!WaterEffect.causticTextures) {
      WaterEffect.causticTextures = [];
      const causticCount = 16;
      
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
    
    // Create caustic light with zero intensity (effectively disabled)
    this.causticLight = new THREE.DirectionalLight(0xffffff, 0);
    this.causticLight.position.set(0, 10, 0);
    this.causticLight.lookAt(0, 0, 0);
    this.scene.add(this.causticLight);
    
    // Create caustic projection mesh with zero opacity
    const causticGeometry = new THREE.PlaneGeometry(this.width, this.height);
    const causticMaterial = new THREE.MeshBasicMaterial({
      map: this.causticTextures[0],
      transparent: true,
      opacity: 0, // Set to 0 to completely hide caustics
      blending: THREE.NoBlending, // Change blending mode
      depthWrite: false
    });
    
    this.causticMesh = new THREE.Mesh(causticGeometry, causticMaterial);
    this.causticMesh.rotation.x = -Math.PI / 2;
    this.causticMesh.position.y = -0.25;
    this.scene.add(this.causticMesh);
  }
  
  private getWaterColorForView(): number {
    switch (this.activeView) {
      case 'transport':
        return 0x1a8cff; // Brighter, more saturated blue
      case 'land':
        return 0x2c85c1; // Slightly deeper blue with a hint of teal
      default:
        return 0x0055aa; // Rich deep blue
    }
  }
  
  public update(frameCount: number, performanceMode: boolean) {
    if (!this.water) return;
    
    // Skip updates in performance mode
    if (performanceMode && frameCount % 2 !== 0) return;
    
    // Get current time for animations
    const time = frameCount * 0.05;
    
    // Update water shader time
    const waterUniforms = this.water.material.uniforms;
    if (waterUniforms.time) {
      // Slower time progression for more majestic waves
      waterUniforms.time.value += 1.0 / 120.0;
    }
    
    // Apply Gerstner waves
    this.applyGerstnerWaves(time);
    
    // Update foam texture animation
    if (this.waterFoam && this.foamTexture) {
      this.foamTexture.offset.x = time * 0.03;
      this.foamTexture.offset.y = time * 0.04;
    }
    
    // Update caustics animation - change every 4 frames
    if (this.causticMesh && frameCount % 4 === 0) {
      this.causticIndex = (this.causticIndex + 1) % this.causticTextures.length;
      (this.causticMesh.material as THREE.MeshBasicMaterial).map = 
        this.causticTextures[this.causticIndex];
      
      // Pulse the caustic light intensity for more dynamic effect
      if (this.causticLight) {
        const pulseIntensity = 0.3 + 0.2 * Math.sin(time * 0.5);
        this.causticLight.intensity = pulseIntensity;
      }
    }
    
    // Update sun reflection if it exists
    if (this.sunReflection) {
      const scaleVariation = 1 + 0.1 * Math.sin(time * 0.4);
      this.sunReflection.scale.set(scaleVariation, 1, scaleVariation);
      
      // Vary opacity for a shimmering effect
      const opacityVariation = 0.3 + 0.1 * Math.sin(time * 0.6);
      (this.sunReflection.material as THREE.MeshBasicMaterial).opacity = opacityVariation;
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
    
    // Keep foam and caustics disabled regardless of view mode
    if (this.waterFoam) {
      (this.waterFoam.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    
    if (this.causticMesh) {
      (this.causticMesh.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    
    if (this.causticLight) {
      this.causticLight.intensity = 0;
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
    
    if (this.sunReflection) {
      this.scene.remove(this.sunReflection);
      this.sunReflection.geometry.dispose();
      (this.sunReflection.material as THREE.Material).dispose();
    }
  }
}
