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
    // Increase water size by 50% to ensure it extends beyond view
    this.size = size * 1.5;
    this.clock = new THREE.Clock();
    
    // Create water
    this.water = this.createWater();
    this.scene.add(this.water);
    
    console.log('Water created with size:', this.size);
  }

  private createWater(): Water {
    // Water geometry - make it larger
    const waterGeometry = new THREE.PlaneGeometry(this.size, this.size);

    // Water texture
    const textureLoader = new THREE.TextureLoader();
    const waterNormals = textureLoader.load('/textures/waternormals.jpg', (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      // Increase repeat for more detailed waves
      texture.repeat.set(8, 8);
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
        waterColor: 0x0047ab, // Changed to a deeper royal blue (from 0x001e0f)
        distortionScale: 4.5,  // Increased from 3.7 for more pronounced waves
        fog: false
      }
    );

    // Position water - lower it slightly more to ensure it's below land
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.2; // Changed from -0.1 to -0.2 to ensure it's below land

    return water;
  }

  public update(): void {
    if (this.water.material instanceof THREE.ShaderMaterial) {
      // Update water animation - slow down slightly for more realistic ocean movement
      this.water.material.uniforms['time'].value += this.clock.getDelta() * 0.4;
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
