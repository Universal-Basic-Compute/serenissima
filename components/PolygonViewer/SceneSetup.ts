import * as THREE from 'three';
import { ViewMode } from './types';
import { CloudFacade } from '@/lib/threejs/CloudFacade';
import { ThreeJSFacade } from '../../lib/threejs/ThreeJSFacade';
import { WaterFacade } from '../../lib/threejs/WaterFacade';

interface SceneSetupProps {
  canvas: HTMLCanvasElement;
  activeView: ViewMode;
  highQuality: boolean;
}

export default class SceneSetup {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: any;
  public composer: any;
  private threejs: ThreeJSFacade;
  private performanceMode: boolean;
  private sunLight: THREE.DirectionalLight = new THREE.DirectionalLight();
  private sunSphere: THREE.Mesh = new THREE.Mesh();
  private sunGlow: THREE.Mesh = new THREE.Mesh();
  private cloudSystem: CloudFacade | null = null;
  private waterFacade: WaterFacade | null = null;
  private zoomThreshold: number = 40; // Threshold for showing clouds
  private activeView: ViewMode;
  
  constructor({ canvas, activeView, highQuality }: SceneSetupProps) {
    this.performanceMode = !highQuality;
    this.activeView = activeView;
    
    try {
      console.log('Initializing ThreeJS facade');
      // Initialize ThreeJS facade with logarithmic depth buffer
      this.threejs = new ThreeJSFacade(canvas, { logarithmicDepthBuffer: true });
      
      // Get references to THREE.js objects
      this.scene = this.threejs.getScene();
      this.camera = this.threejs.getCamera();
      this.renderer = this.threejs.getRenderer();
      this.controls = this.threejs.getControls();
      this.composer = null; // We'll use the one in the facade
      
      console.log('ThreeJS facade initialized successfully');
      
      // Add a force render method to the scene for other components to use
      this.scene.userData.forceRender = () => {
        this.threejs.forceRender();
      };
      
      // Add lights with a slight delay to improve initial loading
      setTimeout(() => this.setupLights(activeView), 100);
    
      // Create cloud system with a delay
      setTimeout(() => {
        console.log('Creating cloud system...');
        this.cloudSystem = new CloudFacade(this.scene, {
          width: 300, // Increased width for wider cloud coverage
          height: 300, // Increased height for wider cloud coverage
          performanceMode: this.performanceMode
        });
        
        // Force an initial update to position clouds and make them visible
        if (this.cloudSystem) {
          console.log('Initializing clouds and setting visibility');
          this.cloudSystem.update(0);
          this.cloudSystem.setVisible(true); // Force visibility initially
          
          // Add a second update after a short delay to ensure clouds are properly initialized
          setTimeout(() => {
            if (this.cloudSystem) {
              console.log('Second cloud initialization');
              this.cloudSystem.update(100);
              this.cloudSystem.setVisible(true);
            }
          }, 500);
        }
      }, 2000);
      
      // Add animation callback for updates
      this.threejs.addAnimationCallback(this.update.bind(this));
      
      console.log('SceneSetup initialization complete');
    } catch (error) {
      console.error('Failed to initialize SceneSetup:', error);
      // Create minimal scene as fallback
      this.createMinimalScene(canvas);
    }
  }
  
  // Add this method to create a minimal scene as fallback
  private createMinimalScene(canvas: HTMLCanvasElement) {
  console.log('Creating minimal fallback scene');
  
  try {
    // Create minimal scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#87CEEB');
    
    // Create minimal camera
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 10, 20);
    this.camera.lookAt(0, 0, 0);
    
    // Create minimal renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Create minimal controls
    const OrbitControls = require('three/examples/jsm/controls/OrbitControls').OrbitControls;
    this.controls = new OrbitControls(this.camera, canvas);
    
    // Add a simple plane to represent water
    const planeGeometry = new THREE.PlaneGeometry(100, 100);
    const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x3366cc });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    this.scene.add(plane);
    
    // Set up minimal animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
    
    console.log('Minimal fallback scene created');
  } catch (error) {
    console.error('Failed to create minimal fallback scene:', error);
  }
}
  
  private setupLights(activeView: ViewMode) {
    // Create the sun directional light
    this.sunLight = new THREE.DirectionalLight(0xffffeb, 1.2);
    this.sunLight.position.copy(this.calculateSunPosition());
    this.sunLight.castShadow = false; // Ensure shadows are disabled
    this.threejs.addObject(this.sunLight);
    
    // Initialize water with a delay
    setTimeout(() => {
      console.log('Creating water system...');
      this.waterFacade = new WaterFacade({
        scene: this.scene,
        size: 300, // Match the size used for clouds
        quality: this.performanceMode ? 'low' : 'high'
      });
      
      // Connect land objects to water after a short delay to ensure they're loaded
      setTimeout(() => {
        // Find all land objects in the scene
        const landObjects: THREE.Object3D[] = [];
        this.scene.traverse(object => {
          if (object instanceof THREE.Mesh && 
              object.userData && 
              (object.userData.isPolygon || object.userData.isLand)) {
            landObjects.push(object);
          }
        });
        
        // Connect land to water
        if (landObjects.length > 0) {
          this.connectLandToWater(landObjects);
        }
      }, 2000); // Wait 2 seconds for land to be fully loaded
    }, 1500);
    
    // Create a sun sphere
    const sunGeometry = new THREE.SphereGeometry(5, 16, 16);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff80 });
    this.sunSphere = new THREE.Mesh(sunGeometry, sunMaterial);
    
    // Position the sun far away in the sky
    const sunPosition = this.calculateSunPosition();
    this.sunSphere.position.copy(sunPosition);
    this.threejs.addObject(this.sunSphere);
    
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
    this.threejs.addObject(this.sunGlow);
    
    // Start sun animation
    this.animateSun();
    
    // Lower the zoom threshold to make clouds visible sooner
    this.zoomThreshold = 20;
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
          (object.userData.isRoad || object.userData.alwaysVisible || object.userData.isPolygon)) {
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
  
  
  // We don't need the handleResize method anymore as it's handled by the facade
  
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
      this.cloudSystem.setVisible(showClouds);
      
      // Always update cloud animation regardless of visibility
      // This ensures they're ready to be shown when we zoom out
      this.cloudSystem.update(frameCount);
      
      // Add debug logging to help diagnose the issue
      if (frameCount % 100 === 0) {
        console.log(`Camera height: ${this.camera.position.y}, Clouds visible: ${showClouds}, Threshold: ${this.zoomThreshold}`);
      }
    } catch (error) {
      console.error('Error updating clouds:', error);
    }
  }
  
  // Add update method to handle all animations
  public update(frameCount: number) {
    // Update clouds
    this.updateClouds(frameCount);
    
    // Update water
    if (this.waterFacade) {
      this.waterFacade.update();
    }
    
    
    // Update sun position occasionally (every 100 frames)
    if (frameCount % 100 === 0) {
      const newPosition = this.calculateSunPosition();
      this.sunSphere.position.copy(newPosition);
      this.sunGlow.position.copy(newPosition);
      this.sunLight.position.copy(newPosition);
    }
    
    // Ensure roads and polygons are always visible
    this.ensureRoadsVisible();
    
    // Make sure roads and polygons are properly lit
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && 
          object.userData && 
          (object.userData.isRoad || object.userData.isPolygon)) {
        // Force visibility
        object.visible = true;
        
        // Ensure materials are updated with lighting
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
      this.cloudSystem.setPerformanceMode(this.performanceMode);
    }
    if (this.waterFacade) {
      this.waterFacade.setQuality(this.performanceMode ? 'low' : 'high');
    }
  }
  
  /**
   * Connect land objects to water for shoreline effects
   * @param landObjects Array of land objects to consider for shoreline effects
   */
  public connectLandToWater(landObjects: THREE.Object3D[]): void {
    if (this.waterFacade) {
      console.log(`Connecting ${landObjects.length} land objects to water system`);
      this.waterFacade.registerLandObjects(landObjects);
      this.waterFacade.setShorelineEffect(true, 0.8, 3.0);
    }
  }
  
  public cleanup() {
    // Clean up cloud system
    if (this.cloudSystem) {
      this.cloudSystem.dispose();
      this.cloudSystem = null;
    }
    
    // Clean up water system
    if (this.waterFacade) {
      this.waterFacade.dispose();
      this.waterFacade = null;
    }
    
    // Dispose of ThreeJS facade - this will handle all THREE.js resource cleanup
    this.threejs.dispose();
  }
}
