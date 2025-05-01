import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { ViewMode } from './types';

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
  private sunLight: THREE.DirectionalLight;
  private sunSphere: THREE.Mesh;
  private sunGlow: THREE.Mesh;
  
  constructor({ canvas, activeView, highQuality }: SceneSetupProps) {
    this.performanceMode = !highQuality;
    
    // Initialize scene with simpler settings initially
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1e5799'); // Brighter blue background
    
    // Skip fog initially for faster loading - we'll add it later
    
    // Create a camera with a better initial position
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );
    
    // Initial camera position - higher up and further back for a good overview
    this.camera.position.set(0, 80, 80);
    
    // Initialize renderer with minimal settings initially
    this.renderer = new THREE.WebGLRenderer({ 
      canvas,
      antialias: false, // Start without antialiasing for faster initial render
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(1); // Start with lowest pixel ratio
    this.renderer.shadowMap.enabled = false; // Start without shadows
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Set up a simple EffectComposer initially
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);
    
    // Enhance renderer after initial load
    setTimeout(() => {
      console.log('Enhancing renderer quality...');
      // Add fog for depth
      this.scene.fog = new THREE.FogExp2('#1e5799', 0.0005);
      
      // Enhance renderer settings
      this.renderer.antialias = true;
      this.renderer.setPixelRatio(this.performanceMode ? 1 : (window.devicePixelRatio > 1 ? 2 : 1));
      this.renderer.shadowMap.enabled = !this.performanceMode;
      this.renderer.shadowMap.type = this.performanceMode ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.2;
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
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
    
    // Basic limits
    this.controls.minDistance = 10;
    this.controls.maxDistance = 200; // Increased from 128 to allow more zooming out
    
    // Enable panning with right mouse button and rotation with middle mouse button
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.NONE, // No action on left click
      MIDDLE: THREE.MOUSE.ROTATE, // Rotation on middle mouse button
      RIGHT: THREE.MOUSE.PAN // Panning on right mouse button (unchanged)
    };
    
    // Make panning parallel to the ground plane
    this.controls.screenSpacePanning = true; // Changed to true for more intuitive panning
    
    // Set initial target to center of scene
    this.controls.target.set(0, 0, 0);
    
    // Call the update method during initialization
    this.controls.update();
    
    // Add lights
    this.setupLights(activeView);
    
    // Add window resize handler
    window.addEventListener('resize', this.handleResize);
  }
  
  private setupLights(activeView: ViewMode) {
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    // Add a hemisphere light for better overall illumination
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x0044ff, 0.6);
    this.scene.add(hemisphereLight);
    
    // Main directional light (sun) - bigger and more yellow
    this.sunLight = new THREE.DirectionalLight(0xffffcc, 1.8);
    this.sunLight.position.set(50, 100, 50);
    this.sunLight.castShadow = true;
    
    // Create a sun sphere for visual effect
    const sunGeometry = new THREE.SphereGeometry(5, 16, 16);
    const sunMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffaa, 
      transparent: true,
      opacity: 0.8
    });
    this.sunSphere = new THREE.Mesh(sunGeometry, sunMaterial);
    this.sunSphere.position.copy(this.sunLight.position);
    this.scene.add(this.sunSphere);
    
    // Add a subtle glow effect to the sun
    const sunGlowGeometry = new THREE.SphereGeometry(7, 16, 16);
    const sunGlowMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffdd, 
      transparent: true,
      opacity: 0.4,
      side: THREE.BackSide
    });
    this.sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
    this.sunGlow.position.copy(this.sunLight.position);
    this.scene.add(this.sunGlow);
    
    // Reduced shadow map resolution for better performance
    this.sunLight.shadow.mapSize.width = this.performanceMode ? 512 : 1024;
    this.sunLight.shadow.mapSize.height = this.performanceMode ? 512 : 1024;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 500;
    this.sunLight.shadow.camera.left = -100;
    this.sunLight.shadow.camera.right = 100;
    this.sunLight.shadow.camera.top = 100;
    this.sunLight.shadow.camera.bottom = -100;
    this.sunLight.shadow.bias = -0.0001;
    
    this.scene.add(this.sunLight);
    
    // Add a secondary light for better illumination
    const fillLight = new THREE.DirectionalLight(0xadd8e6, 0.5);
    fillLight.position.set(-50, 50, -50);
    this.scene.add(fillLight);
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
  
  public cleanup() {
    // Remove event listeners
    window.removeEventListener('resize', this.handleResize);
    
    // Dispose of controls
    this.controls.dispose();
    
    // Dispose of Three.js resources
    this.scene.remove(this.sunSphere);
    this.scene.remove(this.sunGlow);
    this.scene.remove(this.sunLight);
    
    // Dispose of geometries and materials
    this.sunSphere.geometry.dispose();
    (this.sunSphere.material as THREE.Material).dispose();
    this.sunGlow.geometry.dispose();
    (this.sunGlow.material as THREE.Material).dispose();
  }
}
