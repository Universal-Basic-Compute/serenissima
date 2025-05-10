import React, { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';

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
  
  // Function to load a building model
  const loadBuildingModel = async (type: string, variant: string = 'model') => {
    const cacheKey = `${type}-${variant}`;
    
    // Check if we already have this model in cache
    if (modelsCache.current.has(cacheKey)) {
      return modelsCache.current.get(cacheKey).clone();
    }
    
    // Define model paths for different building types
    const modelPaths: Record<string, string> = {
      'market-stall': '/models/buildings/market_stall.glb',
      'public-dock': '/models/buildings/dock.glb',
      'house': '/models/buildings/house.glb',
      'warehouse': '/models/buildings/warehouse.glb',
      'workshop': '/models/buildings/workshop.glb',
      'church': '/models/buildings/church.glb',
      'palace': '/models/buildings/palace.glb',
      'bridge': '/models/buildings/bridge.glb',
      'tower': '/models/buildings/tower.glb',
      'default': '/models/buildings/default_building.glb'
    };
    
    // Get the model path, fallback to default if not found
    const modelPath = modelPaths[type] || modelPaths.default;
    
    try {
      // Load the model
      const gltf = await new Promise<THREE.GLTF>((resolve, reject) => {
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
      
      return model;
    } catch (error) {
      console.error(`Error loading model for ${type}:`, error);
      
      // Create a fallback cube model
      const geometry = new THREE.BoxGeometry(2, 2, 2);
      const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
      const cube = new THREE.Mesh(geometry, material);
      
      // Add the cube to a group to match GLTF structure
      const group = new THREE.Group();
      group.add(cube);
      
      return group;
    }
  };
  
  // Function to create a building mesh
  const createBuildingMesh = async (building: any) => {
    try {
      // Load the building model
      const model = await loadBuildingModel(building.type, building.variant);
      
      // Set position
      model.position.set(
        building.position.x,
        building.position.y || 0,
        building.position.z
      );
      
      // Set rotation
      model.rotation.y = building.rotation || 0;
      
      // Set scale (can be adjusted based on building type)
      model.scale.set(1, 1, 1);
      
      // Add metadata to the model
      model.userData = {
        buildingId: building.id,
        type: building.type,
        landId: building.land_id,
        owner: building.owner || building.created_by
      };
      
      // Add to scene
      scene.add(model);
      
      // Store reference for later cleanup
      buildingMeshesRef.current.set(building.id, model);
      
      console.log(`Created building mesh for ${building.id} at position:`, building.position);
      
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
    
    // Subscribe to events
    const buildingPlacedSubscription = eventBus.subscribe(
      EventTypes.BUILDING_PLACED,
      handleBuildingPlaced
    );
    
    const buildingRemovedSubscription = eventBus.subscribe(
      EventTypes.BUILDING_REMOVED,
      handleBuildingRemoved
    );
    
    return () => {
      // Unsubscribe from events
      buildingPlacedSubscription.unsubscribe();
      buildingRemovedSubscription.unsubscribe();
    };
  }, [active, scene]);
  
  // This component doesn't render anything visible
  return null;
};

export default BuildingRenderer;
