import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';
import { BuildingData } from '@/lib/models/BuildingTypes';
import buildingPositionManager from '@/lib/services/BuildingPositionManager';
import buildingCacheService from '@/lib/services/BuildingCacheService';
import buildingDataService from '@/lib/services/BuildingDataService';
import { BuildingRendererFactory } from '@/lib/services/BuildingRendererFactory';

interface BuildingRendererProps {
  active: boolean;
}

const BuildingRenderer: React.FC<BuildingRendererProps> = ({ active }) => {
  // Create refs for scene and camera
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  
  // State for buildings and loading status
  const [buildings, setBuildings] = useState<BuildingData[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const buildingMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const [isActive, setIsActive] = useState<boolean>(active);
  
  // Create renderer factory
  const rendererFactoryRef = useRef<BuildingRendererFactory | null>(null);
  
  // Initialize with the main scene
  useEffect(() => {
    if (!isActive) return;
    
    console.log('BuildingRenderer: Initializing with main scene');
    
    // Get scene, camera, and renderer from the main application
    if (typeof window !== 'undefined' && window.__threeContext) {
      sceneRef.current = window.__threeContext.scene;
      cameraRef.current = window.__threeContext.camera;
      rendererRef.current = window.__threeContext.renderer;
      
      console.log('BuildingRenderer: Using main scene from window.__threeContext');
    } else {
      // Try to get from canvas element
      const canvas = document.querySelector('canvas');
      if (canvas && canvas.__scene && canvas.__camera) {
        sceneRef.current = canvas.__scene;
        cameraRef.current = canvas.__camera;
        console.log('BuildingRenderer: Using main scene from canvas element');
      } else {
        console.error('BuildingRenderer: Could not find main scene');
        return;
      }
    }
    
    // Initialize renderer factory with the main scene
    rendererFactoryRef.current = new BuildingRendererFactory({
      scene: sceneRef.current,
      positionManager: buildingPositionManager,
      cacheService: buildingCacheService
    });
    
    // Load buildings
    loadBuildingsEfficiently();
    
    // Start memory monitoring
    const stopMemoryMonitoring = startMemoryMonitoring();
    
    return () => {
      // Clean up buildings
      if (rendererFactoryRef.current) {
        for (const [id, mesh] of buildingMeshesRef.current.entries()) {
          const building = buildings.find(b => b.id === id) || { type: 'unknown' } as BuildingData;
          const renderer = rendererFactoryRef.current.getRenderer(building.type);
          renderer.dispose(mesh);
        }
      }
      
      stopMemoryMonitoring();
    };
  }, [isActive]);
  
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
      
      // Store reference for later cleanup
      buildingMeshesRef.current.set(normalizedBuilding.id, mesh);
      
      console.log(`Created building mesh for ${normalizedBuilding.id} at position:`, mesh.position);
      
      return mesh;
    } catch (error) {
      console.error(`Error creating building mesh for ${building.id}:`, error);
      return null;
    }
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
          } else if (sceneRef.current) {
            // Fallback if factory not available
            sceneRef.current.remove(mesh);
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
  
  // Function to focus camera on buildings
  const focusCameraOnBuildings = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current) {
      console.warn('Cannot focus on buildings: scene or camera not defined');
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
    const fov = cameraRef.current.fov;
    const cameraDistance = maxDim / (2 * Math.tan((fov * Math.PI) / 360));
    
    // Position camera at a good viewing angle
    cameraRef.current.position.set(
      center.x + cameraDistance,
      center.y + cameraDistance * 0.5,
      center.z + cameraDistance
    );
    
    // Look at the center of all buildings
    cameraRef.current.lookAt(center);
    
    // Update controls target if available
    if (window.__threeContext && window.__threeContext.controls) {
      window.__threeContext.controls.target.copy(center);
      window.__threeContext.controls.update();
    }
    
    console.log('Camera repositioned to view all buildings:', {
      position: cameraRef.current.position,
      lookingAt: center
    });
  }, []);
  
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
      sceneRef.current.traverse((object) => {
        if (object.userData && 
            object.userData.isDebugMarker && 
            object.userData.buildingId === building.userData.buildingId) {
          sceneRef.current.remove(object);
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
  }, [focusCameraOnBuildings]);
  
  /**
   * Start memory monitoring to track and log memory usage
   */
  const startMemoryMonitoring = () => {
    // Import the memory monitoring utility
    const { startMemoryMonitoring: monitorMemory } = require('@/lib/utils/memoryUtils');
    return monitorMemory();
  };
  
  // Listen for custom events
  useEffect(() => {
    const handleFixPositions = () => {
      // Verify and fix building positions
      if (sceneRef.current) {
        console.log('Verifying and fixing building positions...');
        
        // Find all buildings in the scene
        sceneRef.current.traverse((object) => {
          if (object.userData && object.userData.buildingId) {
            // Get the original position
            const originalPosition = object.position.clone();
            
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
            
            if ((isDefaultPosition || isInvalidPosition) && object.userData.position) {
              console.log(`Building ${object.userData.buildingId} has problematic position, fixing...`);
              
              const pos = object.userData.position;
              
              // Use the position manager to get the correct position
              let newPosition: THREE.Vector3;
              
              if (pos.lat !== undefined && pos.lng !== undefined) {
                console.log(`Building ${object.userData.buildingId} has lat/lng position:`, pos);
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
              object.position.copy(newPosition);
              console.log(`Fixed position for ${object.userData.buildingId}:`, object.position);
            }
          }
        });
        
        console.log('Building position verification and fixing complete');
      }
    };
    
    const handleFocusOnBuildings = () => {
      focusCameraOnBuildings();
    };
    
    const handleEnsureBuildingsVisible = () => {
      ensureBuildingsVisible();
    };
    
    window.addEventListener('fixBuildingPositions', handleFixPositions);
    window.addEventListener('focusOnBuildings', handleFocusOnBuildings);
    window.addEventListener('ensureBuildingsVisible', handleEnsureBuildingsVisible);
    
    return () => {
      window.removeEventListener('fixBuildingPositions', handleFixPositions);
      window.removeEventListener('focusOnBuildings', handleFocusOnBuildings);
      window.removeEventListener('ensureBuildingsVisible', handleEnsureBuildingsVisible);
    };
  }, [focusCameraOnBuildings, ensureBuildingsVisible]);
  
  // Listen for building events
  useEffect(() => {
    if (!isActive) return;
    
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
          
          if (building && rendererFactoryRef.current) {
            // Get the appropriate renderer
            const renderer = rendererFactoryRef.current.getRenderer(building.type);
            
            // Dispose of the mesh
            renderer.dispose(mesh);
          } else if (sceneRef.current) {
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
    
    // Subscribe to events
    const buildingPlacedSubscription = eventBus.subscribe(
      EventTypes.BUILDING_PLACED,
      handleBuildingPlaced
    );
    
    const buildingRemovedSubscription = eventBus.subscribe(
      EventTypes.BUILDING_REMOVED,
      handleBuildingRemoved
    );
    
    // Add event listener for force rerender
    const handleForceRerender = async () => {
      console.log('Force rerender buildings event received');
      
      // Clear existing buildings
      for (const [id, mesh] of buildingMeshesRef.current.entries()) {
        if (rendererFactoryRef.current) {
          const building = buildings.find(b => b.id === id) || { type: 'unknown' } as BuildingData;
          const renderer = rendererFactoryRef.current.getRenderer(building.type);
          renderer.dispose(mesh);
        }
      }
      buildingMeshesRef.current.clear();
      
      // Use the memory-efficient loading strategy
      loadBuildingsEfficiently();
      
      console.log('Started rerendering buildings efficiently');
    };
    
    window.addEventListener('forceRerenderBuildings', handleForceRerender);
    
    return () => {
      // Unsubscribe from events
      buildingPlacedSubscription.unsubscribe();
      buildingRemovedSubscription.unsubscribe();
      window.removeEventListener('forceRerenderBuildings', handleForceRerender);
    };
  }, [active, buildings, ensureBuildingsVisible]);
  
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
  
  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      {/* Loading indicator */}
      {loading && (
        <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-1 rounded">
          Loading buildings...
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="absolute top-4 left-4 bg-red-600/90 text-white px-3 py-1 rounded">
          Error: {error}
        </div>
      )}
    </div>
  );
};

export default BuildingRenderer;
  
