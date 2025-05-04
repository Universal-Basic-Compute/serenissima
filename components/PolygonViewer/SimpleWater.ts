import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';

interface SimpleWaterProps {
  scene: THREE.Scene;
  size: number;
}

export default class SimpleWater {
  private scene: THREE.Scene;
  private water: Water;
  private size: number;
  private clock: THREE.Clock;

  constructor({ scene, size }: SimpleWaterProps) {
    this.scene = scene;
    // Reduce the water size multiplier from 1.5 to 0.8
    this.size = size * 0.8;
    this.clock = new THREE.Clock();
    
    // Create water
    this.water = this.createWater();
    this.scene.add(this.water);
    
    console.log('Water created with size:', this.size);
  }

  private createWater(): Water {
    // Water geometry - make it smaller
    const waterGeometry = new THREE.PlaneGeometry(this.size, this.size);

    // Water texture
    const textureLoader = new THREE.TextureLoader();
    const waterNormals = textureLoader.load('/textures/waternormals.jpg', (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      // Increase repeat for more detailed waves in the smaller area
      texture.repeat.set(4, 4); // Reduced from 8 to 4 for the smaller area
    });

    // Water material - adjust colors for more blue appearance
    const water = new Water(
      waterGeometry,
      {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: waterNormals,
        sunDirection: new THREE.Vector3(0, 1, 0),
        sunColor: 0xffffff,
        waterColor: 0x0047ab, // Deep royal blue
        distortionScale: 3.0,  // Reduced from 4.5 for smaller waves in the smaller area
        fog: false
      }
    );

    // Position water - CRITICAL CHANGE: Position water MUCH lower than land
    water.rotation.x = -Math.PI / 2;
    water.position.y = -5; // Position water 5 units below origin (land is at 0.5)
    
    // With this large separation, z-fighting should be completely eliminated

    return water;
  }

  public update(): void {
    if (this.water.material instanceof THREE.ShaderMaterial) {
      // Update water animation - slow down for smaller area
      this.water.material.uniforms['time'].value += this.clock.getDelta() * 0.3;
    }
  }

  public cleanup(): void {
    if (this.water) {
      this.scene.remove(this.water);
      
      if (this.water.geometry) {
        this.water.geometry.dispose();
      }
      
      if (this.water.material) {
        if (Array.isArray(this.water.material)) {
          this.water.material.forEach(material => material.dispose());
        } else {
          this.water.material.dispose();
        }
      }
    }
  }
}
