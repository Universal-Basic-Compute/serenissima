import * as THREE from 'three';
import { ViewMode } from './types';

interface WaterEffectProps {
  scene: THREE.Scene;
  activeView: ViewMode;
  performanceMode: boolean;
  width: number;
  height: number;
  renderer: THREE.WebGLRenderer;
}

export default class WaterEffect {
  private scene: THREE.Scene;
  private activeView: ViewMode;
  private performanceMode: boolean;
  private width: number;
  private height: number;
  private renderer: THREE.WebGLRenderer;
  private waterGeometry: THREE.PlaneGeometry;
  private waterMaterial: THREE.ShaderMaterial = new THREE.ShaderMaterial();
  private landPolygons: THREE.Mesh[] = [];
  private time: number = 0;
  private landPositions: Float32Array = new Float32Array();
  private landBuffer: THREE.BufferAttribute = new THREE.BufferAttribute(new Float32Array(), 3);
  private clock: THREE.Clock = new THREE.Clock();
  private sunReflection: THREE.Mesh | null = null;
  private water: any = null;
  private waterMesh: THREE.Mesh | null = null;
  private waterFoam: THREE.Mesh | null = null;
  private foamTexture: THREE.Texture | null = null;
  private shoreMesh: THREE.Mesh | null = null;
  private landRenderTarget: THREE.WebGLRenderTarget | null = null;
  private landCamera: THREE.OrthographicCamera | null = null;
  private causticMesh: THREE.Mesh | null = null;
  private causticLight: THREE.DirectionalLight | null = null;
  private causticTextures: THREE.Texture[] = [];
  private sunPosition: THREE.Vector3 = new THREE.Vector3();
  private sunDirection: THREE.Vector3 = new THREE.Vector3();
  private textureLoader: THREE.TextureLoader;
  private waterNormalMap: THREE.Texture | null = null;
  
  // Static properties
  private static textureLoader: THREE.TextureLoader | null = null;
  private static foamTexture: THREE.Texture | null = null;
  private static causticTextures: THREE.Texture[] | null = null;

  constructor({
    scene,
    activeView,
    performanceMode,
    width,
    height,
    renderer
  }: WaterEffectProps) {
    this.scene = scene;
    this.activeView = activeView;
    this.performanceMode = performanceMode;
    this.width = width;
    this.height = height;
    this.renderer = renderer;
    
    // Get the sun position from the scene if available
    const sunLight = this.scene.children.find(child => 
      child instanceof THREE.DirectionalLight && child !== this.causticLight
    ) as THREE.DirectionalLight | undefined;

    if (sunLight) {
      this.sunPosition = sunLight.position.clone();
    } else {
      // Default position if no sun light found
      this.sunPosition = new THREE.Vector3(100, 100, 100);
    }
    
    this.sunDirection = new THREE.Vector3()
      .copy(this.sunPosition)
      .normalize();
    
    // Use shared texture loader or create one if it doesn't exist
    if (!WaterEffect.textureLoader) {
      WaterEffect.textureLoader = new THREE.TextureLoader();
      WaterEffect.textureLoader.setCrossOrigin('anonymous');
    }
    this.textureLoader = WaterEffect.textureLoader || new THREE.TextureLoader();
    
    // Create a simple placeholder water plane initially
    this.waterGeometry = new THREE.PlaneGeometry(
      width, 
      height, 
      performanceMode ? 4 : 16
    );
    
    // Create a fallback texture for water normal map
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#8080ff'; // Blue color for normal map
      ctx.fillRect(0, 0, 128, 128);
    }
    const fallbackTexture = new THREE.CanvasTexture(canvas);
    fallbackTexture.wrapS = THREE.RepeatWrapping;
    fallbackTexture.wrapT = THREE.RepeatWrapping;
    fallbackTexture.repeat.set(10, 10);
    this.waterNormalMap = fallbackTexture;
    
    // Initialize water immediately instead of with delay
    this.initializeWater();
  }
  
  // Add method to create a sun reflection
  private createSunReflection() {
    console.log('Sun reflection creation disabled');
    // No geometry generation
  }
  
  // Add method for Gerstner waves
  private applyGerstnerWaves(time: number) {
    try {
      if (!this.water || !this.water.material || !this.water.material.uniforms) {
        return;
      }
      
      const waterUniforms = this.water.material.uniforms;
      
      // Apply to distortion scale with null check
      if (waterUniforms.distortionScale && 
          typeof waterUniforms.distortionScale !== 'undefined' && 
          typeof waterUniforms.distortionScale.value !== 'undefined') {
        try {
          // Enhanced wave pattern with multiple frequencies
          const baseDistortion = 3.0;
          const variation = 
            Math.sin(time) * 0.15 + 
            Math.cos(time * 0.5) * 0.1 + 
            Math.sin(time * 0.25) * 0.05;
          waterUniforms.distortionScale.value = baseDistortion + variation;
        } catch (error) {
          // Silent fail
        }
      }
      
      // Also modify the normal map scale for more variation with null check
      if (waterUniforms.size && 
          typeof waterUniforms.size !== 'undefined' && 
          typeof waterUniforms.size.value !== 'undefined') {
        try {
          const baseSize = 4.0;
          // More complex variation pattern
          const sizeVariation = 
            Math.sin(time * 0.01) * 0.15 + 
            Math.cos(time * 0.02) * 0.1;
          waterUniforms.size.value = baseSize + sizeVariation;
        } catch (error) {
          // Silent fail
        }
      }
      
      // Add subtle color variation if available
      if (waterUniforms.waterColor && 
          typeof waterUniforms.waterColor !== 'undefined' && 
          typeof waterUniforms.waterColor.value !== 'undefined') {
        try {
          // Get base color
          const baseColor = new THREE.Color(this.getWaterColorForView());
          
          // Add subtle variation
          const r = baseColor.r + Math.sin(time * 0.1) * 0.02;
          const g = baseColor.g + Math.cos(time * 0.15) * 0.02;
          const b = baseColor.b + Math.sin(time * 0.2) * 0.02;
          
          waterUniforms.waterColor.value.setRGB(r, g, b);
        } catch (error) {
          // Silent fail
        }
      }
    } catch (error) {
      // Silent fail
    }
  }
  
  // Add method to create shore interaction effect
  private createShoreInteraction() {
    console.log('Shore interaction creation disabled');
    // No geometry generation
  }
  
  private initializeWater() {
    console.log('Water initialization disabled');
    // No water geometry generation
  }
  
  // Add a new method to create wave displacement
  private addWaveDisplacement(geometry: THREE.PlaneGeometry) {
    // No wave displacement
    console.log('Wave displacement disabled');
  }
  
  private loadFoamTexture() {
    if (!WaterEffect.foamTexture) {
      WaterEffect.foamTexture = WaterEffect.textureLoader!.load(
        'https://threejs.org/examples/textures/foam.jpg',
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(20, 20); // Reduced repeat for less visual noise
          
          // Create foam mesh with lower opacity
          const foamGeometry = new THREE.PlaneGeometry(this.width * 1.5, this.height * 1.5);
          const foamMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.3, // Reduced opacity to minimize flickering
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true
          });
          
          this.waterFoam = new THREE.Mesh(foamGeometry, foamMaterial);
          this.waterFoam.rotation.x = -Math.PI / 2;
          this.waterFoam.position.y = -0.25; // Position lower to avoid z-fighting
          this.waterFoam.renderOrder = 1; // Same render order as water
          this.scene.add(this.waterFoam);
          this.foamTexture = texture;
        }
      );
    } else {
      // Use cached foam texture with lower opacity
      const foamGeometry = new THREE.PlaneGeometry(this.width * 1.5, this.height * 1.5);
      const foamMaterial = new THREE.MeshBasicMaterial({
        map: WaterEffect.foamTexture,
        transparent: true,
        opacity: 0.3, // Reduced opacity
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true
      });
      
      this.waterFoam = new THREE.Mesh(foamGeometry, foamMaterial);
      this.waterFoam.rotation.x = -Math.PI / 2;
      this.waterFoam.position.y = -0.25; // Position lower
      this.waterFoam.renderOrder = 1; // Same render order as water
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
  
  // Add method to create a more realistic water surface
  private createRealisticWaterSurface() {
    if (!this.water || this.performanceMode) return;
    
    try {
      // Add subtle height variation to water geometry for more realistic waves
      const waterGeometry = this.water.geometry as THREE.PlaneGeometry;
      const position = waterGeometry.attributes.position;
      
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const z = position.getZ(i);
        
        // Add very subtle height variation based on position
        // This creates a gentle undulating effect
        const height = 
          Math.sin(x * 0.05) * 0.1 + 
          Math.cos(z * 0.04) * 0.1 +
          Math.sin(x * 0.03 + z * 0.02) * 0.05;
        
        position.setY(i, height);
      }
      
      // Update geometry
      position.needsUpdate = true;
      waterGeometry.computeVertexNormals();
    } catch (error) {
      console.warn('Error creating realistic water surface:', error);
    }
  }
  
  // Add method to create water
  public createWater() {
    console.log('Water creation disabled');
    // No water geometry generation
  }
  
  // Add helper method to create a simple water plane
  private createSimpleWaterPlane() {
    console.log('Simple water plane creation disabled');
    // No water geometry generation
  }
  
  public update(frameCount: number, performanceMode: boolean) {
    try {
      // Skip all updates if water isn't properly initialized
      if (!this.waterMesh) {
        return;
      }
      
      // Animate water waves by updating vertex positions
      if (frameCount % 5 === 0 && this.waterMesh.geometry) {
        try {
          const positions = this.waterMesh.geometry.attributes.position.array;
          const time = frameCount * 0.01;
          
          for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 2];
            
            // Create dynamic waves using time-based sine functions
            positions[i + 1] = 
              Math.sin(x * 0.5 + time) * 0.2 + 
              Math.cos(z * 0.5 + time * 0.8) * 0.2;
          }
          
          // Update geometry
          this.waterMesh.geometry.attributes.position.needsUpdate = true;
        } catch (error) {
          // Silent fail
        }
      }
      
      // Animate sun reflection with additional checks
      if (frameCount % 15 === 0 && this.sunReflection && this.sunReflection.scale) {
        try {
          const reflectionScale = 1.0 + Math.sin(frameCount * 0.01) * 0.05;
          this.sunReflection.scale.set(reflectionScale, reflectionScale, 1);
        } catch (error) {
          // Silent fail
        }
      }
      
      // Update shore interaction with better error handling
      if (this.shoreMesh && this.shoreMesh.material) {
        try {
          // Update shore material time uniform for wave animation
          const shoreMaterial = this.shoreMesh.material as THREE.ShaderMaterial;
          if (shoreMaterial.userData && shoreMaterial.userData.uniforms && shoreMaterial.userData.uniforms.time) {
            // Use a smoother time increment for more fluid animation
            shoreMaterial.userData.uniforms.time.value = frameCount * 0.005;
            shoreMaterial.needsUpdate = true;
          }
        } catch (error) {
          // Silent fail
        }
      }
    } catch (error) {
      // Silent fail for the entire update method
    }
  }
  
  public updateViewMode(activeView: ViewMode) {
    // Skip update if view hasn't changed
    if (this.activeView === activeView) return;
    
    this.activeView = activeView;
    
    // Get the water color for the new view
    const waterColor = this.getWaterColorForView();
    
    // Update water mesh color if it exists
    if (this.waterMesh && this.waterMesh.material) {
      try {
        (this.waterMesh.material as THREE.MeshBasicMaterial).color.setHex(waterColor);
        (this.waterMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
      } catch (error) {
        console.error('Error updating water color in view mode change:', error);
      }
    }
    
    // Update shore interaction color if it exists
    if (this.shoreMesh && this.shoreMesh.material) {
      try {
        const shoreMaterial = this.shoreMesh.material as THREE.ShaderMaterial;
        if (shoreMaterial.userData && shoreMaterial.userData.uniforms && shoreMaterial.userData.uniforms.waterColor) {
          shoreMaterial.userData.uniforms.waterColor.value = new THREE.Color(waterColor);
          shoreMaterial.needsUpdate = true;
        }
      } catch (error) {
        console.error('Error updating shore material color:', error);
      }
    }
    
    // Keep foam and caustics disabled regardless of view mode
    if (this.waterFoam) {
      try {
        (this.waterFoam.material as THREE.MeshBasicMaterial).opacity = 0;
      } catch (error) {
        console.error('Error updating water foam opacity:', error);
      }
    }
    
    if (this.causticMesh) {
      try {
        (this.causticMesh.material as THREE.MeshBasicMaterial).opacity = 0;
      } catch (error) {
        console.error('Error updating caustic mesh opacity:', error);
      }
    }
    
    if (this.causticLight) {
      try {
        this.causticLight.intensity = 0;
      } catch (error) {
        console.error('Error updating caustic light intensity:', error);
      }
    }
  }

  public updateQuality(performanceMode: boolean) {
    this.performanceMode = performanceMode;
    
    // Add more robust null checks
    if (!this.water || !this.water.material || !this.water.material.uniforms) {
      console.log('Water not fully initialized, skipping quality update');
      return;
    }
    
    // Update water quality settings with additional null checks
    const waterUniforms = this.water.material.uniforms;
    
    // Adjust distortion scale based on performance mode with null check
    if (waterUniforms && waterUniforms.distortionScale && waterUniforms.distortionScale.value !== undefined) {
      waterUniforms.distortionScale.value = performanceMode ? 2.0 : 3.7;
    }
    
    // Show/hide foam and caustics based on performance mode with null checks
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
    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
      if (this.waterMesh.geometry) this.waterMesh.geometry.dispose();
      if (this.waterMesh.material) {
        if (Array.isArray(this.waterMesh.material)) {
          this.waterMesh.material.forEach(m => m.dispose());
        } else {
          this.waterMesh.material.dispose();
        }
      }
    }
    
    if (this.waterFoam) {
      this.scene.remove(this.waterFoam);
      if (this.waterFoam.geometry) this.waterFoam.geometry.dispose();
      if (this.waterFoam.material) {
        if (Array.isArray(this.waterFoam.material)) {
          this.waterFoam.material.forEach(m => m.dispose());
        } else {
          this.waterFoam.material.dispose();
        }
      }
    }
    
    if (this.causticMesh) {
      this.scene.remove(this.causticMesh);
      if (this.causticMesh.geometry) this.causticMesh.geometry.dispose();
      if (this.causticMesh.material) {
        if (Array.isArray(this.causticMesh.material)) {
          this.causticMesh.material.forEach(m => m.dispose());
        } else {
          this.causticMesh.material.dispose();
        }
      }
    }
    
    if (this.causticLight) {
      this.scene.remove(this.causticLight);
    }
    
    if (this.sunReflection) {
      this.scene.remove(this.sunReflection);
      if (this.sunReflection.geometry) this.sunReflection.geometry.dispose();
      if (this.sunReflection.material) {
        if (Array.isArray(this.sunReflection.material)) {
          this.sunReflection.material.forEach(m => m.dispose());
        } else {
          this.sunReflection.material.dispose();
        }
      }
    }
    
    // Clean up shore interaction
    if (this.shoreMesh) {
      this.scene.remove(this.shoreMesh);
      if (this.shoreMesh.geometry) this.shoreMesh.geometry.dispose();
      if (this.shoreMesh.material) {
        if (Array.isArray(this.shoreMesh.material)) {
          this.shoreMesh.material.forEach(m => m.dispose());
        } else {
          this.shoreMesh.material.dispose();
        }
      }
    }
    
    if (this.landRenderTarget) {
      this.landRenderTarget.dispose();
    }
    
    // Clear references
    this.waterMesh = null;
    this.water = null;
  }
}
