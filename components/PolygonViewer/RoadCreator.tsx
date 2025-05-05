import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { RoadCreationManager } from '@/lib/threejs/RoadCreationManager';
import roadService from '@/services/RoadService';
import { log } from '@/lib/logUtils';
import { throttle, debounce } from '@/lib/performanceUtils';

interface RoadCreatorProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  active: boolean;
  onComplete: (roadPoints: THREE.Vector3[], roadId?: string) => void;
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
  const [lastFrameTime, setLastFrameTime] = useState<number>(0);
  const [performanceMode, setPerformanceMode] = useState<boolean>(false);
  
  // Refs for the road creation manager and performance monitoring
  const managerRef = useRef<RoadCreationManager | null>(null);
  const frameCountRef = useRef<number>(0);
  const mouseMoveCountRef = useRef<number>(0);
  const lastPerformanceCheckRef = useRef<number>(Date.now());
  
  // Initialize the road creation manager
  useEffect(() => {
    if (active && !managerRef.current) {
      try {
        managerRef.current = new RoadCreationManager(scene, camera);
        log.info('RoadCreator: Road creation manager initialized successfully');
      } catch (error) {
        log.error('RoadCreator: Failed to initialize road creation manager', error);
        setErrorMessage('Failed to initialize road creation tools. Please refresh the page and try again.');
        // Notify parent component of failure
        setTimeout(() => onCancel(), 2000);
      }
    }
    
    return () => {
      if (managerRef.current) {
        try {
          managerRef.current.dispose();
          log.info('RoadCreator: Road creation manager disposed successfully');
        } catch (error) {
          log.error('RoadCreator: Error disposing road creation manager', error);
        } finally {
          managerRef.current = null;
        }
      }
    };
  }, [active, scene, camera, onCancel]);

  // Create throttled and debounced handlers
  const throttledMouseMoveRef = useRef(throttle((event: MouseEvent) => {
    if (!managerRef.current) return;
    
    try {
      // Count mouse moves for performance monitoring
      mouseMoveCountRef.useRef++;
      
      // Update mouse position in the manager
      managerRef.current.updateMousePosition(event.clientX, event.clientY);
      
      // In performance mode, only update UI state every few frames
      if (!performanceMode || frameCountRef.current % 3 === 0) {
        setSnapPoint(managerRef.current.getSnapPoint());
      }
    } catch (error) {
      log.error('RoadCreator: Error during mouse move handling', error);
    }
  }, performanceMode ? 50 : 16)); // Throttle more aggressively in performance mode
  
  // Animation frame handler for smoother updates
  const animationFrameHandler = useCallback(() => {
    if (!active || !managerRef.current) return;
    
    const currentTime = performance.now();
    frameCountRef.current++;
    
    // Check performance every second
    if (currentTime - lastPerformanceCheckRef.current > 1000) {
      const fps = frameCountRef.current;
      const mouseMoves = mouseMoveCountRef.current;
      
      // If performance is suffering, enable performance mode
      if (fps < 30 || mouseMoves > 100) {
        if (!performanceMode) {
          log.info('RoadCreator: Enabling performance mode due to low FPS or high mouse event count');
          setPerformanceMode(true);
        }
      } else if (performanceMode && fps > 50 && mouseMoves < 50) {
        // If performance is good, disable performance mode
        log.info('RoadCreator: Disabling performance mode as performance has improved');
        setPerformanceMode(false);
      }
      
      // Reset counters
      frameCountRef.current = 0;
      mouseMoveCountRef.current = 0;
      lastPerformanceCheckRef.current = currentTime;
    }
    
    // Request next frame
    if (active) {
      requestAnimationFrame(animationFrameHandler);
    }
  }, [active, performanceMode]);
  
  // Set up event listeners when active
  useEffect(() => {
    if (!active || !managerRef.current) return;

    // Add a small delay before enabling click handling to prevent the initial click from being registered
    let clickEnabled = false;
    const enableClickTimeout = setTimeout(() => {
      clickEnabled = true;
    }, 100);
    
    // Start animation frame loop for smooth updates
    requestAnimationFrame(animationFrameHandler);

    const handleMouseMove = (event: MouseEvent) => {
      throttledMouseMoveRef.current(event);
    };

    const handleClick = (event: MouseEvent) => {
      if (!active || event.button !== 0 || !clickEnabled || !managerRef.current) return;
      
      log.info('RoadCreator: Click detected');
      
      try {
        // Mark this event as handled by the road creator
        (event as any).isRoadCreationClick = true;
        
        // Handle click in the manager
        const newPoint = managerRef.current.handleClick();
        
        if (newPoint) {
          log.info(`RoadCreator: Adding point at (${newPoint.x.toFixed(2)}, ${newPoint.y.toFixed(2)}, ${newPoint.z.toFixed(2)})`);
          
          // Update point count for UI
          setPointCount(managerRef.current.getPoints().length);
          
          // Clear any error message
          setErrorMessage(null);
        } else {
          log.warn('RoadCreator: No valid polygon intersection found');
          // Show error message
          setErrorMessage("Please click on a land polygon to place road points");
          
          // Clear the message after 2 seconds
          setTimeout(() => {
            setErrorMessage(null);
          }, 2000);
        }
      } catch (error) {
        log.error('RoadCreator: Error handling click event', error);
        setErrorMessage("Failed to place road point. Please try again.");
        
        // Clear the message after 2 seconds
        setTimeout(() => {
          setErrorMessage(null);
        }, 2000);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!managerRef.current) return;
      
      try {
        if (event.key === 'Escape') {
          // Cancel road creation
          log.info('RoadCreator: Cancelling road creation via Escape key');
          onCancel();
        } else if (event.key === 'Enter' && pointCount >= 2) {
          // Complete road creation
          log.info('RoadCreator: Completing road creation via Enter key');
          onComplete(managerRef.current.getPoints());
        } else if (event.key === 'Backspace' || event.key === 'Delete') {
          // Remove the last point
          log.info('RoadCreator: Removing last point via Backspace/Delete key');
          if (managerRef.current.removeLastPoint()) {
            setPointCount(managerRef.current.getPoints().length);
          } else {
            log.warn('RoadCreator: No points to remove');
          }
        }
      } catch (error) {
        log.error('RoadCreator: Error handling key event', error);
        setErrorMessage("An error occurred. Please try again.");
        
        // Clear the message after 2 seconds
        setTimeout(() => {
          setErrorMessage(null);
        }, 2000);
      }
    };

    const handleRightClick = (event: MouseEvent) => {
      event.preventDefault();
      
      if (!managerRef.current) return;
      
      try {
        if (pointCount >= 2) {
          // Complete the road on right-click
          log.info('RoadCreator: Completing road creation via right-click');
          onComplete(managerRef.current.getPoints());
        } else {
          // Cancel if we don't have enough points
          log.info('RoadCreator: Cancelling road creation via right-click (not enough points)');
          onCancel();
        }
      } catch (error) {
        log.error('RoadCreator: Error handling right-click event', error);
        setErrorMessage("An error occurred. Please try again.");
        
        // Clear the message after 2 seconds
        setTimeout(() => {
          setErrorMessage(null);
        }, 2000);
      }
    };

    // Add this function to mark events for road creation
    const preventLandSelection = (event: MouseEvent) => {
      // Add a custom property to the event to mark it
      (event as any).isRoadCreationClick = true;
    };

    // Create a passive event listener for mouse move to improve performance
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
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
      
      // Cancel any pending throttled or debounced operations
      if (throttledMouseMoveRef.current.cancel) {
        throttledMouseMoveRef.current.cancel();
      }
    };
  }, [active, pointCount, onComplete, onCancel, animationFrameHandler]);

  // Memoize expensive calculations
  const roadPoints = useMemo(() => {
    return managerRef.current?.getPoints() || [];
  }, [pointCount]);
  
  // Render UI controls - memoize the entire component to prevent unnecessary re-renders
  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-30 bg-white p-4 rounded-lg shadow-lg border-2 border-amber-600">
      {performanceMode && (
        <div className="absolute top-0 right-0 bg-yellow-500 text-white text-xs px-1 rounded-bl">
          Performance Mode
        </div>
      )}
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
              // Use memoized points to avoid recalculation
              const points = roadPoints;
              
              // Save the road using the service
              try {
                log.info(`RoadCreator: Attempting to save road with ${points.length} points and curvature ${curvature}`);
                  
                // Show loading state
                setErrorMessage('Saving road...');
                  
                // Create a timeout to handle potential hanging requests
                const timeoutId = setTimeout(() => {
                  log.warn('RoadCreator: Road saving operation is taking too long');
                  setErrorMessage('Road saving is taking longer than expected...');
                }, 3000);
                  
                // For complex roads with many points, simplify before saving if in performance mode
                const pointsToSave = performanceMode && points.length > 20 
                  ? points.filter((_, i) => i % 2 === 0) // Simple filtering for performance mode
                  : points;
                  
                const savedRoad = roadService.saveRoad(
                  pointsToSave, 
                  curvature
                );
                
                // Clear the timeout
                clearTimeout(timeoutId);
                
                log.info('RoadCreator: Road saved successfully:', savedRoad);
                
                // Pass both points and road ID to parent component
                onComplete(points, savedRoad.id);
              } catch (error) {
                log.error('RoadCreator: Failed to save road:', error);
                
                // Provide more detailed error message based on the error type
                let errorMsg = 'Failed to save road. Please try again.';
                
                if (error instanceof Error) {
                  if (error.message.includes('network') || error.message.includes('connection')) {
                    errorMsg = 'Network error while saving road. Please check your connection and try again.';
                  } else if (error.message.includes('permission') || error.message.includes('unauthorized')) {
                    errorMsg = 'You do not have permission to create roads in this area.';
                  } else if (error.message.includes('invalid')) {
                    errorMsg = 'Invalid road data. Please try creating a different road path.';
                  }
                }
                
                setErrorMessage(errorMsg);
                
                // Still pass the points even if saving failed, so the UI can recover
                log.info('RoadCreator: Continuing with points despite save failure');
                onComplete(points);
              }
            } else {
              log.warn('RoadCreator: Attempted to complete road with insufficient points');
              setErrorMessage('At least 2 points are required to create a road.');
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
      
      {/* Road service status */}
      <div className="mt-1 text-xs text-gray-500 text-center">
        Roads will be saved automatically
      </div>
      
      {/* Recovery options - shown when there are errors but we have points */}
      {errorMessage && pointCount >= 2 && (
        <div className="mt-2 flex justify-center space-x-2">
          <button
            onClick={() => {
              log.info('RoadCreator: User chose to retry road saving');
              setErrorMessage(null);
              // Trigger the Complete Road button's onClick handler
              if (managerRef.current) {
                try {
                  const points = managerRef.current.getPoints();
                  const savedRoad = roadService.saveRoad(points, curvature);
                  log.info('RoadCreator: Road saved successfully on retry:', savedRoad);
                  onComplete(points, savedRoad.id);
                } catch (retryError) {
                  log.error('RoadCreator: Failed to save road on retry:', retryError);
                  setErrorMessage('Still unable to save road. Continuing without saving.');
                  // Continue anyway after a brief delay
                  setTimeout(() => onComplete(managerRef.current?.getPoints() || []), 1500);
                }
              }
            }}
            className="px-2 py-0.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
          <button
            onClick={() => {
              log.info('RoadCreator: User chose to continue without saving');
              if (managerRef.current) {
                onComplete(managerRef.current.getPoints());
              }
            }}
            className="px-2 py-0.5 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Continue Anyway
          </button>
        </div>
      )}
    </div>
  );
};

export default RoadCreator;
