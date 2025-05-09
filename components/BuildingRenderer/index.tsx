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
    
      // Safely remove all building meshes from the scene
      if (scene) {
        buildingMeshesRef.current.forEach((mesh, id) => {
          try {
            if (mesh && scene.children.includes(mesh)) {
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
            }
          } catch (error) {
            console.warn(`Error cleaning up mesh ${id}:`, error);
          }
        });
      
        // Clear the map
        buildingMeshesRef.current.clear();
      }
    };
  }, [active, scene]);
  
  // Function to render a building
  const renderBuilding = (building: any) => {
    if (!scene) return;
    
    const { id, type, position, rotation, variant = 'model' } = building;
    
    // Skip if we've already rendered this building
    if (buildingMeshesRef.current.has(id)) return;
    
    // Log the building data for debugging
    console.log('Rendering building:', building);
    
    // Ensure type is a string and properly formatted
    const buildingType = typeof type === 'string' ? type.toLowerCase().replace(/\s+/g, '-') : 'unknown';
    
    // Construct the path to the model
    const modelPath = `/assets/buildings/models/${buildingType}/${variant}.glb`;
    
    console.log(`Attempting to load building model from: ${modelPath}`);
    
    // Add error handling for model loading
    try {
      // Load the model
      gltfLoaderRef.current.load(
        modelPath,
        (gltf) => {
          try {
            const model = gltf.scene;
            
            // Position and rotate the model
            model.position.set(position.x, position.y, position.z);
            model.rotation.y = rotation || 0;
            
            // Calculate bounding box to properly scale the model
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            
            // Scale model to a reasonable size if it's too large or too small
            const maxDimension = Math.max(size.x, size.y, size.z);
            if (maxDimension > 20) {
              // Model is too large, scale it down
              const scale = 10 / maxDimension;
              model.scale.set(scale, scale, scale);
              console.log(`Model was too large (${maxDimension} units), scaled down by ${scale}`);
            } else if (maxDimension < 1) {
              // Model is too small, scale it up
              const scale = 5 / maxDimension;
              model.scale.set(scale, scale, scale);
              console.log(`Model was too small (${maxDimension} units), scaled up by ${scale}`);
            }
            
            // Add to scene
            scene.add(model);
            
            // Store reference
            buildingMeshesRef.current.set(id, model);
            
            console.log(`Building ${id} (${type}) rendered at position:`, position);
          } catch (modelError) {
            console.error(`Error processing model for building ${id}:`, modelError);
            createFallbackMesh(id, type, position, rotation);
          }
        },
        (progress) => {
          // Loading progress
          const percent = progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;
          console.log(`Loading building ${id} (${type}): ${percent}%`);
        },
        (error) => {
          // Error handling
          console.error(`Error loading building ${id} (${type}):`, error);
          createFallbackMesh(id, type, position, rotation);
        }
      );
    } catch (error) {
      console.error(`Error initiating model load for building ${id}:`, error);
      createFallbackMesh(id, type, position, rotation);
    }
  };
  
  // Add a helper function to create fallback meshes
  const createFallbackMesh = (id: string, type: string, position: any, rotation: number) => {
    if (!scene) return;
    
    // Create a fallback mesh
    const geometry = new THREE.BoxGeometry(2, 1, 2);
    // Use amber color for all buildings
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xf59e0b 
    });
    const fallbackMesh = new THREE.Mesh(geometry, material);
    
    // Position and rotate the fallback
    fallbackMesh.position.set(position.x, position.y + 0.5, position.z);
    fallbackMesh.rotation.y = rotation || 0;
    
    // Add to scene
    scene.add(fallbackMesh);
    
    // Store reference
    buildingMeshesRef.current.set(id, fallbackMesh);
    
    console.log(`Created fallback mesh for building ${id}`);
  };
  
  // This component doesn't render any UI
  return null;
};

export default BuildingRenderer;
