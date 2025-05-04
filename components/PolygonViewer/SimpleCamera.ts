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
    
    // Position camera to see both land and water
    this.camera.position.set(0, 40, 80);
    this.camera.lookAt(0, 0, 0);
    
    // Create controls
    this.controls = new OrbitControls(this.camera, domElement);
    
    // Configure controls
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minPolarAngle = 0.1; // Allow more downward angle to see water
    this.controls.maxPolarAngle = Math.PI / 2.5; // Limit to 72 degrees from vertical
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
