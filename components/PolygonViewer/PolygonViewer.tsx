'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { ViewMode, Polygon } from './types';
import { calculateBounds } from './utils';
import SceneSetup from './SceneSetup';
import PolygonRenderer from './PolygonRenderer';
import WaterEffect from './WaterEffect';
import InteractionManager from './InteractionManager';

export default function PolygonViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [polygons, setPolygons] = useState<Polygon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highQuality, setHighQuality] = useState(false);
  const [activeView, setActiveView] = useState<ViewMode>('buildings');
  const [hoveredPolygonId, setHoveredPolygonId] = useState<string | null>(null);
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
  const [infoVisible, setInfoVisible] = useState(false);
  const polygonMeshesRef = useRef<Record<string, THREE.Mesh>>({});
  
  // References to our scene components
  const sceneRef = useRef<SceneSetup | null>(null);
  const polygonRendererRef = useRef<PolygonRenderer | null>(null);
  const waterEffectRef = useRef<WaterEffect | null>(null);
  const interactionManagerRef = useRef<InteractionManager | null>(null);
  
  // Define resetView at component level
  const resetView = useCallback(() => {
    if (sceneRef.current) {
      sceneRef.current.resetCamera();
    }
  }, []);
  
  // Store the resetCamera function on window for access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.resetCameraView = resetView;
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        window.resetCameraView = undefined;
      }
    };
  }, [resetView]);
  
  // Load saved polygons
  useEffect(() => {
    const loadPolygons = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/get-polygons');
        const data = await response.json();
        
        console.log('Loaded polygons:', data);
        
        if (data.polygons) {
          setPolygons(data.polygons);
        } else {
          // If no polygons, create a sample one for testing
          setPolygons([{
            id: 'sample',
            coordinates: [
              { lat: 0, lng: 0 },
              { lat: 0, lng: 1 },
              { lat: 1, lng: 1 },
              { lat: 1, lng: 0 }
            ]
          }]);
        }
      } catch (error) {
        console.error('Error loading polygons:', error);
        setError('Failed to load polygons');
        
        // Create a sample polygon for testing
        setPolygons([{
          id: 'sample',
          coordinates: [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 1 },
            { lat: 1, lng: 1 },
            { lat: 1, lng: 0 }
          ]
        }]);
      } finally {
        setLoading(false);
      }
    };
    
    loadPolygons();
  }, []);

  // Update info panel visibility when selectedPolygonId changes
  useEffect(() => {
    if (selectedPolygonId) {
      setInfoVisible(true);
    } else {
      // Delay hiding the info to allow for animation
      const timer = setTimeout(() => {
        setInfoVisible(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [selectedPolygonId]);

  // Set up Three.js scene
  useEffect(() => {
    if (!canvasRef.current || loading) return;
    
    console.log(`Setting up Three.js scene with ${activeView} view`);
    console.log('Polygons:', polygons);

    // Calculate bounds for all polygons
    const bounds = calculateBounds(polygons);
    console.log('Calculated bounds:', bounds);
    
    // Initialize scene
    const scene = new SceneSetup({
      canvas: canvasRef.current,
      activeView,
      highQuality
    });
    sceneRef.current = scene;
    
    // Initialize polygon renderer
    const polygonRenderer = new PolygonRenderer({
      scene: scene.scene,
      polygons,
      bounds,
      activeView,
      performanceMode: !highQuality,
      polygonMeshesRef
    });
    polygonRendererRef.current = polygonRenderer;
    
    // Initialize water effect
    const waterEffect = new WaterEffect({
      scene: scene.scene,
      activeView,
      performanceMode: !highQuality,
      width: 200,
      height: 200
    });
    waterEffectRef.current = waterEffect;
    
    // Initialize interaction manager
    const interactionManager = new InteractionManager({
      camera: scene.camera,
      scene: scene.scene,
      polygonMeshesRef,
      activeView,
      hoveredPolygonId,
      setHoveredPolygonId,
      selectedPolygonId,
      setSelectedPolygonId
    });
    interactionManagerRef.current = interactionManager;
    
    // Call resetCamera initially to set a good starting view
    scene.resetCamera();
    
    // Add a frame counter for less frequent updates
    let frameCount = 0;
    
    // Animation loop
    const animate = () => {
      const animationId = requestAnimationFrame(animate);
      
      // Update controls each frame for smooth damping effect
      scene.controls.update();
      
      // Update water effect
      waterEffect.update(frameCount, !highQuality);
      
      frameCount++;
      
      // Use composer instead of renderer directly to include post-processing effects
      scene.composer.render();
    };
    
    animate();
    
    // Cleanup
    return () => {
      // Clean up all components
      if (interactionManager) interactionManager.cleanup();
      if (waterEffect) waterEffect.cleanup();
      if (polygonRenderer) polygonRenderer.cleanup();
      if (scene) scene.cleanup();
      
      // Clear references
      sceneRef.current = null;
      polygonRendererRef.current = null;
      waterEffectRef.current = null;
      interactionManagerRef.current = null;
    };
  }, [polygons, loading, activeView, highQuality, hoveredPolygonId, selectedPolygonId]);
  
  if (loading) {
    return <div className="w-full h-full flex items-center justify-center">Loading polygons...</div>;
  }
  
  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <p className="text-red-500 mb-4">{error}</p>
        <p>Displaying sample polygon instead</p>
      </div>
    );
  }
  
  return (
    <div className="w-screen h-screen">
      {/* Floating menu on the left side */}
      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 bg-white rounded-lg shadow-lg p-2 flex flex-col gap-3">
        <button 
          onClick={() => setActiveView('buildings')}
          className={`p-3 rounded-lg transition-all ${activeView === 'buildings' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
          title="Buildings View"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </button>
        <button 
          onClick={() => setActiveView('transport')}
          className={`p-3 rounded-lg transition-all ${activeView === 'transport' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
          title="Transport View"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
        <button 
          onClick={() => setActiveView('land')}
          className={`p-3 rounded-lg transition-all ${activeView === 'land' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
          title="Land View"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </button>
      </div>

      {/* Info panel */}
      <div className="absolute top-4 left-4 z-10 bg-white p-2 rounded shadow">
        {polygons.length === 0 ? (
          <p>No polygons found. Draw some on the map first.</p>
        ) : (
          <p>Found {polygons.length} polygon(s)</p>
        )}
      </div>
      
      {selectedPolygonId && (
        <div 
          className={`absolute top-16 left-4 z-10 bg-white p-2 rounded shadow transition-all duration-300 ${
            infoVisible ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform -translate-y-4'
          }`}
        >
          <p>Selected: {selectedPolygonId}</p>
        </div>
      )}

      {/* Control buttons */}
      <div className="absolute bottom-4 right-4 z-10 flex gap-2">
        <button 
          onClick={resetView}
          className="bg-white px-4 py-2 rounded shadow"
        >
          Reset View
        </button>
        <button 
          onClick={() => setHighQuality(!highQuality)}
          className={`px-4 py-2 rounded shadow ${highQuality ? 'bg-white' : 'bg-blue-500 text-white'}`}
        >
          {highQuality ? 'Performance Mode' : 'Quality Mode'}
        </button>
      </div>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
