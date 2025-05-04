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
  
  // Physics simulation properties
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
    console.log('Initializing physics-based water system...');
    
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
    // Create a much simpler water implementation that will definitely be visible
    console.log('Creating GUARANTEED visible water surface');
    
    // Use a simple plane with animated vertex displacement
    const resolution = 128; // Lower resolution for better performance
    this.waterGeometry = new THREE.PlaneGeometry(
      this.width, 
      this.height, 
      resolution, 
      resolution
    );
    
    // Create a simple shader material with very obvious waves
    const waterShader = {
      uniforms: {
        time: { value: 0.0 },
        waterColor: { value: new THREE.Color(this.getWaterColorForView()) }, // Bright blue
        deepWaterColor: { value: new THREE.Color(this.getDeepWaterColorForView()) }, // Deep blue
      },
      vertexShader: `
        uniform float time;
        varying vec2 vUv;
        varying float vElevation;
        
        void main() {
          vUv = uv;
          
          // Create very obvious waves
          float wave1 = sin(position.x * 0.05 + time * 0.5) * 
                       cos(position.y * 0.05 + time * 0.3) * 2.0;
          
          float wave2 = sin(position.x * 0.1 + time * 0.7) * 
                       sin(position.y * 0.1 + time * 0.4) * 1.0;
          
          // Combine waves with high amplitude
          float elevation = wave1 + wave2;
          vElevation = elevation;
          
          // Apply elevation to vertex
          vec3 newPosition = position;
          newPosition.z += elevation * 3.0; // VERY exaggerated height
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 waterColor;
        uniform vec3 deepWaterColor;
        varying vec2 vUv;
        varying float vElevation;
        
        void main() {
          // Mix colors based on elevation for more visible waves
          float depthFactor = smoothstep(-2.0, 2.0, vElevation);
          vec3 color = mix(deepWaterColor, waterColor, depthFactor);
          
          // Add white caps at wave peaks
          if (vElevation > 1.5) {
            color = mix(color, vec3(1.0), (vElevation - 1.5) * 0.5);
          }
          
          gl_FragColor = vec4(color, 0.9);
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
    
    // FORCE VISIBILITY: Disable depth testing to ensure water is always drawn
    if (this.waterMaterial) {
      this.waterMaterial.depthTest = false;
      this.waterMaterial.depthWrite = false;
      this.waterMaterial.transparent = true;
      this.waterMaterial.opacity = 0.9; // Slightly transparent to see land underneath
    }
    
    // Create the water mesh
    this.waterMesh = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
    
    // Position water at y=0 and rotate to be horizontal
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y = 0;
    
    // Force visibility
    this.waterMesh.visible = true;
    this.waterMesh.renderOrder = 1000;
    
    // Add user data for identification
    this.waterMesh.userData.isWaterMesh = true;
    this.waterMesh.userData.alwaysVisible = true;
    
    // Add to scene
    this.scene.add(this.waterMesh);
    
    console.log('GUARANTEED water surface created');
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
    const waveSpeed = 0.15;
    
    // Save current wave grid
    for (let i = 0; i < size * size; i++) {
      this.prevWaveGrid[i] = this.waveGrid[i];
    }
    
    // Update wave simulation using improved wave equation
    for (let i = 1; i < size - 1; i++) {
      for (let j = 1; j < size - 1; j++) {
        const idx = i * size + j;
        
        // Get neighboring points (including diagonals for more natural propagation)
        const up = (i - 1) * size + j;
        const down = (i + 1) * size + j;
        const left = i * size + (j - 1);
        const right = i * size + (j + 1);
        const upLeft = (i - 1) * size + (j - 1);
        const upRight = (i - 1) * size + (j + 1);
        const downLeft = (i + 1) * size + (j - 1);
        const downRight = (i + 1) * size + (j + 1);
        
        // Calculate improved Laplacian with diagonal contributions
        const laplacian = 
          this.waveGrid[up] + 
          this.waveGrid[down] + 
          this.waveGrid[left] + 
          this.waveGrid[right] - 
          4 * this.waveGrid[idx];
          
        // Add diagonal contributions with lower weight
        const diagonalLaplacian = 
          (this.waveGrid[upLeft] + 
           this.waveGrid[upRight] + 
           this.waveGrid[downLeft] + 
           this.waveGrid[downRight] - 
           4 * this.waveGrid[idx]) * 0.3;
        
        // Combine both laplacians
        const combinedLaplacian = laplacian + diagonalLaplacian;
        
        // Update velocity using wave equation
        this.waveVelocity[idx] += waveSpeed * combinedLaplacian;
        
        // Apply variable damping based on position (more damping near edges)
        const edgeFactor = Math.min(
          i / 10, (size - i) / 10,
          j / 10, (size - j) / 10
        );
        const localDamping = damping * (1.0 - 0.1 * Math.max(0, 1 - edgeFactor));
        
        this.waveVelocity[idx] *= localDamping;
        
        // Update height
        this.waveGrid[idx] += this.waveVelocity[idx] * deltaTime;
      }
    }
    
    // Apply improved boundary conditions (absorbing boundaries)
    for (let i = 0; i < size; i++) {
      // Gradually reduce wave height near boundaries instead of setting to zero
      for (let d = 0; d < 3; d++) {
        if (i + d < size) {
          const dampFactor = 0.7 - (d * 0.2); // Stronger damping closer to edge
          
          // Top edge
          this.waveGrid[d * size + i] *= dampFactor;
          this.waveVelocity[d * size + i] *= dampFactor;
          
          // Bottom edge
          this.waveGrid[(size - 1 - d) * size + i] *= dampFactor;
          this.waveVelocity[(size - 1 - d) * size + i] *= dampFactor;
          
          // Left edge
          this.waveGrid[i * size + d] *= dampFactor;
          this.waveVelocity[i * size + d] *= dampFactor;
          
          // Right edge
          this.waveGrid[i * size + (size - 1 - d)] *= dampFactor;
          this.waveVelocity[i * size + (size - 1 - d)] *= dampFactor;
        }
      }
    }
    
    // Apply land interactions
    this.applyLandInteractions();
    
    // Create occasional random waves with varying probability based on time
    const waveProb = 0.01 + 0.005 * Math.sin(Date.now() * 0.0001);
    if (Math.random() < waveProb) {
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
      
      // Create more varied ripples around land
      const radius = 4; // Increased radius
      const strength = 0.06; // Slightly increased strength
      
      // Add time-based variation to make ripples more dynamic
      const timeVariation = Math.sin(this.time * 0.5 + landPos.x * 0.1) * 0.5 + 0.5;
      const adjustedStrength = strength * (0.8 + timeVariation * 0.4);
      
      // Create ripple pattern with more variation
      for (let i = Math.max(1, gridZ - radius); i < Math.min(size - 1, gridZ + radius); i++) {
        for (let j = Math.max(1, gridX - radius); j < Math.min(size - 1, gridX + radius); j++) {
          const dx = j - gridX;
          const dz = i - gridZ;
          const distSq = dx * dx + dz * dz;
          
          if (distSq < radius * radius) {
            const idx = i * size + j;
            const distFactor = 1 - Math.sqrt(distSq) / radius;
            
            // Create more complex ripple effect with multiple frequencies
            const ripple = 
              Math.sin(this.time * 2.0 + landPos.x * 0.05) * 0.6 + 
              Math.sin(this.time * 3.2 + landPos.z * 0.05) * 0.4;
            
            // Apply ripple with distance falloff
            this.waveGrid[idx] += adjustedStrength * distFactor * ripple;
            
            // Add some velocity for more dynamic effect
            this.waveVelocity[idx] += adjustedStrength * distFactor * 0.02 * 
              Math.sin(this.time * 4.0 + (landPos.x + landPos.z) * 0.1);
          }
        }
      }
      
      // Occasionally create a larger wave from land (like a boat wake)
      if (Math.random() < 0.001) {
        const wakeAngle = Math.random() * Math.PI * 2;
        const wakeLength = radius * 2;
        const wakeWidth = radius * 0.7;
        const wakeStrength = strength * 3;
        
        for (let i = Math.max(1, gridZ - radius * 3); i < Math.min(size - 1, gridZ + radius * 3); i++) {
          for (let j = Math.max(1, gridX - radius * 3); j < Math.min(size - 1, gridX + radius * 3); j++) {
            const dx = j - gridX;
            const dz = i - gridZ;
            
            // Distance along wake direction
            const alongDist = dx * Math.cos(wakeAngle) + dz * Math.sin(wakeAngle);
            
            // Distance perpendicular to wake direction
            const perpDist = Math.abs(dx * Math.sin(wakeAngle) - dz * Math.cos(wakeAngle));
            
            if (alongDist > 0 && alongDist < wakeLength && perpDist < wakeWidth) {
              const idx = i * size + j;
              
              // Taper the wake based on distance
              const alongFactor = 1 - alongDist / wakeLength;
              const perpFactor = 1 - perpDist / wakeWidth;
              const wakeFactor = alongFactor * perpFactor;
              
              // Apply wake impulse
              this.waveGrid[idx] += wakeStrength * wakeFactor;
            }
          }
        }
      }
    }
  }
  
  private createRandomWave() {
    if (!this.waveGrid) return;
    
    const size = this.gridSize;
    
    // Random position in grid with more variation
    const x = Math.floor(Math.random() * (size - 10)) + 5;
    const z = Math.floor(Math.random() * (size - 10)) + 5;
    
    // More varied radius and strength
    const radius = Math.floor(Math.random() * 7) + 3; // Increased max radius
    const strength = (Math.random() * 0.25) + 0.1; // More variation in strength
    
    // Determine wave type (0: circular, 1: elliptical, 2: directional)
    const waveType = Math.floor(Math.random() * 3);
    
    // Create wave with different patterns based on type
    for (let i = Math.max(1, z - radius * 1.5); i < Math.min(size - 1, z + radius * 1.5); i++) {
      for (let j = Math.max(1, x - radius * 1.5); j < Math.min(size - 1, x + radius * 1.5); j++) {
        const dx = j - x;
        const dz = i - z;
        
        let distFactor = 0;
        
        if (waveType === 0) {
          // Circular wave
          const distSq = dx * dx + dz * dz;
          if (distSq < radius * radius) {
            distFactor = 1 - Math.sqrt(distSq) / radius;
          }
        } 
        else if (waveType === 1) {
          // Elliptical wave
          const stretchFactor = 0.7 + Math.random() * 0.6; // Random stretch
          const distSq = dx * dx + (dz * dz) / (stretchFactor * stretchFactor);
          if (distSq < radius * radius) {
            distFactor = 1 - Math.sqrt(distSq) / radius;
          }
        }
        else {
          // Directional wave (like a wake)
          const angle = Math.random() * Math.PI * 2; // Random direction
          const dirX = Math.cos(angle);
          const dirZ = Math.sin(angle);
          
          // Distance along direction
          const alongDist = dx * dirX + dz * dirZ;
          
          // Distance perpendicular to direction
          const perpDist = Math.abs(dx * dirZ - dz * dirX);
          
          if (alongDist > -radius && alongDist < radius * 2 && perpDist < radius * 0.5) {
            // Taper the wave based on distance along direction
            const alongFactor = 1 - Math.abs(alongDist - radius * 0.5) / (radius * 1.5);
            const perpFactor = 1 - perpDist / (radius * 0.5);
            distFactor = alongFactor * perpFactor;
          }
        }
        
        if (distFactor > 0) {
          const idx = i * size + j;
          
          // Apply wave impulse with a bit of randomness
          this.waveGrid[idx] += strength * distFactor * (0.9 + Math.random() * 0.2);
          
          // Add some velocity for more dynamic waves
          this.waveVelocity[idx] += strength * distFactor * 0.5 * (Math.random() * 0.4 - 0.2);
        }
      }
    }
  }
  
  private applyWavesToGeometry() {
    if (!this.waterGeometry || !this.waveGrid) return;
    
    const positions = this.waterGeometry.attributes.position.array;
    const size = this.gridSize;
    const vertexCount = positions.length / 3;
    
    // Create or update normal attribute if needed
    if (!this.waterGeometry.attributes.normal) {
      this.waterGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    }
    const normals = this.waterGeometry.attributes.normal.array;
    
    // Apply wave heights to geometry vertices with improved interpolation
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
      
      // Improved cubic interpolation for smoother results
      const wx = fx * fx * (3 - 2 * fx); // Cubic interpolation weight
      const wz = fz * fz * (3 - 2 * fz); // Cubic interpolation weight
      
      // Apply cubic interpolation
      const h0 = h00 * (1 - wx) + h10 * wx;
      const h1 = h01 * (1 - wx) + h11 * wx;
      const height = h0 * (1 - wz) + h1 * wz;
      
      // Apply multiple layers of waves for more detail
      const smallWave = 
        Math.sin(x * 0.2 + this.time * 0.7) * 
        Math.cos(z * 0.2 + this.time * 0.5) * 0.1;
        
      const microWave = 
        Math.sin(x * 0.8 + this.time * 1.3) * 
        Math.sin(z * 0.7 + this.time * 1.1) * 0.03;
      
      // Combine all wave components
      positions[i3 + 1] = height + smallWave + microWave;
      
      // Calculate normals directly for better lighting
      // Get heights of neighboring points for normal calculation
      const eps = 0.1; // Small offset for normal calculation
      
      // Sample heights at neighboring points
      const hL = this.sampleHeight(gridX - eps, gridZ);
      const hR = this.sampleHeight(gridX + eps, gridZ);
      const hT = this.sampleHeight(gridX, gridZ - eps);
      const hB = this.sampleHeight(gridX, gridZ + eps);
      
      // Calculate normal using central differences
      const nx = (hL - hR) / (2 * eps);
      const nz = (hT - hB) / (2 * eps);
      
      // Normalize the normal vector
      const nl = Math.sqrt(nx * nx + 1 + nz * nz);
      normals[i3] = nx / nl;
      normals[i3 + 1] = 1 / nl;
      normals[i3 + 2] = nz / nl;
    }
    
    // Update geometry
    this.waterGeometry.attributes.position.needsUpdate = true;
    this.waterGeometry.attributes.normal.needsUpdate = true;
  }
  
  // Helper method to sample wave height at any point using bilinear interpolation
  private sampleHeight(gridX: number, gridZ: number): number {
    if (!this.waveGrid) return 0;
    
    const size = this.gridSize;
    
    // Clamp to grid bounds
    gridX = Math.max(0, Math.min(size - 1, gridX));
    gridZ = Math.max(0, Math.min(size - 1, gridZ));
    
    // Get grid indices
    const gx0 = Math.floor(gridX);
    const gz0 = Math.floor(gridZ);
    const gx1 = Math.min(gx0 + 1, size - 1);
    const gz1 = Math.min(gz0 + 1, size - 1);
    
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
    
    return h0 * (1 - fz) + h1 * fz;
  }
  
  private getWaterColorForView(): number {
    switch (this.activeView) {
      case 'transport':
        return 0x4d94ff; // Bright medium blue for transport
      case 'resources':
        return 0x00e6e6; // Bright cyan for resources
      case 'markets':
        return 0x66ccff; // Light blue for markets
      case 'governance':
        return 0x9999ff; // Lavender blue for governance
      case 'land':
        return 0x4d94ff; // Medium blue for land view
      case 'buildings':
        return 0x4d94ff; // Medium blue for buildings
      default:
        return 0x4d94ff; // Medium blue as default
    }
  }
  
  private getDeepWaterColorForView(): number {
    switch (this.activeView) {
      case 'transport':
        return 0x0047b3; // Deep royal blue for transport
      case 'resources':
        return 0x008080; // Teal for resources
      case 'markets':
        return 0x0066cc; // Medium blue for markets
      case 'governance':
        return 0x4d4dff; // Medium slate blue for governance
      case 'land':
        return 0x0047b3; // Deep royal blue for land view
      case 'buildings':
        return 0x0047b3; // Deep royal blue for buildings
      default:
        return 0x0047b3; // Deep royal blue as default
    }
  }
  
  public update(frameCount: number) {
    // Update time with fixed speed for consistent animation
    this.time += 0.05;
    
    // Skip if water mesh doesn't exist
    if (!this.waterMesh || !this.waterMaterial) {
      console.log('Water mesh or material missing, recreating water');
      this.initializeWaterSystem();
      return;
    }
    
    // Update shader uniforms
    this.waterMaterial.uniforms.time.value = this.time;
    
    // Force visibility every frame
    this.waterMesh.visible = true;
    
    // Log every 100 frames to confirm water is updating
    if (frameCount % 100 === 0) {
      console.log('Water animation updating, time:', this.time);
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
