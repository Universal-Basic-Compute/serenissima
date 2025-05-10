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
        
        console.log(`Loaded and rendered ${loadedBuildings.length} buildings`);
      } catch (error) {
        console.error('Error loading buildings:', error);
      }
    };
    
    loadBuildings();
    
    // Listen for building placed events
    const handleBuildingPlaced = (data: any) => {
      console.log('Building placed event received:', data);
      
      // If this is a refresh event, reload all buildings
      if (data.refresh) {
        console.log('Refreshing all buildings');
        
        // Clear existing buildings first
        buildingMeshesRef.current.forEach((mesh, id) => {
          if (mesh && scene.children.includes(mesh)) {
            scene.remove(mesh);
          }
        });
        buildingMeshesRef.current.clear();
        
        // Reload all buildings
        loadBuildings();
        return;
      }
      
      // Add the new building to our state
      if (data.data) {
        setBuildings(prevBuildings => [...prevBuildings, data.data]);
        
        // Render the new building
        renderBuilding(data.data);
      }
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
  
  // Function to normalize coordinates
  const normalizeCoordinates = (position: any): THREE.Vector3 => {
    // Check if these are lat/lng coordinates
    if (position.x > 40 && position.x < 50 && position.z > 10 && position.z < 20) {
      // These appear to be Venice lat/lng coordinates
      // Convert to a reasonable scene position
      return new THREE.Vector3(
        (position.x - 45) * 100, // Center around 45 degrees latitude
        position.y,
        (position.z - 12) * 100  // Center around 12 degrees longitude
      );
    }
    
    // Return original position if not lat/lng
    return new THREE.Vector3(position.x, position.y, position.z);
  };

  // Function to render a building
  const renderBuilding = (building: any) => {
    if (!scene) return;
    
    const { id, type, position, rotation, variant = 'model' } = building;
    
    // Enhanced logging
    console.log('=== BUILDING RENDER ATTEMPT ===');
    console.log('Building data:', JSON.stringify(building, null, 2));
    console.log(`Rendering building ID: ${id}, Type: ${type}, Position:`, position);
    
    // Skip if we've already rendered this building
    if (buildingMeshesRef.current.has(id)) {
      console.log(`Building ${id} already rendered, skipping`);
      return;
    }
    
    // Ensure type is a string and properly formatted
    // Normalize the building type (remove apostrophes, replace spaces with hyphens)
    const buildingType = typeof type === 'string' 
      ? type.toLowerCase().replace(/'/g, '').replace(/\s+/g, '-') 
      : 'unknown';
    
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
            console.log(`Successfully loaded model for building ${id}`);
            const model = gltf.scene;
            
            // Position and rotate the model
            const normalizedPosition = normalizeCoordinates(position);
            model.position.set(normalizedPosition.x, normalizedPosition.y, normalizedPosition.z);
            model.rotation.y = rotation || 0;
            console.log(`Positioned model at normalized position:`, normalizedPosition);
            
            // Add a small y-offset to ensure buildings appear above the land
            model.position.y += 0.1; // Raise slightly above ground level
            
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
            } else {
              // Apply a default scale to make buildings more visible
              const scale = 2.0;
              model.scale.set(scale, scale, scale);
              console.log(`Applied default scale of ${scale} to building`);
            }
            
            // Add a visible helper at the building position
            const helperGeometry = new THREE.SphereGeometry(1, 16, 16);
            const helperMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const helper = new THREE.Mesh(helperGeometry, helperMaterial);
            helper.position.copy(model.position);
            scene.add(helper);
            console.log(`Added position helper at ${JSON.stringify(helper.position)}`);
            
            // Add to scene
            scene.add(model);
            console.log(`Added model to scene for building ${id}`);
            
            // Store reference
            buildingMeshesRef.current.set(id, model);
            
            console.log(`Building ${id} (${type}) successfully rendered at position:`, position);
            
            // Add more detailed logging
            console.log(`Building ${id} world position:`, model.getWorldPosition(new THREE.Vector3()));
            console.log(`Building ${id} world scale:`, model.getWorldScale(new THREE.Vector3()));
            console.log(`Building ${id} is visible:`, model.visible);
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
          console.error(`Model path that failed: ${modelPath}`);
          createFallbackMesh(id, type, position, rotation);
        }
      );
    } catch (error) {
      console.error(`Error initiating model load for building ${id}:`, error);
      console.error(`Stack trace:`, error.stack);
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
    const normalizedPosition = normalizeCoordinates(position);
    fallbackMesh.position.set(normalizedPosition.x, normalizedPosition.y + 0.5, normalizedPosition.z);
    fallbackMesh.rotation.y = rotation || 0;
    
    // Make the fallback mesh larger for visibility
    fallbackMesh.scale.set(3, 3, 3);
    
    // Add a visible helper at the building position
    const helperGeometry = new THREE.SphereGeometry(1, 16, 16);
    const helperMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const helper = new THREE.Mesh(helperGeometry, helperMaterial);
    helper.position.copy(fallbackMesh.position);
    scene.add(helper);
    console.log(`Added position helper at ${JSON.stringify(helper.position)}`);
    
    // Add to scene
    scene.add(fallbackMesh);
    
    // Store reference
    buildingMeshesRef.current.set(id, fallbackMesh);
    
    console.log(`Created fallback mesh for building ${id} at normalized position:`, normalizedPosition);
  };
  
  // This component doesn't render any UI
  return null;
};

export default BuildingRenderer;
