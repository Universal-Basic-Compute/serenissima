import * as THREE from 'three';
// Use dynamic imports with type assertions
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ViewMode } from './types';
import CloudSystem from './CloudSystem';

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
  private activeView: ViewMode;
  
  constructor({ canvas, activeView, highQuality }: SceneSetupProps) {
    this.performanceMode = !highQuality;
    this.activeView = activeView;
    
    // Initialize scene with a neutral background
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#87CEEB'); // Light sky blue background
    
    // Create a camera with a better initial position
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );
    
    // Position camera to view the scene
    this.camera.position.set(0, 30, 60); // Higher and further back for better scene visibility
    this.camera.lookAt(0, 0, 0);
    
    // Initialize renderer with settings to ensure visibility
    this.renderer = new THREE.WebGLRenderer({ 
      canvas,
      antialias: true, // Enable antialiasing for better quality
      powerPreference: 'default',
      precision: 'highp', // Use high precision for better rendering
      logarithmicDepthBuffer: true, // Enable logarithmic depth buffer for better depth handling
      alpha: true
    });
    
    // Use renderer settings that ensure visibility
    this.renderer.setClearColor(0x87CEEB, 1); // Set clear color with full opacity (light sky blue)
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio || 1); // Use device pixel ratio for better quality
    this.renderer.shadowMap.enabled = false;
    this.renderer.sortObjects = true; // Activate object sorting by the renderer
    this.renderer.outputEncoding = THREE.sRGBEncoding; // Use sRGB encoding for better color accuracy
    
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
    
    // Add a simple ambient light immediately
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(ambientLight);
    
    // Add a simple test object to verify rendering
    const testGeometry = new THREE.BoxGeometry(10, 10, 10);
    const testMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const testCube = new THREE.Mesh(testGeometry, testMaterial);
    testCube.position.set(0, 5, 0);
    testCube.userData.isTestCube = true;
    this.scene.add(testCube);
  
    // Force an initial render
    this.renderer.render(this.scene, this.camera);
  
    // Remove test cube after 3 seconds
    setTimeout(() => {
      if (testCube && testCube.parent) {
        this.scene.remove(testCube);
        testGeometry.dispose();
        testMaterial.dispose();
        console.log('Test cube removed after successful rendering');
      }
    }, 3000);
    
    // Limit vertical rotation to prevent going under the map
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI / 3; // Limit to 60 degrees from vertical
    
    // Basic limits
    this.controls.minDistance = 1.76; // Decreased by 50% to allow zooming twice as close (3.52 * 0.5 = 1.76)
    this.controls.maxDistance = 50.63; // Decreased by another 25% to limit zooming out (67.5 * 0.75 = 50.63)
    
    // Enable panning with right mouse button and rotation with middle mouse button
    this.controls.mouseButtons = {
      LEFT: (THREE.MOUSE as any).NONE, // No action on left click
      MIDDLE: THREE.MOUSE.ROTATE, // Rotation on middle mouse button
      RIGHT: THREE.MOUSE.PAN // Panning on right mouse button
    };
    
    // Make panning parallel to the ground plane
    this.controls.screenSpacePanning = true; // Changed to true for more intuitive panning
    
    // This will make right-click pan only in the XZ plane (horizontal) without changing Y (elevation)
    this.controls.screenSpacePanning = false; // This will make panning parallel to the ground plane
    
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
    // Add ambient light for general illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    // Create the sun directional light
    this.sunLight = new THREE.DirectionalLight(0xffffeb, 1.2);
    this.sunLight.position.copy(this.calculateSunPosition());
    this.sunLight.castShadow = false; // Keep shadows disabled for performance
    this.scene.add(this.sunLight);
    
    // Create a sun sphere
    const sunGeometry = new THREE.SphereGeometry(5, 16, 16);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff80 });
    this.sunSphere = new THREE.Mesh(sunGeometry, sunMaterial);
    
    // Position the sun far away in the sky
    const sunPosition = this.calculateSunPosition();
    this.sunSphere.position.copy(sunPosition);
    this.scene.add(this.sunSphere);
    
    // Create a glow effect around the sun
    const sunGlowGeometry = new THREE.SphereGeometry(8, 16, 16);
    const sunGlowMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffff99, 
      transparent: true, 
      opacity: 0.4,
      side: THREE.BackSide 
    });
    this.sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
    this.sunGlow.position.copy(sunPosition);
    this.scene.add(this.sunGlow);
    
    // Start sun animation
    this.animateSun();
  }
  
  private animateSun() {
    // Update sun position every minute
    const updateSun = () => {
      const newPosition = this.calculateSunPosition();
      
      // Update sun sphere position
      this.sunSphere.position.copy(newPosition);
      
      // Update sun glow position
      this.sunGlow.position.copy(newPosition);
      
      // Update directional light position
      this.sunLight.position.copy(newPosition);
      this.sunLight.lookAt(0, 0, 0);
      
      // Adjust light intensity based on sun height
      const sunHeight = newPosition.y;
      const normalizedHeight = Math.max(0, Math.min(1, sunHeight / 100));
      
      // Brighter at noon, dimmer at sunrise/sunset
      this.sunLight.intensity = 0.8 + normalizedHeight * 0.7;
      
      // Change light color based on time of day
      if (normalizedHeight < 0.3) {
        // Sunrise/sunset - more orange
        this.sunLight.color.setHex(0xffcc88);
        this.sunSphere.material.color.setHex(0xffcc66);
      } else {
        // Daytime - more yellow-white
        this.sunLight.color.setHex(0xffffeb);
        this.sunSphere.material.color.setHex(0xffff80);
      }
    };
    
    // Update immediately
    updateSun();
    
    // Then update every minute
    setInterval(updateSun, 60000);
  }
  
  
  // Add a method to ensure roads are always visible
  public ensureRoadsVisible() {
    if (!this.scene) return;
    
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && 
          object.userData && 
          (object.userData.isRoad || object.userData.alwaysVisible)) {
        // Force visibility
        object.visible = true;
        
        // Ensure high render order
        object.renderOrder = 100; // Increased from 30 to 100
        
        // Update material
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(mat => {
              if (mat) {
                mat.needsUpdate = true;
                if (mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.MeshStandardMaterial) {
                  mat.depthWrite = false;
                  mat.polygonOffset = true;
                  mat.polygonOffsetFactor = -10;
                  mat.polygonOffsetUnits = -10;
                }
              }
            });
          } else {
            object.material.needsUpdate = true;
            if (object.material instanceof THREE.MeshBasicMaterial || object.material instanceof THREE.MeshStandardMaterial) {
              object.material.depthWrite = false;
              object.material.polygonOffset = true;
              object.material.polygonOffsetFactor = -10;
              object.material.polygonOffsetUnits = -10;
            }
          }
        }
      }
    });
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
    const longitude = 12.3; // Venezia longitude in degrees
    
    // Day of year (0-365)
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = (now.getTime() - start.getTime()) + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    // Calculate declination angle (simplified)
    const declination = -23.45 * Math.cos(2 * Math.PI * (dayOfYear + 10) / 365);
    
    // Calculate hour angle
    const solarNoon = 12;
    const hourAngle = 15 * (timeOfDay - solarNoon);
    
    // Convert to radians
    const latRad = latitude * Math.PI / 180;
    const declRad = declination * Math.PI / 180;
    const hourRad = hourAngle * Math.PI / 180;
    
    // Calculate solar elevation
    const sinElevation = Math.sin(latRad) * Math.sin(declRad) + 
                         Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourRad);
    const elevation = Math.asin(sinElevation);
    
    // Calculate solar azimuth
    const sinAzimuth = -Math.cos(declRad) * Math.sin(hourRad) / Math.cos(elevation);
    const cosAzimuth = (Math.sin(declRad) - Math.sin(latRad) * sinElevation) / 
                       (Math.cos(latRad) * Math.cos(elevation));
    let azimuth = Math.atan2(sinAzimuth, cosAzimuth);
    
    // Convert elevation and azimuth to Cartesian coordinates
    // Distance is arbitrary but large to place sun far away
    const distance = 1000;
    const height = Math.sin(elevation) * distance;
    const projectedDistance = Math.cos(elevation) * distance;
    const x = Math.sin(azimuth) * projectedDistance;
    const z = -Math.cos(azimuth) * projectedDistance;
    
    // Ensure sun is always visible even at night (just very low in the sky)
    const minHeight = -200; // Minimum height for night time
    const adjustedHeight = Math.max(minHeight, height);
    
    return new THREE.Vector3(x, adjustedHeight, z);
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
    
    try {
      // Set cloud visibility based on camera height
      this.cloudSystem.setVisibility(showClouds);
      
      // Always update cloud animation regardless of visibility
      // This ensures they're ready to be shown when we zoom out
      this.cloudSystem.update(frameCount);
    } catch (error) {
      console.error('Error updating clouds:', error);
    }
  }
  
  // Add update method to handle all animations
  public update(frameCount: number) {
    // Update clouds
    this.updateClouds(frameCount);
    
    // Update sun position occasionally (every 100 frames)
    if (frameCount % 100 === 0) {
      const newPosition = this.calculateSunPosition();
      this.sunSphere.position.copy(newPosition);
      this.sunGlow.position.copy(newPosition);
      this.sunLight.position.copy(newPosition);
    }
    
    // Ensure roads are always visible
    this.ensureRoadsVisible();
    
    // Make sure roads are properly lit
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && 
          object.userData && 
          object.userData.isRoad) {
        // Ensure road materials are updated with lighting
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(mat => {
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.needsUpdate = true;
              }
            });
          } else if (object.material instanceof THREE.MeshStandardMaterial) {
            object.material.needsUpdate = true;
          }
        }
      }
    });
  }
  
  public updateQuality(highQuality: boolean) {
    this.performanceMode = !highQuality;
    if (this.cloudSystem) {
      this.cloudSystem.updateQuality(this.performanceMode);
    }
  }
  
  public cleanup() {
    // Remove event listeners
    window.removeEventListener('resize', this.handleResize);
    
    // Dispose of controls
    if (this.controls) {
      this.controls.dispose();
    }
    
    // Remove test cube if it exists
    this.scene.traverse(object => {
      if (object.userData && object.userData.isTestCube) {
        this.scene.remove(object);
        if ((object as THREE.Mesh).geometry) {
          (object as THREE.Mesh).geometry.dispose();
        }
        if ((object as THREE.Mesh).material) {
          ((object as THREE.Mesh).material as THREE.Material).dispose();
        }
      }
    });
    
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
  }
}
