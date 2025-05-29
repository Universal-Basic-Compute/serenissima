import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface BuildingModelViewerProps {
  buildingName: string;
  width?: number;
  height?: number;
  className?: string;
  variant?: string;
}

const BuildingModelViewer: React.FC<BuildingModelViewerProps> = ({
  buildingName,
  width,
  height,
  className = '',
  variant = 'model'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Refs to track Three.js objects for safer cleanup
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  
  // Construct the base path for the building models
  const basePath = `/assets/buildings/models/${buildingName}`;
  
  useEffect(() => {
    // Set mounted flag to true
    isMountedRef.current = true;
    
    // Create a new canvas element that's completely separate from React's DOM
    const canvas = document.createElement('canvas');
    canvasRef.current = canvas;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    
    // Initialize Three.js scene
    try {
      if (!containerRef.current) return;
      
      // Clear the container first
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }
      
      // Append the canvas to the container
      containerRef.current.appendChild(canvas);
      
      // Get container dimensions
      const containerWidth = width || containerRef.current.clientWidth;
      const containerHeight = height || containerRef.current.clientHeight;
      
      // Create scene
      const scene = new THREE.Scene();
      sceneRef.current = scene;
      scene.background = new THREE.Color(0xf5e9d6); // Warm beige color
      
      // Add lights
      const ambientLight = new THREE.AmbientLight(0xfff0dd, 0.6);
      scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xfff0dd, 1.2);
      directionalLight.position.set(5, 10, 7.5);
      scene.add(directionalLight);
      
      const fillLight = new THREE.DirectionalLight(0xffeedd, 0.8);
      fillLight.position.set(-5, 5, -7.5);
      scene.add(fillLight);
      
      const rimLight = new THREE.DirectionalLight(0xffffee, 0.5);
      rimLight.position.set(0, -5, 0);
      scene.add(rimLight);
      
      // Add camera
      const camera = new THREE.PerspectiveCamera(
        45, 
        containerWidth / containerHeight, 
        0.1, 
        1000
      );
      camera.position.z = 5;
      camera.position.y = 2;
      
      // Add renderer
      const renderer = new THREE.WebGLRenderer({ 
        canvas: canvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true
      });
      rendererRef.current = renderer;
      renderer.setSize(containerWidth, containerHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      
      // Add orbit controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controlsRef.current = controls;
      controls.enableDamping = true;
      controls.dampingFactor = 0.25;
      controls.enableZoom = true;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 3;
      
      // Load model
      const fullModelPath = `${basePath}/${variant}.glb`;
      setIsLoading(true);
      setError(null);
      
      const gltfLoader = new GLTFLoader();
      gltfLoader.load(
        fullModelPath,
        (gltf) => {
          if (!isMountedRef.current) return;
          
          const object = gltf.scene;
          
          // Enable shadows
          object.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              
              if (child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach(mat => {
                    mat.envMapIntensity = 1.5;
                    mat.needsUpdate = true;
                  });
                } else {
                  child.material.envMapIntensity = 1.5;
                  child.material.needsUpdate = true;
                }
              }
            }
          });
          
          // Center the model
          const box = new THREE.Box3().setFromObject(object);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          
          // Reset position
          object.position.x = -center.x;
          object.position.y = -center.y;
          object.position.z = -center.z;
          
          // Scale model to fit view
          const maxDim = Math.max(size.x, size.y, size.z);
          if (maxDim > 0) {
            const scale = 2.5 / maxDim;
            object.scale.set(scale, scale, scale);
          }
          
          scene.add(object);
          
          // Add ground plane
          const groundGeometry = new THREE.PlaneGeometry(10, 10);
          const groundMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x000000,
            transparent: true,
            opacity: 0.3,
            depthWrite: false
          });
          const ground = new THREE.Mesh(groundGeometry, groundMaterial);
          ground.rotation.x = -Math.PI / 2;
          ground.position.y = -size.y / 2 * (2.5 / maxDim) - 0.01;
          ground.receiveShadow = true;
          scene.add(ground);
          
          // Adjust camera
          camera.position.set(4, 3, 4);
          camera.lookAt(0, 0, 0);
          
          setIsLoading(false);
        },
        undefined,
        (error: unknown) => {
          if (!isMountedRef.current) return;
          
          console.error('Error loading model:', error);
          setError(`Failed to load model: ${error instanceof Error ? error.message : String(error)}`);
          setIsLoading(false);
          
          // Create fallback
          const geometry = new THREE.BoxGeometry(1, 1, 1);
          const material = new THREE.MeshBasicMaterial({ color: 0xcc5500 });
          const fallbackMesh = new THREE.Mesh(geometry, material);
          scene.add(fallbackMesh);
        }
      );
      
      // Animation loop
      const animate = () => {
        if (!isMountedRef.current) return;
        
        animationFrameRef.current = requestAnimationFrame(animate);
        
        if (controlsRef.current) controlsRef.current.update();
        if (rendererRef.current && camera && sceneRef.current) {
          rendererRef.current.render(sceneRef.current, camera);
        }
      };
      
      animate();
      
      // Handle resize
      const handleResize = () => {
        if (!containerRef.current || !rendererRef.current || !camera) return;
        
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        
        rendererRef.current.setSize(width, height);
      };
      
      window.addEventListener('resize', handleResize);
      
      // Return cleanup function
      return () => {
        isMountedRef.current = false;
        window.removeEventListener('resize', handleResize);
        
        // Cancel animation frame
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        
        // Dispose Three.js resources
        if (rendererRef.current) {
          rendererRef.current.dispose();
          rendererRef.current = null;
        }
        
        if (controlsRef.current) {
          controlsRef.current.dispose();
          controlsRef.current = null;
        }
        
        if (sceneRef.current) {
          // Dispose geometries and materials
          sceneRef.current.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              if (object.geometry) object.geometry.dispose();
              
              if (object.material) {
                if (Array.isArray(object.material)) {
                  object.material.forEach(material => material.dispose());
                } else {
                  object.material.dispose();
                }
              }
            }
          });
          
          sceneRef.current = null;
        }
        
        // Remove canvas from DOM - do this last
        if (canvasRef.current) {
          try {
            const parent = canvasRef.current.parentNode;
            if (parent && parent.contains(canvasRef.current)) {
              parent.removeChild(canvasRef.current);
            }
          } catch (e) {
            console.warn('Error removing canvas during cleanup:', e);
            // Just nullify the reference without trying to remove it
          } finally {
            canvasRef.current = null;
          }
        }
      };
    } catch (error) {
      console.error('Error setting up 3D scene:', error);
      setError(`Failed to initialize 3D viewer: ${error instanceof Error ? error.message : String(error)}`);
      setIsLoading(false);
    }
  }, [basePath, width, height, variant, buildingName]);
  
  return (
    <div 
      ref={containerRef} 
      className={`relative ${className} w-full h-full`} 
      style={width && height ? { width, height } : undefined}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-amber-50 bg-opacity-75 pointer-events-none">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-600"></div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-amber-50 bg-opacity-75 pointer-events-none">
          <div className="text-red-500 text-xs text-center p-2">
            {error}
          </div>
        </div>
      )}
    </div>
  );
};

export default BuildingModelViewer;
