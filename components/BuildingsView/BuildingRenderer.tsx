import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ThreeDErrorBoundary } from '@/lib/components/ThreeDErrorBoundary';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';
import { BuildingData } from '@/lib/models/BuildingTypes';
import { BuildingRendererFactory } from '@/lib/services/BuildingRendererFactory';
import buildingPositionManager from '@/lib/services/BuildingPositionManager';
import buildingCacheService from '@/lib/services/BuildingCacheService';

/**
 * BuildingRenderer component handles the 3D rendering of placed buildings
 * 
 * This component is responsible for:
 * - Creating and managing 3D meshes for buildings
 * - Updating building visuals based on state changes
 * - Handling level of detail for performance
 * - Managing building animations and effects
 */
interface BuildingRendererProps {
  scene: THREE.Scene;
  buildings: BuildingData[];
  camera?: THREE.Camera;
  onBuildingClick?: (buildingId: string) => void;
}

const BuildingRenderer: React.FC<BuildingRendererProps> = ({ 
  scene, 
  buildings, 
  camera, 
  onBuildingClick 
}) => {
  // Refs to track building meshes
  const buildingMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  
  // Create a renderer factory instance
  const rendererFactoryRef = useRef<BuildingRendererFactory | null>(null);
  
  // Initialize the renderer factory
  useEffect(() => {
    if (scene) {
      rendererFactoryRef.current = new BuildingRendererFactory({
        scene,
        positionManager: buildingPositionManager,
        cacheService: buildingCacheService
      });
    }
    
    return () => {
      rendererFactoryRef.current = null;
    };
  }, [scene]);
  
  // Effect to handle building rendering and cleanup
  useEffect(() => {
    // Skip if no scene or buildings or renderer factory
    if (!scene || !buildings || buildings.length === 0 || !rendererFactoryRef.current) return;
    
    console.log(`BuildingRenderer: Rendering ${buildings.length} buildings`);
    
    // Track which buildings we've processed in this render cycle
    const processedBuildingIds = new Set<string>();
    
    // Process each building
    buildings.forEach(async building => {
      if (!building.id) {
        console.warn('Building without ID:', building);
        return;
      }
      
      processedBuildingIds.add(building.id);
      
      // Get the appropriate renderer for this building type
      const renderer = rendererFactoryRef.current!.getRenderer(building.type);
      
      // Check if we already have a mesh for this building
      if (buildingMeshesRef.current.has(building.id)) {
        // Update existing mesh if needed
        const existingMesh = buildingMeshesRef.current.get(building.id)!;
        renderer.update(building, existingMesh);
      } else {
        try {
          // Create new mesh for this building
          const mesh = await renderer.render(building);
          
          // Store reference to the mesh
          buildingMeshesRef.current.set(building.id, mesh);
          
          // Add click handler if needed
          if (camera && onBuildingClick) {
            addClickHandler(mesh, building.id);
          }
        } catch (error) {
          console.error(`Failed to render building ${building.id}:`, error);
        }
      }
    });
    
    // Remove any meshes for buildings that no longer exist
    buildingMeshesRef.current.forEach((mesh, id) => {
      if (!processedBuildingIds.has(id)) {
        console.log(`Removing building mesh for ${id}`);
        
        // Get the renderer for this building type
        const buildingType = mesh.userData?.type || 'default';
        const renderer = rendererFactoryRef.current!.getRenderer(buildingType);
        
        // Dispose of the mesh
        renderer.dispose(mesh);
        
        // Remove from our tracking map
        buildingMeshesRef.current.delete(id);
      }
    });
    
    // Cleanup function
    return () => {
      // Remove all building meshes from scene
      if (rendererFactoryRef.current) {
        buildingMeshesRef.current.forEach((mesh, id) => {
          const buildingType = mesh.userData?.type || 'default';
          const renderer = rendererFactoryRef.current!.getRenderer(buildingType);
          renderer.dispose(mesh);
        });
        buildingMeshesRef.current.clear();
      }
    };
  }, [scene, buildings, camera, onBuildingClick]);
  
  // Effect to handle building placement events
  useEffect(() => {
    const handleBuildingPlaced = async (data: any) => {
      // If this is just a refresh event, do nothing (the main effect will handle it)
      if (data.refresh) return;
      
      // Otherwise, create or update the building mesh
      if (data.building && data.building.id && rendererFactoryRef.current) {
        const building = data.building;
        const renderer = rendererFactoryRef.current.getRenderer(building.type);
        
        if (buildingMeshesRef.current.has(building.id)) {
          // Update existing mesh
          const existingMesh = buildingMeshesRef.current.get(building.id)!;
          renderer.update(building, existingMesh);
        } else {
          try {
            // Create new mesh
            const mesh = await renderer.render(building);
            
            // Store reference to the mesh
            buildingMeshesRef.current.set(building.id, mesh);
            
            // Add click handler if needed
            if (camera && onBuildingClick) {
              addClickHandler(mesh, building.id);
            }
          } catch (error) {
            console.error(`Failed to render building ${building.id}:`, error);
          }
        }
      }
    };
    
    // Subscribe to building placed events
    const subscription = eventBus.subscribe(EventTypes.BUILDING_PLACED, handleBuildingPlaced);
    
    return () => {
      subscription.unsubscribe();
    };
  }, [scene, camera, onBuildingClick]);
  
  // Function to add click handler to a building mesh
  const addClickHandler = (mesh: THREE.Object3D, buildingId: string) => {
    if (!camera || !onBuildingClick) return;
    
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    const handleClick = (event: MouseEvent) => {
      // Calculate mouse position in normalized device coordinates
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Update the raycaster
      raycaster.setFromCamera(mouse, camera);
      
      // Check for intersections with this building
      const intersects = raycaster.intersectObject(mesh, true);
      
      if (intersects.length > 0) {
        onBuildingClick(buildingId);
      }
    };
    
    window.addEventListener('click', handleClick);
    
    // Store the event listener for cleanup
    mesh.userData.clickHandler = handleClick;
  };
  
  // This component doesn't render anything directly
  return null;
};

// Wrap with error boundary for better error handling
export default function BuildingRendererWithErrorBoundary(props: BuildingRendererProps) {
  return (
    <ThreeDErrorBoundary>
      <BuildingRenderer {...props} />
    </ThreeDErrorBoundary>
  );
}
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ThreeDErrorBoundary } from '@/lib/components/ThreeDErrorBoundary';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';
import { BuildingRendererFactory } from '@/lib/services/BuildingRendererFactory';
import buildingPositionManager from '@/lib/services/BuildingPositionManager';
import buildingCacheService from '@/lib/services/BuildingCacheService';
import { useSceneReady } from '@/lib/components/SceneReadyProvider';

interface BuildingRendererProps {
  active?: boolean;
  scene?: THREE.Scene;
  camera?: THREE.Camera;
}

const BuildingRenderer: React.FC<BuildingRendererProps> = ({ 
  active = true,
  scene: propScene,
  camera: propCamera
}) => {
  const [buildings, setBuildings] = useState<any[]>([]);
  const buildingMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const rendererFactoryRef = useRef<BuildingRendererFactory | null>(null);
  
  // Use the scene ready hook to get the scene and camera if not provided as props
  const { isSceneReady, scene: readyScene, camera: readyCamera } = useSceneReady();
  
  // Use the scene and camera from props or from the hook
  const scene = propScene || readyScene;
  const camera = propCamera || readyCamera;
  
  // Fetch buildings when the component mounts
  useEffect(() => {
    if (!active) return;
    
    const fetchBuildings = async () => {
      try {
        console.log('BuildingRenderer: Fetching buildings from API');
        const response = await fetch('/api/buildings');
        
        if (response.ok) {
          const data = await response.json();
          console.log(`BuildingRenderer: Loaded ${data.buildings?.length || 0} buildings`);
          
          if (data.buildings) {
            setBuildings(data.buildings);
          }
        } else {
          console.warn(`BuildingRenderer: Failed to fetch buildings: ${response.status}`);
        }
      } catch (error) {
        console.error('BuildingRenderer: Error fetching buildings:', error);
      }
    };
    
    fetchBuildings();
    
    // Listen for building placed events to refresh the buildings
    const handleBuildingPlaced = (data: any) => {
      if (data.refresh) {
        console.log('BuildingRenderer: Refreshing buildings due to BUILDING_PLACED event');
        fetchBuildings();
      } else if (data.building) {
        console.log('BuildingRenderer: Adding new building from BUILDING_PLACED event');
        setBuildings(prevBuildings => [...prevBuildings, data.building]);
      }
    };
    
    const subscription = eventBus.subscribe(EventTypes.BUILDING_PLACED, handleBuildingPlaced);
    
    return () => {
      subscription.unsubscribe();
    };
  }, [active]);
  
  // Initialize the renderer factory when the scene is ready
  useEffect(() => {
    if (!scene || !active) return;
    
    console.log('BuildingRenderer: Initializing renderer factory');
    rendererFactoryRef.current = new BuildingRendererFactory({
      scene,
      positionManager: buildingPositionManager,
      cacheService: buildingCacheService
    });
    
    return () => {
      rendererFactoryRef.current = null;
    };
  }, [scene, active]);
  
  // Render buildings when they change or when the scene changes
  useEffect(() => {
    if (!scene || !buildings.length || !rendererFactoryRef.current || !active) return;
    
    console.log(`BuildingRenderer: Rendering ${buildings.length} buildings`);
    
    // Track which buildings we've processed in this render cycle
    const processedBuildingIds = new Set<string>();
    
    // Process each building
    buildings.forEach(async building => {
      if (!building.id) {
        console.warn('BuildingRenderer: Building without ID:', building);
        return;
      }
      
      processedBuildingIds.add(building.id);
      
      // Get the appropriate renderer for this building type
      const renderer = rendererFactoryRef.current!.getRenderer(building.type);
      
      // Check if we already have a mesh for this building
      if (buildingMeshesRef.current.has(building.id)) {
        // Update existing mesh if needed
        const existingMesh = buildingMeshesRef.current.get(building.id)!;
        renderer.update(building, existingMesh);
      } else {
        try {
          // Create new mesh for this building
          const mesh = await renderer.render(building);
          
          // Store reference to the mesh
          buildingMeshesRef.current.set(building.id, mesh);
        } catch (error) {
          console.error(`BuildingRenderer: Failed to render building ${building.id}:`, error);
        }
      }
    });
    
    // Remove any meshes for buildings that no longer exist
    buildingMeshesRef.current.forEach((mesh, id) => {
      if (!processedBuildingIds.has(id)) {
        console.log(`BuildingRenderer: Removing building mesh for ${id}`);
        
        // Get the renderer for this building type
        const buildingType = mesh.userData?.type || 'default';
        const renderer = rendererFactoryRef.current!.getRenderer(buildingType);
        
        // Dispose of the mesh
        renderer.dispose(mesh);
        
        // Remove from our tracking map
        buildingMeshesRef.current.delete(id);
      }
    });
    
    // Cleanup function
    return () => {
      // Only clean up if we're unmounting or becoming inactive
      if (!active && rendererFactoryRef.current) {
        console.log('BuildingRenderer: Cleaning up building meshes');
        buildingMeshesRef.current.forEach((mesh, id) => {
          const buildingType = mesh.userData?.type || 'default';
          const renderer = rendererFactoryRef.current!.getRenderer(buildingType);
          renderer.dispose(mesh);
        });
        buildingMeshesRef.current.clear();
      }
    };
  }, [scene, buildings, active]);
  
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
