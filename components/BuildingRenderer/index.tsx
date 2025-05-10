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
  
  // We're no longer normalizing coordinates - using direct positions instead

  // Function to render a building
  const renderBuilding = (building: any) => {
    if (!scene) return;
    
    const { id, type, position, rotation, variant = 'model' } = building;
    
    // Enhanced logging
    console.log('=== BUILDING RENDER ATTEMPT ===');
    console.log('Building data:', JSON.stringify(building, null, 2));
    console.log(`Rendering building ID: ${id}, Type: ${type}, Position:`, position);
    
    // Add a large debug sphere at the same position
    const sphereGeometry = new THREE.SphereGeometry(5, 32, 32); // Smaller but still visible sphere
    const sphereMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff00ff,  // Bright magenta for better visibility
      transparent: false, // Make fully opaque
      opacity: 1.0
    });
    const debugSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);

    // Use the exact position from the building data
    debugSphere.position.set(position.x, position.y || 10, position.z);
    scene.add(debugSphere);
    console.log(`Added debug sphere at position:`, debugSphere.position);

    // Store reference to the debug sphere
    const debugId = `debug_sphere_${id}`;
    buildingMeshesRef.current.set(debugId, debugSphere);
    
    // Add a reference sphere at origin (0,0,0)
    const originSphereGeometry = new THREE.SphereGeometry(5, 32, 32);
    const originSphereMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x00ff00,  // Bright green
      transparent: false,
      opacity: 1.0
    });
    const originSphere = new THREE.Mesh(originSphereGeometry, originSphereMaterial);
    originSphere.position.set(0, 10, 0); // At origin, 10 units up
    scene.add(originSphere);
    console.log(`Added origin reference sphere at position: (0, 10, 0)`);

    // Store reference
    buildingMeshesRef.current.set('debug_sphere_origin', originSphere);
    
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
            
            // Position and rotate the model - use the exact position from the data
            model.position.set(position.x, position.y || 10, position.z);
            model.rotation.y = rotation || 0;
            console.log(`Positioned model at coordinates: x=${position.x}, y=${position.y || 10}, z=${position.z}`);
            
            // Scale model to be much larger for visibility
            const scale = 10.0; // Increase scale significantly
            model.scale.set(scale, scale, scale);
            console.log(`Applied scale of ${scale} to building`);
            
            // Store the building ID in userData for later reference
            model.userData.buildingId = id;
            model.userData.buildingType = type;
            
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
    
    console.log(`Creating fallback mesh for building ${id} (${type})`);
    
    // Create a much larger fallback mesh
    const geometry = new THREE.BoxGeometry(10, 10, 10);
    // Use bright red for better visibility
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xff0000,
      wireframe: false
    });
    const fallbackMesh = new THREE.Mesh(geometry, material);
    
    // Use the exact position from the data
    fallbackMesh.position.set(position.x, position.y || 10, position.z);
    fallbackMesh.rotation.y = rotation || 0;
    
    // Store the building ID in userData for later reference
    fallbackMesh.userData.buildingId = id;
    fallbackMesh.userData.buildingType = type;
    
    // Add to scene
    scene.add(fallbackMesh);
    console.log(`Added fallback mesh at position:`, fallbackMesh.position);
    
    // Store reference
    buildingMeshesRef.current.set(id, fallbackMesh);
  };
  
  // This component doesn't render any UI
  return null;
};

export default BuildingRenderer;
