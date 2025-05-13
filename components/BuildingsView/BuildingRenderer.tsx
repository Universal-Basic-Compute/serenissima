import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ThreeDErrorBoundary } from '@/lib/components/ThreeDErrorBoundary';
import { useSceneReady } from '@/lib/components/SceneReadyProvider';
import { buildingRendererManager } from '@/lib/services/BuildingRendererManager';
import { eventBus, EventTypes } from '@/lib/eventBus';

interface BuildingRendererProps {
  active?: boolean;
  scene?: THREE.Scene;
  camera?: THREE.Camera;
}

/**
 * BuildingRenderer component
 * 
 * This component is responsible for rendering buildings in the 3D scene.
 * It uses the BuildingRendererManager to handle the actual rendering logic.
 * This is a thin wrapper around the BuildingRendererManager service for React integration.
 */
const BuildingRenderer: React.FC<BuildingRendererProps> = ({ 
  active = true,
  scene: propScene,
  camera: propCamera
}) => {
  // Use the scene ready hook to get the scene and camera if not provided as props
  const { isSceneReady, scene: readyScene, camera: readyCamera } = useSceneReady();
  
  // Use the scene and camera from props or from the hook
  const scene = propScene || readyScene;
  
  // Initialize the building renderer manager when the scene is ready
  useEffect(() => {
    if (!scene || !active) return;
    
    console.log('BuildingRenderer: Initializing building renderer manager');
    buildingRendererManager.initialize(scene);
    
    // Refresh buildings to load initial state
    buildingRendererManager.refreshBuildings();
    
    // Subscribe to building events
    const buildingPlacedSubscription = eventBus.subscribe(
      EventTypes.BUILDING_PLACED, 
      (data) => {
        console.log('BuildingRenderer: Building placed event received', data);
        if (data.refresh) {
          buildingRendererManager.refreshBuildings();
        } else if (data.data) {
          buildingRendererManager.renderBuilding(data.data);
        }
      }
    );
    
    const buildingRemovedSubscription = eventBus.subscribe(
      EventTypes.BUILDING_REMOVED,
      (data) => {
        console.log('BuildingRenderer: Building removed event received', data);
        if (data.buildingId) {
          buildingRendererManager.removeBuilding(data.buildingId);
        }
      }
    );
    
    // Listen for custom events to ensure buildings are visible
    const handleEnsureBuildingsVisible = () => {
      console.log('BuildingRenderer: Ensuring buildings are visible');
      buildingRendererManager.refreshBuildings();
    };
    
    window.addEventListener('ensureBuildingsVisible', handleEnsureBuildingsVisible);
    
    // Cleanup function
    return () => {
      if (!active) {
        buildingRendererManager.cleanup();
      }
      
      // Unsubscribe from events
      buildingPlacedSubscription.unsubscribe();
      buildingRemovedSubscription.unsubscribe();
      window.removeEventListener('ensureBuildingsVisible', handleEnsureBuildingsVisible);
    };
  }, [scene, active]);
  
  // This component doesn't render anything directly
  return null;
};

// Wrap with error boundary for better error handling
export default function BuildingRendererWithErrorBoundary(props: BuildingRendererProps) {
  return (
    <ThreeDErrorBoundary fallback={<div>Error rendering buildings</div>}>
      <BuildingRenderer {...props} />
    </ThreeDErrorBoundary>
  );
}
