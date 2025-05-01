import * as THREE from 'three';
import { ViewMode } from './types';
import { Water } from 'three/examples/jsm/objects/Water.js';

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
  private shoreMesh: THREE.Mesh | null = null;
  private landRenderTarget: THREE.WebGLRenderTarget | null = null;
  private landCamera: THREE.OrthographicCamera | null = null;
  private renderer: THREE.WebGLRenderer;

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
    // Get the sun position projected onto the water plane
    const sunProjection = new THREE.Vector3();
    sunProjection.copy(this.sunPosition);
    
    // Scale down the position to fit within the water plane
    const maxDimension = Math.max(this.width, this.height);
    const scale = maxDimension / (2 * sunProjection.length());
    sunProjection.multiplyScalar(scale * 0.5);
    
    // Keep only the X and Z components for the water plane
    sunProjection.y = -0.1; // Just above water level
    
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
    this.sunReflection.position.copy(sunProjection);
    this.scene.add(this.sunReflection);
  }
  
  // Add method for Gerstner waves
  private applyGerstnerWaves(time: number) {
    if (!this.water) return;
    
    const waterUniforms = this.water.material.uniforms;
    
    // Base distortion
    const baseDistortion = 8.0;
    
    // Multiple wave frequencies for more complex patterns - reduced frequencies to slow down
    const wave1 = Math.sin(time * 0.05) * 1.5;  // Reduced from 0.1
    const wave2 = Math.cos(time * 0.1) * 0.8;   // Reduced from 0.2
    const wave3 = Math.sin(time * 0.025) * 1.2; // Reduced from 0.05
    
    // Combine waves for a more natural effect
    const combinedWaves = wave1 + wave2 + wave3;
    
    // Apply to distortion scale
    if (waterUniforms.distortionScale) {
      waterUniforms.distortionScale.value = baseDistortion + combinedWaves;
    }
    
    // Also modify the normal map scale for more variation
    if (waterUniforms.size) {
      const baseSize = 4.0;
      const sizeVariation = Math.sin(time * 0.015) * 0.5; // Reduced from 0.03
      waterUniforms.size.value = baseSize + sizeVariation;
    }
  }
  
  // Add method to create shore interaction effect
  private createShoreInteraction() {
    // Create a shader material that will highlight the shore areas
    const shoreGeometry = new THREE.PlaneGeometry(this.width * 1.5, this.height * 1.5, 128, 128); // Reduced complexity
    
    // Custom shader material for shore effect with improved visibility
    const shoreMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(0xffffff) },
        landTexture: { value: null },
        waterColor: { value: new THREE.Color(this.getWaterColorForView()) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color;
        uniform vec3 waterColor;
        uniform sampler2D landTexture;
        varying vec2 vUv;
        
        void main() {
          // Sample the land texture
          vec4 landColor = texture2D(landTexture, vUv);
          
          // Calculate distance to land - use all channels for better detection
          float landDistance = 1.0 - max(max(landColor.r, landColor.g), landColor.b);
          
          // Create more dynamic wave patterns - reduced frequency to slow down waves
          float wave1 = sin(time * 0.5 + vUv.x * 10.0 + vUv.y * 8.0) * 0.5 + 0.5;
          float wave2 = cos(time * 0.75 - vUv.x * 8.0 + vUv.y * 6.0) * 0.5 + 0.5;
          float wave = mix(wave1, wave2, 0.5);
          
          // Create a wider, more visible shore effect with foam
          float shoreMask = smoothstep(0.0, 0.3, landDistance) * (1.0 - smoothstep(0.3, 0.6, landDistance));
          
          // Add foam color with more white
          vec3 foamColor = mix(waterColor, vec3(1.0, 1.0, 1.0), 0.8);
          
          // Final color with higher opacity for visibility
          gl_FragColor = vec4(foamColor, shoreMask * wave * 0.7);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    });
    
    this.shoreMesh = new THREE.Mesh(shoreGeometry, shoreMaterial);
    this.shoreMesh.rotation.x = -Math.PI / 2;
    this.shoreMesh.position.y = -0.15; // Position lower to avoid z-fighting with land
    this.shoreMesh.renderOrder = 2; // Lower render order to ensure it renders before land
    this.scene.add(this.shoreMesh);
    
    // Create lower resolution render target for better performance
    this.landRenderTarget = new THREE.WebGLRenderTarget(512, 512, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    });
    
    // Create camera for rendering land texture
    this.landCamera = new THREE.OrthographicCamera(
      -this.width/2, this.width/2, 
      this.height/2, -this.height/2, 
      0.1, 1000
    );
    this.landCamera.position.y = 10;
    this.landCamera.lookAt(0, 0, 0);
  }
  
  private initializeWater() {
    // Load water textures if not already loaded
    if (!WaterEffect.waterNormalMapTexture) {
      WaterEffect.waterNormalMapTexture = WaterEffect.textureLoader!.load(
        'https://threejs.org/examples/textures/waternormals.jpg',
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(10, 10);
        }
      );
    }
    
    this.waterNormalMap = WaterEffect.waterNormalMapTexture;
    
    // Create proper water geometry that matches the scene size
    this.waterGeometry = new THREE.PlaneGeometry(
      this.width * 1.5, 
      this.height * 1.5,
      this.performanceMode ? 16 : 32  // Reduced complexity for better performance
    );
    
    // Create water with proper options
    const waterOptions = {
      textureWidth: this.performanceMode ? 256 : 512, // Reduced resolution
      textureHeight: this.performanceMode ? 256 : 512,
      waterNormals: this.waterNormalMap,
      sunDirection: this.sunDirection,
      sunColor: 0xffffff,
      waterColor: this.getWaterColorForView(),
      distortionScale: this.performanceMode ? 2.0 : 3.0, // Reduced distortion
      fog: false,
      format: THREE.RGBAFormat
    };
    
    this.water = new Water(this.waterGeometry, waterOptions);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -0.6; // Changed from -0.5 to -0.6 to avoid z-fighting
    this.water.renderOrder = 1; // Ensure water renders before land
    this.water.visible = true;
    
    // Add the water to the scene
    this.scene.add(this.water);
    
    // Add shore foam effect
    this.loadFoamTexture();
    
    // Add sun reflection
    this.createSunReflection();
    
    // Create shore interaction effect
    this.createShoreInteraction();
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
      case 'land':
        return 0x20b2aa; // Light sea green for tropical island feel
      default:
        return 0x0088cc; // Deeper turquoise
    }
  }
  
  public update(frameCount: number, performanceMode: boolean) {
    if (!this.water) return;
    
    // Get water uniforms
    const waterUniforms = this.water.material?.uniforms;
    if (!waterUniforms) return;
    
    // Animate water - reduce values even further to slow down the water
    if (waterUniforms.time) {
      waterUniforms.time.value += performanceMode ? 0.001 : 0.002; // Reduced from 0.0025/0.005
    }
    
    // Apply Gerstner waves for more natural water movement - reduce frequency
    this.applyGerstnerWaves(frameCount * 0.01); // Reduced from 0.025
    
    // Animate foam if it exists - slow down the foam movement more
    if (this.waterFoam && this.foamTexture && this.foamTexture.offset) {
      this.foamTexture.offset.x += 0.0001; // Reduced from 0.00025
      this.foamTexture.offset.y += 0.00005; // Reduced from 0.00015
    }
    
    // Animate sun reflection
    if (this.sunReflection) {
      const reflectionScale = 1.0 + Math.sin(frameCount * 0.02) * 0.1;
      this.sunReflection.scale.set(reflectionScale, reflectionScale, 1);
      
      // Slightly move the reflection to simulate water movement
      const basePosition = new THREE.Vector3();
      basePosition.copy(this.sunReflection.position);
      
      const offsetX = Math.sin(frameCount * 0.01) * 5;
      const offsetZ = Math.cos(frameCount * 0.015) * 5;
      
      this.sunReflection.position.x = basePosition.x + offsetX;
      this.sunReflection.position.z = basePosition.z + offsetZ;
    }
    
    // Update shore interaction much less frequently to reduce flickering
    if (this.shoreMesh && this.landRenderTarget && frameCount % 10 === 0) { // Changed from 3 to 10
      // Update time uniform with slower rate
      (this.shoreMesh.material as THREE.ShaderMaterial).uniforms.time.value = frameCount * 0.02; // Reduced from 0.05
      
      try {
        // Render land to texture
        const originalBackground = this.scene.background;
        this.scene.background = new THREE.Color(0x000000);
        
        // Hide water and shore for land rendering
        const waterVisible = this.water.visible;
        const foamVisible = this.waterFoam ? this.waterFoam.visible : false;
        const shoreVisible = this.shoreMesh.visible;
        
        this.water.visible = false;
        if (this.waterFoam) this.waterFoam.visible = false;
        this.shoreMesh.visible = false;
        
        // Save current render target
        const currentRenderTarget = this.renderer.getRenderTarget();
        
        // Render land to texture
        this.renderer.setRenderTarget(this.landRenderTarget);
        this.renderer.clear(); // Clear the render target first
        this.renderer.render(this.scene, this.landCamera);
        
        // Restore original render target
        this.renderer.setRenderTarget(currentRenderTarget);
        
        // Restore visibility
        this.water.visible = waterVisible;
        if (this.waterFoam) this.waterFoam.visible = foamVisible;
        this.shoreMesh.visible = shoreVisible;
        
        // Restore background
        this.scene.background = originalBackground;
        
        // Update land texture uniform
        (this.shoreMesh.material as THREE.ShaderMaterial).uniforms.landTexture.value = this.landRenderTarget.texture;
        
        // Update water color uniform in shore material
        if ((this.shoreMesh.material as THREE.ShaderMaterial).uniforms.waterColor) {
          (this.shoreMesh.material as THREE.ShaderMaterial).uniforms.waterColor.value.setHex(this.getWaterColorForView());
        }
      } catch (error) {
        console.error('Error rendering shore interaction:', error);
      }
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
    
    // Clean up shore interaction
    if (this.shoreMesh) {
      this.scene.remove(this.shoreMesh);
      this.shoreMesh.geometry.dispose();
      (this.shoreMesh.material as THREE.Material).dispose();
    }
    
    if (this.landRenderTarget) {
      this.landRenderTarget.dispose();
    }
  }
}
