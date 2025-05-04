import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';

/**
 * A facade for THREE.js scene management to reduce coupling
 * Provides a simplified interface to Three.js functionality
 */
export class ThreeJSFacade {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private objects: Map<string, THREE.Object3D> = new Map();
  private animationCallbacks: Array<(time: number) => void> = [];
  private animationId: number | null = null;
  private isDisposed: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    // Initialize scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#87CEEB'); // Light sky blue background
    
    // Initialize camera
    this.camera = new THREE.PerspectiveCamera(
      60, 
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );
    this.camera.position.set(0, 30, 60);
    this.camera.lookAt(0, 0, 0);
    
    // Initialize renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    
    // Initialize controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI / 3;
    this.controls.minDistance = 1.76;
    this.controls.maxDistance = 50.63;
    this.controls.screenSpacePanning = false;
    
    // Initialize composer for post-processing
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);
    
    // Add basic ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    // Add resize handler
    window.addEventListener('resize', this.handleResize);
    
    // Add a method to force render
    this.scene.userData.forceRender = this.forceRender.bind(this);
    
    // Start animation loop
    this.startAnimationLoop();
  }
  
  /**
   * Add an object to the scene with an optional id
   */
  public addObject(object: THREE.Object3D, id?: string): void {
    if (this.isDisposed) return;
    
    this.scene.add(object);
    
    if (id) {
      this.objects.set(id, object);
    }
  }
  
  /**
   * Remove an object from the scene by reference or id
   */
  public removeObject(objectOrId: THREE.Object3D | string): void {
    if (this.isDisposed) return;
    
    if (typeof objectOrId === 'string') {
      const object = this.objects.get(objectOrId);
      if (object) {
        this.scene.remove(object);
        this.objects.delete(objectOrId);
      }
    } else {
      this.scene.remove(objectOrId);
      // Also remove from objects map if it exists there
      for (const [id, obj] of this.objects.entries()) {
        if (obj === objectOrId) {
          this.objects.delete(id);
          break;
        }
      }
    }
  }
  
  /**
   * Get an object by id
   */
  public getObject(id: string): THREE.Object3D | undefined {
    return this.objects.get(id);
  }
  
  /**
   * Get the scene
   */
  public getScene(): THREE.Scene {
    return this.scene;
  }
  
  /**
   * Get the camera
   */
  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }
  
  /**
   * Get the renderer
   */
  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }
  
  /**
   * Get the controls
   */
  public getControls(): OrbitControls {
    return this.controls;
  }
  
  /**
   * Force a render of the scene
   */
  public forceRender(): void {
    if (this.isDisposed) return;
    
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
  
  /**
   * Add an animation callback
   */
  public addAnimationCallback(callback: (time: number) => void): void {
    this.animationCallbacks.push(callback);
  }
  
  /**
   * Remove an animation callback
   */
  public removeAnimationCallback(callback: (time: number) => void): void {
    const index = this.animationCallbacks.indexOf(callback);
    if (index !== -1) {
      this.animationCallbacks.splice(index, 1);
    }
  }
  
  /**
   * Start the animation loop
   */
  private startAnimationLoop(): void {
    let lastTime = 0;
    
    const animate = (time: number) => {
      if (this.isDisposed) return;
      
      this.animationId = requestAnimationFrame(animate);
      
      // Update controls
      this.controls.update();
      
      // Call animation callbacks
      this.animationCallbacks.forEach(callback => {
        try {
          callback(time);
        } catch (error) {
          console.error('Error in animation callback:', error);
        }
      });
      
      // Render scene
      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      
      lastTime = time;
    };
    
    this.animationId = requestAnimationFrame(animate);
  }
  
  /**
   * Handle window resize
   */
  private handleResize = (): void => {
    if (this.isDisposed) return;
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Update camera
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    // Update renderer
    this.renderer.setSize(width, height);
    
    // Update composer
    if (this.composer) {
      this.composer.setSize(width, height);
    }
  };
  
  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    
    // Stop animation loop
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    // Remove event listeners
    window.removeEventListener('resize', this.handleResize);
    
    // Dispose of controls
    this.controls.dispose();
    
    // Clear all objects
    this.objects.clear();
    
    // Dispose of renderer
    this.renderer.dispose();
    
    // Clear animation callbacks
    this.animationCallbacks.length = 0;
    
    // Mark scene as disposed
    this.scene.userData.isDisposed = true;
  }
}
