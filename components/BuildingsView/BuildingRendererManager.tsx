import React, { useEffect, useState, useCallback } from 'react';
import { debounce } from 'lodash';
import { useSceneReady } from '@/lib/components/SceneReadyProvider';
import { eventBus, EventTypes } from '@/lib/eventBus';
import { buildingRendererManager } from '@/lib/services/BuildingRendererManager';
import { log } from '@/lib/logUtils';

interface BuildingRendererManagerProps {
  active?: boolean;
  debug?: boolean;
}

/**
 * BuildingRendererManager component
 * 
 * This component manages building rendering and ensures buildings remain visible.
 * It provides debugging capabilities and handles building visibility issues.
 */
const BuildingRendererManager: React.FC<BuildingRendererManagerProps> = ({
  active = true,
  debug = false
}) => {
  const { isSceneReady, scene } = useSceneReady();
  const [buildingCount, setBuildingCount] = useState<number>(0);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  // Add a new state to track scene initialization
  const [sceneInitialized, setSceneInitialized] = useState<boolean>(false);
  
  // Initialize the building renderer manager when the scene is ready
  useEffect(() => {
    if (!isSceneReady || !scene || !active) return;
    
    log.info('BuildingRendererManager: Initializing');
    
    // Add a delay to ensure land and water are rendered first
    const initializationTimer = setTimeout(() => {
      buildingRendererManager.initialize(scene);
      setSceneInitialized(true);
      
      // Initial refresh of buildings only after initialization
      refreshBuildings();
    }, 1500); // 1.5 second delay to allow land and water to render
    
    // Set up periodic refresh to ensure buildings remain visible
    // Only start this after initialization
    let refreshInterval: NodeJS.Timeout;
    let visibilityCheckInterval: NodeJS.Timeout;
    
    const setupIntervals = () => {
      refreshInterval = setInterval(() => {
        if (debug) {
          log.info('BuildingRendererManager: Periodic refresh');
        }
        refreshBuildings();
      }, 30000); // Refresh every 30 seconds
      
      // Add a more frequent check specifically for when buildings disappear
      visibilityCheckInterval = setInterval(() => {
        const count = buildingRendererManager.getBuildingMeshes().size;
        if (count === 0 && buildingCount > 0) {
          console.warn('BuildingRendererManager: Buildings disappeared, refreshing...');
          refreshBuildings();
        }
      }, 5000); // Check every 5 seconds
    };
    
    // Only set up intervals after initialization
    if (sceneInitialized) {
      setupIntervals();
    }
    
    // Listen for events to ensure buildings are visible
    const handleEnsureBuildingsVisible = () => {
      // Only respond to this event if the scene is initialized
      if (sceneInitialized) {
        log.info('BuildingRendererManager: Ensuring buildings are visible (event)');
        refreshBuildings();
      } else {
        log.info('BuildingRendererManager: Ignoring ensureBuildingsVisible event until scene is initialized');
      }
    };
    
    window.addEventListener('ensureBuildingsVisible', handleEnsureBuildingsVisible);
    
    // Listen for scene base rendered event
    const sceneBaseRenderedSubscription = eventBus.subscribe(
      EventTypes.SCENE_BASE_RENDERED,
      (data) => {
        console.log('BuildingRendererManager: Received sceneBaseRendered event', data);
        // Set scene as initialized
        setSceneInitialized(true);
        
        // Initialize the building renderer manager now
        buildingRendererManager.initialize(scene);
        
        // Initial refresh of buildings
        refreshBuildings();
      }
    );
    
    // Subscribe to building events
    const buildingPlacedSubscription = eventBus.subscribe(
      EventTypes.BUILDING_PLACED, 
      (data) => {
        // Only respond to this event if the scene is initialized
        if (!sceneInitialized) return;
        
        log.info('BuildingRendererManager: Building placed event received', data);
        if (data.refresh) {
          // Use the debounced refresh to prevent multiple rapid refreshes
          debouncedRefresh();
        } else if (data.data) {
          // For individual buildings, render directly
          buildingRendererManager.renderBuilding(data.data)
            .then(() => {
              updateBuildingCount();
            });
        }
      }
    );
    
    // Cleanup function
    return () => {
      clearTimeout(initializationTimer);
      if (refreshInterval) clearInterval(refreshInterval);
      if (visibilityCheckInterval) clearInterval(visibilityCheckInterval);
      window.removeEventListener('ensureBuildingsVisible', handleEnsureBuildingsVisible);
      buildingPlacedSubscription.unsubscribe();
      sceneBaseRenderedSubscription.unsubscribe();
      
      if (!active) {
        buildingRendererManager.cleanup();
      }
    };
  }, [isSceneReady, scene, active, debug, sceneInitialized]);
  
  // Track the timestamp of the last refresh request
  const [lastRefreshTimestamp, setLastRefreshTimestamp] = useState<number>(0);
  
  // Create a debounced refresh function to prevent multiple rapid refreshes
  const debouncedRefresh = useCallback(
    debounce(() => {
      if (!isSceneReady || !scene) return;
      
      console.log('BuildingRendererManager: Refreshing buildings (debounced)');
      
      // Add a timestamp to track when the last refresh was initiated
      const refreshTimestamp = Date.now();
      setLastRefreshTimestamp(refreshTimestamp);
      
      buildingRendererManager.refreshBuildings()
        .then(() => {
          // Only update if this is still the most recent refresh request
          if (refreshTimestamp === lastRefreshTimestamp) {
            updateBuildingCount();
            setLastRefresh(new Date());
          }
        })
        .catch(error => {
          log.error('Error refreshing buildings:', error);
        });
    }, 500), // 500ms debounce time
    [isSceneReady, scene, lastRefreshTimestamp]
  );

  // Function to refresh buildings
  const refreshBuildings = () => {
    if (!isSceneReady || !scene) return;
    
    console.log('%c BuildingRendererManager: Refreshing buildings', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    
    // Use the debounced version to prevent multiple rapid refreshes
    debouncedRefresh();
    
    // First check if we already have buildings
    const currentCount = buildingRendererManager.getBuildingMeshes().size;
    
    // If we have no buildings, try the more aggressive approach immediately
    if (currentCount === 0) {
      // Force a scene update if possible
      if (scene.userData && scene.userData.renderer) {
        scene.userData.renderer.render(scene, scene.userData.camera);
      }
      
      // Dispatch custom event to ensure buildings are processed
      window.dispatchEvent(new CustomEvent('regenerateBuildingMarkers'));
    }
  };
  
  // Update building count
  const updateBuildingCount = () => {
    const count = buildingRendererManager.getBuildingMeshes().size;
    setBuildingCount(count);
    
    if (debug) {
      log.info(`BuildingRendererManager: ${count} buildings in scene`);
    }
  };
  
  // Render debug UI if debug mode is enabled
  if (debug) {
    return (
      <div className="fixed bottom-4 right-4 bg-black bg-opacity-70 text-white p-2 rounded z-50 text-xs">
        <div>Buildings: {buildingCount}</div>
        <div>Last refresh: {lastRefresh?.toLocaleTimeString() || 'Never'}</div>
        <button 
          onClick={refreshBuildings}
          className="mt-1 px-2 py-1 bg-blue-600 text-white rounded text-xs"
        >
          Force Refresh
        </button>
      </div>
    );
  }
  
  // This component doesn't render anything visible in normal mode
  return null;
};

export default BuildingRendererManager;
