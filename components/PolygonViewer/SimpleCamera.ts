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
    
    // Position camera for a better view of Venice - centered and less tilted
    // Venice coordinates are approximately centered at (0, 0, 0) in our scene
    this.camera.position.set(0, 30, 40); // Higher up and further back for less tilt
    this.camera.lookAt(0, 0, 0); // Looking at the center of Venice
    
    // Create controls
    this.controls = new OrbitControls(this.camera, domElement);
    
    // Configure controls with improved settings
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minPolarAngle = 0.2; // Increased minimum angle to prevent extreme top-down view
    this.controls.maxPolarAngle = Math.PI / 2.5; // Decreased maximum angle for less tilt
    this.controls.minDistance = 3; // Reduced from 4 to allow closer zoom
    this.controls.maxDistance = 50; // Reduced from 60 to keep focus on the map
    this.controls.screenSpacePanning = true; // Enable screen space panning
    
    // Disable left mouse button for rotation (button 0)
    this.controls.mouseButtons = {
      LEFT: undefined, // Left click does nothing
      MIDDLE: THREE.MOUSE.ROTATE, // Middle click rotates
      RIGHT: THREE.MOUSE.PAN // Right click pans
    };
    
    // Add a custom pan handler to maintain altitude during panning
    // Use type assertion since 'pan' exists in implementation but not in type definition
    const oldPanMethod = (this.controls as any).pan;
    (this.controls as any).pan = (deltaX: number, deltaY: number) => {
      // Get the current camera position before panning
      const oldY = this.camera.position.y;
      
      // Call the original pan method
      oldPanMethod.call(this.controls, deltaX, deltaY);
      
      // Restore the original y-coordinate to maintain altitude
      this.camera.position.y = oldY;
    };
    
    // Set initial target to the center of Venice
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
