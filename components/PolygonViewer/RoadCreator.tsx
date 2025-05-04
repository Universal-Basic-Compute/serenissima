import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoadCreationManager } from '@/lib/threejs/RoadCreationManager';

interface RoadCreatorProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  active: boolean;
  onComplete: (roadPoints: THREE.Vector3[]) => void;
  onCancel: () => void;
}

/**
 * RoadCreator component for creating roads in the 3D scene
 * UI component that uses RoadCreationManager for Three.js operations
 */
const RoadCreator: React.FC<RoadCreatorProps> = ({
  scene,
  camera,
  active,
  onComplete,
  onCancel
}) => {
  // State for UI feedback
  const [curvature, setCurvature] = useState<number>(0.5); // 0 to 1
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [snapPoint, setSnapPoint] = useState<THREE.Vector3 | null>(null);
  const [pointCount, setPointCount] = useState<number>(0);
  
  // Ref for the road creation manager
  const managerRef = useRef<RoadCreationManager | null>(null);
  
  // Initialize the road creation manager
  useEffect(() => {
    if (active && !managerRef.current) {
      managerRef.current = new RoadCreationManager(scene, camera);
    }
    
    return () => {
      if (managerRef.current) {
        managerRef.current.dispose();
        managerRef.current = null;
      }
    };
  }, [active, scene, camera]);

  // Set up event listeners when active
  useEffect(() => {
    if (!active || !managerRef.current) return;

    // Add a small delay before enabling click handling to prevent the initial click from being registered
    let clickEnabled = false;
    const enableClickTimeout = setTimeout(() => {
      clickEnabled = true;
    }, 100);

    const handleMouseMove = (event: MouseEvent) => {
      if (!managerRef.current) return;
      
      // Update mouse position in the manager
      managerRef.current.updateMousePosition(event.clientX, event.clientY);
      
      // Update UI state based on manager state
      setSnapPoint(managerRef.current.getSnapPoint());
    };

    const handleClick = (event: MouseEvent) => {
      if (!active || event.button !== 0 || !clickEnabled || !managerRef.current) return;
      
      console.log('Road Creator: Click detected');
      
      // Mark this event as handled by the road creator
      (event as any).isRoadCreationClick = true;
      
      // Handle click in the manager
      const newPoint = managerRef.current.handleClick();
      
      if (newPoint) {
        console.log(`Road Creator: Adding point at (${newPoint.x}, ${newPoint.y}, ${newPoint.z})`);
        
        // Update point count for UI
        setPointCount(managerRef.current.getPoints().length);
        
        // Clear any error message
        setErrorMessage(null);
      } else {
        console.log('Road Creator: No valid polygon intersection found');
        // Show error message
        setErrorMessage("Please click on a land polygon to place road points");
        
        // Clear the message after 2 seconds
        setTimeout(() => {
          setErrorMessage(null);
        }, 2000);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!managerRef.current) return;
      
      if (event.key === 'Escape') {
        // Cancel road creation
        onCancel();
      } else if (event.key === 'Enter' && pointCount >= 2) {
        // Complete road creation
        onComplete(managerRef.current.getPoints());
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        // Remove the last point
        if (managerRef.current.removeLastPoint()) {
          setPointCount(managerRef.current.getPoints().length);
        }
      }
    };

    const handleRightClick = (event: MouseEvent) => {
      event.preventDefault();
      
      if (!managerRef.current) return;
      
      if (pointCount >= 2) {
        // Complete the road on right-click
        onComplete(managerRef.current.getPoints());
      } else {
        // Cancel if we don't have enough points
        onCancel();
      }
    };

    // Add this function to mark events for road creation
    const preventLandSelection = (event: MouseEvent) => {
      // Add a custom property to the event to mark it
      (event as any).isRoadCreationClick = true;
    };

    // Add event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleRightClick);
    window.addEventListener('click', preventLandSelection, true); // true for capture phase

    return () => {
      // Remove event listeners
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleRightClick);
      window.removeEventListener('click', preventLandSelection, true);
      clearTimeout(enableClickTimeout);
    };
  }, [active, pointCount, onComplete, onCancel]);

  // Render UI controls
  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-30 bg-white p-4 rounded-lg shadow-lg border-2 border-amber-600">
      <div className="text-center mb-2 font-medium text-amber-800">
        Road Creator
      </div>
      
      <div className="flex items-center mb-3">
        <span className="mr-2 text-sm">Curvature:</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={curvature}
          onChange={(e) => {
            const newValue = parseFloat(e.target.value);
            setCurvature(newValue);
            // Update the curvature in the manager
            if (managerRef.current) {
              managerRef.current.setCurvature(newValue);
            }
          }}
          className="w-32"
        />
        <span className="ml-2 text-sm">{Math.round(curvature * 100)}%</span>
      </div>
      
      <div className="flex justify-between">
        <button
          onClick={onCancel}
          className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
        
        <button
          onClick={() => {
            if (managerRef.current && pointCount >= 2) {
              onComplete(managerRef.current.getPoints());
            }
          }}
          disabled={pointCount < 2}
          className={`px-3 py-1 rounded ${
            pointCount < 2
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-amber-600 text-white hover:bg-amber-700 transition-colors'
          }`}
        >
          Complete Road
        </button>
      </div>
      
      <div className="mt-2 text-xs text-gray-600 text-center">
        Click to place points • Press ESC to cancel • Press Backspace to remove last point
      </div>
      
      {/* Error message */}
      {errorMessage && (
        <div className="mt-2 text-red-600 text-sm text-center">
          {errorMessage}
        </div>
      )}
      
      {/* Snapping indicator */}
      {snapPoint && (
        <div className="mt-2 text-green-600 text-sm text-center">
          Snapping to nearest edge or road
        </div>
      )}
      
      {/* Point counter */}
      <div className="mt-2 text-xs text-gray-700 text-center">
        Points: {pointCount} {pointCount >= 2 ? '(Ready to complete)' : ''}
      </div>
    </div>
  );
};

export default RoadCreator;
