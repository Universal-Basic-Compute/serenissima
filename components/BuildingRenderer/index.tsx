import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BuildingService } from '@/lib/services/BuildingService';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';

interface BuildingRendererProps {
  scene: THREE.Scene;
  active: boolean;
}

/**
 * Component for rendering placed buildings in the scene
 */
const BuildingRenderer: React.FC<BuildingRendererProps> = ({
  scene,
  active
}) => {
  // State to track loaded buildings
  const [buildings, setBuildings] = useState<any[]>([]);
  
  // Refs for Three.js objects
  const buildingMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const gltfLoaderRef = useRef<GLTFLoader>(new GLTFLoader());
  
  // Load buildings on mount and when active changes
  useEffect(() => {
    if (!active || !scene) return;
    
    console.log('BuildingRenderer: Initializing');
    
    // Load existing buildings
    const loadBuildings = async () => {
      try {
        const buildingService = new BuildingService();
        const loadedBuildings = await buildingService.getBuildings();
        setBuildings(loadedBuildings);
        
        // Render each building
        loadedBuildings.forEach(building => {
          renderBuilding(building);
        });
      } catch (error) {
        console.error('Error loading buildings:', error);
      }
    };
    
    loadBuildings();
    
    // Listen for building placed events
    const handleBuildingPlaced = (data: any) => {
      console.log('Building placed event received:', data);
      
      // Add the new building to our state
      setBuildings(prevBuildings => [...prevBuildings, data.data]);
      
      // Render the new building
      renderBuilding(data.data);
    };
    
    // Subscribe to building placed events
    const subscription = eventBus.subscribe(EventTypes.BUILDING_PLACED, handleBuildingPlaced);
    
    // Cleanup function
    return () => {
      subscription.unsubscribe();
      
      // Remove all building meshes from the scene
      buildingMeshesRef.current.forEach((mesh, id) => {
        scene.remove(mesh);
        
        // Dispose of geometries and materials
        if (mesh instanceof THREE.Mesh) {
          if (mesh.geometry) mesh.geometry.dispose();
          
          if (mesh.material) {
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach(material => material.dispose());
            } else {
              mesh.material.dispose();
            }
          }
        }
      });
      
      // Clear the map
      buildingMeshesRef.current.clear();
    };
  }, [active, scene]);
  
  // Function to render a building
  const renderBuilding = (building: any) => {
    if (!scene) return;
    
    const { id, type, position, rotation, variant = 'model' } = building;
    
    // Skip if we've already rendered this building
    if (buildingMeshesRef.current.has(id)) return;
    
    // Construct the path to the model
    // Handle dock type specially
    const modelPath = type === 'dock' 
      ? `/assets/buildings/models/dock/${variant}.glb`
      : `/assets/buildings/models/${type}/${variant}.glb`;
    
    // Load the model
    gltfLoaderRef.current.load(
      modelPath,
      (gltf) => {
        const model = gltf.scene;
        
        // Position and rotate the model
        model.position.set(position.x, position.y, position.z);
        model.rotation.y = rotation || 0;
        
        // Add to scene
        scene.add(model);
        
        // Store reference
        buildingMeshesRef.current.set(id, model);
        
        console.log(`Building ${id} (${type}) rendered at position:`, position);
      },
      (progress) => {
        // Loading progress
        console.log(`Loading building ${id} (${type}): ${Math.round(progress.loaded / progress.total * 100)}%`);
      },
      (error) => {
        // Error handling
        console.error(`Error loading building ${id} (${type}):`, error);
        
        // Create a fallback mesh
        const geometry = new THREE.BoxGeometry(2, 1, 2);
        // Use blue color for docks, amber for other buildings
        const material = new THREE.MeshBasicMaterial({ 
          color: type === 'dock' ? 0x3b82f6 : 0xf59e0b 
        });
        const fallbackMesh = new THREE.Mesh(geometry, material);
        
        // Position and rotate the fallback
        fallbackMesh.position.set(position.x, position.y + 0.5, position.z);
        fallbackMesh.rotation.y = rotation || 0;
        
        // Add to scene
        scene.add(fallbackMesh);
        
        // Store reference
        buildingMeshesRef.current.set(id, fallbackMesh);
      }
    );
  };
  
  // This component doesn't render any UI
  return null;
};

export default BuildingRenderer;
