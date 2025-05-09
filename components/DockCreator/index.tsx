import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { BuildingService } from '@/lib/services/BuildingService';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';

interface DockCreatorProps {
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  polygons?: any[];
  active: boolean;
  onComplete: (dockData: any) => void;
  onCancel: () => void;
}

/**
 * Component for creating docks along water edges
 */
const DockCreator: React.FC<DockCreatorProps> = ({
  scene,
  camera,
  polygons,
  active,
  onComplete,
  onCancel
}) => {
  // State for dock placement
  const [previewPosition, setPreviewPosition] = useState<THREE.Vector3 | null>(null);
  const [adjacentLandId, setAdjacentLandId] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [isValidPlacement, setIsValidPlacement] = useState<boolean>(false);
  
  // Refs for Three.js objects
  const previewMeshRef = useRef<THREE.Mesh | null>(null);
  const waterEdgeHelperRef = useRef<THREE.Line | null>(null);
  
  // Get actual scene and camera if not provided
  const actualScene = scene || (document.querySelector('canvas')?.__scene as THREE.Scene);
  const actualCamera = camera || (document.querySelector('canvas')?.__camera as THREE.PerspectiveCamera);
  
  // Initialize preview mesh and event listeners
  useEffect(() => {
    if (!active || !actualScene || !actualCamera) return;
    
    console.log('DockCreator: Initializing');
    
    // Create preview mesh
    const geometry = new THREE.BoxGeometry(2, 0.5, 4); // Simple dock shape
    const material = new THREE.MeshBasicMaterial({
      color: 0x3b82f6, // Blue color
      transparent: true,
      opacity: 0.7,
      wireframe: false
    });
    
    const previewMesh = new THREE.Mesh(geometry, material);
    previewMesh.position.y = 0.25; // Slightly above water level
    previewMesh.visible = false;
    actualScene.add(previewMesh);
    previewMeshRef.current = previewMesh;
    
    // Create water edge helper line
    const edgeGeometry = new THREE.BufferGeometry();
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff });
    const edgeLine = new THREE.Line(edgeGeometry, edgeMaterial);
    edgeLine.visible = false;
    actualScene.add(edgeLine);
    waterEdgeHelperRef.current = edgeLine;
    
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
        // Find nearest water edge
        const waterEdgeInfo = findNearestWaterEdge(target, polygons);
        
        if (waterEdgeInfo.position && waterEdgeInfo.landId) {
          // Update preview mesh position
          if (previewMeshRef.current) {
            previewMeshRef.current.position.copy(waterEdgeInfo.position);
            previewMeshRef.current.rotation.y = rotation;
            previewMeshRef.current.visible = true;
            
            // Update material color based on validity
            const material = previewMeshRef.current.material as THREE.MeshBasicMaterial;
            material.color.set(waterEdgeInfo.isValid ? 0x3b82f6 : 0xff0000);
          }
          
          // Update water edge helper
          if (waterEdgeHelperRef.current && waterEdgeInfo.edge) {
            const points = [
              waterEdgeInfo.edge.start,
              waterEdgeInfo.edge.end
            ];
            const geometry = waterEdgeHelperRef.current.geometry;
            geometry.setFromPoints(points);
            waterEdgeHelperRef.current.visible = true;
          }
          
          // Update state
          setPreviewPosition(waterEdgeInfo.position);
          setAdjacentLandId(waterEdgeInfo.landId);
          setIsValidPlacement(waterEdgeInfo.isValid);
        } else {
          // Hide preview if no valid water edge found
          if (previewMeshRef.current) {
            previewMeshRef.current.visible = false;
          }
          if (waterEdgeHelperRef.current) {
            waterEdgeHelperRef.current.visible = false;
          }
          
          setPreviewPosition(null);
          setAdjacentLandId(null);
          setIsValidPlacement(false);
        }
      }
    };
    
    // Click handler for placing the dock
    const handleClick = (event: MouseEvent) => {
      // Only handle left clicks
      if (event.button !== 0) return;
      
      // Only place if we have a valid position
      if (isValidPlacement && previewPosition && adjacentLandId) {
        placeDock();
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
      
      if (waterEdgeHelperRef.current) {
        actualScene.remove(waterEdgeHelperRef.current);
        waterEdgeHelperRef.current.geometry.dispose();
        (waterEdgeHelperRef.current.material as THREE.Material).dispose();
        waterEdgeHelperRef.current = null;
      }
    };
  }, [active, actualScene, actualCamera, polygons, rotation, onCancel]);
  
  // Function to find the nearest water edge
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
    
    return {
      position: closestPoint,
      landId: closestLandId,
      edge: closestEdge,
      isValid: closestDistance < 5 // Consider valid if within 5 units
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
  
  // Function to place the dock
  const placeDock = async () => {
    if (!previewPosition || !adjacentLandId) return;
    
    try {
      // Create the dock using BuildingService
      const buildingService = new BuildingService();
      const dockData = await buildingService.createDock(
        adjacentLandId,
        previewPosition,
        rotation
      );
      
      console.log('Dock created:', dockData);
      
      // Emit event for dock creation
      eventBus.emit(EventTypes.DOCK_PLACED, {
        dockId: dockData.id,
        type: 'dock',
        data: dockData
      });
      
      // Call onComplete callback
      onComplete(dockData);
    } catch (error) {
      console.error('Error creating dock:', error);
      alert(`Failed to create dock: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Render UI controls
  return (
    <div className="absolute bottom-20 left-4 bg-white bg-opacity-90 p-4 rounded-lg shadow-lg z-30">
      <h3 className="text-lg font-medium text-gray-900 mb-2">Dock Placement</h3>
      
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
            if (isValidPlacement && previewPosition && adjacentLandId) {
              placeDock();
            } else {
              alert('Please position the dock along a valid water edge');
            }
          }}
          disabled={!isValidPlacement}
          className={`px-4 py-2 rounded-md ${
            isValidPlacement
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Place Dock
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
          ? 'Position valid. Click to place the dock.'
          : 'Move cursor to a water edge to place dock.'}
      </div>
    </div>
  );
};

export default DockCreator;
