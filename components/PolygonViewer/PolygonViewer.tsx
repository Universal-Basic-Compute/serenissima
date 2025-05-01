'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { calculateBounds } from './utils';
import SceneSetup from './SceneSetup';
import PolygonRenderer from './PolygonRenderer';
import WaterEffect from './WaterEffect';
import InteractionManager from './InteractionManager';
import ViewModeMenu from './ViewModeMenu';
import LandDetailsPanel from './LandDetailsPanel';
import ActionButton from '../UI/ActionButton';
import usePolygonStore from '@/store/usePolygonStore';

export default function PolygonViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [infoVisible, setInfoVisible] = useState(false);
  const polygonMeshesRef = useRef<Record<string, THREE.Mesh>>({});
  const isInteractingWithPolygon = useRef(false);
  
  // Get state from store
  const {
    polygons,
    loading,
    error,
    activeView,
    highQuality,
    selectedPolygonId,
    setActiveView,
    toggleQuality,
    setHoveredPolygonId,
    setSelectedPolygonId,
    loadPolygons
  } = usePolygonStore();
  
  // References to our scene components
  const sceneRef = useRef<SceneSetup | null>(null);
  const polygonRendererRef = useRef<PolygonRenderer | null>(null);
  const waterEffectRef = useRef<WaterEffect | null>(null);
  const interactionManagerRef = useRef<InteractionManager | null>(null);
  
  
  // Handler for closing the land details panel
  const handleCloseLandDetails = useCallback(() => {
    setSelectedPolygonId(null);
  }, [setSelectedPolygonId]);
  
  // Interaction handlers removed to disable polygon interactions
  
  // Removed effect that stores resetCamera function on window
  
  // Load polygons on mount
  useEffect(() => {
    loadPolygons();
  }, [loadPolygons]);

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
      camera: scene.camera,
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
      hoveredPolygonId: null,
      setHoveredPolygonId,
      selectedPolygonId,
      setSelectedPolygonId
    });
    interactionManagerRef.current = interactionManager;
    
    // Removed automatic camera reset at initialization
    
    // Add a frame counter for less frequent updates
    let frameCount = 0;
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Update controls to enable camera movement
      if (sceneRef.current && sceneRef.current.controls) {
        sceneRef.current.controls.update();
      }
      
      // Update water effect
      if (waterEffectRef.current) {
        waterEffectRef.current.update(frameCount, !highQuality);
      }
      
      // Update polygon LOD
      if (polygonRendererRef.current) {
        polygonRendererRef.current.update();
      }
      
      frameCount++;
      
      // Use composer instead of renderer directly to include post-processing effects
      if (sceneRef.current && sceneRef.current.composer) {
        sceneRef.current.composer.render();
      }
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
  }, [polygons, loading, activeView, highQuality, selectedPolygonId]);
  
  // We've removed the separate controls update loop to prevent camera resets
  
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
      {/* View mode menu */}
      <ViewModeMenu activeView={activeView} setActiveView={setActiveView} />

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

      {/* Add the Land Details Panel */}
      {activeView === 'land' && (
        <LandDetailsPanel 
          selectedPolygonId={selectedPolygonId} 
          onClose={handleCloseLandDetails} 
        />
      )}

      <canvas 
        ref={canvasRef} 
        className="w-full h-full"
      />
    </div>
  );
}
