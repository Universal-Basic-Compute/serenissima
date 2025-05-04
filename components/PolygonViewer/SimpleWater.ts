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
    this.size = size;
    this.clock = new THREE.Clock();
    
    // Create water
    this.water = this.createWater();
    this.scene.add(this.water);
    
    console.log('Water created with size:', size);
  }

  private createWater(): Water {
    // Water geometry
    const waterGeometry = new THREE.PlaneGeometry(this.size, this.size);

    // Water texture
    const textureLoader = new THREE.TextureLoader();
    const waterNormals = textureLoader.load('/textures/waternormals.jpg', (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    });

    // Water material
    const water = new Water(
      waterGeometry,
      {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: waterNormals,
        sunDirection: new THREE.Vector3(0, 1, 0),
        sunColor: 0xffffff,
        waterColor: 0x001e0f,
        distortionScale: 3.7,
        fog: false
      }
    );

    // Position water
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.1; // Slightly below ground level

    return water;
  }

  public update(): void {
    if (this.water.material instanceof THREE.ShaderMaterial) {
      // Update water animation
      this.water.material.uniforms['time'].value += this.clock.getDelta() * 0.5;
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
