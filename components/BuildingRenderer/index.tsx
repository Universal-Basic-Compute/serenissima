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
    // Make sure we have valid position data
    if (!position) {
      console.warn('Invalid position data:', position);
      return new THREE.Vector3(0, 0, 0);
    }
    
    // Log the incoming position for debugging
    console.log('Normalizing position:', position);
    
    // For the market stall specifically, don't transform the coordinates
    // This is a special case for this particular building
    if (position.x === 45.42623684734749 && position.z === 12.33922034185465) {
      console.log('Special case: Market stall coordinates - using as is');
      return new THREE.Vector3(position.x, position.y || 0, position.z);
    }
    
    // Check if these are lat/lng coordinates (Venice is around 45.4, 12.3)
    if (position.x >= 40 && position.x <= 50 && 
        (position.z >= 10 && position.z <= 20 || 
         (typeof position.lng === 'number' && position.lng >= 10 && position.lng <= 20))) {
      
      // These appear to be Venice lat/lng coordinates
      // Get the z/longitude value from the appropriate property
      const longitude = position.z || position.lng || 0;
      
      // Return the coordinates directly without transformation for lat/lng coordinates
      // This ensures buildings appear at their exact specified positions
      return new THREE.Vector3(position.x, position.y || 0, position.z);
    }
    
    // Return original position if not lat/lng
    console.log('Using original coordinates:', position);
    return new THREE.Vector3(position.x, position.y || 0, position.z);
  };

  // Function to render a building
  const renderBuilding = (building: any) => {
    if (!scene) return;
    
    const { id, type, position, rotation, variant = 'model' } = building;
    
    // Enhanced logging
    console.log('=== BUILDING RENDER ATTEMPT ===');
    console.log('Building data:', JSON.stringify(building, null, 2));
    console.log(`Rendering building ID: ${id}, Type: ${type}, Position:`, position);
    
    // Add a large debug sphere at the same position
    const sphereGeometry = new THREE.SphereGeometry(10, 32, 32); // Large 10-unit radius sphere
    const sphereMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000,  // Bright red
      transparent: true,
      opacity: 0.7
    });
    const debugSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);

    // Use the exact same position as the building
    debugSphere.position.set(position.x, position.y + 15, position.z); // Position 15 units above the building
    scene.add(debugSphere);
    console.log(`Added debug sphere at position: ${JSON.stringify(debugSphere.position)}`);

    // Store reference to the debug sphere
    const debugId = `debug_sphere_${id}`;
    buildingMeshesRef.current.set(debugId, debugSphere);
    
    // Add a reference sphere at origin (0,0,0)
    const originSphereGeometry = new THREE.SphereGeometry(5, 32, 32);
    const originSphereMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x00ff00,  // Bright green
      transparent: true,
      opacity: 0.7
    });
    const originSphere = new THREE.Mesh(originSphereGeometry, originSphereMaterial);
    originSphere.position.set(0, 15, 0); // At origin, 15 units up
    scene.add(originSphere);
    console.log(`Added origin reference sphere at position: (0, 15, 0)`);

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
            
            // Position and rotate the model
            // Use the exact position values but RAISE the Y coordinate to place above water
            model.position.set(position.x, 5.0, position.z); // Set Y to 5.0 units above water level
            model.rotation.y = rotation || 0;
            console.log(`Positioned model at position: x=${position.x}, y=5.0, z=${position.z}`);
            
            // Calculate bounding box to properly scale the model
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            
            // Scale model to a reasonable size - reduce the scale to make buildings smaller
            const maxDimension = Math.max(size.x, size.y, size.z);
            if (maxDimension > 20) {
              // Model is too large, scale it down
              const scale = 0.5 / maxDimension; // Reduced scale factor
              model.scale.set(scale, scale, scale);
              console.log(`Model was too large (${maxDimension} units), scaled down by ${scale}`);
            } else if (maxDimension < 1) {
              // Model is too small, scale it up
              const scale = 0.5 / maxDimension; // Reduced scale factor
              model.scale.set(scale, scale, scale);
              console.log(`Model was too small (${maxDimension} units), scaled up by ${scale}`);
            } else {
              // Apply a default scale to make buildings more visible but smaller
              const scale = 0.1; // Significantly reduced from 0.5 to 0.1
              model.scale.set(scale, scale, scale);
              console.log(`Applied default scale of ${scale} to building`);
            }
            
            // Store the building ID in userData for later reference
            model.userData.buildingId = id;
            model.userData.buildingType = type;
            
            // Add a visible helper at the building position
            const helperGeometry = new THREE.SphereGeometry(0.5, 16, 16);
            const helperMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const helper = new THREE.Mesh(helperGeometry, helperMaterial);
            helper.position.set(position.x, 5.0, position.z);
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
    
    console.log(`Creating fallback mesh for building ${id} (${type})`);
    
    // Create a fallback mesh
    const geometry = new THREE.BoxGeometry(2, 1, 2);
    // Use amber color for all buildings
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xf59e0b 
    });
    const fallbackMesh = new THREE.Mesh(geometry, material);
    
    // Position and rotate the fallback - raise the Y position
    fallbackMesh.position.set(position.x, 5.0, position.z); // Set Y to 5.0 units above water level
    fallbackMesh.rotation.y = rotation || 0;
    
    // Make the fallback mesh smaller for better proportions
    fallbackMesh.scale.set(0.5, 0.5, 0.5); // Reduced from 1 to 0.5
    
    // Store the building ID in userData for later reference
    fallbackMesh.userData.buildingId = id;
    fallbackMesh.userData.buildingType = type;
    
    // Add a visible helper at the building position
    const helperGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const helperMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const helper = new THREE.Mesh(helperGeometry, helperMaterial);
    helper.position.set(position.x, 5.0, position.z);
    scene.add(helper);
    console.log(`Added position helper at ${JSON.stringify(helper.position)}`);
    
    // Add to scene
    scene.add(fallbackMesh);
    
    // Store reference
    buildingMeshesRef.current.set(id, fallbackMesh);
    
    console.log(`Created fallback mesh for building ${id} at position: x=${position.x}, y=5.0, z=${position.z}`);
  };
  
  // This component doesn't render any UI
  return null;
};

export default BuildingRenderer;
