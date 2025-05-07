'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { DockCreationManager } from './DockCreationManager';
import { BuildingService } from '@/lib/buildingService';

interface DockCreatorProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  active: boolean;
  onComplete: (dockData: any) => void;
  onCancel: () => void;
}

const DockCreator: React.FC<DockCreatorProps> = ({
  scene,
  camera,
  active,
  onComplete,
  onCancel
}) => {
  const [isPlacing, setIsPlacing] = useState<boolean>(false);
  const [previewPosition, setPreviewPosition] = useState<THREE.Vector3 | null>(null);
  const [previewRotation, setPreviewRotation] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Reference to the dock creation manager
  const managerRef = useRef<DockCreationManager | null>(null);
  
  // Initialize the dock creation manager
  useEffect(() => {
    if (active && !managerRef.current) {
      managerRef.current = new DockCreationManager(scene, camera);
    }
    
    return () => {
      if (managerRef.current) {
        managerRef.current.dispose();
        managerRef.current = null;
      }
    };
  }, [active, scene, camera]);
  
  // Update rotation in the manager when it changes
  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.updateRotation(previewRotation);
    }
  }, [previewRotation]);
  
  // Handle mouse movement for dock placement preview
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!active || !managerRef.current) return;
    
    managerRef.current.updateMousePosition(e.clientX, e.clientY);
    
    // Get the preview position (snapped to water edge)
    const position = managerRef.current.getPreviewPosition();
    if (position) {
      setPreviewPosition(position);
    }
  }, [active]);
  
  // Handle click to place dock
  const handleClick = useCallback(async () => {
    if (!active || !managerRef.current || !previewPosition) return;
    
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
      
      // Create the dock using the service
      const buildingService = BuildingService.getInstance();
      const dockData = await buildingService.createDock(
        landId,
        previewPosition,
        previewRotation
      );
      
      // Call the completion callback
      onComplete(dockData);
    } catch (error) {
      console.error('Error creating dock:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create dock');
    } finally {
      setIsPlacing(false);
    }
  }, [active, previewPosition, previewRotation, onComplete]);
  
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
        className="fixed inset-0 z-10 cursor-crosshair"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />
      
      {/* UI Controls */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-black/80 text-white p-4 rounded-lg z-20">
        <h3 className="text-lg font-bold mb-2">Dock Placement</h3>
        
        <div className="flex space-x-4 mb-2">
          <button
            onClick={handleClick}
            disabled={!previewPosition || isPlacing}
            className={`px-4 py-2 rounded-md ${
              previewPosition && !isPlacing
                ? 'bg-amber-600 hover:bg-amber-700' 
                : 'bg-gray-600 cursor-not-allowed'
            }`}
          >
            {isPlacing ? 'Placing...' : 'Place Dock'}
          </button>
          
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-800 rounded-md"
          >
            Cancel
          </button>
        </div>
        
        <div className="text-sm">
          <p>Press <kbd className="px-2 py-1 bg-gray-700 rounded">R</kbd> to rotate</p>
          <p>Position dock along the shoreline</p>
        </div>
        
        {errorMessage && (
          <div className="mt-2 text-red-400">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
};

export default DockCreator;
