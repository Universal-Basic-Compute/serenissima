import * as THREE from 'three';
import { ViewMode } from './types';

interface AdvancedWaterProps {
  scene: THREE.Scene;
  activeView: ViewMode;
  performanceMode: boolean;
  width: number;
  height: number;
}

export default class AdvancedWater {
  private scene: THREE.Scene;
  private activeView: ViewMode;
  private performanceMode: boolean;
  private width: number;
  private height: number;
  private waterMesh: THREE.Mesh | null = null;
  private waterGeometry: THREE.PlaneGeometry | null = null;
  private waterMaterial: THREE.ShaderMaterial | null = null;
  private time: number = 0;
  private clock: THREE.Clock = new THREE.Clock();
  
  // Liquid simulation properties
  private simulationSize: number = 128; // Resolution of simulation
  private liquidHeightField: Float32Array | null = null;
  private liquidVelocityField: Float32Array | null = null;
  private previousHeightField: Float32Array | null = null;
  private damping: number = 0.98;
  private waveSpeed: number = 0.05;
  private lastUpdateTime: number = 0;
  private interactionPoints: {x: number, z: number, strength: number, radius: number}[] = [];

  constructor({
    scene,
    activeView,
    performanceMode,
    width,
    height
  }: AdvancedWaterProps) {
    this.scene = scene;
    this.activeView = activeView;
    this.performanceMode = performanceMode;
    this.width = width;
    this.height = height;
    
    // Initialize liquid simulation
    this.initializeSimulation();
    
    // Create water mesh with shader
    this.createWaterMesh();
    
    // Start the clock
    this.clock.start();
  }
  
  private initializeSimulation() {
    // Adjust simulation size based on performance mode
    this.simulationSize = this.performanceMode ? 64 : 128;
    
    // Create height and velocity fields
    const size = this.simulationSize * this.simulationSize;
    this.liquidHeightField = new Float32Array(size);
    this.liquidVelocityField = new Float32Array(size);
    this.previousHeightField = new Float32Array(size);
    
    // Initialize with small random values for natural appearance
    for (let i = 0; i < size; i++) {
      this.liquidHeightField[i] = (Math.random() * 2 - 1) * 0.01;
      this.liquidVelocityField[i] = 0;
      this.previousHeightField[i] = this.liquidHeightField[i];
    }
    
    // Add some initial interaction points
    this.addRandomInteractionPoints(5);
  }
  
  private addRandomInteractionPoints(count: number) {
    for (let i = 0; i < count; i++) {
      // Create more varied interaction points
      this.interactionPoints.push({
        x: (Math.random() - 0.5) * this.width,
        z: (Math.random() - 0.5) * this.height,
        strength: Math.random() * 0.2 + 0.05, // Increased from 0.1+0.02 to 0.2+0.05
        radius: Math.random() * 20 + 10 // Increased from 15+5 to 20+10
      });
    }
  }
  
  private createWaterMesh() {
    // Create a water plane with more segments for better wave simulation
    this.waterGeometry = new THREE.PlaneGeometry(
      this.width, 
      this.height, 
      this.simulationSize - 1, // Match segments with simulation size
      this.simulationSize - 1
    );
    
    // Create a custom shader material for water with improved visual effects
    const waterShader = {
      uniforms: {
        time: { value: 0.0 },
        waterColor: { value: new THREE.Color(this.getWaterColorForView()) },
        deepWaterColor: { value: new THREE.Color(this.getDeepWaterColorForView()) },
        foamColor: { value: new THREE.Color(0xffffff) },
        foamThreshold: { value: 0.08 },
        waveHeight: { value: 0.5 } // Increased from 0.2 to 0.5
      },
      vertexShader: `
        uniform float time;
        uniform float waveHeight;
        varying vec2 vUv;
        varying float vElevation;
        
        // Improved wave function for more natural movement
        float getWave(vec2 position) {
          float wave = sin(position.x * 10.0 + time * 1.5) * 0.1 +  // Increased amplitude and speed
                      sin(position.y * 8.0 + time * 1.2) * 0.08 +   // Increased amplitude and speed
                      sin(position.x * 6.0 + position.y * 6.0 + time * 1.8) * 0.06; // Increased amplitude and speed
          return wave;
        }
        
        void main() {
          vUv = uv;
          
          // Add procedural waves to the vertex position
          vec3 pos = position;
          pos.y += getWave(position.xz) * waveHeight;
          
          vElevation = pos.y;
          
          vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * viewMatrix * modelPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 waterColor;
        uniform vec3 deepWaterColor;
        uniform vec3 foamColor;
        uniform float foamThreshold;
        uniform float time;
        varying vec2 vUv;
        varying float vElevation;
        
        void main() {
          // Create depth-based color gradient
          float depthFactor = smoothstep(-0.1, 0.1, vElevation); // Increased range for more visible gradient
          
          // Mix between deep and shallow water colors
          vec3 color = mix(deepWaterColor, waterColor, depthFactor);
          
          // Add foam at wave peaks
          if (vElevation > foamThreshold) {
            float foamIntensity = smoothstep(foamThreshold, foamThreshold + 0.04, vElevation); // Increased range
            color = mix(color, foamColor, foamIntensity * 0.8); // Increased intensity
          }
          
          // Add subtle wave patterns
          float pattern = sin(vUv.x * 60.0 + time) * sin(vUv.y * 60.0 + time) * 0.08; // Increased frequency and amplitude
          color += pattern * vec3(0.15, 0.15, 0.3); // Increased color contribution
          
          // Add subtle highlights
          float highlight = max(0.0, sin(vUv.x * 40.0 + vUv.y * 30.0 + time * 0.8) * 0.15); // Increased frequency and amplitude
          color += highlight * vec3(0.15, 0.15, 0.4); // Increased color contribution
          
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
    
    // Create the water mesh
    this.waterMesh = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
    
    // Position water at y=-0.05 (slightly below land)
    this.waterMesh.position.y = -0.05;
    
    // Rotate the water plane to be horizontal
    this.waterMesh.rotation.x = -Math.PI / 2;
    
    // Set render order to ensure water appears below land
    this.waterMesh.renderOrder = 5;
    
    // Add to scene
    this.scene.add(this.waterMesh);
    
    console.log('Advanced water with liquid simulation created successfully');
  }
  
  // Add a new method to get deep water color
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
      default:
        return 0x005588; // Deep blue
    }
  }
  
  private updateLiquidSimulation(deltaTime: number) {
    if (!this.liquidHeightField || !this.liquidVelocityField || !this.previousHeightField) return;
    
    const size = this.simulationSize;
    
    // Save current height field
    for (let i = 0; i < size * size; i++) {
      this.previousHeightField[i] = this.liquidHeightField[i];
    }
    
    // Update simulation using wave equation with enhanced parameters
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
          this.liquidHeightField[up] + 
          this.liquidHeightField[down] + 
          this.liquidHeightField[left] + 
          this.liquidHeightField[right] - 
          4 * this.liquidHeightField[idx];
        
        // Increase wave speed for more visible waves
        this.liquidVelocityField[idx] += this.waveSpeed * 3.0 * laplacian; // Increased from 1.5 to 3.0
        
        // Apply damping
        this.liquidVelocityField[idx] *= this.damping;
        
        // Update height
        this.liquidHeightField[idx] += this.liquidVelocityField[idx] * deltaTime * 3.0; // Increased from 1.5 to 3.0
      }
    }
    
    // Apply boundary conditions (fixed edges)
    for (let i = 0; i < size; i++) {
      this.liquidHeightField[i] = 0; // Top edge
      this.liquidHeightField[i * size] = 0; // Left edge
      this.liquidHeightField[i * size + (size - 1)] = 0; // Right edge
      this.liquidHeightField[(size - 1) * size + i] = 0; // Bottom edge
    }
    
    // Apply interaction points with increased strength
    this.applyInteractionPoints();
    
    // Add more random interaction points for a livelier water surface
    if (Math.random() < 0.05) { // Increased from 0.03 to 0.05
      this.addRandomInteractionPoints(3); // Increased from 2 to 3
      
      // Remove old interaction points to keep the list manageable
      if (this.interactionPoints.length > 40) { // Increased from 30 to 40
        this.interactionPoints.shift();
      }
    }
  }
  
  private applyInteractionPoints() {
    if (!this.liquidHeightField) return;
    
    const size = this.simulationSize;
    
    // Apply each interaction point with increased strength
    for (const point of this.interactionPoints) {
      // Map world coordinates to simulation grid
      const gridX = Math.floor((point.x / this.width + 0.5) * (size - 1));
      const gridZ = Math.floor((point.z / this.height + 0.5) * (size - 1));
      
      // Calculate radius in grid cells
      const radiusInCells = Math.floor((point.radius / this.width) * size);
      
      // Apply disturbance in a circular area with increased strength
      for (let i = Math.max(1, gridZ - radiusInCells); i < Math.min(size - 1, gridZ + radiusInCells); i++) {
        for (let j = Math.max(1, gridX - radiusInCells); j < Math.min(size - 1, gridX + radiusInCells); j++) {
          const dx = j - gridX;
          const dz = i - gridZ;
          const distSq = dx * dx + dz * dz;
          
          if (distSq < radiusInCells * radiusInCells) {
            const idx = i * size + j;
            
            // Apply a sinusoidal disturbance that changes over time with increased amplitude
            const time = this.time * 4; // Increased from 3 to 4
            const distFactor = 1 - Math.sqrt(distSq) / radiusInCells;
            const strength = point.strength * distFactor * 4.0; // Increased from 2.0 to 4.0
            
            this.liquidHeightField[idx] += strength * Math.sin(time + distSq * 0.1);
          }
        }
      }
    }
  }
  
  private applySimulationToGeometry() {
    if (!this.waterGeometry || !this.liquidHeightField) return;
    
    const positions = this.waterGeometry.attributes.position.array;
    const size = this.simulationSize;
    
    // Apply height field to geometry vertices
    for (let i = 0; i < positions.length / 3; i++) {
      // Get vertex position in local coordinates
      const x = positions[i * 3];
      const z = positions[i * 3 + 2];
      
      // Map to simulation grid coordinates (0 to 1)
      const gridX = (x / this.width + 0.5) * (size - 1);
      const gridZ = (z / this.height + 0.5) * (size - 1);
      
      // Get grid indices
      const gx0 = Math.floor(gridX);
      const gz0 = Math.floor(gridZ);
      const gx1 = Math.min(gx0 + 1, size - 1);
      const gz1 = Math.min(gz0 + 1, size - 1);
      
      // Get interpolation factors
      const fx = gridX - gx0;
      const fz = gridZ - gz0;
      
      // Get wave heights at grid points
      const h00 = this.liquidHeightField[gz0 * size + gx0] || 0;
      const h10 = this.liquidHeightField[gz0 * size + gx1] || 0;
      const h01 = this.liquidHeightField[gz1 * size + gx0] || 0;
      const h11 = this.liquidHeightField[gz1 * size + gx1] || 0;
      
      // Bilinear interpolation
      const h0 = h00 * (1 - fx) + h10 * fx;
      const h1 = h01 * (1 - fx) + h11 * fx;
      const height = h0 * (1 - fz) + h1 * fz;
      
      // Apply height to vertex
      positions[i * 3 + 1] = height;
    }
    
    // Update geometry
    this.waterGeometry.attributes.position.needsUpdate = true;
    
    // Recalculate normals for proper lighting
    this.waterGeometry.computeVertexNormals();
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
  
  public update(frameCount: number) {
    // Update time
    this.time += 0.025; // Increased from 0.015 to 0.025
    
    // Get delta time for physics-based simulation
    const currentTime = this.clock.getElapsedTime();
    const deltaTime = Math.min(0.05, currentTime - this.lastUpdateTime); // Cap delta time
    this.lastUpdateTime = currentTime;
    
    // Skip if water mesh doesn't exist
    if (!this.waterMesh || !this.waterMaterial) return;
    
    // Update shader uniforms
    this.waterMaterial.uniforms.time.value = this.time;
    
    // Update liquid simulation
    this.updateLiquidSimulation(deltaTime);
    
    // Apply simulation to geometry
    this.applySimulationToGeometry();
    
    // Add occasional large waves
    if (Math.random() < 0.01) { // Increased from 0.005 to 0.01
      this.addLargeWave();
    }
  }
  
  // Add a new method to create occasional large waves
  private addLargeWave() {
    if (!this.liquidHeightField) return;
    
    const size = this.simulationSize;
    
    // Choose a random edge to start the wave from
    const edge = Math.floor(Math.random() * 4);
    const waveStrength = 0.3; // Increased from 0.15 to 0.3
    
    switch (edge) {
      case 0: // Top edge
        for (let j = 0; j < size; j++) {
          this.liquidHeightField[j] = waveStrength;
        }
        break;
      case 1: // Right edge
        for (let i = 0; i < size; i++) {
          this.liquidHeightField[i * size + (size - 1)] = waveStrength;
        }
        break;
      case 2: // Bottom edge
        for (let j = 0; j < size; j++) {
          this.liquidHeightField[(size - 1) * size + j] = waveStrength;
        }
        break;
      case 3: // Left edge
        for (let i = 0; i < size; i++) {
          this.liquidHeightField[i * size] = waveStrength;
        }
        break;
    }
  }
  
  public updateViewMode(activeView: ViewMode) {
    if (this.activeView === activeView) return;
    
    this.activeView = activeView;
    
    // Update water color
    if (this.waterMaterial) {
      this.waterMaterial.uniforms.waterColor.value = new THREE.Color(this.getWaterColorForView());
      this.waterMaterial.needsUpdate = true;
    }
  }
  
  public updateQuality(performanceMode: boolean) {
    if (this.performanceMode === performanceMode) return;
    
    this.performanceMode = performanceMode;
    
    // Reinitialize simulation with new resolution
    this.initializeSimulation();
    
    // Recreate water mesh with new resolution
    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
      
      if (this.waterGeometry) {
        this.waterGeometry.dispose();
      }
      
      if (this.waterMaterial) {
        this.waterMaterial.dispose();
      }
      
      this.createWaterMesh();
    }
  }
  
  public cleanup() {
    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
      
      if (this.waterGeometry) {
        this.waterGeometry.dispose();
      }
      
      if (this.waterMaterial) {
        this.waterMaterial.dispose();
      }
    }
    
    // Clear simulation data
    this.liquidHeightField = null;
    this.liquidVelocityField = null;
    this.previousHeightField = null;
    this.interactionPoints = [];
  }
}
