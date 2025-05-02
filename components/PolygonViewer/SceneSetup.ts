import * as THREE from 'three';
// Use dynamic imports with type assertions
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ViewMode } from './types';
import CloudSystem from './CloudSystem';
import SimpleWater from './SimpleWater';

interface SceneSetupProps {
  canvas: HTMLCanvasElement;
  activeView: ViewMode;
  highQuality: boolean;
}

export default class SceneSetup {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  public composer: EffectComposer;
  private performanceMode: boolean;
  private sunLight: THREE.DirectionalLight = new THREE.DirectionalLight();
  private sunSphere: THREE.Mesh = new THREE.Mesh();
  private sunGlow: THREE.Mesh = new THREE.Mesh();
  private cloudSystem: CloudSystem | null = null;
  private zoomThreshold: number = 40; // Changed from 70 to 40 - Threshold for showing clouds
  public water: SimpleWater | null = null; // Reference to water effect
  private activeView: ViewMode;
  
  constructor({ canvas, activeView, highQuality }: SceneSetupProps) {
    this.performanceMode = !highQuality;
    this.activeView = activeView;
    
    // Initialize scene with a light blue background
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e6f7ff'); // Light blue background
    
    // No fog for cleaner visuals
    // Set up scene to use orthographic rendering for flat appearance
    this.scene.userData.flatRendering = true;
    
    // Create a camera with a better initial position
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );
    
    // Position camera higher up and looking down
    this.camera.position.set(0, 40, 0);
    this.camera.lookAt(0, 0, 0);
    
    // Initialize renderer with settings to prevent z-fighting
    this.renderer = new THREE.WebGLRenderer({ 
      canvas,
      antialias: true, // Enable antialiasing to reduce jagged edges
      powerPreference: 'high-performance',
      precision: this.performanceMode ? 'mediump' : 'highp',
      logarithmicDepthBuffer: true, // Enable logarithmic depth buffer to prevent z-fighting
      alpha: true // Add alpha channel to prevent white screen issues
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio > 1 ? 2 : 1); // Use higher pixel ratio for better quality
    this.renderer.shadowMap.enabled = false; // Disable shadows completely
    this.renderer.shadowMap.autoUpdate = false; // Explicitly disable shadow map updates
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.sortObjects = true; // Activate object sorting by the renderer
    // Set pixel ratio explicitly to prevent blurry edges
    this.renderer.setPixelRatio(window.devicePixelRatio > 1 ? window.devicePixelRatio : 1);
    
    // Set up a simple EffectComposer initially
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);
    
    // Enhance renderer after initial load
    setTimeout(() => {
      console.log('Enhancing renderer quality...');
      // No fog for cleaner visuals
      
      // Enhance renderer settings based on performance mode
      if (!this.performanceMode) {
        (this.renderer as any).antialias = true;
        this.renderer.setPixelRatio(window.devicePixelRatio > 1 ? 2 : 1);
        this.renderer.shadowMap.enabled = false; // Keep shadows disabled even in high quality mode
        this.renderer.shadowMap.autoUpdate = false; // Explicitly disable shadow map updates
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
      } else {
        // Keep minimal settings in performance mode
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.enabled = false;
        this.renderer.shadowMap.autoUpdate = false; // Explicitly disable shadow map updates
        this.renderer.toneMapping = THREE.NoToneMapping;
      }
    }, 2000); // Delay enhancement by 2 seconds
    
    // Set up OrbitControls with minimal configuration
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);

    // Add camera movement detection
    this.camera.userData.isMoving = false;
    this.controls.addEventListener('start', () => {
      this.camera.userData.isMoving = true;
    });
    this.controls.addEventListener('end', () => {
      this.camera.userData.isMoving = false;
    });

    // Disable all automatic behaviors
    this.controls.autoRotate = false;
    this.controls.enableDamping = false;
    
    // Prevent automatic camera resets
    this.controls.saveState = function() {}; // Override with empty function
    this.controls.reset = function() {}; // Override with empty function

    // Make controls very simple
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 0.5;
    this.controls.panSpeed = 1.5; // Increased from 0.5 to 1.5 for more responsive panning

    // Ensure controls are explicitly enabled
    this.controls.enablePan = true;
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
    
    // Limit vertical rotation to prevent going under the map
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI / 3; // Limit to 60 degrees from vertical
    
    // Basic limits
    this.controls.minDistance = 12.5; // Increased by 25% from 10
    this.controls.maxDistance = 60; // Decreased by 25% from 80
    
    // Enable panning with right mouse button and rotation with middle mouse button
    this.controls.mouseButtons = {
      LEFT: (THREE.MOUSE as any).NONE, // No action on left click
      MIDDLE: THREE.MOUSE.ROTATE, // Rotation on middle mouse button
      RIGHT: THREE.MOUSE.PAN // Panning on right mouse button (unchanged)
    };
    
    // Make panning parallel to the ground plane
    this.controls.screenSpacePanning = true; // Changed to true for more intuitive panning
    
    // Set initial target to center of scene
    this.controls.target.set(0, 0, 0);
    
    // Call the update method during initialization
    this.controls.update();
    
    // Add lights with a slight delay to improve initial loading
    setTimeout(() => this.setupLights(activeView), 100);
    
    // Add window resize handler
    window.addEventListener('resize', this.handleResize);
    
    setTimeout(() => {
      console.log('Creating cloud system...');
      // Create cloud system with a delay to prioritize initial scene loading
      this.cloudSystem = new CloudSystem({
        scene: this.scene,
        width: 300, // Increased width for wider cloud coverage
        height: 300, // Increased height for wider cloud coverage
        performanceMode: this.performanceMode
      });
      
      // Force an initial update to position clouds and make them visible
      if (this.cloudSystem) {
        console.log('Initializing clouds and setting visibility');
        this.cloudSystem.update(0);
        this.cloudSystem.setVisibility(true); // Force visibility initially
      }
    }, 2000); // Reduced from 3000 to 2000 ms
  }
  
  private setupLights(activeView: ViewMode) {
    console.log('Lights setup disabled');
    // No lights are created to avoid geometry generation
  }
  
  private animateSun() {
    // Do nothing - no sun animation
  }
  
  // Add method to create water
  public createWater() {
    console.log('Water effect creation disabled');
    // No water effect is created to avoid geometry generation
    this.water = null;
  }
  
  private calculateSunPosition(): THREE.Vector3 {
    // Get current time
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    // Convert to decimal hours (0-24)
    const timeOfDay = hours + minutes / 60;
    
    // Venezia coordinates (approximate)
    const latitude = 45.4; // Venezia latitude in degrees
    
    // Calculate sun position based on time of day
    // This is a simplified model - for more accuracy you'd need solar calculations
    
    // Map time to angle (0 at midnight, π at noon)
    const sunAngle = ((timeOfDay - 12) / 12) * Math.PI;
    
    // Calculate height based on time (highest at noon)
    // Adjust for latitude - sun is lower in northern latitudes
    const maxHeight = Math.cos((90 - latitude) * Math.PI / 180);
    const height = Math.sin(sunAngle) * maxHeight;
    
    // Calculate east-west position (east in morning, west in evening)
    const eastWest = Math.cos(sunAngle);
    
    // Calculate north-south position (more southern in winter, northern in summer)
    // This is a very simplified seasonal adjustment
    const month = now.getMonth(); // 0-11
    const seasonalOffset = Math.cos(((month - 6) / 6) * Math.PI) * 0.4;
    const northSouth = -seasonalOffset; // Negative because south is negative Z in Three.js
    
    // Create position vector
    // X = east(+)/west(-), Y = up, Z = north(+)/south(-)
    return new THREE.Vector3(
      eastWest * 100,
      Math.max(0.1, height) * 100, // Ensure sun is always at least slightly above horizon
      northSouth * 100
    );
  }
  
  
  private handleResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  };
  
  public updateControlsState(isInteractingWithPolygon: boolean) {
    if (isInteractingWithPolygon) {
      // Disable controls when interacting with polygons
      this.controls.enabled = false;
    } else {
      // Re-enable controls when not interacting
      this.controls.enabled = true;
    }
  }
  
  public updateClouds(frameCount: number) {
    if (!this.cloudSystem) {
      return;
    }
    
    // Show clouds only when zoomed out
    const showClouds = this.camera.position.y > this.zoomThreshold;
    if (frameCount % 100 === 0) { // Log only occasionally to avoid console spam
      console.log(`Camera height: ${this.camera.position.y}, Cloud threshold: ${this.zoomThreshold}, Showing clouds: ${showClouds}`);
    }
    
    try {
      this.cloudSystem.setVisibility(showClouds);
      
      // Update cloud animation
      if (showClouds) {
        this.cloudSystem.update(frameCount);
      }
    } catch (error) {
      console.error('Error updating clouds:', error);
    }
  }
  
  // Add update method to handle all animations
  public update(frameCount: number) {
    // Update water if it exists
    if (this.water) {
      this.water.update(frameCount);
    }
    
    // Update clouds
    this.updateClouds(frameCount);
  }
  
  public updateQuality(highQuality: boolean) {
    this.performanceMode = !highQuality;
    if (this.cloudSystem) {
      this.cloudSystem.updateQuality(this.performanceMode);
    }
    if (this.water) {
      this.water.updateQuality(this.performanceMode);
    }
    if (this.water) {
      this.water.updateQuality(this.performanceMode);
    }
  }
  
  public cleanup() {
    // Remove event listeners
    window.removeEventListener('resize', this.handleResize);
    
    // Dispose of controls
    if (this.controls) {
      this.controls.dispose();
    }
    
    // Dispose of Three.js resources - add null checks
    if (this.sunSphere) {
      this.scene.remove(this.sunSphere);
      if (this.sunSphere.geometry) {
        this.sunSphere.geometry.dispose();
      }
      if (this.sunSphere.material) {
        (this.sunSphere.material as THREE.Material).dispose();
      }
    }
    
    if (this.sunGlow) {
      this.scene.remove(this.sunGlow);
      if (this.sunGlow.geometry) {
        this.sunGlow.geometry.dispose();
      }
      if (this.sunGlow.material) {
        (this.sunGlow.material as THREE.Material).dispose();
      }
    }
    
    if (this.sunLight) {
      this.scene.remove(this.sunLight);
    }
    
    if (this.cloudSystem) {
      this.cloudSystem.cleanup();
      this.cloudSystem = null;
    }
    
    if (this.water) {
      this.water.cleanup();
      this.water = null;
    }
  }
}
