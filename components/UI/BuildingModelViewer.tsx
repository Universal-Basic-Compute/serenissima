import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface BuildingModelViewerProps {
  buildingName: string;  // Just pass the building name instead of full path
  width?: number;
  height?: number;
  className?: string;
  variant?: string;   // Optional variant name
}

const BuildingModelViewer: React.FC<BuildingModelViewerProps> = ({
  buildingName,
  width = 150,
  height = 150,
  className = '',
  variant = 'model'  // Default to 'model.glb' if no variant specified
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableVariants, setAvailableVariants] = useState<string[]>([]);
  
  // Construct the base path for the building models
  const basePath = `/assets/buildings/models/${buildingName}`;
  
  // Function to load available variants
  const loadAvailableVariants = useCallback(async () => {
    try {
      const response = await fetch(`/api/building-variants/${buildingName}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.variants) {
          setAvailableVariants(data.variants);
        }
      }
    } catch (err) {
      console.error('Error loading variants:', err);
    }
  }, [buildingName]);
  
  // Load available variants when component mounts
  useEffect(() => {
    loadAvailableVariants();
  }, [loadAvailableVariants]);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Initialize Three.js scene - wrap in try/catch for error handling
    try {
      const scene = new THREE.Scene();
      
      // Use a warmer background color - amber/beige tone
      scene.background = new THREE.Color(0xf5e9d6); // Warm beige color
      
      // Add ambient light with warmer tone
      const ambientLight = new THREE.AmbientLight(0xfff0dd, 0.6); // Warmer ambient light with higher intensity
      scene.add(ambientLight);
      
      // Add directional light with warmer tone
      const directionalLight = new THREE.DirectionalLight(0xfff0dd, 1.2); // Warmer directional light with higher intensity
      directionalLight.position.set(5, 10, 7.5);
      scene.add(directionalLight);
      
      // Add a secondary fill light from opposite direction for better illumination
      const fillLight = new THREE.DirectionalLight(0xffeedd, 0.8);
      fillLight.position.set(-5, 5, -7.5);
      scene.add(fillLight);
      
      // Add a subtle rim light for better edge definition
      const rimLight = new THREE.DirectionalLight(0xffffee, 0.5);
      rimLight.position.set(0, -5, 0);
      scene.add(rimLight);
      
      // Add camera
      const camera = new THREE.PerspectiveCamera(
        45, 
        width / height, 
        0.1, 
        1000
      );
      camera.position.z = 5;
      camera.position.y = 2;
      
      // Add renderer with improved settings
      const renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true // Needed for taking screenshots
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      
      // Enable shadow mapping for better visual quality
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      
      // Enable tone mapping for more realistic lighting
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      
      containerRef.current.appendChild(renderer.domElement);
      
      // Add orbit controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.25;
      controls.enableZoom = true;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 3; // Increased from 2 to 3
    
    // Construct the full path to the GLB file
    const fullModelPath = `${basePath}/${variant}.glb`;
    
    const loadModel = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Only use GLTFLoader since we're only supporting GLB files now
        const gltfLoader = new GLTFLoader();
        const gltf = await new Promise<any>((resolve, reject) => {
          gltfLoader.load(
            fullModelPath,
            resolve,
            undefined,
            (error) => {
              console.error('Error loading model:', error);
              reject(new Error(`Failed to load model: ${error.message}`));
            }
          );
        });
        
        // Check if the model loaded correctly
        if (!gltf || !gltf.scene) {
          throw new Error('Model loaded but scene is missing');
        }
        
        const object = gltf.scene;
        
        // Enable shadows for the model
        object.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Enhance materials for better visual quality
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
        
        // Scale model to fit view better
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
          // Increase the scale factor to make the model larger within the viewer
          const scale = 2.5 / maxDim; // Increased from 2 to 2.5
          object.scale.set(scale, scale, scale);
        }
        
        scene.add(object);
        
        // Add a subtle ground plane with shadow - use a safer material
        const groundGeometry = new THREE.PlaneGeometry(10, 10);
        const groundMaterial = new THREE.MeshBasicMaterial({ 
          color: 0x000000,
          transparent: true,
          opacity: 0.3,
          depthWrite: false
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -size.y / 2 * (2.5 / maxDim) - 0.01; // Position just below the model
        ground.receiveShadow = true;
        scene.add(ground);
        
        // Adjust camera position for better viewing angle
        camera.position.set(4, 3, 4); // Adjust these values for a better default view
        camera.lookAt(0, 0, 0);
        
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading model:', err);
        setError(`Failed to load model: ${err instanceof Error ? err.message : String(err)}`);
        setIsLoading(false);
        
        // Create a fallback object to display when model loading fails
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0xcc5500 }); // Amber color
        const fallbackMesh = new THREE.Mesh(geometry, material);
        scene.add(fallbackMesh);
        
        // Add text to indicate error
        const textDiv = document.createElement('div');
        textDiv.style.position = 'absolute';
        textDiv.style.top = '50%';
        textDiv.style.left = '50%';
        textDiv.style.transform = 'translate(-50%, -50%)';
        textDiv.style.color = 'white';
        textDiv.style.backgroundColor = 'rgba(0,0,0,0.5)';
        textDiv.style.padding = '5px';
        textDiv.style.borderRadius = '3px';
        textDiv.style.fontSize = '10px';
        textDiv.style.textAlign = 'center';
        textDiv.innerText = 'Model Error';
        containerRef.current?.appendChild(textDiv);
      }
    };
    
    loadModel();
    
    // Animation loop with error handling
    const animate = () => {
      try {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      } catch (error) {
        console.error('Animation error:', error);
        // Don't rethrow - just log the error and continue
        // This prevents the entire component from crashing
      }
    };
    
    animate();
    
    // Cleanup
    return () => {
      if (containerRef.current) {
        // Remove the renderer's canvas
        if (containerRef.current.contains(renderer.domElement)) {
          containerRef.current.removeChild(renderer.domElement);
        }
          
        // Remove any error text elements
        const textElements = containerRef.current.querySelectorAll('div');
        textElements.forEach(el => {
          if (containerRef.current.contains(el)) {
            containerRef.current.removeChild(el);
          }
        });
          
        // Properly dispose of Three.js objects to prevent memory leaks
        try {
          renderer.dispose();
          // Dispose of geometries and materials
          scene.traverse((object) => {
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
        } catch (error) {
          console.error('Error during cleanup:', error);
        }
      }
    };
  } catch (setupError) {
    // Handle errors during scene setup
    console.error('Error setting up 3D scene:', setupError);
    setError(`Failed to initialize 3D viewer: ${setupError instanceof Error ? setupError.message : String(setupError)}`);
    setIsLoading(false);
  }
  }, [basePath, width, height, variant]);
  
  return (
    <div 
      ref={containerRef} 
      className={`relative ${className}`} 
      style={{ width, height }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-amber-50 bg-opacity-75">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-600"></div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-amber-50 bg-opacity-75">
          <div className="text-red-500 text-xs text-center p-2">
            {error}
          </div>
        </div>
      )}
    </div>
  );
};

export default BuildingModelViewer;
