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
    this.textureLoader = WaterEffect.textureLoader;
    
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
    // Create a shader material that will highlight the shore areas
    const shoreGeometry = new THREE.PlaneGeometry(this.width * 1.5, this.height * 1.5, 128, 128); // Reduced complexity
    
    // Initialize uniforms explicitly
    const shoreUniforms = {
      time: { value: 0 },
      color: { value: new THREE.Color(0xffffff) },
      landTexture: { value: null },
      waterColor: { value: new THREE.Color(this.getWaterColorForView()) }
    };
    
    // Custom shader material for shore effect with improved visibility
    const shoreMaterial = new THREE.ShaderMaterial({
      uniforms: shoreUniforms,
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
          
          // Create more dynamic wave patterns with varying frequencies
          float wave1 = sin(time * 0.5 + vUv.x * 10.0 + vUv.y * 8.0) * 0.5 + 0.5;
          float wave2 = cos(time * 0.75 - vUv.x * 8.0 + vUv.y * 6.0) * 0.5 + 0.5;
          float wave3 = sin(time * 0.3 + vUv.x * 5.0 - vUv.y * 7.0) * 0.5 + 0.5;
          
          // Mix waves for more natural look
          float wave = mix(mix(wave1, wave2, 0.5), wave3, 0.3);
          
          // Enhanced shore effect with more dynamic foam
          float shoreMask = smoothstep(0.0, 0.2, landDistance) * (1.0 - smoothstep(0.2, 0.6, landDistance));
          
          // Create more dynamic foam near shores
          float foamIntensity = shoreMask * (
            0.8 + 
            0.2 * sin(time * 0.8 + vUv.x * 20.0 + vUv.y * 15.0) + 
            0.3 * cos(time * 0.5 - vUv.x * 15.0 + vUv.y * 10.0)
          );
          
          // Add foam color with more white and slight blue tint
          vec3 foamColor = mix(waterColor, vec3(0.98, 0.99, 1.0), 0.9);
          
          // Add subtle variation to foam based on position
          float foamVariation = sin(vUv.x * 40.0) * sin(vUv.y * 40.0) * 0.15 + 0.85;
          
          // Final color with higher opacity for visibility and variation
          gl_FragColor = vec4(foamColor * foamVariation, foamIntensity * wave * 0.9);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    });
    
    // Store a reference to the uniforms for easier access
    shoreMaterial.userData = { uniforms: shoreUniforms };
    
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
    try {
      // Create proper water geometry that matches the scene size
      this.waterGeometry = new THREE.PlaneGeometry(
        this.width * 1.5, 
        this.height * 1.5,
        this.performanceMode ? 8 : 32  // Increased resolution for high quality mode
      );
      
      // Try to load the actual texture, but don't wait for it
      this.textureLoader.load(
        '/textures/waternormals.jpg',
        (texture) => {
          console.log('Water normal map loaded successfully');
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(10, 10);
          this.waterNormalMap = texture;
          
          // If water already exists, update its normal map
          if (this.water && this.water.material && this.water.material.uniforms && this.water.material.uniforms.normalSampler) {
            this.water.material.uniforms.normalSampler.value = texture;
          }
        },
        (xhr) => {
          console.log(`Water normal map loading: ${(xhr.loaded / xhr.total) * 100}% loaded`);
        },
        (error) => {
          console.warn('Could not load water normal map from primary path:', error);
          // Try alternative path without leading slash
          this.textureLoader.load(
            'textures/waternormals.jpg',
            (texture) => {
              console.log('Water normal map loaded from alternative path');
              texture.wrapS = THREE.RepeatWrapping;
              texture.wrapT = THREE.RepeatWrapping;
              texture.repeat.set(10, 10);
              this.waterNormalMap = texture;
              
              if (this.water && this.water.material && this.water.material.uniforms && this.water.material.uniforms.normalSampler) {
                this.water.material.uniforms.normalSampler.value = texture;
              }
            },
            undefined,
            (secondError) => {
              console.warn('Could not load water normal map from alternative path, using fallback:', secondError);
              // We already have the fallback texture set, so no need to do anything here
            }
          );
        }
      );
      
      // Create water with proper options
      const waterOptions = {
        textureWidth: this.performanceMode ? 128 : 512, // Increased resolution for high quality
        textureHeight: this.performanceMode ? 128 : 512,
        waterNormals: this.waterNormalMap,
        sunDirection: this.sunDirection,
        sunColor: 0xffffff,
        waterColor: this.getWaterColorForView(),
        distortionScale: this.performanceMode ? 1.0 : 3.0, // Increased distortion for high quality
        fog: false,
        format: THREE.RGBAFormat
      };
      
      this.water = new Water(this.waterGeometry, waterOptions);
      this.water.rotation.x = -Math.PI / 2;
      this.water.position.y = -0.7; // Lower position to avoid z-fighting
      this.water.renderOrder = 1;
      this.water.visible = true;
      
      // Add the water to the scene
      this.scene.add(this.water);
      
      // Skip foam and caustics in all cases to reduce errors
      
      // Add sun reflection with a delay to ensure water is properly initialized
      setTimeout(() => {
        try {
          this.createSunReflection();
        } catch (error) {
          console.error('Error creating sun reflection:', error);
        }
      }, 1000);
      
      // Add shore interaction with a delay to ensure water is properly initialized
      setTimeout(() => {
        try {
          this.createShoreInteraction();
        } catch (error) {
          console.error('Error creating shore interaction:', error);
        }
      }, 1500);
      
      // Create realistic water surface with a delay
      if (!this.performanceMode) {
        setTimeout(() => {
          try {
            this.createRealisticWaterSurface();
          } catch (error) {
            console.error('Error creating realistic water surface:', error);
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Error initializing water:', error);
    }
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
  
  public update(frameCount: number, performanceMode: boolean) {
    try {
      // Skip all updates if water isn't properly initialized
      if (!this.water || !this.water.material) {
        return;
      }
      
      // Get water uniforms with additional safety checks
      const waterUniforms = this.water.material.uniforms;
      if (!waterUniforms) {
        return;
      }
      
      // Animate water with null checks for each uniform
      if (waterUniforms.time && waterUniforms.time.value !== undefined) {
        try {
          // Use a very small increment to minimize the chance of errors
          const timeIncrement = performanceMode ? 0.0002 : 0.0005;
          waterUniforms.time.value += timeIncrement;
        } catch (error) {
          // Just silently fail here - no need to log errors for every frame
        }
      }
      
      // Skip all other animations most of the time to reduce potential errors
      if (frameCount % 10 !== 0) {
        return;
      }
      
      // Apply Gerstner waves with additional checks - but much less frequently
      if (frameCount % 30 === 0 && typeof this.applyGerstnerWaves === 'function') {
        try {
          this.applyGerstnerWaves(frameCount * 0.002);
        } catch (error) {
          // Silent fail
        }
      }
      
      // Animate foam with additional checks - but much less frequently
      if (frameCount % 20 === 0 && this.waterFoam && this.foamTexture && this.foamTexture.offset) {
        try {
          this.foamTexture.offset.x += 0.00002;
          this.foamTexture.offset.y += 0.00001;
        } catch (error) {
          // Silent fail
        }
      }
      
      // Animate sun reflection with additional checks - but much less frequently
      if (frameCount % 15 === 0 && this.sunReflection && this.sunReflection.scale) {
        try {
          const reflectionScale = 1.0 + Math.sin(frameCount * 0.01) * 0.05;
          this.sunReflection.scale.set(reflectionScale, reflectionScale, 1);
        } catch (error) {
          // Silent fail
        }
      }
      
      // Update shore interaction with better error handling - more frequent updates for smoother animation
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
      
      // Render land texture to render target for shore effect - less frequently to save performance
      if (this.landRenderTarget && this.landCamera && frameCount % 30 === 0) {
        try {
          // Store current renderer state
          const currentRenderTarget = this.renderer.getRenderTarget();
          
          // Set render target to land texture
          this.renderer.setRenderTarget(this.landRenderTarget);
          
          // Render only land objects
          const currentVisibility = this.water.visible;
          this.water.visible = false;
          this.renderer.render(this.scene, this.landCamera);
          this.water.visible = currentVisibility;
          
          // Restore renderer state
          this.renderer.setRenderTarget(currentRenderTarget);
          
          // Update shore material with land texture
          if (this.shoreMesh && this.shoreMesh.material) {
            const shoreMaterial = this.shoreMesh.material as THREE.ShaderMaterial;
            if (shoreMaterial.userData && shoreMaterial.userData.uniforms && shoreMaterial.userData.uniforms.landTexture) {
              shoreMaterial.userData.uniforms.landTexture.value = this.landRenderTarget.texture;
            }
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
    this.activeView = activeView;
    
    if (!this.water || !this.water.material || !this.water.material.uniforms) return;
    
    // Update water color based on view mode
    const waterColor = this.getWaterColorForView();
    const waterUniforms = this.water.material.uniforms;
    
    if (waterUniforms.waterColor && waterUniforms.waterColor.value) {
      try {
        waterUniforms.waterColor.value.setHex(waterColor);
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
