import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader';

interface BuildingModelViewerProps {
  modelPath: string;
  width?: number;
  height?: number;
  className?: string;
}

const BuildingModelViewer: React.FC<BuildingModelViewerProps> = ({
  modelPath,
  width = 150,
  height = 150,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
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
    controls.autoRotateSpeed = 2;
    
    // Determine which loader to use based on file extension
    const fileExtension = modelPath.split('.').pop()?.toLowerCase();
    
    const loadModel = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        let object;
        
        switch (fileExtension) {
          case 'glb':
          case 'gltf':
            const gltfLoader = new GLTFLoader();
            const gltf = await new Promise<any>((resolve, reject) => {
              gltfLoader.load(
                modelPath,
                resolve,
                undefined,
                reject
              );
            });
            object = gltf.scene;
            break;
            
          case 'fbx':
            const fbxLoader = new FBXLoader();
            object = await new Promise<any>((resolve, reject) => {
              fbxLoader.load(
                modelPath,
                resolve,
                undefined,
                reject
              );
            });
            break;
            
          case 'obj':
            const objLoader = new OBJLoader();
            object = await new Promise<any>((resolve, reject) => {
              objLoader.load(
                modelPath,
                resolve,
                undefined,
                reject
              );
            });
            break;
            
          default:
            throw new Error(`Unsupported file format: ${fileExtension}`);
        }
        
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
          const scale = 2 / maxDim;
          object.scale.set(scale, scale, scale);
        }
        
        scene.add(object);
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
  }, [modelPath, width, height]);
  
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
