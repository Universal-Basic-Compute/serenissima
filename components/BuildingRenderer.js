import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';
import buildingPositionManager from '@/lib/services/BuildingPositionManager';
import buildingCacheService from '@/lib/services/BuildingCacheService';
import buildingDataService from '@/lib/services/BuildingDataService';
import { BuildingRendererFactory } from '@/lib/services/BuildingRendererFactory';

const BuildingRenderer = ({ active }) => {
  // Create refs for canvas, scene, camera, renderer, and controls
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  
  // State for buildings and loading status
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const buildingMeshesRef = useRef(new Map());
  const [isActive, setIsActive] = useState(active);
  
  // Create renderer factory
  const rendererFactoryRef = useRef(null);
  
  // Initialize the scene, camera, and renderer
  useEffect(() => {
    if (!isActive || !canvasRef.current) return;
    
    console.log('BuildingRenderer: Initializing standalone scene');
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Light sky blue
    sceneRef.current = scene;
    
    // Create camera
    const camera = new THREE.PerspectiveCamera(
      60, // Field of view
      window.innerWidth / window.innerHeight, // Aspect ratio
      1, // Near clipping plane
      500 // Far clipping plane
    );
    camera.position.set(45, 20, 12); // Position camera
    cameraRef.current = camera;
    
    // Create renderer
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current,
      antialias: true,
      logarithmicDepthBuffer: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    
    // Create controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(45, 0, 12);
    controls.update();
    controlsRef.current = controls;
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    
    // Create a ground plane for reference
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xfff0c0,
      roughness: 0.8,
      metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Initialize renderer factory
    rendererFactoryRef.current = new BuildingRendererFactory({
      scene: scene,
      positionManager: buildingPositionManager,
      cacheService: buildingCacheService
    });
    
    // Animation loop
    const animate = () => {
      if (!isActive) return;
      
      requestAnimationFrame(animate);
      
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    
    animate();
    
    // Handle window resize
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      
      rendererRef.current.setSize(width, height);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Load buildings
    loadBuildingsEfficiently();
    
    // Start memory monitoring
    const stopMemoryMonitoring = startMemoryMonitoring();
    
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      
      // Clean up buildings
      if (rendererFactoryRef.current) {
        for (const [id, mesh] of buildingMeshesRef.current.entries()) {
          const building = buildings.find(b => b.id === id) || { type: 'unknown' };
          const renderer = rendererFactoryRef.current.getRenderer(building.type);
          renderer.dispose(mesh);
        }
      }
      
      stopMemoryMonitoring();
    };
  }, [isActive, buildings]);
  
  // Rest of the component implementation...
  
  /**
   * Update building visibility based on camera distance
   */
  const updateBuildingVisibility = () => {
    if (!sceneRef.current) {
      console.warn('Cannot update building visibility: scene is not defined');
      return;
    }
    
    // Get camera
    const camera = getCamera();
    if (!camera) return;
    
    // Get camera position
    const cameraPosition = camera.position.clone();
    
    // Update visibility for each building
    buildingMeshesRef.current.forEach((mesh, id) => {
      const distance = cameraPosition.distanceTo(mesh.position);
      
      // Hide buildings that are too far away
      if (distance > 100) {
        mesh.visible = false;
      } else {
        mesh.visible = true;
        
        // For buildings at medium distance, use low detail version
        if (distance > 50 && !mesh.userData.isLowDetail) {
          // Check if we already have a low detail version
          const lowDetailId = `${id}-low`;
          const lowDetailMesh = buildingMeshesRef.current.get(lowDetailId);
          
          if (lowDetailMesh) {
            // Show low detail, hide high detail
            lowDetailMesh.visible = true;
            mesh.visible = false;
          }
        }
      }
    });
  };

  /**
   * Get camera from scene
   */
  const getCamera = () => {
    if (typeof window === 'undefined') return null;
    
    // Try to get camera from window.__threeContext
    if (window.__threeContext && window.__threeContext.camera) {
      return window.__threeContext.camera;
    }
    
    // Try to get camera from canvas element
    const canvas = document.querySelector('canvas');
    if (canvas && canvas.__camera) {
      return canvas.__camera;
    }
    
    return null;
  };
  
  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full pointer-events-auto"
        style={{ 
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 10,
          opacity: 0.9 // Make it slightly transparent to see the main scene behind
        }}
      />
      
      {/* Loading indicator */}
      {loading && (
        <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-1 rounded">
          Loading buildings...
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="absolute top-4 left-4 bg-red-600/90 text-white px-3 py-1 rounded">
          Error: {error}
        </div>
      )}
    </div>
  );
};

export default BuildingRenderer;
