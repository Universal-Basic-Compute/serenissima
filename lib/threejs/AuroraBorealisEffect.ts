import * as THREE from 'three';

export interface AuroraBorealisProps {
  scene: THREE.Scene;
  position?: { x: number; y: number; z: number };
  radius?: number;
  height?: number;
  colors?: THREE.Color[];
}

export class AuroraBorealisEffect {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private clock: THREE.Clock;
  private isDisposed: boolean = false;

  constructor({
    scene,
    position = { x: 0, y: 0, z: 0 },
    radius = 5,
    height = 15,
    colors = [
      new THREE.Color(0x00ffff), // Cyan
      new THREE.Color(0xff00ff), // Magenta
      new THREE.Color(0x00ff00), // Green
    ],
  }: AuroraBorealisProps) {
    this.scene = scene;
    this.clock = new THREE.Clock();

    // Create shader material for the aurora effect
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color1: { value: colors[0] },
        color2: { value: colors[1] },
        color3: { value: colors[2] },
        opacity: { value: 0.6 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        
        void main() {
          vUv = uv;
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color1;
        uniform vec3 color2;
        uniform vec3 color3;
        uniform float opacity;
        
        varying vec2 vUv;
        varying vec3 vPosition;
        
        void main() {
          // Create vertical wave effect
          float wave1 = sin(vUv.y * 10.0 + time * 0.5) * 0.5 + 0.5;
          float wave2 = sin(vUv.y * 15.0 - time * 0.7) * 0.5 + 0.5;
          float wave3 = sin(vUv.y * 5.0 + time * 0.3) * 0.5 + 0.5;
          
          // Angular component for rotation around cylinder
          float angle = atan(vPosition.x, vPosition.z);
          float angularWave = sin(angle * 8.0 + time * 0.8) * 0.5 + 0.5;
          
          // Mix colors based on waves and time
          vec3 color = mix(color1, color2, wave1);
          color = mix(color, color3, wave2 * sin(time * 0.2) * 0.5 + 0.5);
          
          // Add radial gradient for edge glow
          float radius = length(vPosition.xz);
          float normalizedRadius = radius / 5.0; // Assuming radius = 5
          float edgeGlow = smoothstep(0.8, 1.0, normalizedRadius) * 0.8 + 0.2;
          
          // Height-based opacity
          float heightFactor = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
          
          // Combine all effects
          float finalOpacity = opacity * heightFactor * (0.6 + 0.4 * angularWave) * edgeGlow;
          
          gl_FragColor = vec4(color, finalOpacity);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Create a cylinder geometry for the aurora
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 64, 64, true);
    
    // Create the mesh
    this.mesh = new THREE.Mesh(geometry, this.material);
    
    // Position the aurora
    this.mesh.position.set(position.x, position.y + height / 2, position.z);
    
    // Add to scene
    this.scene.add(this.mesh);
  }

  /**
   * Animate the aurora effect
   */
  public animate() {
    if (this.isDisposed) return;
    
    const time = this.clock.getElapsedTime();
    
    // Update shader uniforms
    if (this.material.uniforms) {
      this.material.uniforms.time.value = time;
    }
  }

  /**
   * Clean up resources
   */
  public dispose() {
    if (this.isDisposed) return;
    
    this.scene.remove(this.mesh);
    
    if (this.mesh.geometry) {
      this.mesh.geometry.dispose();
    }
    
    if (this.material) {
      this.material.dispose();
    }
    
    this.isDisposed = true;
  }
}
