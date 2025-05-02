import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

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
    
    // Initialize Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);
    
    // Add camera
    const camera = new THREE.PerspectiveCamera(
      45, 
      width / height, 
      0.1, 
      1000
    );
    camera.position.z = 5;
    camera.position.y = 2;
    
    // Add renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
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
            reject
          );
        });
        
        const object = gltf.scene;
        
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
        
        // Adjust camera position for better viewing angle
        camera.position.set(4, 3, 4); // Adjust these values for a better default view
        camera.lookAt(0, 0, 0);
        
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading model:', err);
        setError(`Failed to load model: ${err instanceof Error ? err.message : String(err)}`);
        setIsLoading(false);
      }
    };
    
    loadModel();
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    
    animate();
    
    // Cleanup
    return () => {
      if (containerRef.current && containerRef.current.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [basePath, width, height, variant]);
  
  return (
    <div 
      ref={containerRef} 
      className={`relative ${className}`} 
      style={{ width, height }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-75">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-600"></div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-75">
          <div className="text-red-500 text-xs text-center p-2">
            {error}
          </div>
        </div>
      )}
    </div>
  );
};

export default BuildingModelViewer;
