import React, { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';
import { BuildingData } from '@/lib/models/BuildingTypes';
import buildingPositionManager from '@/lib/services/BuildingPositionManager';
import buildingCacheService from '@/lib/services/BuildingCacheService';
import buildingDataService from '@/lib/services/BuildingDataService';
import { BuildingRendererFactory } from '@/lib/services/BuildingRendererFactory';

interface BuildingRendererProps {
  scene: THREE.Scene;
  active: boolean;
}

const BuildingRenderer: React.FC<BuildingRendererProps> = ({ scene, active }) => {
  const [buildings, setBuildings] = useState<BuildingData[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const buildingMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  
  // Create renderer factory
  const rendererFactoryRef = useRef<BuildingRendererFactory | null>(null);
  
  // Initialize renderer factory
  useEffect(() => {
    if (scene) {
      rendererFactoryRef.current = new BuildingRendererFactory({
        scene,
        positionManager: buildingPositionManager,
        cacheService: buildingCacheService
      });
    }
    
    return () => {
      // No cleanup needed for factory
    };
  }, [scene]);
  
  // Function to verify and fix building positions
  const verifyAndFixBuildingPositions = () => {
    console.log('Verifying and fixing building positions...');
    
    // Find all buildings in the scene
    const buildings = [];
    scene.traverse((object) => {
      if (object.userData && object.userData.buildingId) {
        buildings.push(object);
      }
    });
    
    console.log(`Found ${buildings.length} buildings to verify`);
    
    // Check each building's position
    buildings.forEach((building) => {
      // Get the original position
      const originalPosition = building.position.clone();
      
      // Check if the position is at the default (0,0,0) or (45,5,12)
      const isDefaultPosition = 
        (Math.abs(originalPosition.x) < 0.001 && Math.abs(originalPosition.z) < 0.001) ||
        (Math.abs(originalPosition.x - 45) < 0.001 && Math.abs(originalPosition.z - 12) < 0.001);
      
      // Check if position is extremely large (likely a conversion error)
      const isInvalidPosition = 
        Math.abs(originalPosition.x) > 1000 || 
        Math.abs(originalPosition.z) > 1000 ||
        isNaN(originalPosition.x) ||
        isNaN(originalPosition.z);
      
      if ((isDefaultPosition || isInvalidPosition) && building.userData.position) {
        console.log(`Building ${building.userData.buildingId} has problematic position, fixing...`);
        
        const pos = building.userData.position;
        
        // Use the position manager to get the correct position
        let newPosition: THREE.Vector3;
        
        if (pos.lat !== undefined && pos.lng !== undefined) {
          console.log(`Building ${building.userData.buildingId} has lat/lng position:`, pos);
          newPosition = buildingPositionManager.latLngToScenePosition({
            lat: parseFloat(pos.lat.toString()),
            lng: parseFloat(pos.lng.toString())
          });
        }
        else if (pos.x !== undefined && pos.z !== undefined) {
          // Position is already in scene coordinates, just ensure it's set correctly
          newPosition = new THREE.Vector3(
            parseFloat(pos.x.toString()),
            pos.y !== undefined ? parseFloat(pos.y.toString()) : 5,
            parseFloat(pos.z.toString())
          );
        }
        else {
          // Default position
          newPosition = new THREE.Vector3(45, 5, 12);
        }
        
        // Set the new position
        building.position.copy(newPosition);
        console.log(`Fixed position for ${building.userData.buildingId}:`, building.position);
      }
    });
    
    console.log('Building position verification and fixing complete');
  };
  
  // Function to create a building mesh using the renderer factory
  const createBuildingMesh = async (building: BuildingData) => {
    try {
      if (!rendererFactoryRef.current) {
        console.error('Renderer factory not initialized');
        return null;
      }
      
      // Normalize the building data
      const normalizedBuilding = buildingDataService.normalizeBuilding(building);
      
      // Get the appropriate renderer for this building type
      const renderer = rendererFactoryRef.current.getRenderer(normalizedBuilding.type);
      
      // Render the building
      const mesh = await renderer.render(normalizedBuilding);
      
      // Store reference for later cleanup
      buildingMeshesRef.current.set(normalizedBuilding.id, mesh);
      
      console.log(`Created building mesh for ${normalizedBuilding.id} at position:`, mesh.position);
      
      return mesh;
    } catch (error) {
      console.error(`Error creating building mesh for ${building.id}:`, error);
      return null;
    }
  };
  
  // Function to diagnose building positions
  const diagnoseBuildingPositions = (buildings: BuildingData[]): void => {
    console.log('Diagnosing building positions...');
    
    // Count buildings with different position formats
    let latLngCount = 0;
    let xzCount = 0;
    let invalidCount = 0;
    let extremeCount = 0;
    
    buildings.forEach((building, index) => {
      console.log(`Building ${index + 1} (${building.id}):`);
      console.log(`  Type: ${building.type}`);
      
      if (!building.position) {
        console.error(`  No position data!`);
        invalidCount++;
        return;
      }
      
      if ('lat' in building.position && 'lng' in building.position) {
        latLngCount++;
        const lat = parseFloat(building.position.lat.toString());
        const lng = parseFloat(building.position.lng.toString());
        
        console.log(`  Position (lat/lng): ${lat}, ${lng}`);
        
        // Check for extreme values
        if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          console.error(`  Invalid lat/lng values!`);
          invalidCount++;
        }
        
        // Check distance from Venice center
        const centerLat = 45.4371;
        const centerLng = 12.3358;
        const distanceFromVenice = Math.sqrt(
          Math.pow(lat - centerLat, 2) + 
          Math.pow(lng - centerLng, 2)
        );
        
        console.log(`  Distance from Venice center: ${distanceFromVenice.toFixed(4)} degrees`);
        
        if (distanceFromVenice > 0.5) {
          console.error(`  Coordinates too far from Venice!`);
          extremeCount++;
        }
      } else if ('x' in building.position && 'z' in building.position) {
        xzCount++;
        const x = parseFloat(building.position.x.toString());
        const z = parseFloat(building.position.z.toString());
        const y = building.position.y !== undefined ? parseFloat(building.position.y.toString()) : 5;
        
        console.log(`  Position (x/y/z): ${x}, ${y}, ${z}`);
        
        // Check for extreme values
        if (isNaN(x) || isNaN(z) || Math.abs(x) > 500 || Math.abs(z) > 500) {
          console.error(`  Extreme x/z values!`);
          extremeCount++;
        }
      } else {
        console.error(`  Unrecognized position format:`, building.position);
        invalidCount++;
      }
    });
    
    console.log('Position diagnosis summary:');
    console.log(`  Total buildings: ${buildings.length}`);
    console.log(`  Buildings with lat/lng positions: ${latLngCount}`);
    console.log(`  Buildings with x/z positions: ${xzCount}`);
    console.log(`  Buildings with invalid positions: ${invalidCount}`);
    console.log(`  Buildings with extreme positions: ${extremeCount}`);
  };

  // Function to fetch buildings from API
  const fetchBuildings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching buildings from API...');
      
      // Use the building data service to get buildings
      const buildingsData = await buildingDataService.getBuildings();
      
      console.log(`Fetched ${buildingsData.length} buildings from API`);
      
      // Run diagnostics on the building data
      diagnoseBuildingPositions(buildingsData);
      
      setBuildings(buildingsData);
      return buildingsData;
    } catch (error) {
      console.error('Error fetching buildings:', error);
      setError(error.message || 'Failed to fetch buildings');
      return [];
    } finally {
      setLoading(false);
    }
  };
  
  // Function to render buildings
  const renderBuildings = async (buildingsData: BuildingData[]) => {
    console.log(`Rendering ${buildingsData.length} buildings...`);
    
    // Create a set of building IDs for tracking
    const currentBuildingIds = new Set(buildingsData.map(b => b.id));
    
    // Remove buildings that are no longer in the data
    for (const [id, mesh] of buildingMeshesRef.current.entries()) {
      if (!currentBuildingIds.has(id)) {
        console.log(`Removing building ${id} from scene`);
        
        // Use the renderer factory to dispose of the mesh
        if (rendererFactoryRef.current) {
          const building = buildingsData.find(b => b.id === id) || { type: 'unknown' } as BuildingData;
          const renderer = rendererFactoryRef.current.getRenderer(building.type);
          renderer.dispose(mesh);
        } else {
          // Fallback if factory not available
          scene.remove(mesh);
        }
        
        buildingMeshesRef.current.delete(id);
      }
    }
    
    // Create or update buildings
    for (const building of buildingsData) {
      // Check if building already exists
      if (buildingMeshesRef.current.has(building.id)) {
        // Update existing building if needed
        const existingMesh = buildingMeshesRef.current.get(building.id);
        
        if (rendererFactoryRef.current) {
          const renderer = rendererFactoryRef.current.getRenderer(building.type);
          renderer.update(building, existingMesh);
        }
        
        continue;
      }
      
      // Create new building mesh
      await createBuildingMesh(building);
    }
    
    console.log(`Rendered ${buildingsData.length} buildings`);
  };
  
  // Function to focus camera on buildings
  const focusCameraOnBuildings = useCallback(() => {
    if (!scene || buildingMeshesRef.current.size === 0) {
      console.log('Cannot focus on buildings: scene or buildings not available');
      return;
    }
    
    console.log('Focusing camera on buildings...');
    
    // Create a bounding box that encompasses all buildings
    const boundingBox = new THREE.Box3();
    
    // Add all building meshes to the bounding box
    buildingMeshesRef.current.forEach((mesh) => {
      boundingBox.expandByObject(mesh);
    });
    
    // Get the center and size of the bounding box
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    
    console.log('Building bounding box:', {
      center: center,
      size: size,
      min: boundingBox.min,
      max: boundingBox.max
    });
    
    // Calculate the distance needed to view all buildings
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = 60; // Default FOV if camera not available
    const cameraDistance = maxDim / (2 * Math.tan((fov * Math.PI) / 360));
    
    // Find the camera
    const camera = document.querySelector('canvas')?.__camera as THREE.PerspectiveCamera;
    
    if (camera) {
      // Position camera at a good viewing angle
      camera.position.set(
        center.x + cameraDistance,
        center.y + cameraDistance * 0.5,
        center.z + cameraDistance
      );
      
      // Look at the center of all buildings
      camera.lookAt(center);
      
      // Update controls if available
      const controls = camera.userData?.controls;
      if (controls && controls.target) {
        controls.target.copy(center);
        controls.update();
      }
      
      console.log('Camera repositioned to view all buildings:', {
        position: camera.position,
        lookingAt: center
      });
    } else {
      console.warn('Camera not found, cannot focus on buildings');
    }
  }, [scene]);
  
  // Function to ensure buildings are visible
  const ensureBuildingsVisible = useCallback(() => {
    if (!scene) return;
    
    console.log('Ensuring buildings are visible...');
    
    // Find all buildings in the scene
    const buildings: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (object.userData && object.userData.buildingId) {
        buildings.push(object);
      }
    });
    
    console.log(`Found ${buildings.length} buildings in the scene`);
    
    if (buildings.length === 0) {
      console.warn('No buildings found in the scene');
      
      // Create test buildings at known positions
      const geometry = new THREE.BoxGeometry(5, 5, 5);
      const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      
      // Create a test building at the origin
      const testBuilding = new THREE.Mesh(geometry, material);
      testBuilding.position.set(0, 5, 0);
      testBuilding.userData = {
        buildingId: 'test-building-origin',
        type: 'test-building'
      };
      scene.add(testBuilding);
      
      // Create another test building at a known position
      const testBuilding2 = new THREE.Mesh(geometry.clone(), material.clone());
      testBuilding2.position.set(10, 5, 10);
      testBuilding2.userData = {
        buildingId: 'test-building-10-10',
        type: 'test-building'
      };
      scene.add(testBuilding2);
      
      console.log('Added test buildings at origin and (10,5,10)');
      
      // Store references for later cleanup
      buildingMeshesRef.current.set('test-building-origin', testBuilding);
      buildingMeshesRef.current.set('test-building-10-10', testBuilding2);
      
      // Update buildings array with new test buildings
      buildings.push(testBuilding, testBuilding2);
    }
    
    // Create debug markers for each building
    buildings.forEach((building) => {
      // Remove any existing debug markers for this building
      scene.traverse((object) => {
        if (object.userData && 
            object.userData.isDebugMarker && 
            object.userData.buildingId === building.userData.buildingId) {
          scene.remove(object);
        }
      });
      
      // Create a visible marker at the building position
      const markerGeometry = new THREE.SphereGeometry(2, 16, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff0000,
        transparent: false
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(building.position);
      marker.position.y += 10; // Position above the building
      marker.userData = {
        isDebugMarker: true,
        buildingId: building.userData.buildingId
      };
      scene.add(marker);
      console.log(`Added debug marker for building ${building.userData.buildingId} at position:`, marker.position);
    });
    
    // Focus camera on buildings
    focusCameraOnBuildings();
  }, [scene, focusCameraOnBuildings]);
  
  // Function to add debug markers for buildings
  const addDebugMarkers = () => {
    if (!scene) return;
    
    console.log('Adding debug markers for buildings...');
    
    // Remove any existing debug markers
    scene.traverse((object) => {
      if (object.userData && object.userData.isDebugMarker) {
        scene.remove(object);
        if (object instanceof THREE.Mesh) {
          if (object.geometry) object.geometry.dispose();
          if (object.material instanceof THREE.Material) {
            object.material.dispose();
          } else if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          }
        }
      }
    });
    
    // Add a marker for each building
    buildingMeshesRef.current.forEach((mesh, id) => {
      const markerGeometry = new THREE.SphereGeometry(2, 16, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff0000,
        transparent: true,
        opacity: 0.7
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      
      // Position the marker above the building
      marker.position.copy(mesh.position);
      marker.position.y += 10;
      
      // Add metadata
      marker.userData = {
        isDebugMarker: true,
        buildingId: id
      };
      
      // Add to scene
      scene.add(marker);
      
      console.log(`Added debug marker for building ${id} at position:`, marker.position);
    });
  };

  // Initial load of buildings
  useEffect(() => {
    if (active && scene && rendererFactoryRef.current) {
      console.log('BuildingRenderer is active, loading buildings...');
      fetchBuildings().then(buildingsData => {
        renderBuildings(buildingsData);
        
        // Add a delay to ensure buildings are loaded
        const timer = setTimeout(() => {
          verifyAndFixBuildingPositions();
          // Focus camera on buildings after fixing positions
          ensureBuildingsVisible();
        }, 2000);
        
        return () => clearTimeout(timer);
      });
    }
    
    return () => {
      // Cleanup buildings when component unmounts
      if (rendererFactoryRef.current) {
        for (const [id, mesh] of buildingMeshesRef.current.entries()) {
          const building = buildings.find(b => b.id === id) || { type: 'unknown' } as BuildingData;
          const renderer = rendererFactoryRef.current.getRenderer(building.type);
          renderer.dispose(mesh);
        }
      } else {
        // Fallback if factory not available
        for (const mesh of buildingMeshesRef.current.values()) {
          scene.remove(mesh);
        }
      }
      
      buildingMeshesRef.current.clear();
    };
  }, [active, scene, ensureBuildingsVisible]);
  
  // Listen for the fixBuildingPositions event and other custom events
  useEffect(() => {
    const handleFixPositions = () => {
      verifyAndFixBuildingPositions();
    };
    
    const handleFocusOnBuildings = () => {
      focusCameraOnBuildings();
    };
    
    const handleAddDebugMarkers = () => {
      addDebugMarkers();
    };
    
    const handleEnsureBuildingsVisible = () => {
      ensureBuildingsVisible();
    };
    
    window.addEventListener('fixBuildingPositions', handleFixPositions);
    window.addEventListener('focusOnBuildings', handleFocusOnBuildings);
    window.addEventListener('addDebugMarkers', handleAddDebugMarkers);
    window.addEventListener('ensureBuildingsVisible', handleEnsureBuildingsVisible);
    
    return () => {
      window.removeEventListener('fixBuildingPositions', handleFixPositions);
      window.removeEventListener('focusOnBuildings', handleFocusOnBuildings);
      window.removeEventListener('addDebugMarkers', handleAddDebugMarkers);
      window.removeEventListener('ensureBuildingsVisible', handleEnsureBuildingsVisible);
    };
  }, [scene, focusCameraOnBuildings, ensureBuildingsVisible]);
  
  // Listen for building events
  useEffect(() => {
    if (!active || !scene || !rendererFactoryRef.current) return;
    
    const handleBuildingPlaced = async (data: any) => {
      console.log('Building placed event received:', data);
      
      if (data.refresh) {
        // Refresh all buildings
        console.log('Refreshing all buildings...');
        const buildingsData = await fetchBuildings();
        renderBuildings(buildingsData);
        
        // Ensure buildings are visible after refresh
        setTimeout(() => {
          ensureBuildingsVisible();
        }, 1000);
        
        return;
      }
      
      if (data.buildingId && data.type && data.data) {
        // Add a single new building
        console.log('Adding new building:', data.buildingId);
        
        // Normalize the building data
        const normalizedBuilding = buildingDataService.normalizeBuilding(data.data);
        
        // Check if building already exists
        if (buildingMeshesRef.current.has(data.buildingId)) {
          console.log(`Building ${data.buildingId} already exists, updating...`);
          
          // Get existing mesh
          const existingMesh = buildingMeshesRef.current.get(data.buildingId);
          
          // Get the appropriate renderer
          const renderer = rendererFactoryRef.current.getRenderer(normalizedBuilding.type);
          
          // Update the mesh
          renderer.update(normalizedBuilding, existingMesh);
        } else {
          // Create new building mesh
          await createBuildingMesh(normalizedBuilding);
        }
        
        // Update buildings state
        setBuildings(prev => {
          // Remove existing building with same ID if it exists
          const filtered = prev.filter(b => b.id !== data.buildingId);
          // Add the new building
          return [...filtered, normalizedBuilding];
        });
        
        // Emit a more specific event for the building lifecycle
        eventBus.emit(EventTypes.BUILDING_CONSTRUCTION_COMPLETED, {
          buildingId: normalizedBuilding.id,
          type: normalizedBuilding.type,
          landId: normalizedBuilding.land_id,
          position: normalizedBuilding.position,
          owner: normalizedBuilding.owner || normalizedBuilding.created_by,
          completionTime: Date.now()
        });
        
        // Ensure the new building is visible
        setTimeout(() => {
          ensureBuildingsVisible();
        }, 500);
      }
    };
    
    const handleBuildingRemoved = (data: any) => {
      console.log('Building removed event received:', data);
      
      if (data.buildingId) {
        // Get the mesh
        const mesh = buildingMeshesRef.current.get(data.buildingId);
        
        if (mesh) {
          // Find the building data
          const building = buildings.find(b => b.id === data.buildingId);
          
          if (building) {
            // Get the appropriate renderer
            const renderer = rendererFactoryRef.current.getRenderer(building.type);
            
            // Dispose of the mesh
            renderer.dispose(mesh);
          } else {
            // Fallback if building data not found
            scene.remove(mesh);
          }
          
          // Remove from map
          buildingMeshesRef.current.delete(data.buildingId);
          
          // Update buildings state
          setBuildings(prev => prev.filter(b => b.id !== data.buildingId));
          
          // Emit a more specific event for the building lifecycle
          eventBus.emit(EventTypes.BUILDING_DEMOLISHED, {
            buildingId: data.buildingId,
            time: Date.now()
          });
        }
      }
    };
    
    const handleBuildingUpdated = (data: any) => {
      console.log('Building updated event received:', data);
      
      if (data.buildingId && data.updates) {
        // Get the mesh
        const mesh = buildingMeshesRef.current.get(data.buildingId);
        
        if (mesh) {
          // Find the building data
          const building = buildings.find(b => b.id === data.buildingId);
          
          if (building) {
            // Apply updates to building data
            const updatedBuilding = {
              ...building,
              ...data.updates
            };
            
            // Get the appropriate renderer
            const renderer = rendererFactoryRef.current.getRenderer(updatedBuilding.type);
            
            // Update the mesh
            renderer.update(updatedBuilding, mesh);
            
            // Update buildings state
            setBuildings(prev => 
              prev.map(b => b.id === data.buildingId ? updatedBuilding : b)
            );
          }
        }
      }
    };
    
    const handleForceRerender = async () => {
      console.log('Force rerender buildings event received');
      
      // Clear existing buildings
      for (const [id, mesh] of buildingMeshesRef.current.entries()) {
        const building = buildings.find(b => b.id === id) || { type: 'unknown' } as BuildingData;
        const renderer = rendererFactoryRef.current.getRenderer(building.type);
        renderer.dispose(mesh);
      }
      buildingMeshesRef.current.clear();
      
      // Fetch and render all buildings again
      const buildingsData = await fetchBuildings();
      renderBuildings(buildingsData);
      
      console.log(`Rerendered ${buildingsData.length} buildings`);
    };
    
    // Subscribe to events
    const buildingPlacedSubscription = eventBus.subscribe(
      EventTypes.BUILDING_PLACED,
      handleBuildingPlaced
    );
    
    const buildingRemovedSubscription = eventBus.subscribe(
      EventTypes.BUILDING_REMOVED,
      handleBuildingRemoved
    );
    
    const buildingUpdatedSubscription = eventBus.subscribe(
      EventTypes.BUILDING_UPDATED,
      handleBuildingUpdated
    );
    
    // Add event listener for force rerender
    window.addEventListener('forceRerenderBuildings', handleForceRerender);
    
    return () => {
      // Unsubscribe from events
      buildingPlacedSubscription.unsubscribe();
      buildingRemovedSubscription.unsubscribe();
      buildingUpdatedSubscription.unsubscribe();
      window.removeEventListener('forceRerenderBuildings', handleForceRerender);
    };
  }, [active, scene, buildings]);
  
  // This component doesn't render anything visible
  return null;
};

export default BuildingRenderer;
