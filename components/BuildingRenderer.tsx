import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';
import { BuildingData } from '@/lib/models/BuildingTypes';
import buildingPositionManager from '@/lib/services/BuildingPositionManager';
import buildingCacheService from '@/lib/services/BuildingCacheService';
import buildingDataService from '@/lib/services/BuildingDataService';
import { BuildingRendererFactory } from '@/lib/services/BuildingRendererFactory';

// Add type declaration for window properties
declare global {
  interface Window {
    __threeContext?: {
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      renderer: THREE.WebGLRenderer;
    };
  }
  
  // Add custom properties to HTMLCanvasElement
  interface HTMLCanvasElement {
    __scene?: THREE.Scene;
    __camera?: THREE.PerspectiveCamera;
    __renderer?: THREE.WebGLRenderer;
  }
}

interface BuildingRendererProps {
  scene?: THREE.Scene;
  active: boolean;
  sceneReady?: boolean; // New prop to explicitly indicate scene readiness
}

const BuildingRenderer: React.FC<BuildingRendererProps> = ({ 
  scene, 
  active,
  sceneReady = false // Default to false
}) => {
  // Create a local scene if none is provided
  const [localScene, setLocalScene] = useState<THREE.Scene | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);
  
  // Initialize scene on component mount or when sceneReady changes
  useEffect(() => {
    // Don't proceed if sceneReady is false
    if (!sceneReady) {
      console.log('BuildingRenderer: Waiting for scene to be ready');
      return;
    }
    
    // If a scene is provided via props, use it
    if (scene) {
      console.log('BuildingRenderer: Using provided scene');
      sceneRef.current = scene;
      setLocalScene(scene);
      setIsReady(true);
      return;
    }
    
    console.log('BuildingRenderer: No scene provided, searching for existing scene');
    
    // Try to get scene from window.__threeContext
    if (typeof window !== 'undefined' && window.__threeContext && window.__threeContext.scene) {
      console.log('BuildingRenderer: Found scene in window.__threeContext');
      sceneRef.current = window.__threeContext.scene;
      setLocalScene(window.__threeContext.scene);
      setIsReady(true);
      return;
    }
    
    // Try to get scene from canvas element
    if (typeof document !== 'undefined') {
      const canvas = document.querySelector('canvas');
      if (canvas && canvas.__scene) {
        console.log('BuildingRenderer: Found scene in canvas.__scene');
        sceneRef.current = canvas.__scene;
        setLocalScene(canvas.__scene);
        setIsReady(true);
        return;
      }
    }
    
    console.warn('BuildingRenderer: No scene found even though sceneReady is true');
  }, [scene, sceneReady]);
  
  // Don't proceed if not ready
  if (!isReady || !sceneRef.current) {
    console.log('BuildingRenderer: Not ready yet');
    return null;
  }
  
  // Log the scene we're using
  console.log('BuildingRenderer: Ready with scene', sceneRef.current);
  
  const [buildings, setBuildings] = useState<BuildingData[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const buildingMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  
  // Create renderer factory
  const rendererFactoryRef = useRef<BuildingRendererFactory | null>(null);
  
  // Initialize renderer factory
  useEffect(() => {
    if (!sceneRef.current) {
      console.warn('BuildingRenderer: scene is not defined, cannot initialize renderer factory');
      return;
    }
    
    try {
      rendererFactoryRef.current = new BuildingRendererFactory({
        scene: sceneRef.current,
        positionManager: buildingPositionManager,
        cacheService: buildingCacheService
      });
      
      console.log('BuildingRenderer: renderer factory initialized successfully');
    } catch (error) {
      console.error('BuildingRenderer: error initializing renderer factory:', error);
    }
    
    return () => {
      // No cleanup needed for factory
    };
  }, [sceneRef.current]);
  
  // Function to verify and fix building positions
  const verifyAndFixBuildingPositions = () => {
    if (!sceneRef.current) {
      console.warn('Cannot verify building positions: scene is not defined');
      return;
    }
    
    console.log('Verifying and fixing building positions...');
    
    // Find all buildings in the scene
    const buildings = [];
    sceneRef.current.traverse((object) => {
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
      if (!sceneRef.current) {
        console.error('Cannot create building mesh: scene is not defined');
        return null;
      }
      
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
      
      // Check if this is an empty placeholder (failed to load model)
      if (mesh.userData && mesh.userData.isEmptyPlaceholder) {
        console.log(`Building ${normalizedBuilding.id} is using an empty placeholder due to model loading failure`);
        // We still store the reference for cleanup, but the mesh won't be visible
      }
      
      // Store reference for later cleanup
      buildingMeshesRef.current.set(normalizedBuilding.id, mesh);
      
      // Ensure the building is at ground level
      mesh.position.y = 0;
      
      console.log(`Created building mesh for ${normalizedBuilding.id} at position:`, mesh.position);
      
      return mesh;
    } catch (error) {
      console.error(`Error creating building mesh for ${building.id}:`, error);
      return null;
    }
  };
  
  // Function to diagnose building positions
  const diagnoseBuildingPositions = (buildings: BuildingData[]): void => {
    if (!sceneRef.current) {
      console.warn('Cannot diagnose building positions: scene is not defined');
      return;
    }
    
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

  /**
   * Load buildings in a memory-efficient way
   */
  const loadBuildingsEfficiently = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Loading buildings efficiently...');
      
      // First, load a small batch of buildings to show something quickly
      const initialBatch = await fetchBuildingBatch(0, 20);
      console.log(`Loaded initial batch of ${initialBatch.length} buildings`);
      
      // Update state with initial buildings
      setBuildings(initialBatch);
      
      // Render the initial batch
      await renderBuildingsInBatches(initialBatch);
      
      // Then load more buildings in the background
      loadRemainingBuildingsInBackground(initialBatch.length);
      
    } catch (error) {
      console.error('Error loading buildings:', error);
      setError(error.message || 'Failed to fetch buildings');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetch a batch of buildings
   */
  const fetchBuildingBatch = async (offset: number, limit: number): Promise<BuildingData[]> => {
    try {
      const response = await fetch(`/api/buildings?offset=${offset}&limit=${limit}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch buildings: ${response.status}`);
      }
      
      const data = await response.json();
      return data.buildings || [];
    } catch (error) {
      console.error(`Error fetching buildings batch (offset=${offset}, limit=${limit}):`, error);
      return [];
    }
  };

  /**
   * Load remaining buildings in the background
   */
  const loadRemainingBuildingsInBackground = async (initialCount: number): Promise<void> => {
    const BATCH_SIZE = 20;
    let offset = initialCount;
    let hasMore = true;
    
    while (hasMore) {
      try {
        // Fetch the next batch
        const batch = await fetchBuildingBatch(offset, BATCH_SIZE);
        
        // If we got fewer buildings than requested, we've reached the end
        if (batch.length < BATCH_SIZE) {
          hasMore = false;
        }
        
        if (batch.length > 0) {
          console.log(`Loaded additional batch of ${batch.length} buildings`);
          
          // Update state with new buildings
          setBuildings(prev => [...prev, ...batch]);
          
          // Render this batch
          await renderBuildingsInBatches(batch);
          
          // Update offset for next batch
          offset += batch.length;
          
          // Wait a bit to allow UI to update and garbage collection to run
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
          hasMore = false;
        }
      } catch (error) {
        console.error('Error loading additional buildings:', error);
        hasMore = false;
      }
    }
    
    console.log(`Finished loading all buildings (total: ${offset})`);
  };
  
  /**
   * Render buildings in batches to avoid memory spikes
   */
  const renderBuildingsInBatches = async (buildingsData: BuildingData[]) => {
    console.log(`Rendering ${buildingsData.length} buildings in batches...`);
    
    try {
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
      
      // Process buildings in batches of 10
      const BATCH_SIZE = 10;
      const totalBatches = Math.ceil(buildingsData.length / BATCH_SIZE);
      
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const start = batchIndex * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, buildingsData.length);
        const batch = buildingsData.slice(start, end);
        
        console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} buildings)`);
        
        // Process this batch
        await processBuildingBatch(batch);
        
        // Wait a short time to allow the UI to update and garbage collection to run
        if (batchIndex < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      console.log(`Finished rendering all ${buildingsData.length} buildings`);
    } catch (error) {
      console.error('Error in renderBuildings:', error);
    }
  };
  
  /**
   * Process a batch of buildings
   */
  const processBuildingBatch = async (buildings: BuildingData[]) => {
    // Process each building in the batch
    for (const building of buildings) {
      try {
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
      } catch (buildingError) {
        console.error(`Error processing building ${building.id}:`, buildingError);
        // Continue with next building instead of stopping
      }
    }
  };
  
  // Function to focus camera on buildings
  const focusCameraOnBuildings = useCallback(() => {
    if (!sceneRef.current) {
      console.warn('Cannot focus on buildings: scene is not defined');
      return;
    }
    
    if (buildingMeshesRef.current.size === 0) {
      console.log('Cannot focus on buildings: no buildings available');
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
    if (!sceneRef.current) {
      console.warn('Cannot ensure buildings are visible: scene is not defined');
      return;
    }
    
    console.log('Ensuring buildings are visible...');
    
    // Find all buildings in the scene
    const buildings: THREE.Object3D[] = [];
    sceneRef.current.traverse((object) => {
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
      sceneRef.current.add(testBuilding);
      
      // Create another test building at a known position
      const testBuilding2 = new THREE.Mesh(geometry.clone(), material.clone());
      testBuilding2.position.set(10, 5, 10);
      testBuilding2.userData = {
        buildingId: 'test-building-10-10',
        type: 'test-building'
      };
      sceneRef.current.add(testBuilding2);
      
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
      sceneRef.current.add(marker);
      console.log(`Added debug marker for building ${building.userData.buildingId} at position:`, marker.position);
    });
    
    // Focus camera on buildings
    focusCameraOnBuildings();
  }, [scene, focusCameraOnBuildings]);
  
  // Function to add debug markers for buildings
  const addDebugMarkers = () => {
    if (!sceneRef.current) {
      console.warn('Cannot add debug markers: scene is not defined');
      return;
    }
    
    console.log('Adding debug markers for buildings...');
    
    // Remove any existing debug markers
    sceneRef.current.traverse((object) => {
      if (object.userData && object.userData.isDebugMarker) {
        sceneRef.current.remove(object);
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
      sceneRef.current.add(marker);
      
      console.log(`Added debug marker for building ${id} at position:`, marker.position);
    });
  };

  /**
   * Start memory monitoring to track and log memory usage
   */
  const startMemoryMonitoring = () => {
    // Import the memory monitoring utility
    const { startMemoryMonitoring: monitorMemory } = require('@/lib/utils/memoryUtils');
    return monitorMemory();
  };
  
  // Initial load of buildings
  useEffect(() => {
    if (!active) return;
    
    // Double-check that we have a valid scene
    if (!sceneRef.current) {
      console.error('BuildingRenderer: scene is still not defined, cannot render buildings');
      return;
    }
    
    if (!rendererFactoryRef.current) {
      console.warn('BuildingRenderer: renderer factory is not initialized');
      return;
    }
    
    console.log('BuildingRenderer is active, loading buildings...');
    
    // Use the memory-efficient loading strategy
    loadBuildingsEfficiently();
    
    // Start memory monitoring
    const stopMemoryMonitoring = startMemoryMonitoring();
    
    // Add a delay to ensure buildings are loaded
    const timer = setTimeout(() => {
      if (sceneRef.current) { // Add additional check here
        verifyAndFixBuildingPositions();
        // Focus camera on buildings after fixing positions
        ensureBuildingsVisible();
      }
    }, 2000);
    
    return () => {
      clearTimeout(timer);
      stopMemoryMonitoring();
      
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
          if (sceneRef.current) { // Add check for scene here
            sceneRef.current.remove(mesh);
          }
        }
      }
      
      buildingMeshesRef.current.clear();
    };
  }, [active, sceneRef.current, ensureBuildingsVisible]);
  
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
  }, [sceneRef.current, focusCameraOnBuildings, ensureBuildingsVisible]);
  
  // Listen for building events
  useEffect(() => {
    if (!active) return;
    
    // Double-check that we have a valid scene
    if (!sceneRef.current) {
      console.error('BuildingRenderer: scene is still not defined, cannot listen for building events');
      return;
    }
    
    if (!rendererFactoryRef.current) {
      console.warn('BuildingRenderer: renderer factory is not initialized');
      return;
    }
    
    const handleBuildingPlaced = async (data: any) => {
      console.log('Building placed event received:', data);
      
      if (data.refresh) {
        // Refresh all buildings
        console.log('Refreshing all buildings...');
        
        // Use the memory-efficient loading strategy
        loadBuildingsEfficiently();
        
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
            sceneRef.current.remove(mesh);
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
      
      // Use the memory-efficient loading strategy
      loadBuildingsEfficiently();
      
      console.log('Started rerendering buildings efficiently');
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
  /**
   * Update building visibility based on camera distance
   */
  const updateBuildingVisibility = () => {
    if (!sceneRef.current) {
      console.warn('Cannot update building visibility: scene is not defined');
      return;
    }
    
    // Get camera
    const camera = getCamera();
    if (!camera) return;
    
    // Get camera position
    const cameraPosition = camera.position.clone();
    
    // Update visibility for each building
    buildingMeshesRef.current.forEach((mesh, id) => {
      const distance = cameraPosition.distanceTo(mesh.position);
      
      // Hide buildings that are too far away
      if (distance > 100) {
        mesh.visible = false;
      } else {
        mesh.visible = true;
        
        // For buildings at medium distance, use low detail version
        if (distance > 50 && !mesh.userData.isLowDetail) {
          // Check if we already have a low detail version
          const lowDetailId = `${id}-low`;
          const lowDetailMesh = buildingMeshesRef.current.get(lowDetailId);
          
          if (lowDetailMesh) {
            // Show low detail, hide high detail
            lowDetailMesh.visible = true;
            mesh.visible = false;
          }
        }
      }
    });
  };

  /**
   * Get camera from scene
   */
  const getCamera = (): THREE.Camera | null => {
    if (typeof window === 'undefined') return null;
    
    // Try to get camera from window.__threeContext
    if (window.__threeContext && window.__threeContext.camera) {
      return window.__threeContext.camera;
    }
    
    // Try to get camera from canvas element
    const canvas = document.querySelector('canvas');
    if (canvas && canvas.__camera) {
      return canvas.__camera;
    }
    
    return null;
  };
  
  // Add effect to update building visibility based on camera distance
  useEffect(() => {
    if (!active) return;
    if (!sceneRef.current) {
      console.warn('BuildingRenderer: scene is not defined, cannot update building visibility');
      return;
    }
    
    // Function to update building visibility
    const updateVisibility = () => {
      updateBuildingVisibility();
    };
    
    // Set up an interval to update visibility
    const intervalId = setInterval(updateVisibility, 1000);
    
    // Also update on camera move
    const handleCameraMove = () => {
      updateBuildingVisibility();
    };
    
    // Try to get controls
    const camera = getCamera();
    if (camera && camera.userData && camera.userData.controls) {
      camera.userData.controls.addEventListener('change', handleCameraMove);
    }
    
    return () => {
      clearInterval(intervalId);
      if (camera && camera.userData && camera.userData.controls) {
        camera.userData.controls.removeEventListener('change', handleCameraMove);
      }
    };
  }, [scene, active]);
