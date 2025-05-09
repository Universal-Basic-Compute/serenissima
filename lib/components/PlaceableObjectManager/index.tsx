import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { BuildingService } from '@/lib/services/BuildingService';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';
import { getWalletAddress } from '@/lib/walletUtils';

export type PlaceableObjectType = 'building' | 'dock';

export interface PlaceableObjectProps {
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
    // Other constraint flags
  };
  onComplete: (objectData: any) => void;
  onCancel: () => void;
}

/**
 * Unified component for creating placeable objects (buildings, docks, etc.)
 */
const PlaceableObjectManager: React.FC<PlaceableObjectProps> = ({
  scene,
  camera,
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
  // State for object placement
  const [previewPosition, setPreviewPosition] = useState<THREE.Vector3 | null>(null);
  const [landId, setLandId] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [isValidPlacement, setIsValidPlacement] = useState<boolean>(false);
  
  // Refs for Three.js objects
  const previewMeshRef = useRef<THREE.Mesh | null>(null);
  const helperRef = useRef<THREE.Line | null>(null);
  
  // Get actual scene and camera if not provided
  const actualScene = scene || (document.querySelector('canvas')?.__scene as THREE.Scene);
  const actualCamera = camera || (document.querySelector('canvas')?.__camera as THREE.PerspectiveCamera);
  
  // Initialize preview mesh and event listeners
  useEffect(() => {
    if (!active || !actualScene || !actualCamera) return;
    
    console.log(`PlaceableObjectManager: Initializing for ${type}`);
    
    // Create preview mesh based on object type
    let geometry: THREE.BufferGeometry;
    let material: THREE.Material;
    
    if (type === 'dock') {
      // Dock preview - simple box but longer and thinner
      geometry = new THREE.BoxGeometry(2, 0.5, 4);
      material = new THREE.MeshBasicMaterial({
        color: 0x3b82f6, // Blue color for docks
        transparent: true,
        opacity: 0.7,
        wireframe: false
      });
    } else {
      // Building preview - simple box
      geometry = new THREE.BoxGeometry(2, 1, 2);
      material = new THREE.MeshBasicMaterial({
        color: 0xf59e0b, // Amber color for buildings
        transparent: true,
        opacity: 0.7,
        wireframe: false
      });
    }
    
    const previewMesh = new THREE.Mesh(geometry, material);
    previewMesh.position.y = type === 'dock' ? 0.25 : 0.5; // Docks slightly lower than buildings
    previewMesh.visible = false;
    actualScene.add(previewMesh);
    previewMeshRef.current = previewMesh;
    
    // Create helper line
    const edgeGeometry = new THREE.BufferGeometry();
    const edgeMaterial = new THREE.LineBasicMaterial({ 
      color: type === 'dock' ? 0x00ffff : 0xf59e0b 
    });
    const edgeLine = new THREE.Line(edgeGeometry, edgeMaterial);
    edgeLine.visible = false;
    actualScene.add(edgeLine);
    helperRef.current = edgeLine;
    
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
        // Find placement info based on object type
        let placementInfo;
        
        if (constraints?.requireWaterEdge) {
          // For docks, find nearest water edge
          placementInfo = findNearestWaterEdge(target, polygons);
        } else {
          // For buildings, find land at position
          placementInfo = findLandAtPosition(target, polygons);
        }
        
        if (placementInfo.position && placementInfo.landId) {
          // Update preview mesh position
          if (previewMeshRef.current) {
            previewMeshRef.current.position.copy(placementInfo.position);
            previewMeshRef.current.rotation.y = rotation;
            previewMeshRef.current.visible = true;
            
            // Update material color based on validity
            const material = previewMeshRef.current.material as THREE.MeshBasicMaterial;
            material.color.set(placementInfo.isValid ? (type === 'dock' ? 0x3b82f6 : 0xf59e0b) : 0xff0000);
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
          setPreviewPosition(placementInfo.position);
          setLandId(placementInfo.landId);
          setIsValidPlacement(placementInfo.isValid);
        } else {
          // Hide preview if no valid placement found
          if (previewMeshRef.current) {
            previewMeshRef.current.visible = false;
          }
          if (helperRef.current) {
            helperRef.current.visible = false;
          }
          
          setPreviewPosition(null);
          setLandId(null);
          setIsValidPlacement(false);
        }
      }
    };
    
    // Click handler for placing the object
    const handleClick = (event: MouseEvent) => {
      // Only handle left clicks
      if (event.button !== 0) return;
      
      // Only place if we have a valid position
      if (isValidPlacement && previewPosition && landId) {
        placeObject();
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
      
      if (helperRef.current) {
        actualScene.remove(helperRef.current);
        helperRef.current.geometry.dispose();
        (helperRef.current.material as THREE.Material).dispose();
        helperRef.current = null;
      }
    };
  }, [active, actualScene, actualCamera, polygons, rotation, type, constraints, onCancel]);
  
  // Function to find nearest water edge (for docks)
  const findNearestWaterEdge = (position: THREE.Vector3, polygons: any[]) => {
    let closestEdge = null;
    let closestDistance = Infinity;
    let closestLandId = null;
    let closestPoint = null;
    
    for (const polygon of polygons) {
      const waterEdges = getWaterEdges(polygon);
      
      for (const edge of waterEdges) {
        const point = getClosestPointOnEdge(edge.start, edge.end, position);
        const distance = position.distanceTo(point);
        
        if (distance < closestDistance && distance < 10) { // Only consider edges within 10 units
          closestDistance = distance;
          closestEdge = edge;
          closestLandId = polygon.id;
          closestPoint = point;
        }
      }
    }
    
    // Check if admin permission is required
    let isValid = closestDistance < 5; // Consider valid if within 5 units
    
    if (isValid && constraints?.requireAdminPermission) {
      isValid = checkAdminPermission();
    }
    
    return {
      position: closestPoint,
      landId: closestLandId,
      edge: closestEdge,
      isValid: isValid
    };
  };
  
  // Function to get water edges of a polygon
  const getWaterEdges = (polygon: any) => {
    const waterEdges = [];
    const vertices = polygon.vertices || [];
    
    // Check each edge to see if it's a water edge (not shared with another polygon)
    for (let i = 0; i < vertices.length; i++) {
      const start = vertices[i];
      const end = vertices[(i + 1) % vertices.length];
      
      // Simple check: if this edge is not shared with another polygon, it's a water edge
      // In a real implementation, this would check against all other polygons
      const isWaterEdge = true; // Simplified for this example
      
      if (isWaterEdge) {
        waterEdges.push({
          start: new THREE.Vector3(start.x, 0, start.z),
          end: new THREE.Vector3(end.x, 0, end.z)
        });
      }
    }
    
    return waterEdges;
  };
  
  // Function to get the closest point on an edge
  const getClosestPointOnEdge = (start: THREE.Vector3, end: THREE.Vector3, point: THREE.Vector3) => {
    const edge = new THREE.Line3(start, end);
    const closestPoint = new THREE.Vector3();
    edge.closestPointToPoint(point, true, closestPoint);
    return closestPoint;
  };
  
  // Function to find land at a position (for buildings)
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
  
  // Function to check if the user has admin permission
  const checkAdminPermission = () => {
    // Get user profile from localStorage
    const userProfileStr = localStorage.getItem('userProfile');
    if (!userProfileStr) {
      return false;
    }
    
    const userProfile = JSON.parse(userProfileStr);
    return userProfile.username === 'ConsiglioDeiDieci';
  };
  
  // Function to place the object
  const placeObject = async () => {
    if (!previewPosition || !landId) return;
    
    try {
      // Get the current wallet address
      const walletAddress = getWalletAddress();
      
      if (!walletAddress) {
        alert('Please connect your wallet first');
        return;
      }
      
      const buildingService = BuildingService.getInstance();
      let objectData;
      
      if (type === 'dock') {
        // Create a dock
        objectData = await buildingService.createDock(
          landId,
          previewPosition,
          rotation
        );
        
        console.log('Dock created:', objectData);
        
        // Emit event for dock creation
        eventBus.emit(EventTypes.DOCK_PLACED, {
          dockId: objectData.id,
          type: 'dock',
          data: objectData
        });
      } else {
        // Create a building
        objectData = await buildingService.saveBuilding({
          type: objectData.name,
          variant: objectData.variant || 'model',
          land_id: landId,
          position: {
            x: previewPosition.x,
            y: previewPosition.y,
            z: previewPosition.z
          },
          rotation: rotation,
          created_by: walletAddress
        });
        
        console.log('Building created:', objectData);
        
        // Emit event for building creation
        eventBus.emit(EventTypes.BUILDING_PLACED, {
          buildingId: objectData.id,
          type: objectData.name,
          variant: objectData.variant || 'model',
          data: objectData
        });
      }
      
      // Call onComplete callback
      onComplete(objectData);
    } catch (error) {
      console.error(`Error creating ${type}:`, error);
      alert(`Failed to create ${type}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Render UI controls
  return (
    <div className="absolute bottom-20 left-4 bg-white bg-opacity-90 p-4 rounded-lg shadow-lg z-30">
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {type === 'dock' ? 'Dock' : 'Building'} Placement
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
      
      <div className="flex space-x-2">
        <button
          onClick={() => {
            if (isValidPlacement && previewPosition && landId) {
              placeObject();
            } else {
              if (type === 'dock') {
                alert('Please position the dock along a valid water edge');
              } else {
                alert('Please position the building on a valid land parcel that you own');
              }
            }
          }}
          disabled={!isValidPlacement}
          className={`px-4 py-2 rounded-md ${
            isValidPlacement
              ? (type === 'dock' 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-amber-600 text-white hover:bg-amber-700')
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Place {type === 'dock' ? 'Dock' : 'Building'}
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
          ? `Position valid. Click to place the ${type}.`
          : type === 'dock'
            ? 'Move cursor to a water edge to place dock.'
            : 'Move cursor to a land parcel you own to place building.'
        }
      </div>
    </div>
  );
};

export default PlaceableObjectManager;
