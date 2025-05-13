import React, { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { eventBus, EventTypes } from '../eventBus';
import { BuildingService, BuildingData } from '../services/BuildingService';
import { getWalletAddress } from '../walletUtils';
import { useSceneReady } from './SceneReadyProvider';

// Define our local interface for building data during placement
export interface PlaceableBuildingData {
  id?: string;
  type: string;
  variant?: string;
  land_id: string;
  position: {
    x: number;
    y: number;
    z: number;
  } | {
    lat: number;
    lng: number;
  };
  rotation: number;
  created_by?: string;
}

export type PlaceableObjectType = 'building' | 'dock' | 'road';

export interface PlaceableObjectManagerProps {
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  polygons?: any[];
  active: boolean;
  type: PlaceableObjectType;
  objectData: {
    name?: string;
    variant?: string;
    // Other type-specific properties
  };
  constraints?: {
    requireWaterEdge?: boolean;
    requireLandOwnership?: boolean;
    requireAdminPermission?: boolean;
    snapToRoad?: boolean;
    // Other constraint flags
  };
  onComplete?: (data: any) => void;
  onCancel?: () => void;
}

/**
 * Unified component for placing objects (buildings, docks, roads, etc.)
 * This component handles the UI and interaction for placing objects in the 3D world.
 */
const PlaceableObjectManager: React.FC<PlaceableObjectManagerProps> = ({
  scene: propScene,
  camera: propCamera,
  polygons,
  active,
  type,
  objectData,
  constraints = {
    requireWaterEdge: type === 'dock',
    requireLandOwnership: type === 'building',
    requireAdminPermission: type === 'dock'
  },
  onComplete,
  onCancel
}) => {
  // Use SceneReady hook to get scene and camera if not provided
  const { isSceneReady, scene: readyScene, camera: readyCamera } = useSceneReady();
  
  // Use provided scene/camera or ones from SceneReady
  const scene = propScene || readyScene;
  const camera = propCamera || readyCamera;
  
  // State for placement
  const [isPlacing, setIsPlacing] = useState<boolean>(active);
  const [isValid, setIsValid] = useState<boolean>(false);
  const [rotation, setRotation] = useState<number>(0);
  const [position, setPosition] = useState<THREE.Vector3 | null>(null);
  const [landId, setLandId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Refs for Three.js objects
  const previewMeshRef = useRef<THREE.Object3D | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const helperRef = useRef<THREE.Line | null>(null);
  
  // Refs for services
  const buildingServiceRef = useRef(BuildingService.getInstance());
  
  // Initialize placement
  useEffect(() => {
    if (!active || !scene || !camera) return;
    
    console.log(`PlaceableObjectManager: Initializing placement for ${type}`);
    setIsPlacing(true);
    
    // Create preview mesh based on object type
    createPreviewMesh();
    
    // Add event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);
    
    // Clean up on unmount
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
      
      // Remove preview mesh
      if (previewMeshRef.current && scene) {
        scene.remove(previewMeshRef.current);
        
        // Dispose of geometries and materials
        if (previewMeshRef.current instanceof THREE.Mesh) {
          if (previewMeshRef.current.geometry) {
            previewMeshRef.current.geometry.dispose();
          }
          
          if (previewMeshRef.current.material) {
            if (Array.isArray(previewMeshRef.current.material)) {
              previewMeshRef.current.material.forEach(material => material.dispose());
            } else {
              previewMeshRef.current.material.dispose();
            }
          }
        }
        
        previewMeshRef.current = null;
      }
      
      // Remove helper line
      if (helperRef.current && scene) {
        scene.remove(helperRef.current);
        helperRef.current.geometry.dispose();
        if (helperRef.current.material instanceof THREE.Material) {
          helperRef.current.material.dispose();
        }
        helperRef.current = null;
      }
    };
  }, [active, scene, camera, type, objectData]);
  
  // Create preview mesh
  const createPreviewMesh = () => {
    if (!scene) return;
    
    // Remove existing preview mesh
    if (previewMeshRef.current) {
      scene.remove(previewMeshRef.current);
      previewMeshRef.current = null;
    }
    
    // Create a simple box for building preview as fallback
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshBasicMaterial({
      color: type === 'dock' ? 0x3b82f6 : 0xf59e0b, // Blue for docks, amber for buildings
      transparent: true,
      opacity: 0.5,
      wireframe: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.5; // Position at half height
    
    // Add a label with the object name
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = 'rgba(0, 0, 0, 0.7)';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'white';
      context.font = 'bold 24px Arial';
      context.textAlign = 'center';
      context.fillText(objectData.name || type, canvas.width / 2, 40);
      
      const texture = new THREE.CanvasTexture(canvas);
      const labelMaterial = new THREE.SpriteMaterial({ map: texture });
      const label = new THREE.Sprite(labelMaterial);
      label.position.set(0, 2, 0);
      label.scale.set(5, 1.25, 1);
      
      mesh.add(label);
    }
    
    // Add to scene
    scene.add(mesh);
    previewMeshRef.current = mesh;
    
    // If this is a building with a name, try to load the actual model
    if (type === 'building' && objectData.name) {
      // Fix the model path - ensure it uses the correct format for the path
      // Normalize the building name (remove apostrophes, replace spaces with hyphens)
      const normalizedName = objectData.name.toLowerCase().replace(/'/g, '').replace(/\s+/g, '-');
      const modelPath = `/models/buildings/${normalizedName}/${objectData.variant || 'model'}.glb`;
        
      console.log(`Attempting to load building model from: ${modelPath}`);
        
      // Load the actual building model
      const gltfLoader = new GLTFLoader();
      gltfLoader.load(
        modelPath,
        (gltf) => {
          // Remove the temporary preview mesh
          if (previewMeshRef.current && scene) {
            scene.remove(previewMeshRef.current);
            if (previewMeshRef.current instanceof THREE.Mesh) {
              previewMeshRef.current.geometry.dispose();
              if (previewMeshRef.current.material instanceof THREE.Material) {
                previewMeshRef.current.material.dispose();
              } else if (Array.isArray(previewMeshRef.current.material)) {
                previewMeshRef.current.material.forEach(mat => mat.dispose());
              }
            }
          }
            
          // Use the loaded model as the preview
          const model = gltf.scene;
            
          // Make the model semi-transparent
          model.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(mat => {
                  mat.transparent = true;
                  mat.opacity = 0.7;
                });
              } else {
                child.material.transparent = true;
                child.material.opacity = 0.7;
              }
            }
          });
            
          // Add the model to the scene
          model.visible = false;
          scene.add(model);
          previewMeshRef.current = model;
            
          console.log(`Successfully loaded building model for ${objectData.name}`);
        },
        undefined,
        (error) => {
          console.error(`Error loading building model: ${error instanceof Error ? error.message : String(error)}`);
          // Keep using the simple box preview if model loading fails
        }
      );
    }
    
    // Create helper line for placement guidance
    const edgeGeometry = new THREE.BufferGeometry();
    const edgeMaterial = new THREE.LineBasicMaterial({ 
      color: type === 'dock' ? 0x3b82f6 : 0xf59e0b 
    });
    const edgeLine = new THREE.Line(edgeGeometry, edgeMaterial);
    edgeLine.visible = false;
    scene.add(edgeLine);
    helperRef.current = edgeLine;
  };
  
  // Update preview mesh color based on validity
  const updatePreviewMeshColor = (valid: boolean) => {
    if (!previewMeshRef.current) return;
    
    // Update color based on validity
    if (previewMeshRef.current instanceof THREE.Mesh) {
      const material = previewMeshRef.current.material;
      
      if (Array.isArray(material)) {
        material.forEach(mat => {
          if (mat instanceof THREE.MeshBasicMaterial) {
            mat.color.set(valid ? (type === 'dock' ? 0x3b82f6 : 0xf59e0b) : 0xff0000);
          }
        });
      } else if (material instanceof THREE.MeshBasicMaterial) {
        material.color.set(valid ? (type === 'dock' ? 0x3b82f6 : 0xf59e0b) : 0xff0000);
      }
    } else if (previewMeshRef.current.type === "Group" || previewMeshRef.current.type === "Object3D") {
      // For GLTF models, update opacity based on validity
      previewMeshRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => {
              mat.opacity = valid ? 0.7 : 0.3;
              mat.color = new THREE.Color(valid ? 0xffffff : 0xff0000);
            });
          } else {
            child.material.opacity = valid ? 0.7 : 0.3;
            child.material.color = new THREE.Color(valid ? 0xffffff : 0xff0000);
          }
        }
      });
    }
  };
  
  // Handle mouse move
  const handleMouseMove = (event: MouseEvent) => {
    if (!isPlacing || !scene || !camera) return;
    
    // Calculate mouse position in normalized device coordinates
    mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Update raycaster
    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    
    // Find intersections with the ground plane
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectionPoint = new THREE.Vector3();
    raycasterRef.current.ray.intersectPlane(groundPlane, intersectionPoint);
    
    if (intersectionPoint) {
      // Find placement info based on object type
      let placementInfo;
      
      if (type === 'dock') {
        placementInfo = findWaterEdgeAtPosition(intersectionPoint);
      } else {
        // For buildings and other objects, find land at position
        placementInfo = findLandAtPosition(intersectionPoint);
      }
      
      if (placementInfo.position && placementInfo.landId) {
        // Update preview mesh position
        if (previewMeshRef.current) {
          previewMeshRef.current.position.copy(placementInfo.position);
          previewMeshRef.current.rotation.y = rotation;
          previewMeshRef.current.visible = true;
        }
        
        // Update helper
        if (helperRef.current) {
          const points = placementInfo.outline || placementInfo.edge ? 
            (placementInfo.outline ? 
              placementInfo.outline.map((p: any) => new THREE.Vector3(p.x, 0.05, p.z)) : 
              [placementInfo.edge.start, placementInfo.edge.end]
            ) : [];
          
          if (points.length > 0) {
            const geometry = helperRef.current.geometry;
            geometry.setFromPoints(points);
            helperRef.current.visible = true;
          } else {
            helperRef.current.visible = false;
          }
        }
        
        // Update state
        setPosition(placementInfo.position);
        setLandId(placementInfo.landId);
        setIsValid(placementInfo.isValid);
        setErrorMessage(placementInfo.errorMessage || null);
        
        // Update preview mesh color based on validity
        updatePreviewMeshColor(placementInfo.isValid);
      } else {
        // Hide preview if no valid placement found
        if (previewMeshRef.current) {
          previewMeshRef.current.visible = false;
        }
        if (helperRef.current) {
          helperRef.current.visible = false;
        }
        
        setPosition(null);
        setLandId(null);
        setIsValid(false);
        setErrorMessage(placementInfo.errorMessage || "Invalid placement location");
      }
    }
  };
  
  // Handle click
  const handleClick = (event: MouseEvent) => {
    // Only handle left clicks
    if (event.button !== 0) return;
    
    // Only place if we have a valid position
    if (isPlacing && isValid && position && landId) {
      placeObject();
    } else if (errorMessage) {
      // Show error message
      console.warn(`Cannot place object: ${errorMessage}`);
    }
  };
  
  // Handle context menu (right click)
  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    cancelPlacement();
  };
  
  // Handle key down
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isPlacing) return;
    
    // Escape to cancel
    if (event.key === 'Escape') {
      cancelPlacement();
    }
    
    // R to rotate
    if (event.key === 'r' || event.key === 'R') {
      rotateObject();
    }
  };
  
  // Rotate object
  const rotateObject = () => {
    // Rotate by 45 degrees
    const newRotation = (rotation + Math.PI / 4) % (Math.PI * 2);
    setRotation(newRotation);
    
    // Update preview mesh rotation
    if (previewMeshRef.current) {
      previewMeshRef.current.rotation.y = newRotation;
    }
  };
  
  // Place object
  const placeObject = async () => {
    if (!position || !isValid || !landId) return;
    
    try {
      // Get the current wallet address
      const walletAddress = getWalletAddress();
      
      if (!walletAddress) {
        alert('Please connect your wallet first');
        return;
      }
      
      // Create object data based on type
      if (type === 'building') {
        // Create building data
        const buildingData: PlaceableBuildingData = {
          type: objectData.name || 'unknown',
          land_id: landId,
          position: {
            x: position.x,
            y: position.y,
            z: position.z
          },
          rotation: rotation,
          variant: objectData.variant || 'model',
          created_by: walletAddress
        };
        
        // Save building
        const placedObject = await buildingServiceRef.current.saveBuilding(buildingData as BuildingData);
        
        // Emit building placed event
        eventBus.emit(EventTypes.BUILDING_PLACED, {
          buildingId: placedObject.id,
          type: objectData.name,
          variant: objectData.variant || 'model',
          data: placedObject
        });
        
        // Call onComplete callback
        if (onComplete) {
          onComplete(placedObject);
        }
      } else if (type === 'dock') {
        // Create dock data
        const dockData = {
          type: 'dock',
          land_id: landId,
          position: {
            x: position.x,
            y: position.y,
            z: position.z
          },
          rotation: rotation,
          created_by: walletAddress
        };
        
        // Save dock (using building API for now)
        const placedObject = await buildingServiceRef.current.saveBuilding(dockData as BuildingData);
        
        // Emit dock placed event
        eventBus.emit('DOCK_PLACED', {
          dockId: placedObject.id,
          type: 'dock',
          data: placedObject
        });
        
        // Call onComplete callback
        if (onComplete) {
          onComplete(placedObject);
        }
      } else if (type === 'road') {
        // Road placement would be handled here
        console.log('Road placement not yet implemented');
      }
      
      // End placement
      setIsPlacing(false);
    } catch (error) {
      console.error(`Error placing ${type}:`, error);
      setErrorMessage(`Failed to place ${type}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Cancel placement
  const cancelPlacement = () => {
    setIsPlacing(false);
    
    // Call onCancel callback
    if (onCancel) {
      onCancel();
    }
  };
  
  // Find land at position (for buildings)
  const findLandAtPosition = (position: THREE.Vector3) => {
    if (!polygons) {
      return {
        position: null,
        landId: null,
        isValid: false,
        errorMessage: "No land data available"
      };
    }
    
    for (const polygon of polygons) {
      // Check if position is inside this polygon
      if (isPointInPolygon(position, polygon)) {
        // Check if the user owns this land
        const isOwned = checkLandOwnership(polygon.id);
        
        return {
          position: new THREE.Vector3(position.x, 0, position.z),
          landId: polygon.id,
          outline: polygon.vertices,
          isValid: isOwned || !constraints.requireLandOwnership,
          errorMessage: isOwned ? null : "You don't own this land"
        };
      }
    }
    
    return {
      position: null,
      landId: null,
      isValid: false,
      errorMessage: "Not on valid land"
    };
  };
  
  // Find water edge at position (for docks)
  const findWaterEdgeAtPosition = (position: THREE.Vector3) => {
    if (!polygons) {
      return {
        position: null,
        landId: null,
        isValid: false,
        errorMessage: "No land data available"
      };
    }
    
    // This is a simplified implementation
    // In a real implementation, this would find the closest water edge
    
    // For now, just return the position as valid
    return {
      position: position,
      landId: "water_edge",
      isValid: true,
      edge: {
        start: new THREE.Vector3(position.x - 1, 0.1, position.z),
        end: new THREE.Vector3(position.x + 1, 0.1, position.z)
      }
    };
  };
  
  // Check if a point is inside a polygon
  const isPointInPolygon = (point: THREE.Vector3, polygon: any) => {
    // Simple implementation of point-in-polygon algorithm
    const vertices = polygon.vertices || [];
    if (vertices.length < 3) return false;
    
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x;
      const zi = vertices[i].z;
      const xj = vertices[j].x;
      const zj = vertices[j].z;
      
      const intersect = ((zi > point.z) !== (zj > point.z)) &&
        (point.x < (xj - xi) * (point.z - zi) / (zj - zi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  };
  
  // Check if the user owns the land
  const checkLandOwnership = (landId: string) => {
    // In a real implementation, this would check against actual ownership data
    // For now, we'll assume the user owns all land for demonstration purposes
    return true;
  };
  
  // Render UI controls
  return (
    <div className="absolute bottom-20 left-4 bg-white bg-opacity-90 p-4 rounded-lg shadow-lg z-30">
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {type.charAt(0).toUpperCase() + type.slice(1)} Placement
      </h3>
      
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Rotation
        </label>
        <input
          type="range"
          min="0"
          max={Math.PI * 2}
          step="0.1"
          value={rotation}
          onChange={(e) => setRotation(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>
      
      {errorMessage && (
        <div className="mb-2 text-sm text-red-600 bg-red-100 p-2 rounded">
          {errorMessage}
        </div>
      )}
      
      <div className="flex space-x-2">
        <button
          onClick={placeObject}
          disabled={!isValid}
          className={`px-4 py-2 rounded-md ${
            isValid
              ? (type === 'dock' 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-amber-600 text-white hover:bg-amber-700')
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Place {type.charAt(0).toUpperCase() + type.slice(1)}
        </button>
        
        <button
          onClick={cancelPlacement}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
      
      <div className="mt-2 text-xs text-gray-500">
        {isValid
          ? `Position valid. Click to place the ${type}.`
          : type === 'dock'
            ? 'Move cursor to a water edge to place dock.'
            : 'Move cursor to a land parcel you own to place building.'
        }
        <br />
        <span className="italic">Press R to rotate, Escape to cancel</span>
      </div>
    </div>
  );
};

export default PlaceableObjectManager;
