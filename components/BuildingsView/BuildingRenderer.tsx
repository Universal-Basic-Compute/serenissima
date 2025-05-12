import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ThreeDErrorBoundary } from '@/lib/components/ThreeDErrorBoundary';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';

/**
 * BuildingRenderer component handles the 3D rendering of placed buildings
 * 
 * This component is responsible for:
 * - Creating and managing 3D meshes for buildings
 * - Updating building visuals based on state changes
 * - Handling level of detail for performance
 * - Managing building animations and effects
 */
interface BuildingRendererProps {
  scene: THREE.Scene;
  buildings: any[];
  camera?: THREE.Camera;
  onBuildingClick?: (buildingId: string) => void;
}

const BuildingRenderer: React.FC<BuildingRendererProps> = ({ 
  scene, 
  buildings, 
  camera, 
  onBuildingClick 
}) => {
  // Refs to track building meshes and loaders
  const buildingMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const gltfLoaderRef = useRef<GLTFLoader>(new GLTFLoader());
  
  // Effect to handle building rendering and cleanup
  useEffect(() => {
    // Skip if no scene or buildings
    if (!scene || !buildings || buildings.length === 0) return;
    
    console.log(`BuildingRenderer: Rendering ${buildings.length} buildings`);
    
    // Track which buildings we've processed in this render cycle
    const processedBuildingIds = new Set<string>();
    
    // Process each building
    buildings.forEach(building => {
      if (!building.id) {
        console.warn('Building without ID:', building);
        return;
      }
      
      processedBuildingIds.add(building.id);
      
      // Check if we already have a mesh for this building
      if (buildingMeshesRef.current.has(building.id)) {
        // Update existing mesh if needed
        const existingMesh = buildingMeshesRef.current.get(building.id)!;
        updateBuildingMesh(existingMesh, building);
      } else {
        // Create new mesh for this building
        createBuildingMesh(building);
      }
    });
    
    // Remove any meshes for buildings that no longer exist
    buildingMeshesRef.current.forEach((mesh, id) => {
      if (!processedBuildingIds.has(id)) {
        console.log(`Removing building mesh for ${id}`);
        scene.remove(mesh);
        disposeMesh(mesh);
        buildingMeshesRef.current.delete(id);
      }
    });
    
    // Cleanup function
    return () => {
      // Remove all building meshes from scene
      buildingMeshesRef.current.forEach((mesh, id) => {
        scene.remove(mesh);
        disposeMesh(mesh);
      });
      buildingMeshesRef.current.clear();
    };
  }, [scene, buildings]);
  
  // Effect to handle building placement events
  useEffect(() => {
    const handleBuildingPlaced = (data: any) => {
      // If this is just a refresh event, do nothing (the main effect will handle it)
      if (data.refresh) return;
      
      // Otherwise, create or update the building mesh
      if (data.building && data.building.id) {
        if (buildingMeshesRef.current.has(data.building.id)) {
          const existingMesh = buildingMeshesRef.current.get(data.building.id)!;
          updateBuildingMesh(existingMesh, data.building);
        } else {
          createBuildingMesh(data.building);
        }
      }
    };
    
    // Subscribe to building placed events
    const subscription = eventBus.subscribe(EventTypes.BUILDING_PLACED, handleBuildingPlaced);
    
    return () => {
      subscription.unsubscribe();
    };
  }, [scene]);
  
  // Function to create a building mesh
  const createBuildingMesh = async (building: any) => {
    try {
      console.log(`Creating building mesh for ${building.id} of type ${building.type}`);
      
      // Determine the path to the GLB file based on building type and variant
      const variant = building.variant || 'model';
      const modelPath = `/assets/buildings/models/${building.type}/${variant}.glb`;
      
      console.log(`Loading model from: ${modelPath}`);
      
      // Create a group to hold the model
      const buildingGroup = new THREE.Group();
      buildingGroup.userData = {
        buildingId: building.id,
        type: building.type,
        landId: building.land_id,
        owner: building.owner || building.created_by,
        position: building.position
      };
      
      // Position the group
      const position = new THREE.Vector3(
        building.position.x,
        building.position.y || 0,
        building.position.z
      );
      
      buildingGroup.position.copy(position);
      buildingGroup.rotation.y = building.rotation || 0;
      
      // Add to scene immediately so we have something visible
      scene.add(buildingGroup);
      
      // Store reference to the group
      buildingMeshesRef.current.set(building.id, buildingGroup);
      
      try {
        // Load the GLB model
        const gltf = await new Promise<any>((resolve, reject) => {
          gltfLoaderRef.current.load(
            modelPath,
            resolve,
            (xhr) => {
              console.log(`${building.id} model ${Math.round(xhr.loaded / xhr.total * 100)}% loaded`);
            },
            reject
          );
        });
        
        // Add the loaded model to the group
        buildingGroup.add(gltf.scene);
        
        // Configure model for better rendering
        gltf.scene.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.needsUpdate = true;
              child.material.roughness = 0.7;
              child.material.metalness = 0.3;
              child.material.emissive.set(0x202020);
            }
          }
        });
        
        // Scale the model appropriately
        buildingGroup.scale.set(0.4, 0.4, 0.4);
        
        console.log(`Successfully loaded model for ${building.id}`);
      } catch (error) {
        console.error(`Failed to load model for ${building.id}:`, error);
        
        // Create a fallback cube if model loading fails
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshStandardMaterial({ 
          color: 0xD2B48C,
          roughness: 0.7,
          metalness: 0.2
        });
        
        const cube = new THREE.Mesh(geometry, material);
        cube.castShadow = true;
        cube.receiveShadow = true;
        
        buildingGroup.add(cube);
        
        // Add a label with the building type
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        
        if (context) {
          context.fillStyle = 'rgba(0, 0, 0, 0.8)';
          context.fillRect(0, 0, 256, 64);
          context.font = 'bold 24px Arial';
          context.fillStyle = 'white';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(building.type, 128, 32);
          
          const texture = new THREE.CanvasTexture(canvas);
          const labelMaterial = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true
          });
          
          const label = new THREE.Sprite(labelMaterial);
          label.position.set(0, 2, 0);
          label.scale.set(2, 0.5, 1);
          
          buildingGroup.add(label);
        }
      }
      
      // Add click handler
      if (camera && onBuildingClick) {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        
        const handleClick = (event: MouseEvent) => {
          // Calculate mouse position in normalized device coordinates
          const rect = (event.target as HTMLElement).getBoundingClientRect();
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          
          // Update the raycaster
          raycaster.setFromCamera(mouse, camera);
          
          // Check for intersections with this building
          const intersects = raycaster.intersectObject(buildingGroup, true);
          
          if (intersects.length > 0) {
            onBuildingClick(building.id);
          }
        };
        
        window.addEventListener('click', handleClick);
        
        // Store the event listener for cleanup
        buildingGroup.userData.clickHandler = handleClick;
      }
      
    } catch (error) {
      console.error(`Error creating building mesh for ${building.id}:`, error);
    }
  };
  
  // Function to update an existing building mesh
  const updateBuildingMesh = (mesh: THREE.Object3D, building: any) => {
    // Update position if needed
    if (building.position) {
      mesh.position.set(
        building.position.x,
        building.position.y || 0,
        building.position.z
      );
    }
    
    // Update rotation if needed
    if (building.rotation !== undefined) {
      mesh.rotation.y = building.rotation;
    }
    
    // Update metadata
    mesh.userData = {
      ...mesh.userData,
      buildingId: building.id,
      type: building.type,
      landId: building.land_id,
      owner: building.owner || building.created_by,
      position: building.position
    };
  };
  
  // Function to dispose of a mesh and its resources
  const disposeMesh = (mesh: THREE.Object3D) => {
    // Remove event listeners
    if (mesh.userData.clickHandler) {
      window.removeEventListener('click', mesh.userData.clickHandler);
    }
    
    // Dispose of geometries and materials
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(material => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  };
  
  // This component doesn't render anything directly
  return null;
};

// Wrap with error boundary for better error handling
export default function BuildingRendererWithErrorBoundary(props: BuildingRendererProps) {
  return (
    <ThreeDErrorBoundary>
      <BuildingRenderer {...props} />
    </ThreeDErrorBoundary>
  );
}
