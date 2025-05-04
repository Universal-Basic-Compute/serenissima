import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default class SimpleCamera {
  public camera: THREE.PerspectiveCamera;
  public controls: OrbitControls;
  
  constructor(domElement: HTMLElement) {
    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      60, // Field of view
      window.innerWidth / window.innerHeight, // Aspect ratio
      0.1, // Near clipping plane
      1000 // Far clipping plane
    );
    
    // Position camera
    this.camera.position.set(0, 30, 60);
    this.camera.lookAt(0, 0, 0);
    
    // Create controls
    this.controls = new OrbitControls(this.camera, domElement);
    
    // Configure controls
    this.controls.enableDamping = false;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI / 3; // Limit to 60 degrees from vertical
    this.controls.minDistance = 5;
    this.controls.maxDistance = 100;
    this.controls.screenSpacePanning = false;
    
    // Set initial target
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }
  
  public update() {
    this.controls.update();
  }
  
  public cleanup() {
    this.controls.dispose();
  }
}
