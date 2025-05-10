import React, { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';
import { normalizeCoordinates } from '@/components/PolygonViewer/utils';

interface BuildingRendererProps {
  scene: THREE.Scene;
  active: boolean;
}

const BuildingRenderer: React.FC<BuildingRendererProps> = ({ scene, active }) => {
  const [buildings, setBuildings] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const buildingMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const modelsCache = useRef<Map<string, THREE.Object3D>>(new Map());
  const gltfLoader = useRef<GLTFLoader>(new GLTFLoader());
  
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
        
        // Check if position has lat/lng format
        if (pos.lat !== undefined && pos.lng !== undefined) {
          console.log(`Building ${building.userData.buildingId} has lat/lng position:`, pos);
          
          // Convert lat/lng to Three.js coordinates
          const bounds = {
            centerLat: 45.4371,
            centerLng: 12.3358,
            scale: 100000,
            latCorrectionFactor: 0.7
          };
          
          const x = (pos.lng - bounds.centerLng) * bounds.scale;
          const z = -(pos.lat - bounds.centerLat) * bounds.scale * bounds.latCorrectionFactor;
          
          // Set the new position with increased height
          building.position.set(x, 5, z);
          console.log(`Fixed position for ${building.userData.buildingId}:`, building.position);
        }
        else if (pos.x !== undefined && pos.z !== undefined) {
          // Position is already in scene coordinates, just ensure it's set correctly
          building.position.set(pos.x, pos.y || 5, pos.z);
          console.log(`Reset position for ${building.userData.buildingId} using stored coordinates:`, building.position);
        }
      }
    });
    
    console.log('Building position verification and fixing complete');
  };

  // Function to load a building model
  const loadBuildingModel = async (type: string, variant: string = 'model') => {
    const cacheKey = `${type}-${variant}`;
    
    // Check if we already have this model in cache
    if (modelsCache.current.has(cacheKey)) {
      return modelsCache.current.get(cacheKey).clone();
    }
    
    // Define model paths with multiple fallback options
    const modelPaths = [
      `/assets/buildings/models/${type}/${variant}.glb`,  // Primary path with variant
      `/assets/buildings/models/${type}/model.glb`,       // Fallback to default variant
      `/models/buildings/${type}.glb`,                    // Legacy path
      `/models/buildings/default_building.glb`            // Ultimate fallback
    ];
    
    // Try each path in sequence until one works
    for (const modelPath of modelPaths) {
      try {
        console.log(`Attempting to load model from: ${modelPath}`);
        
        // Load the model
        const gltf = await new Promise<GLTF>((resolve, reject) => {
          gltfLoader.current.load(
            modelPath,
            resolve,
            undefined,
            reject
          );
        });
        
        // Clone the model to avoid reference issues
        const model = gltf.scene.clone();
        
        // Cache the model for future use
        modelsCache.current.set(cacheKey, model.clone());
        
        console.log(`Successfully loaded model from: ${modelPath}`);
        return model;
      } catch (error) {
        console.warn(`Failed to load model from ${modelPath}:`, error);
        // Continue to next path option
      }
    }
    
    // If all paths fail, create a fallback cube model
    console.error(`All model loading attempts failed for ${type}. Creating fallback.`);
    
    // Create a more visible fallback cube model with a distinctive color
    const geometry = new THREE.BoxGeometry(3, 3, 3); // Larger size for better visibility
    
    // Generate a deterministic color based on building type
    let hash = 0;
    for (let i = 0; i < type.length; i++) {
      hash = type.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = (hash & 0x00FFFFFF);
    
    const material = new THREE.MeshStandardMaterial({ 
      color: color, 
      emissive: 0x440044, // Add some emissive glow
      wireframe: false
    });
    const cube = new THREE.Mesh(geometry, material);
    
    // Add the cube to a group to match GLTF structure
    const group = new THREE.Group();
    group.add(cube);
    
    // Add a label to identify the building type
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(type, canvas.width/2, canvas.height/2);
      
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(0, 2, 0); // Position above the cube
      sprite.scale.set(3, 1.5, 1);
      group.add(sprite);
    }
    
    return group;
  };
  
  // Function to create a building mesh
  const createBuildingMesh = async (building: any) => {
    try {
      // Load the building model
      const model = await loadBuildingModel(building.type, building.variant);
      
      // Parse position data properly
      let position = { x: 0, y: 5, z: 0 }; // Default position with height=5
      
      console.log(`Processing position for building ${building.id}:`, building.position);
      
      // Handle different position formats
      if (building.position) {
        // If position is a string (JSON), parse it
        if (typeof building.position === 'string') {
          try {
            console.log(`Building ${building.id}: Position is a string, attempting to parse:`, building.position);
            const parsedPos = JSON.parse(building.position);
            
            // Check if parsed position has lat/lng format
            if (parsedPos.lat !== undefined && parsedPos.lng !== undefined) {
              // Convert lat/lng to Three.js coordinates
              const bounds = {
                centerLat: 45.4371,
                centerLng: 12.3358,
                scale: 100000,
                latCorrectionFactor: 0.7
              };
              
              const x = (parsedPos.lng - bounds.centerLng) * bounds.scale;
              const z = -(parsedPos.lat - bounds.centerLat) * bounds.scale * bounds.latCorrectionFactor;
              
              position = { x, y: 5, z };
              console.log(`Converted lat/lng position for ${building.id}:`, position);
            } 
            // Check if parsed position has x/z format
            else if (parsedPos.x !== undefined && parsedPos.z !== undefined) {
              position = {
                x: parsedPos.x,
                y: parsedPos.y || 5,
                z: parsedPos.z
              };
              console.log(`Using parsed x/y/z position for ${building.id}:`, position);
            }
            else {
              console.warn(`Building ${building.id}: Parsed position has unknown format:`, parsedPos);
            }
          } catch (error) {
            console.error(`Building ${building.id}: Error parsing position:`, error);
          }
        } 
        // If position is already an object
        else if (typeof building.position === 'object') {
          console.log(`Building ${building.id}: Position is an object:`, building.position);
          
          // Check if it's lat/lng format
          if (building.position.lat !== undefined && building.position.lng !== undefined) {
            // Get the lat/lng values with full precision
            const lat = parseFloat(building.position.lat.toString());
            const lng = parseFloat(building.position.lng.toString());
            
            console.log(`Building ${building.id}: Converting lat/lng: ${lat}, ${lng}`);
            
            // Define Venice center coordinates and scaling factors
            const bounds = {
              centerLat: 45.4371,
              centerLng: 12.3358,
              scale: 100000,
              latCorrectionFactor: 0.7
            };
            
            // Calculate x and z directly
            const x = (lng - bounds.centerLng) * bounds.scale;
            const z = -(lat - bounds.centerLat) * bounds.scale * bounds.latCorrectionFactor;
            
            position = { x, y: 5, z };
            console.log(`Building ${building.id}: Converted lat/lng to position:`, position);
          } 
          // Check if it's x/z format
          else if (building.position.x !== undefined && building.position.z !== undefined) {
            position = {
              x: parseFloat(building.position.x.toString()),
              y: building.position.y !== undefined ? parseFloat(building.position.y.toString()) : 5,
              z: parseFloat(building.position.z.toString())
            };
            console.log(`Building ${building.id}: Using direct x/y/z position:`, position);
          }
          else {
            console.warn(`Building ${building.id}: Position object has unknown format:`, building.position);
          }
        }
      }
      
      // Ensure position has a reasonable height to be visible
      if (!position.y || position.y < 0.1) {
        console.log(`Building ${building.id}: Setting default height (y=5) because current height is ${position.y}`);
        position.y = 5;
      }
      
      // Set position with explicit values to avoid undefined
      console.log(`Building ${building.id}: Setting final position:`, position);
      
      model.position.set(
        position.x,
        position.y,
        position.z
      );
      
      // Add more detailed logging with a distinctive prefix
      console.log(`[BuildingRenderer] Setting building ${building.id} position to:`, {
        x: model.position.x,
        y: model.position.y,
        z: model.position.z
      });
      
      // Set rotation
      model.rotation.y = building.rotation || 0;
      
      // Set scale (can be adjusted based on building type)
      model.scale.set(1, 1, 1);
      
      // Add metadata to the model
      model.userData = {
        buildingId: building.id,
        type: building.type,
        landId: building.land_id,
        owner: building.owner || building.created_by,
        position: position // Store the parsed position for reference
      };
      
      // Add to scene
      scene.add(model);
      
      // Store reference for later cleanup
      buildingMeshesRef.current.set(building.id, model);
      
      console.log(`Created building mesh for ${building.id} at position:`, model.position);
      
      return model;
    } catch (error) {
      console.error(`Error creating building mesh for ${building.id}:`, error);
      return null;
    }
  };
  
  // Function to fetch buildings from API
  const fetchBuildings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching buildings from API...');
      const response = await fetch('/api/buildings');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch buildings: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`Fetched ${data.buildings?.length || 0} buildings from API`);
      
      if (data.buildings && Array.isArray(data.buildings)) {
        // Log each building for debugging
        data.buildings.forEach((building: any, index: number) => {
          console.log(`Building ${index + 1}:`, building);
          console.log(`Position data:`, building.position);
          
          // Ensure position is properly formatted
          if (typeof building.position === 'string') {
            try {
              building.position = JSON.parse(building.position);
            } catch (error) {
              console.error(`Error parsing position for building ${building.id}:`, error);
              // Set a default position if parsing fails
              building.position = { x: 45, y: 5, z: 12 };
            }
          } else if (!building.position || typeof building.position !== 'object') {
            console.warn(`Building ${building.id} has invalid position, setting default`);
            building.position = { x: 45, y: 5, z: 12 };
          }
          
          // Ensure position has all required properties
          if (building.position) {
            building.position = {
              x: building.position.x !== undefined ? Number(building.position.x) : 45,
              y: building.position.y !== undefined ? Number(building.position.y) : 5,
              z: building.position.z !== undefined ? Number(building.position.z) : 12
            };
          }
        });
        
        setBuildings(data.buildings);
        return data.buildings;
      } else {
        console.warn('Invalid buildings data format:', data);
        return [];
      }
    } catch (error) {
      console.error('Error fetching buildings:', error);
      setError(error.message || 'Failed to fetch buildings');
      return [];
    } finally {
      setLoading(false);
    }
  };
  
  // Function to render buildings
  const renderBuildings = async (buildingsData: any[]) => {
    console.log(`Rendering ${buildingsData.length} buildings...`);
    
    // Create a set of building IDs for tracking
    const currentBuildingIds = new Set(buildingsData.map(b => b.id));
    
    // Remove buildings that are no longer in the data
    for (const [id, mesh] of buildingMeshesRef.current.entries()) {
      if (!currentBuildingIds.has(id)) {
        console.log(`Removing building ${id} from scene`);
        scene.remove(mesh);
        buildingMeshesRef.current.delete(id);
      }
    }
    
    // Create or update buildings
    for (const building of buildingsData) {
      // Skip if building already exists
      if (buildingMeshesRef.current.has(building.id)) {
        // TODO: Update existing building if needed
        continue;
      }
      
      // Create new building mesh
      await createBuildingMesh(building);
    }
    
    console.log(`Rendered ${buildingsData.length} buildings`);
  };
  
  // Initial load of buildings
  useEffect(() => {
    if (active && scene) {
      console.log('BuildingRenderer is active, loading buildings...');
      fetchBuildings().then(buildingsData => {
        renderBuildings(buildingsData);
        
        // Add a delay to ensure buildings are loaded
        const timer = setTimeout(() => {
          verifyAndFixBuildingPositions();
        }, 2000);
        
        return () => clearTimeout(timer);
      });
    }
    
    return () => {
      // Cleanup buildings when component unmounts
      for (const mesh of buildingMeshesRef.current.values()) {
        scene.remove(mesh);
      }
      buildingMeshesRef.current.clear();
    };
  }, [active, scene]);
  
  // Listen for the fixBuildingPositions event
  useEffect(() => {
    const handleFixPositions = () => {
      verifyAndFixBuildingPositions();
    };
    
    window.addEventListener('fixBuildingPositions', handleFixPositions);
    
    return () => {
      window.removeEventListener('fixBuildingPositions', handleFixPositions);
    };
  }, [scene]);
  
  // Listen for building events
  useEffect(() => {
    if (!active || !scene) return;
    
    const handleBuildingPlaced = async (data: any) => {
      console.log('Building placed event received:', data);
      
      if (data.refresh) {
        // Refresh all buildings
        console.log('Refreshing all buildings...');
        const buildingsData = await fetchBuildings();
        renderBuildings(buildingsData);
        return;
      }
      
      if (data.buildingId && data.type && data.data) {
        // Add a single new building
        console.log('Adding new building:', data.buildingId);
        
        // Check if building already exists
        if (buildingMeshesRef.current.has(data.buildingId)) {
          console.log(`Building ${data.buildingId} already exists, updating...`);
          // Remove existing building
          const existingMesh = buildingMeshesRef.current.get(data.buildingId);
          scene.remove(existingMesh);
          buildingMeshesRef.current.delete(data.buildingId);
        }
        
        // Create new building mesh
        await createBuildingMesh(data.data);
        
        // Update buildings state
        setBuildings(prev => {
          // Remove existing building with same ID if it exists
          const filtered = prev.filter(b => b.id !== data.buildingId);
          // Add the new building
          return [...filtered, data.data];
        });
      }
    };
    
    const handleBuildingRemoved = (data: any) => {
      console.log('Building removed event received:', data);
      
      if (data.buildingId) {
        // Remove building from scene
        const mesh = buildingMeshesRef.current.get(data.buildingId);
        if (mesh) {
          scene.remove(mesh);
          buildingMeshesRef.current.delete(data.buildingId);
          
          // Update buildings state
          setBuildings(prev => prev.filter(b => b.id !== data.buildingId));
        }
      }
    };
    
    const handleForceRerender = async () => {
      console.log('Force rerender buildings event received');
      
      // Clear existing buildings
      for (const mesh of buildingMeshesRef.current.values()) {
        scene.remove(mesh);
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
    
    // Add event listener for force rerender
    window.addEventListener('forceRerenderBuildings', handleForceRerender);
    
    return () => {
      // Unsubscribe from events
      buildingPlacedSubscription.unsubscribe();
      buildingRemovedSubscription.unsubscribe();
      window.removeEventListener('forceRerenderBuildings', handleForceRerender);
    };
  }, [active, scene]);
  
  // This component doesn't render anything visible
  return null;
};

export default BuildingRenderer;
