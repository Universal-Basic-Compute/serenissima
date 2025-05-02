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
  
  // Particle system for water effects
  private particleSystem: THREE.Points | null = null;
  private particleGeometry: THREE.BufferGeometry | null = null;
  private particleMaterial: THREE.PointsMaterial | null = null;
  private particlePositions: Float32Array | null = null;
  private particleVelocities: Float32Array | null = null;
  
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
    
    // Create particle system for water effects
    this.createParticleSystem();
    
    // Initialize wave simulation
    this.initializeWaveSimulation();
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
        waveHeight: { value: 0.8 }
      },
      vertexShader: `
        uniform float time;
        uniform float waveHeight;
        varying vec2 vUv;
        varying float vElevation;
        
        // Procedural wave function
        float wave(vec2 position) {
          float result = 0.0;
          
          // Large slow waves
          result += sin(position.x * 0.5 + time * 0.5) * 
                   cos(position.y * 0.4 + time * 0.3) * 0.5;
          
          // Medium waves
          result += sin(position.x * 1.0 + time * 0.8) * 
                   sin(position.y * 1.3 + time * 0.6) * 0.25;
          
          // Small ripples
          result += sin(position.x * 2.5 + time * 1.5) * 
                   sin(position.y * 2.8 + time * 1.7) * 0.125;
                   
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
          
          // Add foam at wave peaks
          if (vElevation > 0.3) {
            float foamFactor = smoothstep(0.3, 0.5, vElevation);
            color = mix(color, vec3(1.0), foamFactor * 0.7);
          }
          
          // Add subtle wave patterns
          float pattern = sin(vUv.x * 100.0 + time) * sin(vUv.y * 100.0 + time * 0.7) * 0.03;
          color += pattern * vec3(0.1, 0.1, 0.3);
          
          // Increase opacity for better visibility
          gl_FragColor = vec4(color, 0.95);
        }
      `
    };
    
    // Create the material
    this.waterMaterial = new THREE.ShaderMaterial({
      uniforms: waterShader.uniforms,
      vertexShader: waterShader.vertexShader,
      fragmentShader: waterShader.fragmentShader,
      transparent: true,
      side: THREE.DoubleSide
    });
    
    // Create the water mesh
    this.waterMesh = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
    
    // Position water at y=-0.1 (below land)
    this.waterMesh.position.y = -0.1;
    
    // Rotate the water plane to be horizontal
    this.waterMesh.rotation.x = -Math.PI / 2;
    
    // Set render order to ensure water appears below land
    this.waterMesh.renderOrder = 1;
    
    // Add to scene
    this.scene.add(this.waterMesh);
    
    console.log('Water surface created successfully');
  }
  
  private createParticleSystem() {
    // Determine particle count based on performance mode - reduce count
    const particleCount = this.performanceMode ? 2000 : 5000; // Reduced from 5000/15000
    
    // Create particle geometry
    this.particleGeometry = new THREE.BufferGeometry();
    
    // Create particle positions and velocities
    this.particlePositions = new Float32Array(particleCount * 3);
    this.particleVelocities = new Float32Array(particleCount * 3);
    
    // Initialize particles with random positions within water bounds
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      
      // Random position within water bounds
      this.particlePositions[i3] = (Math.random() - 0.5) * this.width;
      this.particlePositions[i3 + 1] = Math.random() * 0.2; // Height between 0 and 0.2 (reduced from 0.5)
      this.particlePositions[i3 + 2] = (Math.random() - 0.5) * this.height;
      
      // Random velocity
      this.particleVelocities[i3] = (Math.random() - 0.5) * 0.01; // Reduced from 0.02
      this.particleVelocities[i3 + 1] = Math.random() * 0.005; // Reduced from 0.01
      this.particleVelocities[i3 + 2] = (Math.random() - 0.5) * 0.01; // Reduced from 0.02
    }
    
    // Add positions to geometry
    this.particleGeometry.setAttribute(
      'position', 
      new THREE.BufferAttribute(this.particlePositions, 3)
    );
    
    // Create particle material with reduced size and opacity
    this.particleMaterial = new THREE.PointsMaterial({
      color: this.getWaterColorForView(),
      size: this.performanceMode ? 0.1 : 0.08, // Reduced from 0.2/0.15
      transparent: true,
      opacity: 0.4, // Reduced from 0.6
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    // Create particle system
    this.particleSystem = new THREE.Points(this.particleGeometry, this.particleMaterial);
    
    // Position particle system at water level
    this.particleSystem.position.y = -0.05; // Slightly below water surface
    
    // Add to scene
    this.scene.add(this.particleSystem);
    
    console.log('Water particle system created successfully');
  }
  
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
    const waveSpeed = 0.05;
    
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
    
    // Random radius and strength
    const radius = Math.floor(Math.random() * 5) + 3;
    const strength = (Math.random() * 0.1) + 0.05;
    
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
  
  private updateParticles(deltaTime: number) {
    if (!this.particlePositions || !this.particleVelocities || !this.particleGeometry) return;
    
    const particleCount = this.particlePositions.length / 3;
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    
    // Update each particle
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      
      // Update position based on velocity
      this.particlePositions[i3] += this.particleVelocities[i3] * deltaTime * 60;
      this.particlePositions[i3 + 1] += this.particleVelocities[i3 + 1] * deltaTime * 60;
      this.particlePositions[i3 + 2] += this.particleVelocities[i3 + 2] * deltaTime * 60;
      
      // Add some wave motion
      this.particlePositions[i3 + 1] += 
        Math.sin(this.time + this.particlePositions[i3] * 0.1) * 0.002 +
        Math.cos(this.time + this.particlePositions[i3 + 2] * 0.1) * 0.002;
      
      // Boundary checks
      if (this.particlePositions[i3] < -halfWidth) {
        this.particlePositions[i3] = halfWidth;
      } else if (this.particlePositions[i3] > halfWidth) {
        this.particlePositions[i3] = -halfWidth;
      }
      
      if (this.particlePositions[i3 + 2] < -halfHeight) {
        this.particlePositions[i3 + 2] = halfHeight;
      } else if (this.particlePositions[i3 + 2] > halfHeight) {
        this.particlePositions[i3 + 2] = -halfHeight;
      }
      
      // Keep particles near the surface
      if (this.particlePositions[i3 + 1] < 0) {
        this.particlePositions[i3 + 1] = Math.random() * 0.5;
      } else if (this.particlePositions[i3 + 1] > 0.5) {
        this.particlePositions[i3 + 1] = 0;
      }
      
      // Occasionally change velocity
      if (Math.random() < 0.01) {
        this.particleVelocities[i3] = (Math.random() - 0.5) * 0.02;
        this.particleVelocities[i3 + 2] = (Math.random() - 0.5) * 0.02;
      }
    }
    
    // Update particle geometry
    this.particleGeometry.attributes.position.needsUpdate = true;
  }
  
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
      
      // Apply height to vertex
      positions[i3 + 1] = height;
    }
    
    // Update geometry
    this.waterGeometry.attributes.position.needsUpdate = true;
    
    // Recalculate normals for proper lighting
    this.waterGeometry.computeVertexNormals();
  }
  
  private getWaterColorForView(): number {
    switch (this.activeView) {
      case 'transport':
        return 0x66ccff; // Brighter blue for transport
      case 'resources':
        return 0x4ac0a0; // Brighter teal for resources
      case 'markets':
        return 0x6d9ecc; // Brighter steel blue for markets
      case 'governance':
        return 0x6a5acd; // Brighter slate blue for governance
      case 'land':
        return 0x33d6e8; // Brighter sea green for land view
      case 'buildings':
        return 0x33aaff; // Brighter turquoise
      default:
        return 0x33aaff; // Brighter turquoise
    }
  }
  
  private getDeepWaterColorForView(): number {
    switch (this.activeView) {
      case 'transport':
        return 0x0066cc; // Deeper blue for transport
      case 'resources':
        return 0x1a5952; // Darker teal for resources
      case 'markets':
        return 0x2c4356; // Darker steel blue for markets
      case 'governance':
        return 0x27214d; // Darker slate blue for governance
      case 'land':
        return 0x0088a9; // Deeper sea green for land view
      case 'buildings':
        return 0x005588; // Deep blue
      default:
        return 0x005588; // Deep blue
    }
  }
  
  public update(frameCount: number) {
    // Update time
    this.time += 0.03;
    
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
    
    // Update particles
    this.updateParticles(deltaTime);
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
    
    // Update particle color
    if (this.particleMaterial) {
      this.particleMaterial.color.set(this.getWaterColorForView());
      this.particleMaterial.needsUpdate = true;
    }
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
    
    // Remove particle system
    if (this.particleSystem) {
      this.scene.remove(this.particleSystem);
      
      if (this.particleGeometry) {
        this.particleGeometry.dispose();
      }
      
      if (this.particleMaterial) {
        this.particleMaterial.dispose();
      }
    }
    
    // Clear references
    this.waterMesh = null;
    this.waterGeometry = null;
    this.waterMaterial = null;
    this.particleSystem = null;
    this.particleGeometry = null;
    this.particleMaterial = null;
    this.particlePositions = null;
    this.particleVelocities = null;
    this.waveGrid = null;
    this.prevWaveGrid = null;
    this.waveVelocity = null;
  }
}
