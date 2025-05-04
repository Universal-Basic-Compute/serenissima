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
      1, // Near clipping plane (increased from 0.1 to reduce depth range)
      500 // Far clipping plane (decreased from 1000 to reduce depth range)
    );
    
    // Position camera closer for the smaller water area
    this.camera.position.set(0, 40, 80); // Reduced from (0, 60, 120)
    this.camera.lookAt(0, 0, 0);
    
    // Create controls
    this.controls = new OrbitControls(this.camera, domElement);
    
    // Configure controls
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minPolarAngle = 0.1; // Allow more downward angle to see water
    this.controls.maxPolarAngle = Math.PI / 2.5; // Limit to 72 degrees from vertical
    this.controls.minDistance = 5; // Reduced from 10 to allow closer zoom
    this.controls.maxDistance = 150; // Reduced from 200 for the smaller area
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
