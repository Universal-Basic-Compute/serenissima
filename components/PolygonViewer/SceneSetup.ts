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
    this.scene.background = new THREE.Color('#87CEEB'); // Sky blue background
    
    // No fog for cleaner visuals
    
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
      powerPreference: 'high-performance',
      precision: this.performanceMode ? 'mediump' : 'highp', // Lower precision in performance mode
      logarithmicDepthBuffer: false // Disable for better performance
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(1); // Start with lowest pixel ratio
    this.renderer.shadowMap.enabled = false; // Disable shadows completely
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    
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
        this.renderer.antialias = true;
        this.renderer.setPixelRatio(window.devicePixelRatio > 1 ? 2 : 1);
        this.renderer.shadowMap.enabled = false; // Keep shadows disabled even in high quality mode
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
      } else {
        // Keep minimal settings in performance mode
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.enabled = false;
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
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
    
    // Basic limits
    this.controls.minDistance = 2; // Decreased to 2 to allow even more zooming in
    this.controls.maxDistance = 100; // Set to 100 for a more controlled zoom range
    
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
    
    // Add lights with a slight delay to improve initial loading
    setTimeout(() => this.setupLights(activeView), 100);
    
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
    this.sunLight.castShadow = false; // Ensure shadows are completely disabled
    
    // Create a sun sphere for visual effect
    const sunGeometry = new THREE.SphereGeometry(5, 16, 16);
    const sunMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffaa, 
      transparent: true,
      opacity: 0.8
    });
    this.sunSphere = new THREE.Mesh(sunGeometry, sunMaterial);
    this.sunSphere.position.copy(this.sunLight.position);
    
    // Add bloom effect to sun
    const sunBloomGeometry = new THREE.SphereGeometry(6, 16, 16);
    const sunBloomMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffee,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending
    });
    const sunBloom = new THREE.Mesh(sunBloomGeometry, sunBloomMaterial);
    this.sunSphere.add(sunBloom);
    
    this.scene.add(this.sunSphere);
    
    // Add a subtle glow effect to the sun
    const sunGlowGeometry = new THREE.SphereGeometry(10, 16, 16);
    const sunGlowMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffdd, 
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending
    });
    this.sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
    this.sunGlow.position.copy(this.sunLight.position);
    this.scene.add(this.sunGlow);
    
    // Add sun rays using line segments
    const rayCount = 8;
    const rayGeometry = new THREE.BufferGeometry();
    const rayMaterial = new THREE.LineBasicMaterial({
      color: 0xffffcc,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending
    });
    
    const rayVertices = [];
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2;
      const innerRadius = 7;
      const outerRadius = 15;
      
      const x1 = Math.cos(angle) * innerRadius;
      const y1 = Math.sin(angle) * innerRadius;
      const z1 = 0;
      
      const x2 = Math.cos(angle) * outerRadius;
      const y2 = Math.sin(angle) * outerRadius;
      const z2 = 0;
      
      rayVertices.push(x1, y1, z1, x2, y2, z2);
    }
    
    rayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rayVertices, 3));
    const sunRays = new THREE.LineSegments(rayGeometry, rayMaterial);
    this.sunSphere.add(sunRays);
    
    // Shadow settings are not needed since we disabled shadows
    
    this.scene.add(this.sunLight);
    
    // Add a secondary light for better illumination
    const fillLight = new THREE.DirectionalLight(0xadd8e6, 0.5);
    fillLight.position.set(-50, 50, -50);
    this.scene.add(fillLight);
    
    // Add a subtle rim light to enhance edges
    const rimLight = new THREE.DirectionalLight(0xfff0e0, 0.3);
    rimLight.position.set(0, -10, -50);
    this.scene.add(rimLight);
    
    // Animate sun and lights
    this.animateSun();
  }
  
  private animateSun() {
    // Create subtle animation for sun and its effects
    const animate = () => {
      if (!this.sunSphere || !this.sunGlow) return;
      
      const time = Date.now() * 0.0005;
      
      // Subtle pulsing effect for sun glow
      const pulseScale = 1 + 0.05 * Math.sin(time * 2);
      this.sunGlow.scale.set(pulseScale, pulseScale, pulseScale);
      
      // Subtle color shift
      const hue = 0.12 + 0.01 * Math.sin(time * 3);
      const sunColor = new THREE.Color().setHSL(hue, 0.5, 0.7);
      this.sunLight.color.copy(sunColor);
      
      // Request next frame
      requestAnimationFrame(animate);
    };
    
    // Start animation
    animate();
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
  }
}
