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
  const [previewRotation, setPreviewRotation] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlacementValid, setIsPlacementValid] = useState<boolean>(false);
  
  // Reference to the dock creation manager
  const managerRef = useRef<DockCreationManager | null>(null);
  
  // Initialize the dock creation manager
  useEffect(() => {
    console.log('DockCreator: Initializing with active =', active, 'polygons =', polygons.length);
    if (active && !managerRef.current && polygons.length > 0) {
      console.log('DockCreator: Creating new DockCreationManager');
      managerRef.current = new DockCreationManager(scene, camera, polygons);
    }
    
    return () => {
      if (managerRef.current) {
        console.log('DockCreator: Disposing DockCreationManager');
        managerRef.current.dispose();
        managerRef.current = null;
      }
    };
  }, [active, scene, camera, polygons]);
  
  // Update rotation in the manager when it changes
  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.updateRotation(previewRotation);
    }
  }, [previewRotation]);
  
  // Handle mouse movement for dock placement preview
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!active || !managerRef.current) {
      console.log('DockCreator: Mouse move ignored - active =', active, 'manager =', !!managerRef.current);
      return;
    }
    
    console.log('DockCreator: Mouse move at', e.clientX, e.clientY);
    managerRef.current.updateMousePosition(e.clientX, e.clientY);
    
    // Get the preview position (snapped to water edge)
    const position = managerRef.current.getPreviewPosition();
    if (position) {
      console.log('DockCreator: Preview position updated to', position);
      setPreviewPosition(position);
      const isValid = managerRef.current.isPlacementValid();
      console.log('DockCreator: Placement valid =', isValid);
      setIsPlacementValid(isValid);
    }
  }, [active]);
  
  // Add document-level event listeners as a fallback
  useEffect(() => {
    if (!active) return;
    
    console.log('DockCreator: Adding document event listeners');
    
    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (!managerRef.current) return;
      console.log('Document mouse move detected at', e.clientX, e.clientY);
      managerRef.current.updateMousePosition(e.clientX, e.clientY);
      
      // Get the preview position (snapped to water edge)
      const position = managerRef.current.getPreviewPosition();
      if (position) {
        setPreviewPosition(position);
        setIsPlacementValid(managerRef.current.isPlacementValid());
      }
    };
    
    const handleDocumentClick = (e: MouseEvent) => {
      console.log('Document click detected at', e.clientX, e.clientY);
      // Call the handleClick function directly
      handleClick();
    };
    
    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('click', handleDocumentClick);
    
    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [active]); // Remove handleClick from dependencies
  
  // Handle click to place dock
  const handleClick = () => {
    console.log('DockCreator: Click detected, active =', active, 'manager =', !!managerRef.current);
    
    if (!active || !managerRef.current) {
      console.log('DockCreator: Click ignored - component not active or manager not initialized');
      return;
    }
    
    // Get the current preview position directly from the manager
    const currentPosition = managerRef.current.getPreviewPosition();
    console.log('DockCreator: Current preview position =', currentPosition);
    
    if (!currentPosition) {
      console.log('DockCreator: No valid position found');
      return;
    }
    
    // Check if placement is valid
    const isValid = managerRef.current.isPlacementValid();
    console.log('DockCreator: Placement valid =', isValid);
    
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
          rotation: previewRotation,
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
          rotation: previewRotation,
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
  
  // Handle rotation with keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!active) return;
      
      if (e.key === 'r' || e.key === 'R') {
        // Rotate 45 degrees
        setPreviewRotation((prev) => (prev + Math.PI / 4) % (Math.PI * 2));
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active]);
  
  // Render UI
  if (!active) return null;
  
  return (
    <div className="dock-creator">
      {/* Overlay for mouse events */}
      <div 
        className="fixed inset-0 z-[100]" // Increase z-index to be higher than anything else
        style={{ 
          pointerEvents: 'all',
          cursor: 'crosshair',
          position: 'fixed', // Change from absolute to fixed
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(255,0,0,0.05)' // Make it slightly visible for debugging
        }}
        onMouseMove={(e) => {
          console.log('Overlay mouse move detected at', e.clientX, e.clientY);
          handleMouseMove(e);
        }}
        onClick={(e) => {
          console.log('Overlay click detected at', e.clientX, e.clientY);
          e.preventDefault(); // Add this
          e.stopPropagation(); // Keep this
          handleClick();
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
        
        <div className="mb-4">
          <label className="block text-sm mb-1">Rotation</label>
          <input
            type="range"
            min="0"
            max={Math.PI * 2}
            step="0.1"
            value={previewRotation}
            onChange={(e) => setPreviewRotation(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
        
        <div className="text-sm mb-4">
          <p>Position your cursor where you want to place the dock.</p>
          <p>Docks must be placed at the edge of land parcels adjacent to water.</p>
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
