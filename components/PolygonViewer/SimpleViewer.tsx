'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import Link from 'next/link';
import SimpleCamera from './SimpleCamera';
import { WaterFacade as SimpleWater, WaterQualityLevel } from './SimpleWater';
import SimplePolygonRenderer from './SimplePolygonRenderer';
import { calculateBounds } from './utils';

export default function SimpleViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [polygons, setPolygons] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // UI state
  const [showControls, setShowControls] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [activeView, setActiveView] = useState<'aerial' | 'street'>('aerial');
  const [qualityMode, setQualityMode] = useState<'high' | 'performance'>('high');
  const [marketPanelVisible, setMarketPanelVisible] = useState(false);
  
  // References to our scene components
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraControllerRef = useRef<SimpleCamera | null>(null);
  const waterRef = useRef<SimpleWater | null>(null);
  const polygonRendererRef = useRef<SimplePolygonRenderer | null>(null);
  
  // Load polygons (still needed to calculate bounds)
  useEffect(() => {
    fetch('/api/get-polygons')
      .then(response => response.json())
      .then(data => {
        if (data.polygons) {
          setPolygons(data.polygons);
        }
        setLoading(false);
      })
      .catch(error => {
        console.error('Error loading polygons:', error);
        setLoading(false);
      });
  }, []);
  
  // Set up Three.js scene
  useEffect(() => {
    if (!canvasRef.current || loading || polygons.length === 0) return;
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#87CEEB'); // Light sky blue
    sceneRef.current = scene;
    
    // Create renderer with logarithmic depth buffer
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current,
      antialias: true,
      logarithmicDepthBuffer: true  // Enable logarithmic depth buffer to prevent z-fighting
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;
    
    // Calculate bounds for all polygons (still needed for water size)
    const bounds = calculateBounds(polygons);
    
    // Create camera controller
    const cameraController = new SimpleCamera(renderer.domElement);
    cameraControllerRef.current = cameraController;
    
    // Create water first (so it's rendered first)
    const waterSize = Math.max(bounds.scale * 500, 1000);
    const water = new SimpleWater({
      scene,
      size: waterSize,
      quality: qualityMode === 'high' ? 'high' : 'medium'
    });
    waterRef.current = water;
    
    // Create polygon renderer after water
    const polygonRenderer = new SimplePolygonRenderer({
      scene,
      polygons,
      bounds
    });
    polygonRendererRef.current = polygonRenderer;
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (cameraController) {
        cameraController.update();
      }
      
      if (waterRef.current) {
        waterRef.current.update();
      }
      
      renderer.render(scene, cameraController.camera);
    };
    
    animate();
    
    // Handle window resize
    const handleResize = () => {
      if (!cameraController || !renderer) return;
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      cameraController.camera.aspect = width / height;
      cameraController.camera.updateProjectionMatrix();
      
      renderer.setSize(width, height);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (polygonRendererRef.current) polygonRendererRef.current.cleanup();
      if (waterRef.current) waterRef.current.dispose();
      if (cameraController) cameraController.cleanup();
      if (renderer) renderer.dispose();
      
      scene.traverse(object => {
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
    };
  }, [polygons, loading, qualityMode]);
  
  // Update water quality when quality mode changes
  useEffect(() => {
    if (waterRef.current) {
      waterRef.current.setQuality(qualityMode === 'high' ? 'high' : 'medium');
    }
  }, [qualityMode]);
  
  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-lg">Loading Venice...</div>
      </div>
    );
  }
  
  return (
    <div className="w-screen h-screen">
      <canvas ref={canvasRef} className="w-full h-full" />
      
      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 bg-black/50 text-white p-4 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold hover:text-amber-400 transition-colors">
          La Serenissima
        </Link>
        
        <div className="flex space-x-4">
          <button 
            onClick={() => setShowControls(!showControls)}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-600 rounded text-black transition-colors"
          >
            {showControls ? 'Hide Controls' : 'Show Controls'}
          </button>
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 rounded text-white transition-colors"
          >
            {showInfo ? 'Hide Info' : 'Show Info'}
          </button>
        </div>
      </div>
      
      {/* Controls Panel */}
      {showControls && (
        <div className="absolute bottom-4 left-4 bg-black/70 text-white p-4 rounded-lg max-w-xs">
          <h2 className="text-lg font-bold mb-2">Camera Controls</h2>
          <ul className="space-y-1 text-sm">
            <li>• Left-click + drag: Rotate camera</li>
            <li>• Right-click + drag: Pan camera</li>
            <li>• Scroll wheel: Zoom in/out</li>
            <li>• Double-click: Reset view</li>
          </ul>
          
          <h2 className="text-lg font-bold mt-4 mb-2">View Options</h2>
          <div className="grid grid-cols-2 gap-2">
            <button 
              className={`px-2 py-1 rounded text-sm transition-colors ${
                activeView === 'aerial' 
                  ? 'bg-amber-500 text-black' 
                  : 'bg-gray-500 text-white hover:bg-gray-600'
              }`}
              onClick={() => setActiveView('aerial')}
            >
              Aerial View
            </button>
            <button 
              className={`px-2 py-1 rounded text-sm transition-colors ${
                activeView === 'street' 
                  ? 'bg-amber-500 text-black' 
                  : 'bg-gray-500 text-white hover:bg-gray-600'
              }`}
              onClick={() => setActiveView('street')}
            >
              Street View
            </button>
            <button 
              className={`px-2 py-1 rounded text-sm transition-colors ${
                qualityMode === 'high' 
                  ? 'bg-amber-500 text-black' 
                  : 'bg-gray-500 text-white hover:bg-gray-600'
              }`}
              onClick={() => setQualityMode('high')}
            >
              High Quality
            </button>
            <button 
              className={`px-2 py-1 rounded text-sm transition-colors ${
                qualityMode === 'performance' 
                  ? 'bg-amber-500 text-black' 
                  : 'bg-gray-500 text-white hover:bg-gray-600'
              }`}
              onClick={() => setQualityMode('performance')}
            >
              Performance
            </button>
          </div>
        </div>
      )}
      
      {/* Information Panel */}
      {showInfo && (
        <div className="absolute top-20 right-4 bg-black/70 text-white p-4 rounded-lg max-w-sm">
          <h2 className="text-lg font-bold mb-2">About La Serenissima</h2>
          <p className="text-sm mb-3">
            Welcome to a simplified view of La Serenissima, a digital recreation of Renaissance Venice.
            This view shows the basic layout of the city with land and water.
          </p>
          
          <h3 className="text-md font-bold mb-1">Legend</h3>
          <div className="flex items-center space-x-2 mb-1">
            <div className="w-4 h-4 bg-amber-500"></div>
            <span className="text-sm">Land Parcels</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-blue-500"></div>
            <span className="text-sm">Water</span>
          </div>
          
          <div className="mt-4 text-xs text-gray-300">
            Simple Viewer v1.0
          </div>
        </div>
      )}
      
      {/* Bottom Right Menu */}
      <div className="absolute bottom-4 right-4 bg-black/70 text-white p-4 rounded-lg">
        <div className="grid grid-cols-2 gap-2">
          <button className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-white text-sm transition-colors">
            Create Land
          </button>
          <button className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-white text-sm transition-colors">
            Delete Land
          </button>
          <button className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm transition-colors">
            Add Bridge
          </button>
          <button className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded text-white text-sm transition-colors">
            Add Road
          </button>
        </div>
      </div>
      
      {/* View Mode Selector */}
      <div className="absolute top-20 left-4 bg-black/70 text-white p-3 rounded-lg">
        <h3 className="text-sm font-bold mb-2">View Mode</h3>
        <div className="flex flex-col space-y-2">
          <button 
            className={`px-3 py-1 rounded text-sm transition-colors ${
              !marketPanelVisible ? 'bg-amber-500 text-black' : 'bg-gray-600 hover:bg-gray-500 text-white'
            }`}
            onClick={() => setMarketPanelVisible(false)}
          >
            Land View
          </button>
          <button 
            className={`px-3 py-1 rounded text-sm transition-colors ${
              marketPanelVisible ? 'bg-amber-500 text-black' : 'bg-gray-600 hover:bg-gray-500 text-white'
            }`}
            onClick={() => setMarketPanelVisible(true)}
          >
            Market View
          </button>
        </div>
      </div>
    </div>
  );
}
