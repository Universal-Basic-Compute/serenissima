import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ThreeDErrorBoundary } from '@/lib/components/ThreeDErrorBoundary';
import { useSceneReady } from '@/lib/components/SceneReadyProvider';
import { buildingRendererManager } from '@/lib/services/BuildingRendererManager';
import { eventBus, EventTypes } from '@/lib/eventBus';

// Define the missing building event types
const BUILDING_REMOVED = 'BUILDING_REMOVED';
const BUILDING_UPDATED = 'BUILDING_UPDATED';

// Extend EventTypes with the missing building event types
declare module '@/lib/eventBus' {
  interface EventTypes {
    BUILDING_REMOVED: string;
    BUILDING_UPDATED: string;
  }
}
import { log } from '@/lib/logUtils';

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
 * 
 * @component
 * @param {BuildingRendererProps} props - Component props
 * @param {boolean} [props.active=true] - Whether the renderer is active
 * @param {THREE.Scene} [props.scene] - Optional scene to render in (uses SceneReadyProvider if not provided)
 * @param {THREE.Camera} [props.camera] - Optional camera (uses SceneReadyProvider if not provided)
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
  
  // Track loading state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [buildingCount, setBuildingCount] = useState<number>(0);
  
  // Initialize the building renderer manager when the scene is ready
  useEffect(() => {
    if (!scene || !active) return;
    
    log.info('BuildingRenderer: Initializing building renderer manager');
    // Don't initialize buildingRendererManager here - let BuildingRendererManager handle it
    
    console.log(`%c BuildingRenderer: Checking for model files in public directory...`, 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');

    // Check if the models directory exists
    fetch('/models/buildings/', { method: 'HEAD' })
      .then(response => {
        console.log(`%c Models directory check: ${response.ok ? 'EXISTS' : 'MISSING'} (${response.status})`, 
          `background: ${response.ok ? '#00FF00' : '#FF0000'}; color: black; padding: 2px 5px; font-weight: bold;`);
      })
      .catch(error => {
        console.warn(`%c Error checking models directory: ${error.message}`, 
          'background: #FF0000; color: white; padding: 2px 5px; font-weight: bold;');
      });

    // Check for a specific model file
    fetch('/models/buildings/market-stall/model.glb', { method: 'HEAD' })
      .then(response => {
        console.log(`%c Market stall model check: ${response.ok ? 'EXISTS' : 'MISSING'} (${response.status})`, 
          `background: ${response.ok ? '#00FF00' : '#FF0000'}; color: black; padding: 2px 5px; font-weight: bold;`);
      })
      .catch(error => {
        console.warn(`%c Error checking market stall model: ${error.message}`, 
          'background: #FF0000; color: white; padding: 2px 5px; font-weight: bold;');
      });
    
    // Don't refresh buildings here - let BuildingRendererManager handle it
    setIsLoading(false);
    
    // Don't subscribe to building events here - let BuildingRendererManager handle it
    const buildingPlacedSubscription = { unsubscribe: () => {} }; // Dummy subscription
    
    const buildingRemovedSubscription = eventBus.subscribe(
      BUILDING_REMOVED,
      (data) => {
        log.info('BuildingRenderer: Building removed event received', data);
        if (data.buildingId) {
          buildingRendererManager.removeBuilding(data.buildingId);
          // Update building count
          setBuildingCount(buildingRendererManager.getBuildingMeshes().size);
        }
      }
    );
    
    const buildingUpdatedSubscription = eventBus.subscribe(
      BUILDING_UPDATED,
      (data) => {
        log.info('BuildingRenderer: Building updated event received', data);
        if (data.building) {
          buildingRendererManager.updateBuilding(data.building);
        }
      }
    );
    
    // Don't listen for ensureBuildingsVisible events here - let BuildingRendererManager handle it
    const handleEnsureBuildingsVisible = () => {
      log.info('BuildingRenderer: Received ensureBuildingsVisible but ignoring (handled by BuildingRendererManager)');
    };
    
    // Cleanup function
    return () => {
      if (!active) {
        buildingRendererManager.cleanup();
      }
      
      // Unsubscribe from events
      buildingPlacedSubscription.unsubscribe();
      buildingRemovedSubscription.unsubscribe();
      buildingUpdatedSubscription.unsubscribe();
      window.removeEventListener('ensureBuildingsVisible', handleEnsureBuildingsVisible);
    };
  }, [scene, active]);
  
  // This component doesn't render anything visible directly
  // But we can return a hidden div with debugging info
  return (
    <div style={{ display: 'none' }} data-testid="building-renderer">
      <span data-building-count={buildingCount} />
      <span data-loading={isLoading} />
    </div>
  );
};

// Wrap with error boundary for better error handling
export default function BuildingRendererWithErrorBoundary(props: BuildingRendererProps) {
  return (
    <ThreeDErrorBoundary fallback={<div>Error rendering buildings</div>}>
      <BuildingRenderer {...props} />
    </ThreeDErrorBoundary>
  );
}
