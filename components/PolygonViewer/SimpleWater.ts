import * as THREE from 'three';
import { ViewMode } from './types';

interface SimpleWaterProps {
  scene: THREE.Scene;
  activeView: ViewMode;
  performanceMode: boolean;
  width: number;
  height: number;
}

export default class SimpleWater {
  private scene: THREE.Scene;
  private activeView: ViewMode;
  private performanceMode: boolean;
  private width: number;
  private height: number;
  private waterMesh: THREE.Mesh | null = null;
  private time: number = 0;
  private waveSimulationData: Float32Array | null = null;
  private waveVelocity: Float32Array | null = null;
  private waveSimulationSize = 128; // Match with geometry segments
  private damping = 0.98;
  private waveSpeed = 0.05;
  private lastUpdateTime = 0;

  constructor({
    scene,
    activeView,
    performanceMode,
    width,
    height
  }: SimpleWaterProps) {
    this.scene = scene;
    this.activeView = activeView;
    this.performanceMode = performanceMode;
    this.width = width;
    this.height = height;
    
    // Create a simple water plane immediately
    this.createWater();
  }
  
  private createWater() {
    console.log('Creating physically simulated water plane...');
    
    // Create a water plane with more segments for better wave animation
    const geometry = new THREE.PlaneGeometry(
      this.width * 4, 
      this.height * 4, 
      128, // Increase segments significantly for smoother waves
      128
    );
    
    // Load water textures
    const textureLoader = new THREE.TextureLoader();
    
    // Load water normal map with better error handling
    const normalMap = textureLoader.load('/textures/waternormals.jpg', 
      (texture) => {
        console.log('Water normal map loaded successfully');
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(8, 8); // Increase repeat for more detailed waves
      },
      undefined,
      (error) => {
        console.error('Error loading water normal map:', error);
        // Create a fallback normal map
        this.createFallbackNormalMap();
      }
    );
    
    // Create a more advanced material for water with stronger normal effect
    const waterColor = new THREE.Color(this.getWaterColorForView());
    const material = new THREE.MeshPhongMaterial({
      color: waterColor,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      normalMap: normalMap,
      normalScale: new THREE.Vector2(1.5, 1.5),
      shininess: 100,
      specular: 0x111111,
    });
    
    // Create the water mesh
    this.waterMesh = new THREE.Mesh(geometry, material);
    
    // Position water at y=-0.05 (closer to the land which is at y=0.1)
    this.waterMesh.position.y = -0.05;
    
    // Rotate the water plane to be horizontal
    this.waterMesh.rotation.x = -Math.PI / 2;
    
    // Set render order to ensure water appears below land
    this.waterMesh.renderOrder = 5;
    
    // Add to scene
    this.scene.add(this.waterMesh);
    
    // Initialize wave simulation data
    this.initializeWaveSimulation();
    
    console.log('Enhanced water mesh with physical simulation created successfully');
  }
  
  // Add this method to create a fallback normal map
  private createFallbackNormalMap() {
    console.log('Creating fallback water normal map');
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Create a more complex wave pattern
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          // Create multiple overlapping sine waves for more realistic water
          const r = Math.floor(127 * Math.sin((x / canvas.width) * Math.PI * 10) + 127);
          const g = Math.floor(127 * Math.sin((y / canvas.height) * Math.PI * 10) + 127);
          const b = 255; // Full blue for normal map
          
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      
      const fallbackTexture = new THREE.CanvasTexture(canvas);
      fallbackTexture.wrapS = fallbackTexture.wrapT = THREE.RepeatWrapping;
      fallbackTexture.repeat.set(8, 8);
      
      // Apply to water mesh if it exists
      if (this.waterMesh) {
        const material = this.waterMesh.material as THREE.MeshPhysicalMaterial;
        material.normalMap = fallbackTexture;
        material.needsUpdate = true;
      }
    }
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
    this.time += 0.01;
    
    // Skip if water mesh doesn't exist
    if (!this.waterMesh) return;
    
    // Get the material
    const material = this.waterMesh.material as THREE.MeshPhongMaterial;
    
    // Update normal map offset for wave animation
    if (material.normalMap) {
      // Create more complex wave motion with multiple frequencies
      material.normalMap.offset.x = Math.sin(this.time * 0.05) * 0.2 + this.time * 0.05;
      material.normalMap.offset.y = Math.cos(this.time * 0.04) * 0.2 + this.time * 0.03;
      
      // Vary normal scale for more dynamic waves
      const scale = 1.0 + Math.sin(this.time * 0.1) * 0.5;
      material.normalScale.set(scale, scale);
      
      // Slightly vary the water color over time for more realism
      const baseColor = new THREE.Color(this.getWaterColorForView());
      const r = baseColor.r + Math.sin(this.time * 0.1) * 0.05;
      const g = baseColor.g + Math.cos(this.time * 0.15) * 0.05;
      const b = baseColor.b + Math.sin(this.time * 0.2) * 0.05;
      material.color.setRGB(r, g, b);
      
      // Update material
      material.needsUpdate = true;
    }
    
    // Update wave simulation
    this.updateWaveSimulation();
    
    // Apply wave simulation to geometry
    this.applyWavesToGeometry();
  }
  
  public updateViewMode(activeView: ViewMode) {
    this.activeView = activeView;
    
    // Update water color
    if (this.waterMesh) {
      const waterColor = this.getWaterColorForView();
      (this.waterMesh.material as THREE.MeshBasicMaterial).color.setHex(waterColor);
    }
  }
  
  public updateQuality(performanceMode: boolean) {
    this.performanceMode = performanceMode;
  }
  
  // Add method to initialize wave simulation
  private initializeWaveSimulation() {
    const size = this.waveSimulationSize;
    this.waveSimulationData = new Float32Array(size * size);
    this.waveVelocity = new Float32Array(size * size);
    
    // Initialize with small random values
    for (let i = 0; i < size * size; i++) {
      this.waveSimulationData[i] = (Math.random() * 2 - 1) * 0.01;
      this.waveVelocity[i] = 0;
    }
    
    this.lastUpdateTime = Date.now();
  }

  // Add method to update wave simulation using wave equation
  private updateWaveSimulation() {
    if (!this.waveSimulationData || !this.waveVelocity) return;
    
    const now = Date.now();
    const deltaTime = Math.min(0.05, (now - this.lastUpdateTime) / 1000); // Cap at 50ms
    this.lastUpdateTime = now;
    
    const size = this.waveSimulationSize;
    const newWaveData = new Float32Array(size * size);
    
    // Add random wave sources occasionally
    if (Math.random() < 0.03) {
      const x = Math.floor(Math.random() * (size - 10)) + 5;
      const y = Math.floor(Math.random() * (size - 10)) + 5;
      const idx = y * size + x;
      this.waveSimulationData[idx] += (Math.random() * 2 - 1) * 0.2;
    }
    
    // Update wave simulation using the wave equation
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
          this.waveSimulationData[up] + 
          this.waveSimulationData[down] + 
          this.waveSimulationData[left] + 
          this.waveSimulationData[right] - 
          4 * this.waveSimulationData[idx];
        
        // Update velocity using wave equation
        this.waveVelocity[idx] += this.waveSpeed * laplacian;
        
        // Apply damping
        this.waveVelocity[idx] *= this.damping;
        
        // Update height
        newWaveData[idx] = this.waveSimulationData[idx] + this.waveVelocity[idx] * deltaTime;
      }
    }
    
    // Apply boundary conditions (fixed edges)
    for (let i = 0; i < size; i++) {
      newWaveData[i] = 0; // Top edge
      newWaveData[i * size] = 0; // Left edge
      newWaveData[i * size + (size - 1)] = 0; // Right edge
      newWaveData[(size - 1) * size + i] = 0; // Bottom edge
    }
    
    // Update wave data
    this.waveSimulationData = newWaveData;
  }

  // Add method to apply wave simulation to geometry
  private applyWavesToGeometry() {
    if (!this.waterMesh || !this.waveSimulationData) return;
    
    // Get geometry
    const geometry = this.waterMesh.geometry as THREE.PlaneGeometry;
    const positions = geometry.attributes.position.array;
    const size = this.waveSimulationSize;
    
    // Apply wave heights to geometry vertices
    for (let i = 0; i < positions.length / 3; i++) {
      // Get vertex position in local coordinates
      const x = positions[i * 3];
      const z = positions[i * 3 + 2];
      
      // Map to simulation grid coordinates (0 to 1)
      const gridX = (x / (this.width * 4) + 0.5) * (size - 1);
      const gridZ = (z / (this.height * 4) + 0.5) * (size - 1);
      
      // Get grid indices
      const gx0 = Math.floor(gridX);
      const gz0 = Math.floor(gridZ);
      const gx1 = Math.min(gx0 + 1, size - 1);
      const gz1 = Math.min(gz0 + 1, size - 1);
      
      // Get interpolation factors
      const fx = gridX - gx0;
      const fz = gridZ - gz0;
      
      // Get wave heights at grid points
      const h00 = this.waveSimulationData[gz0 * size + gx0] || 0;
      const h10 = this.waveSimulationData[gz0 * size + gx1] || 0;
      const h01 = this.waveSimulationData[gz1 * size + gx0] || 0;
      const h11 = this.waveSimulationData[gz1 * size + gx1] || 0;
      
      // Bilinear interpolation
      const h0 = h00 * (1 - fx) + h10 * fx;
      const h1 = h01 * (1 - fx) + h11 * fx;
      const height = h0 * (1 - fz) + h1 * fz;
      
      // Apply height to vertex
      positions[i * 3 + 1] = height * 0.5; // Scale factor for wave height
    }
    
    // Update geometry
    geometry.attributes.position.needsUpdate = true;
    
    // Recalculate normals for proper lighting
    geometry.computeVertexNormals();
  }

  public cleanup() {
    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
      
      if (this.waterMesh.geometry) {
        this.waterMesh.geometry.dispose();
      }
      
      if (this.waterMesh.material) {
        (this.waterMesh.material as THREE.Material).dispose();
      }
    }
    
    // Clear wave simulation data
    this.waveSimulationData = null;
    this.waveVelocity = null;
  }
}
