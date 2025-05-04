import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoadCreatorFacade } from '@/lib/threejs/RoadCreatorFacade';

interface RoadCreatorProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  active: boolean;
  onComplete: (roadPoints: THREE.Vector3[]) => void;
  onCancel: () => void;
}

/**
 * RoadCreator component for creating roads in the 3D scene
 * UI component that uses RoadCreatorFacade for Three.js operations
 */
const RoadCreator: React.FC<RoadCreatorProps> = ({
  scene,
  camera,
  active,
  onComplete,
  onCancel
}) => {
  // State
  const [points, setPoints] = useState<THREE.Vector3[]>([]);
  const [curvature, setCurvature] = useState<number>(0.5); // 0 to 1
  const [isPlacing, setIsPlacing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [snapPoint, setSnapPoint] = useState<THREE.Vector3 | null>(null);
  
  // Refs
  const roadCreatorRef = useRef<RoadCreatorFacade | null>(null);
  
  // Initialize the road creator facade
  useEffect(() => {
    if (active && !roadCreatorRef.current) {
      roadCreatorRef.current = new RoadCreatorFacade(scene, camera);
    }
    
    return () => {
      if (roadCreatorRef.current) {
        roadCreatorRef.current.dispose();
        roadCreatorRef.current = null;
      }
    };
  }, [active, scene, camera]);

  // Set up event listeners when active
  useEffect(() => {
    if (!active || !roadCreatorRef.current) return;

    // Add a small delay before enabling click handling to prevent the initial click from being registered
    let clickEnabled = false;
    const enableClickTimeout = setTimeout(() => {
      clickEnabled = true;
    }, 100);

    const handleMouseMove = (event: MouseEvent) => {
      if (!roadCreatorRef.current) return;
      
      // Update mouse position in the facade
      roadCreatorRef.current.updateMousePosition(event.clientX, event.clientY);
      
      // Update road preview
      updateRoadPreview();
    };

    const handleClick = (event: MouseEvent) => {
      if (!active || event.button !== 0 || !clickEnabled || !roadCreatorRef.current) return;
      
      console.log('Road Creator: Click detected');
      
      // Mark this event as handled by the road creator
      (event as any).isRoadCreationClick = true;
      
      // Update mouse position in the facade
      roadCreatorRef.current.updateMousePosition(event.clientX, event.clientY);
      
      // Find intersection with polygon meshes
      const intersectionPoint = roadCreatorRef.current.findIntersection();
      
      if (intersectionPoint) {
        console.log(`Road Creator: Adding point at (${intersectionPoint.x}, ${intersectionPoint.y}, ${intersectionPoint.z})`);
        
        // Add point to the road
        const newPoints = [...points, intersectionPoint];
        setPoints(newPoints);
        
        // If this is the first point, start placing mode
        if (newPoints.length === 1) {
          setIsPlacing(true);
        }
        
        // If we have at least 2 points, update the preview
        if (newPoints.length >= 2) {
          roadCreatorRef.current.createRoadMesh(newPoints, curvature);
        }
        
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
      if (event.key === 'Escape') {
        // Cancel road creation
        onCancel();
      } else if (event.key === 'Enter' && points.length >= 2) {
        // Complete road creation
        onComplete(points);
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        // Remove the last point
        if (points.length > 0 && roadCreatorRef.current) {
          const newPoints = [...points];
          newPoints.pop();
          setPoints(newPoints);
          
          if (newPoints.length >= 2) {
            // Update preview with remaining points
            roadCreatorRef.current.createRoadMesh(newPoints, curvature);
          }
          
          if (newPoints.length === 0) {
            setIsPlacing(false);
          }
        }
      }
    };

    const handleRightClick = (event: MouseEvent) => {
      event.preventDefault();
      
      if (points.length >= 2) {
        // Complete the road on right-click
        onComplete(points);
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
  }, [active, points, curvature, onComplete, onCancel]);

  // Update road preview when mouse moves
  const updateRoadPreview = () => {
    if (!isPlacing || points.length === 0 || !roadCreatorRef.current) return;
    
    // Find intersection with polygon meshes
    const intersectionPoint = roadCreatorRef.current.findIntersection();
    
    if (intersectionPoint) {
      // Find snap point if available
      const snappedPoint = roadCreatorRef.current.findSnapPoint(intersectionPoint, points);
      
      // Update snap point state for UI feedback
      setSnapPoint(snappedPoint);
      
      // Use the snapped point if available, otherwise use the intersection point
      const finalPoint = snappedPoint || intersectionPoint;
      
      // Create indicator at the current point
      roadCreatorRef.current.createIndicatorMesh(finalPoint, !!snappedPoint);
      
      // Create a temporary array with the current points plus the mouse position
      const previewPoints = [...points, finalPoint];
      
      // Update the preview mesh if we have at least 2 points
      if (previewPoints.length >= 2) {
        roadCreatorRef.current.createRoadMesh(previewPoints, curvature);
      }
    }
  };

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
            // Update the preview if we have points
            if (points.length >= 2 && roadCreatorRef.current) {
              roadCreatorRef.current.createRoadMesh(points, newValue);
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
          onClick={() => onComplete(points)}
          disabled={points.length < 2}
          className={`px-3 py-1 rounded ${
            points.length < 2
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
    </div>
  );
};

export default RoadCreator;
