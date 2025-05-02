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
  private waterMesh: THREE.Mesh | null = null;
  private waterGeometry: THREE.PlaneGeometry | null = null;
  private waterMaterial: THREE.ShaderMaterial | null = null;
  private time: number = 0;
  private clock: THREE.Clock = new THREE.Clock();
  private textureLoader: THREE.TextureLoader;
  private waterNormalMap: THREE.Texture | null = null;
  private landPolygons: THREE.Mesh[] = [];
  private shoreLinePoints: THREE.Vector3[] = [];
  private waveSimulationActive: boolean = false;
  private waveSimulationResolution: number = 64; // Resolution of wave simulation
  private waveHeightMap: Float32Array | null = null;
  private waveVelocityMap: Float32Array | null = null;
  private waveDampingFactor: number = 0.98; // Damping factor for waves
  private waveSpeed: number = 0.5; // Speed of wave propagation
  private waveAmplitude: number = 0.2; // Maximum wave height
  private lastUpdateTime: number = 0;
  private sunReflection: THREE.Mesh | null = null;
  private water: any = null;
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
  private landPositions: Float32Array = new Float32Array();
  private landBuffer: THREE.BufferAttribute = new THREE.BufferAttribute(new Float32Array(), 3);
  
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
    this.textureLoader = new THREE.TextureLoader();
    
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
    
    // Initialize water with a slight delay to ensure land polygons are loaded
    setTimeout(() => this.initializeWater(), 500);
    
    // Start the clock for time-based animations
    this.clock.start();
  }
  
  private initializeWater() {
    console.log('Initializing 3D water simulation...');
    
    // Create a water normal map texture
    this.loadWaterTextures();
    
    // Create the water mesh with shader material
    this.createWaterMesh();
    
    // Initialize wave simulation
    this.initializeWaveSimulation();
    
    // Collect land polygon information for shoreline detection
    this.collectLandPolygons();
    
    // Set wave simulation active
    this.waveSimulationActive = true;
  }
  
  private loadWaterTextures() {
    // Load water normal map for realistic wave appearance
    console.log('Attempting to load water normal map from /textures/waternormals.jpg');
    
    this.textureLoader.load(
      '/textures/waternormals.jpg',
      (texture) => {
        console.log('Water normal map loaded successfully');
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(5, 5);
        this.waterNormalMap = texture;
        
        // Update material if it exists
        if (this.waterMaterial) {
          try {
            (this.waterMaterial as any).uniforms.normalMap.value = texture;
            this.waterMaterial.needsUpdate = true;
          } catch (error) {
            console.error('Error applying normal map to water material:', error);
          }
        }
      },
      (progressEvent) => {
        // Log progress
        console.log('Loading water normal map progress:', progressEvent);
      },
      (error) => {
        console.error('Error loading water normal map:', error);
        // Create a fallback normal map with better error handling
        try {
          this.createFallbackNormalMap();
        } catch (fallbackError) {
          console.error('Error creating fallback normal map:', fallbackError);
          // Create an even simpler fallback as last resort
          this.createSimplestFallbackNormalMap();
        }
      }
    );
  }
  
  // Add this new method to create a fallback normal map
  private createFallbackNormalMap() {
    console.log('Creating fallback water normal map');
    // Create a canvas for a fallback normal map
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Create a simple normal map pattern
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          // Create a wavy pattern
          const r = Math.floor(127 * Math.sin((x / canvas.width) * Math.PI * 10) + 127);
          const g = Math.floor(127 * Math.sin((y / canvas.height) * Math.PI * 10) + 127);
          const b = 255; // Full blue for normal map
          
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      
      const fallbackTexture = new THREE.CanvasTexture(canvas);
      fallbackTexture.wrapS = fallbackTexture.wrapT = THREE.RepeatWrapping;
      fallbackTexture.repeat.set(5, 5);
      this.waterNormalMap = fallbackTexture;
      
      // Update material if it exists
      if (this.waterMaterial) {
        (this.waterMaterial as any).uniforms.normalMap.value = fallbackTexture;
        this.waterMaterial.needsUpdate = true;
      }
      console.log('Fallback water normal map created successfully');
    }
  }
  
  private createFallbackNormalMap() {
    console.log('Creating fallback water normal map');
    // Create a canvas for a fallback normal map
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Create a simple normal map pattern
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          // Create a wavy pattern
          const r = Math.floor(127 * Math.sin((x / canvas.width) * Math.PI * 10) + 127);
          const g = Math.floor(127 * Math.sin((y / canvas.height) * Math.PI * 10) + 127);
          const b = 255; // Full blue for normal map
          
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      
      const fallbackTexture = new THREE.CanvasTexture(canvas);
      fallbackTexture.wrapS = fallbackTexture.wrapT = THREE.RepeatWrapping;
      fallbackTexture.repeat.set(5, 5);
      this.waterNormalMap = fallbackTexture;
      
      // Update material if it exists
      if (this.waterMaterial) {
        try {
          (this.waterMaterial as any).uniforms.normalMap.value = fallbackTexture;
          this.waterMaterial.needsUpdate = true;
        } catch (error) {
          console.error('Error applying fallback normal map:', error);
        }
      }
      console.log('Fallback water normal map created successfully');
    } else {
      console.error('Could not get 2D context for fallback normal map');
      throw new Error('Canvas 2D context not available');
    }
  }
  
  // Add this new method as an even simpler fallback
  private createSimplestFallbackNormalMap() {
    console.log('Creating simplest fallback normal map');
    
    // Create a plain blue texture as absolute fallback
    const data = new Uint8Array([0, 0, 255, 255]);
    const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(5, 5);
    texture.needsUpdate = true;
    
    this.waterNormalMap = texture;
    
    // Update material if it exists
    if (this.waterMaterial) {
      try {
        (this.waterMaterial as any).uniforms.normalMap.value = texture;
        this.waterMaterial.needsUpdate = true;
      } catch (error) {
        console.error('Error applying simplest fallback normal map:', error);
      }
    }
    console.log('Simplest fallback normal map created successfully');
  }
  
  private createWaterMesh() {
    // Create a higher resolution water geometry for better wave simulation
    const resolution = this.performanceMode ? 64 : 128;
    this.waterGeometry = new THREE.PlaneGeometry(
      this.width * 2, 
      this.height * 2,
      resolution,
      resolution
    );
    
    // Create water shader material
    const waterColor = new THREE.Color(this.getWaterColorForView());
    
    // Define shader material for realistic water
    this.waterMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        waterColor: { value: waterColor },
        normalMap: { value: this.waterNormalMap },
        waveHeight: { value: this.waveAmplitude },
        waveSpeed: { value: this.waveSpeed },
        resolution: { value: new THREE.Vector2(resolution, resolution) },
        sunDirection: { value: new THREE.Vector3(0.5, 0.5, 0.0).normalize() }
      },
      vertexShader: `
        uniform float time;
        uniform float waveHeight;
        uniform float waveSpeed;
        
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;
        
        // Function to create Gerstner waves
        vec3 gerstnerWave(vec3 position, float steepness, float wavelength, float speed, vec2 direction) {
          direction = normalize(direction);
          float k = 2.0 * 3.14159 / wavelength;
          float f = k * (dot(direction, position.xz) - speed * time);
          float a = steepness / k;
          
          return vec3(
            direction.x * a * cos(f),
            a * sin(f),
            direction.y * a * cos(f)
          );
        }
        
        void main() {
          vUv = uv;
          vPosition = position;
          
          // Base position
          vec3 pos = position;
          
          // Apply multiple Gerstner waves for more realistic water
          vec3 wave1 = gerstnerWave(position, 0.1, 20.0, waveSpeed, vec2(1.0, 0.0));
          vec3 wave2 = gerstnerWave(position, 0.05, 15.0, waveSpeed * 0.8, vec2(0.7, 0.7));
          vec3 wave3 = gerstnerWave(position, 0.03, 10.0, waveSpeed * 1.2, vec2(0.0, 1.0));
          
          // Combine waves
          pos += wave1 + wave2 + wave3;
          
          // Apply wave height
          pos.y *= waveHeight;
          
          // Calculate normal for lighting
          vec3 tangent1 = normalize(wave1 + wave2 + wave3);
          vec3 tangent2 = normalize(cross(vec3(0.0, 1.0, 0.0), tangent1));
          vNormal = normalize(cross(tangent1, tangent2));
          
          // Set final position
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 waterColor;
        uniform sampler2D normalMap;
        uniform vec3 sunDirection;
        
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;
        
        void main() {
          // Sample normal map
          vec3 normal = texture2D(normalMap, vUv).rgb * 2.0 - 1.0;
          normal = normalize(normal);
          
          // Combine with vertex normal for more detail
          vec3 finalNormal = normalize(vNormal + normal * 0.5);
          
          // Calculate fresnel effect for edge highlighting
          float fresnel = pow(1.0 - max(0.0, dot(finalNormal, vec3(0.0, 1.0, 0.0))), 3.0);
          
          // Calculate sun reflection
          float sunReflection = max(0.0, dot(reflect(-sunDirection, finalNormal), vec3(0.0, 1.0, 0.0)));
          sunReflection = pow(sunReflection, 32.0);
          
          // Calculate depth-based color variation
          float depth = smoothstep(0.0, 20.0, -vPosition.y);
          vec3 depthColor = mix(waterColor, waterColor * 0.5, depth);
          
          // Final color with reflections and fresnel
          vec3 finalColor = depthColor;
          finalColor += vec3(1.0, 1.0, 0.8) * sunReflection * 0.5;
          finalColor = mix(finalColor, vec3(0.8, 0.9, 1.0), fresnel * 0.5);
          
          gl_FragColor = vec4(finalColor, 0.9);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide
    });
    
    // Create the water mesh
    this.waterMesh = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
    
    // Position water at y=0 (below the land which is at y=0.1)
    this.waterMesh.position.y = 0;
    
    // Rotate the water plane to be horizontal
    this.waterMesh.rotation.x = -Math.PI / 2;
    
    // Set render order to ensure water appears below land
    this.waterMesh.renderOrder = 5;
    
    // Add to scene
    this.scene.add(this.waterMesh);
  }
  
  private initializeWaveSimulation() {
    // Initialize wave height and velocity maps
    const size = this.waveSimulationResolution * this.waveSimulationResolution;
    this.waveHeightMap = new Float32Array(size);
    this.waveVelocityMap = new Float32Array(size);
    
    // Initialize with small random values for natural wave appearance
    for (let i = 0; i < size; i++) {
      this.waveHeightMap[i] = (Math.random() * 2 - 1) * 0.01;
      this.waveVelocityMap[i] = 0;
    }
  }
  
  private collectLandPolygons() {
    // Find all land polygon meshes in the scene
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && 
          object.userData && 
          object.userData.isLandPolygon) {
        this.landPolygons.push(object);
        
        // Extract shoreline points from the polygon
        if (object.geometry instanceof THREE.BufferGeometry) {
          const position = object.geometry.attributes.position;
          const count = position.count;
          
          // Extract points around the perimeter of the land
          for (let i = 0; i < count; i++) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);
            
            // Transform to world coordinates
            const point = new THREE.Vector3(x, y, z);
            point.applyMatrix4(object.matrixWorld);
            
            // Only add points that are on the edge (simplified approach)
            if (i % 10 === 0) { // Sample every 10th point to reduce computation
              this.shoreLinePoints.push(point);
            }
          }
        }
      }
    });
    
    console.log(`Collected ${this.landPolygons.length} land polygons and ${this.shoreLinePoints.length} shoreline points`);
  }
  
  private updateWaveSimulation(deltaTime: number) {
    if (!this.waveHeightMap || !this.waveVelocityMap) return;
    
    const size = this.waveSimulationResolution;
    const newHeightMap = new Float32Array(size * size);
    
    // Wave equation parameters
    const c = this.waveSpeed; // Wave speed
    const damping = this.waveDampingFactor;
    
    // Update wave simulation using the wave equation
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const idx = i * size + j;
        
        // Skip boundary points
        if (i === 0 || i === size - 1 || j === 0 || j === size - 1) {
          newHeightMap[idx] = 0;
          continue;
        }
        
        // Get neighboring points
        const up = (i - 1) * size + j;
        const down = (i + 1) * size + j;
        const left = i * size + (j - 1);
        const right = i * size + (j + 1);
        
        // Calculate Laplacian (sum of neighbors - 4 * center)
        const laplacian = 
          this.waveHeightMap[up] + 
          this.waveHeightMap[down] + 
          this.waveHeightMap[left] + 
          this.waveHeightMap[right] - 
          4 * this.waveHeightMap[idx];
        
        // Update velocity using wave equation
        this.waveVelocityMap[idx] += c * c * laplacian * deltaTime;
        
        // Apply damping
        this.waveVelocityMap[idx] *= damping;
        
        // Update height
        newHeightMap[idx] = this.waveHeightMap[idx] + this.waveVelocityMap[idx] * deltaTime;
        
        // Apply interaction with shoreline
        // Map simulation coordinates to world coordinates
        const worldX = (j / size - 0.5) * this.width * 2;
        const worldZ = (i / size - 0.5) * this.height * 2;
        const worldPoint = new THREE.Vector3(worldX, 0, worldZ);
        
        // Check distance to shoreline points
        for (const shorePoint of this.shoreLinePoints) {
          const distance = worldPoint.distanceTo(shorePoint);
          if (distance < 5) { // Threshold for shore interaction
            // Create wave reflection effect near shores
            const factor = 1 - distance / 5;
            newHeightMap[idx] *= (1 - factor * 0.5); // Reduce height near shores
            
            // Add some randomness for foam/ripple effect
            if (Math.random() < 0.1) {
              newHeightMap[idx] += (Math.random() * 2 - 1) * 0.02 * factor;
            }
          }
        }
      }
    }
    
    // Add random waves occasionally
    if (Math.random() < 0.05) {
      const i = Math.floor(Math.random() * (size - 4)) + 2;
      const j = Math.floor(Math.random() * (size - 4)) + 2;
      const idx = i * size + j;
      newHeightMap[idx] += (Math.random() * 2 - 1) * 0.1;
    }
    
    // Swap height maps
    this.waveHeightMap = newHeightMap;
  }
  
  private applyWaveSimulationToMesh() {
    if (!this.waterGeometry || !this.waveHeightMap) return;
    
    const positions = this.waterGeometry.attributes.position.array;
    const size = this.waveSimulationResolution;
    
    // Map vertex positions to simulation grid
    for (let i = 0; i < positions.length; i += 3) {
      // Get normalized position in the range [0,1]
      const x = (positions[i] / (this.width * 2)) + 0.5;
      const z = (positions[i + 2] / (this.height * 2)) + 0.5;
      
      // Map to grid indices
      const gridX = Math.floor(x * (size - 1));
      const gridZ = Math.floor(z * (size - 1));
      
      // Bilinear interpolation for smoother waves
      const fx = x * (size - 1) - gridX;
      const fz = z * (size - 1) - gridZ;
      
      const idx00 = Math.min(Math.max(gridZ * size + gridX, 0), size * size - 1);
      const idx10 = Math.min(Math.max(gridZ * size + gridX + 1, 0), size * size - 1);
      const idx01 = Math.min(Math.max((gridZ + 1) * size + gridX, 0), size * size - 1);
      const idx11 = Math.min(Math.max((gridZ + 1) * size + gridX + 1, 0), size * size - 1);
      
      // Interpolate wave height
      const h00 = this.waveHeightMap[idx00];
      const h10 = this.waveHeightMap[idx10];
      const h01 = this.waveHeightMap[idx01];
      const h11 = this.waveHeightMap[idx11];
      
      const h0 = h00 * (1 - fx) + h10 * fx;
      const h1 = h01 * (1 - fx) + h11 * fx;
      const height = h0 * (1 - fz) + h1 * fz;
      
      // Apply height to vertex
      positions[i + 1] = height * this.waveAmplitude;
    }
    
    // Update geometry
    this.waterGeometry.attributes.position.needsUpdate = true;
    
    // Recalculate normals for proper lighting
    this.waterGeometry.computeVertexNormals();
  }
  
  // Add method to create a sun reflection
  private createSunReflection() {
    console.log('Sun reflection creation disabled');
    // No sun reflection is created to avoid geometry generation
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
  
  private loadFoamTexture() {
    console.log('Foam texture loading disabled');
    // No foam texture is loaded to avoid geometry generation
  }
  
  private loadCausticTextures() {
    console.log('Caustic textures loading disabled');
    // No caustic textures are loaded to avoid geometry generation
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
    console.log('Realistic water surface creation disabled');
    // No water surface is created to avoid geometry generation
  }
  
  // Add method to create water
  public createWater() {
    console.log('Water creation disabled');
    // No water is created to avoid geometry generation
  }
  
  // Add helper method to create a simple water plane
  private createSimpleWaterPlane() {
    // Create a large plane for water
    const waterGeometry = new THREE.PlaneGeometry(
      this.width * 2, 
      this.height * 2,
      1,
      1
    );
    
    // Create a simple blue material for water
    const waterMaterial = new THREE.MeshBasicMaterial({
      color: this.getWaterColorForView(),
      transparent: true,
      opacity: 0.8
    });
    
    // Create the water mesh
    this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    
    // Position water at y=0 (below the land which is at y=0.1)
    this.waterMesh.position.y = 0;
    
    // Rotate the water plane to be horizontal
    this.waterMesh.rotation.x = -Math.PI / 2;
    
    // Set render order to ensure water appears below land
    this.waterMesh.renderOrder = 5;
    
    // Add to scene
    this.scene.add(this.waterMesh);
  }
  
  public update(frameCount: number, performanceMode: boolean = false) {
    // Update time for shader animations
    this.time += 0.01;
    
    // Get delta time for physics-based simulation
    const currentTime = this.clock.getElapsedTime();
    const deltaTime = Math.min(0.05, currentTime - this.lastUpdateTime); // Cap delta time to prevent instability
    this.lastUpdateTime = currentTime;
    
    // Skip updates if water isn't properly initialized
    if (!this.waterMesh || !this.waterMaterial) {
      return;
    }
    
    // Update shader uniforms
    if (this.waterMaterial instanceof THREE.ShaderMaterial) {
      this.waterMaterial.uniforms.time.value = this.time;
    }
    
    // Update wave simulation at a reduced rate for performance
    if (this.waveSimulationActive && frameCount % (performanceMode ? 5 : 2) === 0) {
      this.updateWaveSimulation(deltaTime);
      this.applyWaveSimulationToMesh();
    }
  }
  
  public updateViewMode(activeView: ViewMode) {
    // Skip update if view hasn't changed
    if (this.activeView === activeView) return;
    
    this.activeView = activeView;
    
    // Get the water color for the new view
    const waterColor = new THREE.Color(this.getWaterColorForView());
    
    // Update water material color
    if (this.waterMaterial instanceof THREE.ShaderMaterial) {
      this.waterMaterial.uniforms.waterColor.value = waterColor;
      this.waterMaterial.needsUpdate = true;
    }
  }
  
  public updateQuality(performanceMode: boolean) {
    this.performanceMode = performanceMode;
    
    // Adjust wave simulation resolution based on performance mode
    if (performanceMode) {
      this.waveSimulationResolution = 32;
      this.waveAmplitude = 0.15;
    } else {
      this.waveSimulationResolution = 64;
      this.waveAmplitude = 0.2;
    }
    
    // Reinitialize wave simulation with new resolution
    this.initializeWaveSimulation();
    
    // Update shader parameters
    if (this.waterMaterial instanceof THREE.ShaderMaterial) {
      this.waterMaterial.uniforms.waveHeight.value = this.waveAmplitude;
    }
  }
  
  public cleanup() {
    // Remove water mesh from scene
    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
      
      // Dispose of geometry and material
      if (this.waterGeometry) {
        this.waterGeometry.dispose();
      }
      
      if (this.waterMaterial) {
        this.waterMaterial.dispose();
      }
    }
    
    // Remove water and related objects from scene
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
    this.waterGeometry = null;
    this.waterMaterial = null;
    this.waveHeightMap = null;
    this.waveVelocityMap = null;
    this.landPolygons = [];
    this.shoreLinePoints = [];
    this.water = null;
  }
}
