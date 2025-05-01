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
import BridgeRenderer from './BridgeRenderer';

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
    landOwners,
    setActiveView,
    toggleQuality,
    setHoveredPolygonId,
    setSelectedPolygonId,
    loadPolygons,
    loadLandOwners
  } = usePolygonStore();
  
  // References to our scene components
  const sceneRef = useRef<SceneSetup | null>(null);
  const polygonRendererRef = useRef<PolygonRenderer | null>(null);
  const waterEffectRef = useRef<WaterEffect | null>(null);
  const interactionManagerRef = useRef<InteractionManager | null>(null);
  const bridgeRendererRef = useRef<BridgeRenderer | null>(null);
  
  
  // Handler for closing the land details panel
  const handleCloseLandDetails = useCallback(() => {
    setSelectedPolygonId(null);
  }, [setSelectedPolygonId]);
  
  // Interaction handlers removed to disable polygon interactions
  
  // Removed effect that stores resetCamera function on window
  
  // Add this to the state
  const [bridges, setBridges] = useState([]);

  // Add this function to load bridges
  const loadBridges = useCallback(async () => {
    try {
      const response = await fetch('/api/get-bridges');
      const data = await response.json();
      setBridges(data.bridges || []);
    } catch (error) {
      console.error('Error loading bridges:', error);
    }
  }, []);

  // Load polygons on mount
  useEffect(() => {
    console.log('Loading polygons and bridges...');
    loadPolygons();
    loadBridges();
    
    // Always load land owners since land view is now the default
    loadLandOwners();
  }, [loadPolygons, loadBridges, loadLandOwners]);
  
  // Add an effect to listen for polygon deletion events
  useEffect(() => {
    const handlePolygonDeleted = () => {
      // Reload polygons when a polygon is deleted
      loadPolygons();
      loadLandOwners();
    };
    
    // Create a custom event for polygon deletion
    window.addEventListener('polygonDeleted', handlePolygonDeleted);
    
    return () => {
      window.removeEventListener('polygonDeleted', handlePolygonDeleted);
    };
  }, [loadPolygons, loadLandOwners]);

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

  // Set up Three.js scene - only depends on polygons and loading
  // NOT dependent on activeView, highQuality, or selectedPolygonId to prevent scene recreation
  useEffect(() => {
    if (!canvasRef.current || loading) return;
    
    console.log(`Setting up Three.js scene`);
    console.log('Polygons:', polygons);

    // Calculate bounds for all polygons
    const bounds = calculateBounds(polygons);
    console.log('Calculated bounds:', bounds);
    
    // Initialize scene
    const scene = new SceneSetup({
      canvas: canvasRef.current,
      activeView, // We'll still pass activeView, but handle view changes separately
      highQuality
    });
    sceneRef.current = scene;
    
    // Add camera reference to window for debugging
    if (typeof window !== 'undefined') {
      (window as any).threeJsCamera = scene.camera;
    }
    
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
    
    // Initialize bridge renderer
    const bridgeRenderer = new BridgeRenderer({
      scene: scene.scene,
      bridges,
      polygons,
      bounds,
      activeView,
      performanceMode: !highQuality
    });
    bridgeRendererRef.current = bridgeRenderer;
    
    // Add a frame counter for less frequent updates
    let frameCount = 0;
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Update controls to enable camera movement
      if (sceneRef.current && sceneRef.current.controls) {
        // Store camera position before controls update
        const cameraPosBeforeUpdate = sceneRef.current.camera.position.clone();
        
        sceneRef.current.controls.update();
        
        // Check if camera position changed during controls update
        if (!cameraPosBeforeUpdate.equals(sceneRef.current.camera.position)) {
          console.log('Camera position changed during controls update:', {
            before: cameraPosBeforeUpdate,
            after: sceneRef.current.camera.position.clone()
          });
        }
      }
      
      // Update water effect
      if (waterEffectRef.current) {
        waterEffectRef.current.update(frameCount, !highQuality);
      }
      
      // Update polygon LOD and selection state
      if (polygonRendererRef.current) {
        // Pass the current selectedPolygonId to ensure selection state is maintained
        polygonRendererRef.current.update(selectedPolygonId);
      }
      
      frameCount++;
      
      // Use composer instead of renderer directly to include post-processing effects
      if (sceneRef.current && sceneRef.current.composer) {
        // Store camera position before render
        const cameraPosBeforeRender = sceneRef.current.camera.position.clone();
        
        // Render the scene
        sceneRef.current.composer.render();
        
        // Check if camera position changed during render
        if (!cameraPosBeforeRender.equals(sceneRef.current.camera.position)) {
          console.log('Camera position changed during render:', {
            before: cameraPosBeforeRender,
            after: sceneRef.current.camera.position.clone()
          });
        }
      }
    };
    
    animate();
    
    // Cleanup
    return () => {
      // Clean up all components
      if (interactionManagerRef.current) interactionManagerRef.current.cleanup();
      if (waterEffectRef.current) waterEffectRef.current.cleanup();
      if (polygonRendererRef.current) polygonRendererRef.current.cleanup();
      if (bridgeRendererRef.current) bridgeRendererRef.current.cleanup();
      if (sceneRef.current) sceneRef.current.cleanup();
      
      // Clear references
      sceneRef.current = null;
      polygonRendererRef.current = null;
      waterEffectRef.current = null;
      interactionManagerRef.current = null;
      bridgeRendererRef.current = null;
    };
  }, [polygons, loading]); // Remove activeView and highQuality dependencies
  
  // We've removed the separate controls update loop to prevent camera resets
  
  // Add a separate effect to handle selection state changes
  useEffect(() => {
    // Only update selection state when selectedPolygonId changes
    // This ensures the selection is durable
    if (polygonRendererRef.current) {
      console.log('Updating selection state:', selectedPolygonId);
      polygonRendererRef.current.updateSelectionState(selectedPolygonId);
    }
  }, [selectedPolygonId]);
  
  // Add a separate effect to handle view mode changes
  useEffect(() => {
    // Update view mode when activeView changes
    if (sceneRef.current) {
      console.log(`Updating view mode to ${activeView}`);
      
      // Load land owners when switching to land view
      if (activeView === 'land') {
        loadLandOwners();
      }
      
      // Update water effect
      if (waterEffectRef.current) {
        waterEffectRef.current.updateViewMode(activeView);
      }
      
      // Update polygon renderer
      if (polygonRendererRef.current) {
        polygonRendererRef.current.updateViewMode(activeView);
      }
      
      // Update interaction manager
      if (interactionManagerRef.current) {
        interactionManagerRef.current.updateViewMode(activeView);
      }
      
      // Update bridge renderer
      if (bridgeRendererRef.current) {
        bridgeRendererRef.current.updateViewMode(activeView);
      }
    }
  }, [activeView, loadLandOwners]);

  // Add a separate effect to handle quality changes
  useEffect(() => {
    // Update quality when highQuality changes
    if (sceneRef.current) {
      console.log(`Updating quality to ${highQuality ? 'high' : 'low'}`);
      
      // Update water effect
      if (waterEffectRef.current) {
        waterEffectRef.current.updateQuality(!highQuality);
      }
      
      // Update polygon renderer
      if (polygonRendererRef.current) {
        polygonRendererRef.current.updateQuality(!highQuality);
      }
      
      // Update bridge renderer
      if (bridgeRendererRef.current) {
        bridgeRendererRef.current.updateQuality(!highQuality);
      }
    }
  }, [highQuality]);
  
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
          <div className="flex items-center justify-between">
            <p>Selected: {selectedPolygonId}</p>
            <button
              onClick={() => {
                if (confirm(`Are you sure you want to delete polygon ${selectedPolygonId}?`)) {
                  // Call the delete API
                  fetch('/api/delete-polygon', {
                    method: 'DELETE',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ id: selectedPolygonId }),
                  })
                  .then(response => response.json())
                  .then(data => {
                    if (data.success) {
                      // Clear selection and trigger reload
                      setSelectedPolygonId(null);
                      window.dispatchEvent(new Event('polygonDeleted'));
                      alert('Polygon deleted successfully');
                    } else {
                      alert(`Failed to delete polygon: ${data.error}`);
                    }
                  })
                  .catch(error => {
                    console.error('Error deleting polygon:', error);
                    alert('An error occurred while deleting the polygon');
                  });
                }
              }}
              className="ml-4 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
              title="Delete this polygon"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Add the Land Details Panel */}
      {activeView === 'land' && (
        <LandDetailsPanel 
          selectedPolygonId={selectedPolygonId} 
          onClose={handleCloseLandDetails}
          polygons={polygons}
          landOwners={landOwners}
        />
      )}

      <canvas 
        ref={canvasRef} 
        className="w-full h-full"
      />
    </div>
  );
}
