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
  private time: number = 0;
  private clock: THREE.Clock = new THREE.Clock();
  
  // Water surface
  private waterMesh: THREE.Mesh | null = null;
  private waterGeometry: THREE.PlaneGeometry | null = null;
  private waterMaterial: THREE.ShaderMaterial | null = null;
  
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
    
    // Initialize the water system
    this.initializeWaterSystem();
    
    // Start the clock
    this.clock.start();
  }
  
  private initializeWaterSystem() {
    console.log('Initializing simple water system...');
    
    // Create the water surface with shader-based waves
    this.createWaterSurface();
  }
  
  private createWaterSurface() {
    // Create water geometry with higher resolution
    this.waterGeometry = new THREE.PlaneGeometry(
      this.width, 
      this.height, 
      256, // Increased from 128 for smoother waves
      256
    );
    
    // Create water shader material with improved shader
    const waterShader = {
      uniforms: {
        time: { value: 0.0 },
        waterColor: { value: new THREE.Color(this.getWaterColorForView()) },
        deepWaterColor: { value: new THREE.Color(this.getDeepWaterColorForView()) }
      },
      vertexShader: `
        uniform float time;
        varying vec2 vUv;
        varying float vElevation;
        
        void main() {
          vUv = uv;
          
          // More pronounced wave calculation
          float elevation = 
            sin(position.x * 0.5 + time * 0.5) * 
            cos(position.z * 0.4 + time * 0.3) * 0.8 +
            sin(position.x * 1.0 + time * 0.8) * 
            sin(position.z * 1.3 + time * 0.6) * 0.4 +
            sin(position.x * 2.5 + time * 1.5) * 
            sin(position.z * 2.8 + time * 1.7) * 0.2;
          
          vElevation = elevation;
          
          vec3 pos = position;
          pos.y += elevation * 1.5; // Increased wave height multiplier from 0.8 to 1.5
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 waterColor;
        uniform vec3 deepWaterColor;
        uniform float time; // Add time uniform to fragment shader
        varying vec2 vUv;
        varying float vElevation;
        
        void main() {
          // Mix between deep and shallow water colors based on elevation
          float depthFactor = smoothstep(-0.5, 0.5, vElevation);
          vec3 color = mix(deepWaterColor, waterColor, depthFactor);
          
          // Add foam at wave peaks - more visible
          if (vElevation > 0.2) { // Lower threshold from 0.25 to 0.2
            float foamFactor = smoothstep(0.2, 0.4, vElevation);
            color = mix(color, vec3(1.0), foamFactor * 0.9);
          }
          
          // Add subtle wave patterns - more pronounced
          float pattern = sin(vUv.x * 100.0 + time * 0.5) * sin(vUv.y * 100.0 + time * 0.3) * 0.1; // Increased from 0.05 to 0.1
          color += pattern * vec3(0.2, 0.2, 0.4); // Increased color impact
          
          gl_FragColor = vec4(color, 0.9); // Add slight transparency (0.9 instead of 1.0)
        }
      `
    };
    
    // Create the material with transparency enabled
    this.waterMaterial = new THREE.ShaderMaterial({
      uniforms: waterShader.uniforms,
      vertexShader: waterShader.vertexShader,
      fragmentShader: waterShader.fragmentShader,
      transparent: true, // Enable transparency
      side: THREE.DoubleSide
    });
    
    // Create the water mesh
    this.waterMesh = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
    
    // Position water at y=0 (surface level) - move higher for better visibility
    this.waterMesh.position.y = 0.01; // Changed from -0.05 to 0.01 to be more visible
    
    // Rotate the water plane to be horizontal
    this.waterMesh.rotation.x = -Math.PI / 2;
    
    // Set render order to ensure water appears below land
    this.waterMesh.renderOrder = 5;
    
    // Add user data flag to identify as water mesh
    this.waterMesh.userData.isWaterMesh = true;
    
    // Add to scene
    this.scene.add(this.waterMesh);
    
    console.log('Water surface created successfully');
  }
  
  private getWaterColorForView(): number {
    switch (this.activeView) {
      case 'transport':
        return 0x33ccff; // Brighter blue
      case 'resources':
        return 0x00ffdd; // Brighter teal
      case 'markets':
        return 0x66ddff; // Brighter steel blue
      case 'governance':
        return 0x9988ff; // Brighter slate blue
      case 'land':
        return 0x33ccff; // Brighter sea blue
      case 'buildings':
        return 0x33ccff; // Brighter turquoise
      default:
        return 0x33ccff; // Default brighter blue
    }
  }
  
  private getDeepWaterColorForView(): number {
    switch (this.activeView) {
      case 'transport':
        return 0x0088ff; // Deeper blue
      case 'resources':
        return 0x00aaaa; // Deeper teal
      case 'markets':
        return 0x0088cc; // Deeper steel blue
      case 'governance':
        return 0x6a5fdb; // Deeper slate blue
      case 'land':
        return 0x0088dd; // Deeper sea blue
      case 'buildings':
        return 0x0088dd; // Deeper blue
      default:
        return 0x0088dd; // Default deeper blue
    }
  }
  
  public update(frameCount: number) {
    // Update time with faster speed
    this.time += 0.1; // Doubled from 0.05 to 0.1
    
    // Skip if water mesh doesn't exist
    if (!this.waterMesh || !this.waterMaterial) return;
    
    // Update shader uniforms
    this.waterMaterial.uniforms.time.value = this.time;
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
  
  public setLandPositions(positions: THREE.Vector3[]) {
    // This method is kept for compatibility but doesn't do anything in the simple version
    console.log(`Received ${positions.length} land positions (not used in simple water)`);
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
  }
}
