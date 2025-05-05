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
    this.camera.lookAt(0, 0, 0); // Looking at the origin where everything is positioned
    
    // Create controls
    this.controls = new OrbitControls(this.camera, domElement);
    
    // Configure controls
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minPolarAngle = 0.1; // Allow more downward angle to see water
    this.controls.maxPolarAngle = Math.PI / 2.5; // Limit to 72 degrees from vertical
    this.controls.minDistance = 2.5; // Allow zooming in 50% more (from 5 to 2.5)
    this.controls.maxDistance = 52.5; // Allow zooming out 30% less than current value (75 * 0.7 = 52.5)
    this.controls.screenSpacePanning = true; // Enable screen space panning
    
    // Disable left mouse button for rotation (button 0)
    this.controls.mouseButtons = {
      LEFT: undefined, // Left click does nothing
      MIDDLE: THREE.MOUSE.ROTATE, // Middle click rotates
      RIGHT: THREE.MOUSE.PAN // Right click pans
    };
    
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
