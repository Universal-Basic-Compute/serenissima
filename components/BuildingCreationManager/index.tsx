import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { BuildingService } from '@/lib/services/BuildingService';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';
import { getWalletAddress } from '@/lib/walletUtils';

interface BuildingCreationManagerProps {
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  polygons?: any[];
  active: boolean;
  buildingName: string;
  variant?: string;
  onComplete: (buildingData: any) => void;
  onCancel: () => void;
}

/**
 * Component for creating buildings on land parcels
 */
const BuildingCreationManager: React.FC<BuildingCreationManagerProps> = ({
  scene,
  camera,
  polygons,
  active,
  buildingName,
  variant = 'model',
  onComplete,
  onCancel
}) => {
  // State for building placement
  const [previewPosition, setPreviewPosition] = useState<THREE.Vector3 | null>(null);
  const [landId, setLandId] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [isValidPlacement, setIsValidPlacement] = useState<boolean>(false);
  
  // Refs for Three.js objects
  const previewMeshRef = useRef<THREE.Mesh | null>(null);
  const landHelperRef = useRef<THREE.Line | null>(null);
  
  // Get actual scene and camera if not provided
  const actualScene = scene || (document.querySelector('canvas')?.__scene as THREE.Scene);
  const actualCamera = camera || (document.querySelector('canvas')?.__camera as THREE.PerspectiveCamera);
  
  // Initialize preview mesh and event listeners
  useEffect(() => {
    if (!active || !actualScene || !actualCamera) return;
    
    console.log('BuildingCreationManager: Initializing');
    
    // Create preview mesh - simple box as placeholder
    // In a real implementation, this would load the actual building model
    const geometry = new THREE.BoxGeometry(2, 1, 2); // Simple building shape
    const material = new THREE.MeshBasicMaterial({
      color: 0xf59e0b, // Amber color
      transparent: true,
      opacity: 0.7,
      wireframe: false
    });
    
    const previewMesh = new THREE.Mesh(geometry, material);
    previewMesh.position.y = 0.5; // Slightly above ground level
    previewMesh.visible = false;
    actualScene.add(previewMesh);
    previewMeshRef.current = previewMesh;
    
    // Create land helper line
    const edgeGeometry = new THREE.BufferGeometry();
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xf59e0b });
    const edgeLine = new THREE.Line(edgeGeometry, edgeMaterial);
    edgeLine.visible = false;
    actualScene.add(edgeLine);
    landHelperRef.current = edgeLine;
    
    // Mouse move handler
    const handleMouseMove = (event: MouseEvent) => {
      if (!actualCamera || !polygons) return;
      
      // Convert mouse position to normalized device coordinates
      const mouse = new THREE.Vector2();
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      // Raycasting to find intersection with ground plane
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, actualCamera);
      
      // Create a ground plane for raycasting
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const target = new THREE.Vector3();
      
      if (raycaster.ray.intersectPlane(groundPlane, target)) {
        // Find land parcel at this position
        const landInfo = findLandAtPosition(target, polygons);
        
        if (landInfo.position && landInfo.landId) {
          // Update preview mesh position
          if (previewMeshRef.current) {
            previewMeshRef.current.position.copy(landInfo.position);
            previewMeshRef.current.rotation.y = rotation;
            previewMeshRef.current.visible = true;
            
            // Update material color based on validity
            const material = previewMeshRef.current.material as THREE.MeshBasicMaterial;
            material.color.set(landInfo.isValid ? 0xf59e0b : 0xff0000);
          }
          
          // Update land helper
          if (landHelperRef.current && landInfo.outline) {
            const points = landInfo.outline.map(p => new THREE.Vector3(p.x, 0.05, p.z));
            const geometry = landHelperRef.current.geometry;
            geometry.setFromPoints(points);
            landHelperRef.current.visible = true;
          }
          
          // Update state
          setPreviewPosition(landInfo.position);
          setLandId(landInfo.landId);
          setIsValidPlacement(landInfo.isValid);
        } else {
          // Hide preview if no valid land found
          if (previewMeshRef.current) {
            previewMeshRef.current.visible = false;
          }
          if (landHelperRef.current) {
            landHelperRef.current.visible = false;
          }
          
          setPreviewPosition(null);
          setLandId(null);
          setIsValidPlacement(false);
        }
      }
    };
    
    // Click handler for placing the building
    const handleClick = (event: MouseEvent) => {
      // Only handle left clicks
      if (event.button !== 0) return;
      
      // Only place if we have a valid position
      if (isValidPlacement && previewPosition && landId) {
        placeBuilding();
      }
    };
    
    // Right-click handler for canceling
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      onCancel();
    };
    
    // Add event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    window.addEventListener('contextmenu', handleContextMenu);
    
    // Cleanup function
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('contextmenu', handleContextMenu);
      
      // Remove preview mesh and helper
      if (previewMeshRef.current) {
        actualScene.remove(previewMeshRef.current);
        previewMeshRef.current.geometry.dispose();
        (previewMeshRef.current.material as THREE.Material).dispose();
        previewMeshRef.current = null;
      }
      
      if (landHelperRef.current) {
        actualScene.remove(landHelperRef.current);
        landHelperRef.current.geometry.dispose();
        (landHelperRef.current.material as THREE.Material).dispose();
        landHelperRef.current = null;
      }
    };
  }, [active, actualScene, actualCamera, polygons, rotation, onCancel]);
  
  // Function to find land at a position
  const findLandAtPosition = (position: THREE.Vector3, polygons: any[]) => {
    for (const polygon of polygons) {
      // Check if position is inside this polygon
      if (isPointInPolygon(position, polygon)) {
        // Check if the user owns this land
        const isOwned = checkLandOwnership(polygon.id);
        
        return {
          position: new THREE.Vector3(position.x, 0, position.z),
          landId: polygon.id,
          outline: polygon.vertices,
          isValid: isOwned // Only valid if user owns the land
        };
      }
    }
    
    return {
      position: null,
      landId: null,
      outline: null,
      isValid: false
    };
  };
  
  // Function to check if a point is inside a polygon
  const isPointInPolygon = (point: THREE.Vector3, polygon: any) => {
    // Simple implementation of point-in-polygon algorithm
    // In a real implementation, this would be more robust
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
  
  // Function to check if the user owns the land
  const checkLandOwnership = (landId: string) => {
    // In a real implementation, this would check against actual ownership data
    // For now, we'll assume the user owns all land for demonstration purposes
    return true;
  };
  
  // Function to place the building
  const placeBuilding = async () => {
    if (!previewPosition || !landId) return;
    
    try {
      // Get the current wallet address
      const walletAddress = getWalletAddress();
      
      if (!walletAddress) {
        alert('Please connect your wallet first');
        return;
      }
      
      // Create the building using BuildingService
      const buildingService = new BuildingService();
      const buildingData = await buildingService.saveBuilding({
        type: buildingName,
        variant: variant,
        land_id: landId,
        position: {
          x: previewPosition.x,
          y: previewPosition.y,
          z: previewPosition.z
        },
        rotation: rotation,
        created_by: walletAddress
      });
      
      console.log('Building created:', buildingData);
      
      // Emit event for building creation
      eventBus.emit(EventTypes.BUILDING_PLACED, {
        buildingId: buildingData.id,
        type: buildingName,
        variant: variant,
        data: buildingData
      });
      
      // Call onComplete callback
      onComplete(buildingData);
    } catch (error) {
      console.error('Error creating building:', error);
      alert(`Failed to create building: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Render UI controls
  return (
    <div className="absolute bottom-20 left-4 bg-white bg-opacity-90 p-4 rounded-lg shadow-lg z-30">
      <h3 className="text-lg font-medium text-gray-900 mb-2">Building Placement</h3>
      
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
      
      <div className="flex space-x-2">
        <button
          onClick={() => {
            if (isValidPlacement && previewPosition && landId) {
              placeBuilding();
            } else {
              alert('Please position the building on a valid land parcel that you own');
            }
          }}
          disabled={!isValidPlacement}
          className={`px-4 py-2 rounded-md ${
            isValidPlacement
              ? 'bg-amber-600 text-white hover:bg-amber-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Place Building
        </button>
        
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
      
      <div className="mt-2 text-xs text-gray-500">
        {isValidPlacement
          ? 'Position valid. Click to place the building.'
          : 'Move cursor to a land parcel you own to place building.'}
      </div>
    </div>
  );
};

export default BuildingCreationManager;
