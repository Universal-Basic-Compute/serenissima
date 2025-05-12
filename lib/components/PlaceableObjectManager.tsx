import React, { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { eventBus, EventTypes } from '../eventBus';
import { getBuildingService } from '../services/BuildingService';
import { getDockService } from '../services/DockService';

interface PlaceableObjectManagerProps {
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  polygons?: any[];
  active: boolean;
  type: 'building' | 'dock';
  objectData: any;
  constraints?: {
    requireLandOwnership?: boolean;
    allowWaterPlacement?: boolean;
    snapToRoad?: boolean;
    snapToWater?: boolean;
  };
  onComplete?: (data: any) => void;
  onCancel?: () => void;
}

/**
 * Component for managing placeable objects (buildings, docks, etc.)
 */
const PlaceableObjectManager: React.FC<PlaceableObjectManagerProps> = ({
  scene,
  camera,
  polygons,
  active,
  type,
  objectData,
  constraints = {},
  onComplete,
  onCancel
}) => {
  // State for placement
  const [isPlacing, setIsPlacing] = useState<boolean>(active);
  const [isValid, setIsValid] = useState<boolean>(false);
  const [rotation, setRotation] = useState<number>(0);
  const [position, setPosition] = useState<THREE.Vector3 | null>(null);
  const [landId, setLandId] = useState<string | null>(null);
  
  // Refs for Three.js objects
  const previewMeshRef = useRef<THREE.Object3D | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  
  // Refs for services
  const buildingServiceRef = useRef(getBuildingService());
  const dockServiceRef = useRef(getDockService());
  
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
    
    // Clean up on unmount
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
      
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
    };
  }, [active, scene, camera, type, objectData]);
  
  // Create preview mesh based on object type
  const createPreviewMesh = () => {
    if (!scene) return;
    
    // Remove existing preview mesh
    if (previewMeshRef.current) {
      scene.remove(previewMeshRef.current);
      previewMeshRef.current = null;
    }
    
    let mesh: THREE.Object3D;
    
    // Create mesh based on object type
    if (type === 'building') {
      // Create a simple box for building preview
      const geometry = new THREE.BoxGeometry(2, 2, 2);
      const material = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.5,
        wireframe: true
      });
      mesh = new THREE.Mesh(geometry, material);
      
      // Add a label with the building name
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = 'white';
        context.font = '24px Arial';
        context.fillText(objectData.name, 10, 40);
        
        const texture = new THREE.CanvasTexture(canvas);
        const labelMaterial = new THREE.SpriteMaterial({ map: texture });
        const label = new THREE.Sprite(labelMaterial);
        label.position.set(0, 2, 0);
        label.scale.set(5, 1.25, 1);
        
        mesh.add(label);
      }
    } else if (type === 'dock') {
      // Create a simple platform for dock preview
      const geometry = new THREE.BoxGeometry(4, 0.5, 8);
      const material = new THREE.MeshBasicMaterial({
        color: 0x0088ff,
        transparent: true,
        opacity: 0.5,
        wireframe: true
      });
      mesh = new THREE.Mesh(geometry, material);
      
      // Add a label
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = 'white';
        context.font = '24px Arial';
        context.fillText('Dock', 10, 40);
        
        const texture = new THREE.CanvasTexture(canvas);
        const labelMaterial = new THREE.SpriteMaterial({ map: texture });
        const label = new THREE.Sprite(labelMaterial);
        label.position.set(0, 2, 0);
        label.scale.set(5, 1.25, 1);
        
        mesh.add(label);
      }
    } else {
      // Default fallback
      const geometry = new THREE.SphereGeometry(1, 16, 16);
      const material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.5,
        wireframe: true
      });
      mesh = new THREE.Mesh(geometry, material);
    }
    
    // Add to scene
    scene.add(mesh);
    previewMeshRef.current = mesh;
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
            mat.color.set(valid ? 0x00ff00 : 0xff0000);
          }
        });
      } else if (material instanceof THREE.MeshBasicMaterial) {
        material.color.set(valid ? 0x00ff00 : 0xff0000);
      }
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
    
    // Update position
    setPosition(intersectionPoint);
    
    // Update preview mesh position
    if (previewMeshRef.current) {
      previewMeshRef.current.position.copy(intersectionPoint);
      previewMeshRef.current.rotation.y = rotation;
    }
    
    // Check if position is valid
    const valid = checkPositionValidity(intersectionPoint);
    setIsValid(valid);
    updatePreviewMeshColor(valid);
    
    // Find land ID at position
    const landIdAtPosition = findLandIdAtPosition(intersectionPoint);
    setLandId(landIdAtPosition);
  };
  
  // Handle click
  const handleClick = (event: MouseEvent) => {
    if (!isPlacing || !position || !isValid) return;
    
    // Left click to place
    if (event.button === 0) {
      placeObject();
    }
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
      let placedObject;
      
      // Place object based on type
      if (type === 'building') {
        // Create building data
        const buildingData = {
          type: objectData.name,
          land_id: landId,
          position: {
            x: position.x,
            y: position.y,
            z: position.z
          },
          rotation: rotation,
          variant: objectData.variant || 'model'
        };
        
        // Save building
        placedObject = await buildingServiceRef.current.saveBuilding(buildingData);
      } else if (type === 'dock') {
        // Create dock
        placedObject = await dockServiceRef.current.createDock(
          landId,
          position,
          rotation
        );
      }
      
      // Call onComplete callback
      if (onComplete && placedObject) {
        onComplete(placedObject);
      }
      
      // End placement
      setIsPlacing(false);
    } catch (error) {
      console.error(`Error placing ${type}:`, error);
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
  
  // Check if position is valid
  const checkPositionValidity = (position: THREE.Vector3): boolean => {
    // Check if position is on land
    const landIdAtPosition = findLandIdAtPosition(position);
    
    if (!landIdAtPosition) {
      return false;
    }
    
    // Check if land is owned by the player
    if (constraints.requireLandOwnership) {
      const isOwnedByPlayer = checkLandOwnership(landIdAtPosition);
      
      if (!isOwnedByPlayer) {
        return false;
      }
    }
    
    // Check type-specific constraints
    if (type === 'dock') {
      // Docks should be placed at water edges
      return checkDockPlacementValidity(position);
    }
    
    return true;
  };
  
  // Find land ID at position
  const findLandIdAtPosition = (position: THREE.Vector3): string | null => {
    if (!polygons) return null;
    
    // Simple implementation: find the closest polygon
    // In a real implementation, this would use point-in-polygon tests
    
    let closestPolygon = null;
    let closestDistance = Infinity;
    
    polygons.forEach(polygon => {
      if (polygon.centroid) {
        const centroidPosition = new THREE.Vector3(
          polygon.centroid.x,
          0,
          polygon.centroid.z
        );
        
        const distance = position.distanceTo(centroidPosition);
        
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPolygon = polygon;
        }
      }
    });
    
    // Check if the closest polygon is within a reasonable distance
    if (closestPolygon && closestDistance < 50) {
      return closestPolygon.id;
    }
    
    return null;
  };
  
  // Check if land is owned by the player
  const checkLandOwnership = (landId: string): boolean => {
    // This is a placeholder implementation
    // In a real application, this would check if the land is owned by the player
    
    // For now, just return true
    return true;
  };
  
  // Check if dock placement is valid
  const checkDockPlacementValidity = (position: THREE.Vector3): boolean => {
    // This is a placeholder implementation
    // In a real application, this would check if the position is at a water edge
    
    // For now, just return true
    return true;
  };
  
  // Render nothing - this is a non-visual component
  return null;
};

export default PlaceableObjectManager;
