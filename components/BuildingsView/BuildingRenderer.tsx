import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ThreeDErrorBoundary } from '@/lib/components/ThreeDErrorBoundary';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';
import { BuildingRendererFactory } from '@/lib/services/BuildingRendererFactory';
import buildingPositionManager from '@/lib/services/BuildingPositionManager';
import buildingCacheService from '@/lib/services/BuildingCacheService';
import { useSceneReady } from '@/lib/components/SceneReadyProvider';
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
