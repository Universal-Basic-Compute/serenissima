import * as THREE from 'three';
import { ViewMode } from './types';

interface WaterProps {
  scene: THREE.Scene;
  activeView: ViewMode;
  performanceMode: boolean;
  width: number;
  height: number;
}

export default class Water {
  private scene: THREE.Scene;
  private activeView: ViewMode;
  private performanceMode: boolean;
  private width: number;
  private height: number;
  private time: number = 0;
  private clock: THREE.Clock = new THREE.Clock();
  
  // Water surface
  private waterMesh: THREE.Mesh | null = null;
  private waterGeometry: THREE.PlaneGeometry | null = null;
  private waterMaterial: THREE.ShaderMaterial | null = null;
  
  // Water simulation properties only
  
  // Wave simulation
  private waveGrid: Float32Array | null = null;
  private prevWaveGrid: Float32Array | null = null;
  private waveVelocity: Float32Array | null = null;
  private gridSize: number = 0;
  private landPositions: THREE.Vector3[] = [];
  
  constructor({
    scene,
    activeView,
    performanceMode,
    width,
    height
  }: WaterProps) {
    this.scene = scene;
    this.activeView = activeView;
    this.performanceMode = performanceMode;
    this.width = width;
    this.height = height;
    
    // Initialize the water system
    this.initializeWaterSystem();
    
    // Start the clock
    this.clock.start();
  }
  
  private initializeWaterSystem() {
    console.log('Initializing unified water system...');
    
    // Create the water surface with shader-based waves
    this.createWaterSurface();
    
    // Initialize wave simulation
    this.initializeWaveSimulation();
    
    // Mark the water mesh for identification
    if (this.waterMesh) {
      this.waterMesh.userData.isWaterMesh = true;
    }
    
    // Create initial waves for immediate visual effect
    for (let i = 0; i < 10; i++) {
      this.createRandomWave();
    }
  }
  
  private createWaterSurface() {
    // Determine grid resolution based on performance mode
    const resolution = this.performanceMode ? 128 : 256;
    
    // Create water geometry
    this.waterGeometry = new THREE.PlaneGeometry(
      this.width, 
      this.height, 
      resolution - 1, 
      resolution - 1
    );
    
    // Create water shader material with improved visibility
    const waterShader = {
      uniforms: {
        time: { value: 0.0 },
        waterColor: { value: new THREE.Color(this.getWaterColorForView()) },
        deepWaterColor: { value: new THREE.Color(this.getDeepWaterColorForView()) },
        resolution: { value: new THREE.Vector2(resolution, resolution) },
        waveHeight: { value: 1.5 } // Increased from 0.8 to 1.5 for more visible waves
      },
      vertexShader: `
        uniform float time;
        uniform float waveHeight;
        varying vec2 vUv;
        varying float vElevation;
        
        // Procedural wave function
        float wave(vec2 position) {
          float result = 0.0;
          
          // Large slow waves - increased amplitude
          result += sin(position.x * 0.5 + time * 0.5) * 
                   cos(position.y * 0.4 + time * 0.3) * 0.8;
          
          // Medium waves - increased amplitude
          result += sin(position.x * 1.0 + time * 0.8) * 
                   sin(position.y * 1.3 + time * 0.6) * 0.4;
          
          // Small ripples - increased amplitude
          result += sin(position.x * 2.5 + time * 1.5) * 
                   sin(position.y * 2.8 + time * 1.7) * 0.2;
                   
          return result;
        }
        
        void main() {
          vUv = uv;
          
          // Calculate wave height
          vec3 pos = position;
          float elevation = wave(position.xz);
          pos.y += elevation * waveHeight;
          
          // Store elevation for fragment shader
          vElevation = elevation;
          
          gl_Position = projectionMatrix * modelMatrix * viewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 waterColor;
        uniform vec3 deepWaterColor;
        uniform float time;
        varying vec2 vUv;
        varying float vElevation;
        
        void main() {
          // Mix between deep and shallow water colors based on elevation
          float depthFactor = smoothstep(-0.5, 0.5, vElevation);
          vec3 color = mix(deepWaterColor, waterColor, depthFactor);
          
          // Add foam at wave peaks - more visible foam
          if (vElevation > 0.25) { // Lower threshold from 0.3 to 0.25
            float foamFactor = smoothstep(0.25, 0.45, vElevation);
            color = mix(color, vec3(1.0), foamFactor * 0.9); // Increased from 0.7 to 0.9
          }
          
          // Add subtle wave patterns - more pronounced
          float pattern = sin(vUv.x * 100.0 + time) * sin(vUv.y * 100.0 + time * 0.7) * 0.05; // Increased from 0.03 to 0.05
          color += pattern * vec3(0.1, 0.1, 0.3);
          
          // Increase opacity for better visibility
          gl_FragColor = vec4(color, 1.0);
        }
      `
    };
    
    // Create the material
    this.waterMaterial = new THREE.ShaderMaterial({
      uniforms: waterShader.uniforms,
      vertexShader: waterShader.vertexShader,
      fragmentShader: waterShader.fragmentShader,
      transparent: false,
      side: THREE.DoubleSide
    });
    
    // Create the water mesh
    this.waterMesh = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
    
    // Position water at y=-0.15 (slightly higher than before for better visibility)
    this.waterMesh.position.y = -0.15;
    
    // Rotate the water plane to be horizontal
    this.waterMesh.rotation.x = -Math.PI / 2;
    
    // Set render order to ensure water appears below land but above background
    this.waterMesh.renderOrder = 5;
    
    // Add to scene
    this.scene.add(this.waterMesh);
    
    console.log('Water surface created successfully');
  }
  
  // Particle system removed to focus only on wave simulation
  
  private initializeWaveSimulation() {
    // Determine grid size based on performance mode
    this.gridSize = this.performanceMode ? 64 : 128;
    
    // Create wave grids
    const gridLength = this.gridSize * this.gridSize;
    this.waveGrid = new Float32Array(gridLength);
    this.prevWaveGrid = new Float32Array(gridLength);
    this.waveVelocity = new Float32Array(gridLength);
    
    // Initialize with small random values
    for (let i = 0; i < gridLength; i++) {
      this.waveGrid[i] = (Math.random() * 2 - 1) * 0.01;
      this.prevWaveGrid[i] = this.waveGrid[i];
      this.waveVelocity[i] = 0;
    }
    
    console.log('Wave simulation initialized successfully');
  }
  
  // Method to collect land positions for wave interaction
  public setLandPositions(positions: THREE.Vector3[]) {
    this.landPositions = positions;
    console.log(`Set ${positions.length} land positions for water interaction`);
  }
  
  private updateWaveSimulation(deltaTime: number) {
    if (!this.waveGrid || !this.prevWaveGrid || !this.waveVelocity) return;
    
    const size = this.gridSize;
    const damping = 0.98;
    const waveSpeed = 0.15; // Increased from 0.05 to 0.15 for more active waves
    
    // Save current wave grid
    for (let i = 0; i < size * size; i++) {
      this.prevWaveGrid[i] = this.waveGrid[i];
    }
    
    // Update wave simulation using wave equation
    for (let i = 1; i < size - 1; i++) {
      for (let j = 1; j < size - 1; j++) {
        const idx = i * size + j;
        
        // Get neighboring points
        const up = (i - 1) * size + j;
        const down = (i + 1) * size + j;
        const left = i * size + (j - 1);
        const right = i * size + (j + 1);
        
        // Calculate Laplacian (sum of neighbors - 4 * center)
        const laplacian = 
          this.waveGrid[up] + 
          this.waveGrid[down] + 
          this.waveGrid[left] + 
          this.waveGrid[right] - 
          4 * this.waveGrid[idx];
        
        // Update velocity using wave equation
        this.waveVelocity[idx] += waveSpeed * laplacian;
        
        // Apply damping
        this.waveVelocity[idx] *= damping;
        
        // Update height
        this.waveGrid[idx] += this.waveVelocity[idx] * deltaTime;
      }
    }
    
    // Apply boundary conditions (fixed edges)
    for (let i = 0; i < size; i++) {
      this.waveGrid[i] = 0; // Top edge
      this.waveGrid[i * size] = 0; // Left edge
      this.waveGrid[i * size + (size - 1)] = 0; // Right edge
      this.waveGrid[(size - 1) * size + i] = 0; // Bottom edge
    }
    
    // Apply land interactions
    this.applyLandInteractions();
    
    // Create occasional random waves
    if (Math.random() < 0.01) {
      this.createRandomWave();
    }
  }
  
  private applyLandInteractions() {
    if (!this.waveGrid || this.landPositions.length === 0) return;
    
    const size = this.gridSize;
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    
    // For each land position, create wave interactions
    for (const landPos of this.landPositions) {
      // Convert world position to grid coordinates
      const gridX = Math.floor(((landPos.x + halfWidth) / this.width) * (size - 1));
      const gridZ = Math.floor(((landPos.z + halfHeight) / this.height) * (size - 1));
      
      // Skip if outside grid
      if (gridX < 0 || gridX >= size || gridZ < 0 || gridZ >= size) continue;
      
      // Create small ripples around land
      const radius = 3;
      const strength = 0.05;
      
      for (let i = Math.max(1, gridZ - radius); i < Math.min(size - 1, gridZ + radius); i++) {
        for (let j = Math.max(1, gridX - radius); j < Math.min(size - 1, gridX + radius); j++) {
          const dx = j - gridX;
          const dz = i - gridZ;
          const distSq = dx * dx + dz * dz;
          
          if (distSq < radius * radius) {
            const idx = i * size + j;
            const distFactor = 1 - Math.sqrt(distSq) / radius;
            
            // Create small ripple effect
            this.waveGrid[idx] += strength * distFactor * Math.sin(this.time * 2);
          }
        }
      }
    }
  }
  
  private createRandomWave() {
    if (!this.waveGrid) return;
    
    const size = this.gridSize;
    
    // Random position in grid
    const x = Math.floor(Math.random() * (size - 10)) + 5;
    const z = Math.floor(Math.random() * (size - 10)) + 5;
    
    // Random radius and strength - increased strength
    const radius = Math.floor(Math.random() * 5) + 3;
    const strength = (Math.random() * 0.2) + 0.1; // Doubled from (0.1 + 0.05) to (0.2 + 0.1)
    
    // Create wave
    for (let i = Math.max(1, z - radius); i < Math.min(size - 1, z + radius); i++) {
      for (let j = Math.max(1, x - radius); j < Math.min(size - 1, x + radius); j++) {
        const dx = j - x;
        const dz = i - z;
        const distSq = dx * dx + dz * dz;
        
        if (distSq < radius * radius) {
          const idx = i * size + j;
          const distFactor = 1 - Math.sqrt(distSq) / radius;
          
          // Apply wave impulse
          this.waveGrid[idx] += strength * distFactor;
        }
      }
    }
  }
  
  // Particle update method removed
  
  private applyWavesToGeometry() {
    if (!this.waterGeometry || !this.waveGrid) return;
    
    const positions = this.waterGeometry.attributes.position.array;
    const size = this.gridSize;
    const vertexCount = positions.length / 3;
    
    // Apply wave heights to geometry vertices
    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3;
      
      // Get vertex position in local coordinates
      const x = positions[i3];
      const z = positions[i3 + 2];
      
      // Map to grid coordinates (0 to 1)
      const gridX = ((x / this.width) + 0.5) * (size - 1);
      const gridZ = ((z / this.height) + 0.5) * (size - 1);
      
      // Get grid indices
      const gx0 = Math.floor(gridX);
      const gz0 = Math.floor(gridZ);
      const gx1 = Math.min(gx0 + 1, size - 1);
      const gz1 = Math.min(gz0 + 1, size - 1);
      
      // Skip if outside grid
      if (gx0 < 0 || gz0 < 0 || gx1 >= size || gz1 >= size) continue;
      
      // Get interpolation factors
      const fx = gridX - gx0;
      const fz = gridZ - gz0;
      
      // Get wave heights at grid points
      const h00 = this.waveGrid[gz0 * size + gx0] || 0;
      const h10 = this.waveGrid[gz0 * size + gx1] || 0;
      const h01 = this.waveGrid[gz1 * size + gx0] || 0;
      const h11 = this.waveGrid[gz1 * size + gx1] || 0;
      
      // Bilinear interpolation
      const h0 = h00 * (1 - fx) + h10 * fx;
      const h1 = h01 * (1 - fx) + h11 * fx;
      const height = h0 * (1 - fz) + h1 * fz;
      
      // Apply height to vertex with additional sine wave for more movement
      const additionalWave = 
        Math.sin(x * 0.2 + this.time * 0.7) * 
        Math.cos(z * 0.2 + this.time * 0.5) * 0.1;
      
      positions[i3 + 1] = height + additionalWave;
    }
    
    // Update geometry
    this.waterGeometry.attributes.position.needsUpdate = true;
    
    // Recalculate normals for proper lighting
    this.waterGeometry.computeVertexNormals();
  }
  
  private getWaterColorForView(): number {
    switch (this.activeView) {
      case 'transport':
        return 0x00b3ff; // Brighter, more saturated blue for transport
      case 'resources':
        return 0x00e6c0; // Brighter, more saturated teal for resources
      case 'markets':
        return 0x00a3e6; // Brighter, more saturated steel blue for markets
      case 'governance':
        return 0x7b68ee; // Brighter, more saturated slate blue for governance
      case 'land':
        return 0x00c3ff; // Brighter, more saturated sea blue for land view
      case 'buildings':
        return 0x00b3ff; // Brighter, more saturated turquoise
      default:
        return 0x00b3ff; // Brighter, more saturated turquoise
    }
  }
  
  private getDeepWaterColorForView(): number {
    switch (this.activeView) {
      case 'transport':
        return 0x0077e6; // Deeper, more saturated blue for transport
      case 'resources':
        return 0x008877; // Darker, more saturated teal for resources
      case 'markets':
        return 0x0066a3; // Darker, more saturated steel blue for markets
      case 'governance':
        return 0x5a4fcb; // Darker, more saturated slate blue for governance
      case 'land':
        return 0x0077c2; // Deeper, more saturated sea blue for land view
      case 'buildings':
        return 0x0077c2; // Deeper, more saturated blue
      default:
        return 0x0077c2; // Deeper, more saturated blue
    }
  }
  
  public update(frameCount: number) {
    // Update time - increased speed for more visible animation
    this.time += 0.05; // Increased from 0.03 to 0.05
    
    // Get delta time for physics-based simulation
    const deltaTime = Math.min(0.05, this.clock.getDelta());
    
    // Skip if water mesh doesn't exist
    if (!this.waterMesh || !this.waterMaterial) return;
    
    // Update shader uniforms
    this.waterMaterial.uniforms.time.value = this.time;
    
    // Update wave simulation
    this.updateWaveSimulation(deltaTime);
    
    // Apply waves to geometry
    this.applyWavesToGeometry();
    
    // Create random waves more frequently (every ~20 frames instead of ~100)
    if (Math.random() < 0.05) {
      this.createRandomWave();
    }
  }
  
  public updateViewMode(activeView: ViewMode) {
    if (this.activeView === activeView) return;
    
    this.activeView = activeView;
    
    // Update water color
    if (this.waterMaterial) {
      this.waterMaterial.uniforms.waterColor.value = new THREE.Color(this.getWaterColorForView());
      this.waterMaterial.uniforms.deepWaterColor.value = new THREE.Color(this.getDeepWaterColorForView());
      this.waterMaterial.needsUpdate = true;
    }
    
    // Remove reference to undefined particleMaterial
  }
  
  public updateQuality(performanceMode: boolean) {
    if (this.performanceMode === performanceMode) return;
    
    this.performanceMode = performanceMode;
    
    // Recreate water system with new quality settings
    this.cleanup();
    this.initializeWaterSystem();
  }
  
  public cleanup() {
    // Remove water mesh
    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
      
      if (this.waterGeometry) {
        this.waterGeometry.dispose();
      }
      
      if (this.waterMaterial) {
        this.waterMaterial.dispose();
      }
    }
    
    // Clear references
    this.waterMesh = null;
    this.waterGeometry = null;
    this.waterMaterial = null;
    this.waveGrid = null;
    this.prevWaveGrid = null;
    this.waveVelocity = null;
  }
}
