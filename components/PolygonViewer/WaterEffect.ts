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
    // Create a completely invisible water plane
    const waterOptions = {
      textureWidth: 1,
      textureHeight: 1,
      waterNormals: this.waterNormalMap,
      sunDirection: this.sunDirection,
      sunColor: 0xffffff,
      waterColor: 0x001e0f,
      distortionScale: 0, // Set to 0 to remove distortion
      fog: false, // Disable fog
      format: THREE.RGBAFormat
    };
    
    // Create minimal geometry
    this.waterGeometry = new THREE.PlaneGeometry(0, 0);
    
    // Create the water mesh but make it invisible
    this.water = new Water(this.waterGeometry, waterOptions);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -100; // Move far below the scene
    this.water.visible = false; // Make it invisible
    
    // Add the water to the scene (though it's invisible)
    this.scene.add(this.water);
    
    // Don't load any additional effects
    // this.loadFoamTexture();
    // this.loadCausticTextures();
    // this.createSunReflection();
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
    // Do nothing - all water effects disabled
    return;
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
