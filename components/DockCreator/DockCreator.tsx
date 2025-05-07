'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { DockCreationManager } from './DockCreationManager';
import { getApiBaseUrl } from '@/lib/apiUtils';
import { getWalletAddress } from '@/lib/walletUtils';
import { eventBus, EventTypes } from '@/lib/eventBus';

interface DockCreatorProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  polygons: any[];
  active: boolean;
  onComplete: (dockData: any) => void;
  onCancel: () => void;
}

const DockCreator: React.FC<DockCreatorProps> = ({
  scene,
  camera,
  polygons,
  active,
  onComplete,
  onCancel
}) => {
  const [isPlacing, setIsPlacing] = useState<boolean>(false);
  const [previewPosition, setPreviewPosition] = useState<THREE.Vector3 | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlacementValid, setIsPlacementValid] = useState<boolean>(false);
  
  // Reference to the dock creation manager
  const managerRef = useRef<DockCreationManager | null>(null);
  
  // Get scene and camera with fallbacks if props are not provided
  const actualScene = scene || (document.querySelector('canvas')?.__scene as THREE.Scene);
  const actualCamera = camera || (document.querySelector('canvas')?.__camera as THREE.PerspectiveCamera);
  
  // Initialize the dock creation manager
  useEffect(() => {
    console.log('DockCreator: Initializing with active =', active, 'polygons =', polygons?.length);
    console.log('DockCreator: Scene =', !!actualScene, 'Camera =', !!actualCamera);
    
    if (!active) return;
    
    // Function to initialize the manager with retries
    const initializeManager = async () => {
      let attempts = 0;
      const maxAttempts = 5;
      
      while (attempts < maxAttempts && !managerRef.current) {
        console.log(`DockCreator: Initialization attempt ${attempts + 1}`);
        
        // Try to get scene, camera, and polygons from window.__threeContext
        const globalScene = window.__threeContext?.scene;
        const globalCamera = window.__threeContext?.camera;
        const globalPolygons = window.__polygonData || [];
        
        console.log('Found from global:', 
          !!globalScene, 
          !!globalCamera, 
          globalPolygons.length);
        
        // Use props if provided, otherwise use global objects
        const sceneToUse = scene || actualScene || globalScene;
        const cameraToUse = camera || actualCamera || globalCamera;
        const polygonsToUse = polygons || globalPolygons;
        
        if (sceneToUse && cameraToUse && polygonsToUse && polygonsToUse.length > 0) {
          try {
            console.log('DockCreator: Creating new DockCreationManager');
            managerRef.current = new DockCreationManager(sceneToUse, cameraToUse, polygonsToUse);
            
            // Force an initial update of the mouse position to show the preview
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            managerRef.current.updateMousePosition(centerX, centerY);
            
            console.log('DockCreator: Manager initialized successfully');
            break;
          } catch (error) {
            console.error('Error creating DockCreationManager:', error);
          }
        } else {
          console.log('DockCreator: Missing scene, camera, or polygons');
        }
        
        // Wait before trying again
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
      
      if (!managerRef.current) {
        console.error('DockCreator: Failed to initialize manager after', maxAttempts, 'attempts');
      }
    };
    
    // Start initialization
    initializeManager();
    
    return () => {
      if (managerRef.current) {
        console.log('DockCreator: Disposing DockCreationManager');
        managerRef.current.dispose();
        managerRef.current = null;
      }
    };
  }, [active, actualScene, actualCamera, polygons]);
  
  
  // Add throttling for mouse movement
  const lastUpdateTimeRef = useRef<number>(0);
  const throttleIntervalRef = useRef<number>(50); // 50ms throttle
  
  // Throttled mouse move handler
  const handleMouseMove = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!active || !managerRef.current) return;
    
    const now = Date.now();
    if (now - lastUpdateTimeRef.current < throttleIntervalRef.current) return;
    
    lastUpdateTimeRef.current = now;
    
    managerRef.current.updateMousePosition(e.clientX, e.clientY);
    
    // Get the preview position (snapped to water edge)
    const position = managerRef.current.getPreviewPosition();
    if (position) {
      setPreviewPosition(position);
      const isValid = managerRef.current.isPlacementValid();
      setIsPlacementValid(isValid);
    }
  }, [active]);
  
  // Use a single document-level event listener
  useEffect(() => {
    if (!active) return;
    
    const handleDocumentMouseMove = (e: MouseEvent) => {
      handleMouseMove(e);
    };
    
    const handleDocumentClick = (e: MouseEvent) => {
      // Only handle left mouse button clicks
      if (e.button !== 0) return;
      handleClick();
    };
    
    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('click', handleDocumentClick);
    
    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [active, handleMouseMove]); // Include handleClick in dependencies
  
  // Handle click to place dock
  const handleClick = () => {
    if (!active || !managerRef.current) {
      return;
    }
    
    // Get the current preview position directly from the manager
    const currentPosition = managerRef.current.getPreviewPosition();
    
    if (!currentPosition) {
      return;
    }
    
    // Check if placement is valid
    const isValid = managerRef.current.isPlacementValid();
    
    if (!isValid) {
      setErrorMessage('Dock must be placed along a water edge adjacent to land');
      return;
    }
    
    // Continue with the async part in an IIFE
    (async () => {
      try {
        setIsPlacing(true);
        setErrorMessage(null);
        
        // Get the land ID from the manager
        const landId = managerRef.current.getAdjacentLandId();
      
        if (!landId) {
          setErrorMessage('Dock must be adjacent to land');
          setIsPlacing(false);
          return;
        }
      
        // Get wallet address
        const walletAddress = getWalletAddress();
        if (!walletAddress) {
          setErrorMessage('Please connect your wallet to place a dock');
          setIsPlacing(false);
          return;
        }
      
        // Get the current edge and calculate rotation
        const currentEdge = managerRef.current.getCurrentEdge();
        let rotation = 0;
      
        if (currentEdge) {
          // Calculate the direction vector of the edge
          const direction = new THREE.Vector3()
            .subVectors(currentEdge.end, currentEdge.start)
            .normalize();
        
          // Calculate the angle for proper alignment perpendicular to the edge
          rotation = Math.atan2(direction.z, direction.x) + Math.PI/2;
        }
      
        // Generate connection points
        const connectionPoints = managerRef.current.generateConnectionPoints();
      
        // Prepare dock data
        const dockData = {
          landId: landId,
          position: {
            x: currentPosition.x,
            y: currentPosition.y,
            z: currentPosition.z
          },
          rotation: rotation, // Use calculated rotation instead of previewRotation
          connectionPoints: connectionPoints,
          createdBy: walletAddress,
          // Add metadata for the dock model
          metadata: {
            modelPath: '/assets/buildings/models/public-dock/model.glb',
            scale: 1.0,
            offsetY: 0.1
          }
        };
        
        // Send to server
        const response = await fetch(`${getApiBaseUrl()}/api/docks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dockData),
        });
        
        if (!response.ok) {
          throw new Error(`Failed to create dock: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Emit event
        eventBus.emit(EventTypes.DOCK_PLACED, {
          dockId: data.id,
          landId: landId,
          position: currentPosition,
          rotation: rotation, // Use calculated rotation instead of previewRotation
          modelPath: '/assets/buildings/models/public-dock/model.glb'
        });
        
        // Call the completion callback
        onComplete(data);
      } catch (error) {
        console.error('Error creating dock:', error);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to create dock');
      } finally {
        setIsPlacing(false);
      }
    })();
  };
  
  
  // Render UI
  if (!active) return null;
  
  return (
    <div className="dock-creator">
      {/* Overlay for mouse events - SIMPLIFIED */}
      <div 
        className="fixed inset-0"
        style={{ 
          pointerEvents: 'none',
          cursor: 'crosshair',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,255,0.01)',
          zIndex: 1000
        }}
      />
      
      {/* UI Controls */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-black/80 text-white p-4 rounded-lg z-20 w-96">
        <h3 className="text-lg font-serif mb-4 text-center">Dock Placement</h3>
        
        {errorMessage && (
          <div className="bg-red-500/70 p-2 rounded mb-4 text-white text-sm">
            {errorMessage}
          </div>
        )}
        
        <div className="text-sm mb-4">
          <p>Position your cursor where you want to place the dock.</p>
          <p>Docks must be placed at the edge of land parcels adjacent to water.</p>
          <p>The dock will automatically align perpendicular to the shoreline.</p>
          {isPlacementValid && (
            <p className="text-green-400 mt-2">Valid placement location found</p>
          )}
        </div>
        
        <div className="flex justify-between">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded transition-colors"
            disabled={isPlacing}
          >
            Cancel
          </button>
          
          <button
            onClick={handleClick}
            disabled={!isPlacementValid || isPlacing}
            className={`px-4 py-2 rounded ${
              isPlacementValid && !isPlacing
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {isPlacing ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Creating...
              </div>
            ) : (
              'Place Dock'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DockCreator;
