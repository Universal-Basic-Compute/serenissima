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
    // Create water geometry with higher resolution for smoother waves
    this.waterGeometry = new THREE.PlaneGeometry(
      this.width, 
      this.height, 
      this.performanceMode ? 256 : 384, // Increased resolution
      this.performanceMode ? 256 : 384
    );
    
    // Create water shader material with advanced effects
    const waterShader = {
      uniforms: {
        time: { value: 0.0 },
        waterColor: { value: new THREE.Color(this.getWaterColorForView()) },
        deepWaterColor: { value: new THREE.Color(this.getDeepWaterColorForView()) },
        sunPosition: { value: new THREE.Vector3(500, 300, 100) },
        sunColor: { value: new THREE.Color(0xffffeb) }
      },
      vertexShader: `
        uniform float time;
        varying vec2 vUv;
        varying float vElevation;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        
        // Improved wave function with multiple frequencies and amplitudes
        float wave(vec2 position) {
          // Large slow waves
          float wave1 = sin(position.x * 0.5 + time * 0.5) * 
                       cos(position.z * 0.4 + time * 0.3) * 0.8;
          
          // Medium waves
          float wave2 = sin(position.x * 1.0 + time * 0.8) * 
                       sin(position.z * 1.3 + time * 0.6) * 0.4;
          
          // Small ripples
          float wave3 = sin(position.x * 2.5 + time * 1.5) * 
                       sin(position.z * 2.8 + time * 1.7) * 0.2;
          
          // Micro detail
          float wave4 = sin(position.x * 5.0 + time * 2.5) * 
                       sin(position.z * 5.5 + time * 2.2) * 0.1;
          
          // Combine all waves
          return wave1 + wave2 + wave3 + wave4;
        }
        
        // Function to calculate normal from heightmap
        vec3 calculateNormal(vec2 pos) {
          float eps = 0.1;
          
          float centerHeight = wave(pos);
          float rightHeight = wave(pos + vec2(eps, 0.0));
          float topHeight = wave(pos + vec2(0.0, eps));
          
          vec3 dx = vec3(eps, rightHeight - centerHeight, 0.0);
          vec3 dy = vec3(0.0, topHeight - centerHeight, eps);
          
          return normalize(cross(dx, dy));
        }
        
        void main() {
          vUv = uv;
          
          // Calculate wave height
          vec3 pos = position;
          float elevation = wave(position.xz);
          pos.y += elevation * 1.5; // Increased wave height
          
          // Calculate normal for lighting
          vNormal = calculateNormal(position.xz);
          
          // Store elevation for fragment shader
          vElevation = elevation;
          
          // Calculate view position for reflections
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          vViewPosition = -mvPosition.xyz;
          
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 waterColor;
        uniform vec3 deepWaterColor;
        uniform float time;
        uniform vec3 sunPosition;
        uniform vec3 sunColor;
        
        varying vec2 vUv;
        varying float vElevation;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        
        // Fresnel approximation
        float fresnel(vec3 normal, vec3 viewDir, float power) {
          return pow(1.0 - max(0.0, dot(normalize(normal), normalize(viewDir))), power);
        }
        
        void main() {
          // Mix between deep and shallow water colors based on elevation
          float depthFactor = smoothstep(-0.5, 0.5, vElevation);
          vec3 color = mix(deepWaterColor, waterColor, depthFactor);
          
          // Add foam at wave peaks with smoother transition
          if (vElevation > 0.2) {
            float foamFactor = smoothstep(0.2, 0.4, vElevation);
            color = mix(color, vec3(1.0), foamFactor * 0.9);
          }
          
          // Add specular highlight (sun reflection)
          vec3 viewDir = normalize(vViewPosition);
          vec3 sunDir = normalize(sunPosition);
          vec3 halfwayDir = normalize(sunDir + viewDir);
          float spec = pow(max(dot(vNormal, halfwayDir), 0.0), 64.0);
          vec3 specular = sunColor * spec * 0.6;
          
          // Add fresnel effect (more reflective at glancing angles)
          float fresnelFactor = fresnel(vNormal, viewDir, 5.0);
          color = mix(color, vec3(0.8, 0.9, 1.0), fresnelFactor * 0.3);
          
          // Add light ray effect
          float lightRay = pow(abs(sin(vUv.x * 3.14159 * 2.0)), 20.0) * 0.15;
          
          // Add horizontal striations
          float striation = sin(vUv.y * 150.0 + time * 0.2) * 0.03;
          
          // Add subtle wave patterns with more variation
          float pattern = sin(vUv.x * 100.0 + time * 0.5) * sin(vUv.y * 100.0 + time * 0.3) * 0.1;
          pattern += sin(vUv.x * 50.0 - time * 0.3) * sin(vUv.y * 50.0 + time * 0.2) * 0.05;
          
          // Add caustics effect
          float causticPattern = 
            sin(vUv.x * 40.0 + time * 2.0) * 
            sin(vUv.y * 40.0 + time * 1.7) * 0.05;
          causticPattern = max(0.0, causticPattern);
          
          // Combine all effects
          color += pattern * vec3(0.2, 0.2, 0.4);
          color += lightRay * vec3(0.7, 0.8, 1.0);
          color += striation * vec3(0.5, 0.7, 1.0);
          color += specular;
          color += causticPattern * vec3(0.3, 0.6, 1.0);
          
          // Add subtle color variation based on time
          float colorShift = sin(time * 0.1) * 0.05;
          color.b += colorShift;
          color.g += colorShift * 0.5;
          
          gl_FragColor = vec4(color, 0.8); // Slightly increased opacity for better visibility
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
    // Update time with variable speed for more natural animation
    const timeSpeed = 0.1 + Math.sin(frameCount * 0.001) * 0.02; // Subtle variation in speed
    this.time += timeSpeed;
    
    // Skip if water mesh doesn't exist
    if (!this.waterMesh || !this.waterMaterial) return;
    
    // Update shader uniforms
    this.waterMaterial.uniforms.time.value = this.time;
    
    // Update sun position for dynamic lighting
    if (this.waterMaterial.uniforms.sunPosition) {
      const sunAngle = this.time * 0.05;
      const sunHeight = 300 + Math.sin(this.time * 0.02) * 100;
      this.waterMaterial.uniforms.sunPosition.value.set(
        Math.cos(sunAngle) * 500,
        sunHeight,
        Math.sin(sunAngle) * 500
      );
    }
    
    // Periodically update sun color for time-of-day effect
    if (this.waterMaterial.uniforms.sunColor && frameCount % 100 === 0) {
      const dayFactor = 0.5 + 0.5 * Math.sin(this.time * 0.01); // Day-night cycle
      const r = 1.0;
      const g = 0.9 + dayFactor * 0.1; // Slightly more yellow during day
      const b = 0.7 + dayFactor * 0.3; // More blue during day
      this.waterMaterial.uniforms.sunColor.value.setRGB(r, g, b);
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
