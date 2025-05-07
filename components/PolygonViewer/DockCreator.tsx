import React, { useState, useEffect, useRef } from 'react';
import { getApiBaseUrl } from '@/lib/apiUtils';
import { getWalletAddress } from '@/lib/walletUtils';
import { eventBus, EventTypes } from '@/lib/eventBus';
import * as THREE from 'three';

interface DockCreatorProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  polygons: any[];
  active: boolean;
  onComplete: (dockData: any) => void;
  onCancel: () => void;
}

// Helper class to find water edges for dock placement
class WaterEdgeDetector {
  private polygons: any[];
  
  constructor(polygons: any[]) {
    this.polygons = polygons;
  }
  
  public findNearestWaterEdge(position: THREE.Vector3, maxDistance: number = 10): { 
    position: THREE.Vector3 | null; 
    landId: string | null;
    edge: { start: THREE.Vector3, end: THREE.Vector3 } | null;
  } {
    let closestPosition: THREE.Vector3 | null = null;
    let closestDistance = maxDistance;
    let closestLandId: string | null = null;
    let closestEdge: { start: THREE.Vector3, end: THREE.Vector3 } | null = null;
    
    // Check each polygon for water edges
    for (const polygon of this.polygons) {
      const waterEdges = this.getWaterEdges(polygon);
      
      for (const edge of waterEdges) {
        const closestPoint = this.getClosestPointOnEdge(edge.start, edge.end, position);
        const distance = position.distanceTo(closestPoint);
        
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPosition = closestPoint;
          closestLandId = polygon.id;
          closestEdge = edge;
        }
      }
    }
    
    return { 
      position: closestPosition, 
      landId: closestLandId,
      edge: closestEdge
    };
  }
  
  private getWaterEdges(polygon: any): { start: THREE.Vector3, end: THREE.Vector3 }[] {
    const waterEdges: { start: THREE.Vector3, end: THREE.Vector3 }[] = [];
    
    if (!polygon.coordinates || !polygon.coordinates[0]) {
      return waterEdges;
    }
    
    const coordinates = polygon.coordinates[0];
    
    // Check each edge of the polygon
    for (let i = 0; i < coordinates.length - 1; i++) {
      const start = new THREE.Vector3(coordinates[i][0], 0.1, coordinates[i][1]);
      const end = new THREE.Vector3(coordinates[i+1][0], 0.1, coordinates[i+1][1]);
      
      // Determine if this is a water edge (simplified check)
      // In a real implementation, this would check against water polygons
      // For now, we'll assume edges near the boundary of the map are water edges
      if (this.isWaterEdge(polygon, coordinates[i], coordinates[i+1])) {
        waterEdges.push({ start, end });
      }
    }
    
    // Check the closing edge
    if (coordinates.length > 1) {
      const start = new THREE.Vector3(coordinates[coordinates.length-1][0], 0.1, coordinates[coordinates.length-1][1]);
      const end = new THREE.Vector3(coordinates[0][0], 0.1, coordinates[0][1]);
      
      if (this.isWaterEdge(polygon, coordinates[coordinates.length-1], coordinates[0])) {
        waterEdges.push({ start, end });
      }
    }
    
    return waterEdges;
  }
  
  private isWaterEdge(polygon: any, start: any, end: any): boolean {
    // This is a simplified check for water edges
    // In a real implementation, this would check against water polygons
    
    // For now, we'll use a heuristic: if the edge is on the boundary of the map
    // or if it's not shared with another polygon, it's likely a water edge
    
    // Check if the edge is on the boundary of the map
    const isBoundaryEdge = this.isOnMapBoundary(start) || this.isOnMapBoundary(end);
    
    // Check if the edge is shared with another polygon
    const isSharedEdge = this.isEdgeSharedWithAnotherPolygon(polygon, start, end);
    
    // If it's on the boundary or not shared, it's likely a water edge
    return isBoundaryEdge || !isSharedEdge;
  }
  
  private isOnMapBoundary(point: any): boolean {
    // Check if the point is on the boundary of the map
    // This is a simplified check - in a real implementation, this would use the actual map bounds
    const mapBounds = {
      minX: -100,
      maxX: 100,
      minZ: -100,
      maxZ: 100
    };
    
    const x = point[0];
    const z = point[1];
    
    const margin = 5; // Allow some margin for error
    
    return (
      Math.abs(x - mapBounds.minX) < margin ||
      Math.abs(x - mapBounds.maxX) < margin ||
      Math.abs(z - mapBounds.minZ) < margin ||
      Math.abs(z - mapBounds.maxZ) < margin
    );
  }
  
  private isEdgeSharedWithAnotherPolygon(polygon: any, start: any, end: any): boolean {
    // Check if the edge is shared with another polygon
    for (const otherPolygon of this.polygons) {
      if (otherPolygon.id === polygon.id) continue;
      
      const otherCoordinates = otherPolygon.coordinates[0];
      if (!otherCoordinates) continue;
      
      // Check each edge of the other polygon
      for (let i = 0; i < otherCoordinates.length - 1; i++) {
        if (this.areEdgesEqual(start, end, otherCoordinates[i], otherCoordinates[i+1])) {
          return true;
        }
      }
      
      // Check the closing edge
      if (otherCoordinates.length > 1) {
        if (this.areEdgesEqual(start, end, otherCoordinates[otherCoordinates.length-1], otherCoordinates[0])) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  private areEdgesEqual(start1: any, end1: any, start2: any, end2: any): boolean {
    // Check if two edges are the same (allowing for reversed direction)
    const isForwardMatch = 
      Math.abs(start1[0] - start2[0]) < 0.1 &&
      Math.abs(start1[1] - start2[1]) < 0.1 &&
      Math.abs(end1[0] - end2[0]) < 0.1 &&
      Math.abs(end1[1] - end2[1]) < 0.1;
      
    const isReverseMatch = 
      Math.abs(start1[0] - end2[0]) < 0.1 &&
      Math.abs(start1[1] - end2[1]) < 0.1 &&
      Math.abs(end1[0] - start2[0]) < 0.1 &&
      Math.abs(end1[1] - start2[1]) < 0.1;
      
    return isForwardMatch || isReverseMatch;
  }
  
  private getClosestPointOnEdge(start: THREE.Vector3, end: THREE.Vector3, point: THREE.Vector3): THREE.Vector3 {
    // Calculate the closest point on a line segment to a given point
    const line = new THREE.Line3(start, end);
    const closestPoint = new THREE.Vector3();
    line.closestPointToPoint(point, true, closestPoint);
    return closestPoint;
  }
}

// Main DockCreator component
const DockCreator: React.FC<DockCreatorProps> = ({
  scene,
  camera,
  polygons,
  active,
  onComplete,
  onCancel
}) => {
  const [previewPosition, setPreviewPosition] = useState<THREE.Vector3 | null>(null);
  const [previewRotation, setPreviewRotation] = useState<number>(0);
  const [adjacentLandId, setAdjacentLandId] = useState<string | null>(null);
  const [currentEdge, setCurrentEdge] = useState<{ start: THREE.Vector3, end: THREE.Vector3 } | null>(null);
  const [isPlacementValid, setIsPlacementValid] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // References
  const previewMeshRef = useRef<THREE.Mesh | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const waterEdgeDetectorRef = useRef<WaterEdgeDetector | null>(null);
  
  // Initialize water edge detector
  useEffect(() => {
    if (polygons && polygons.length > 0) {
      waterEdgeDetectorRef.current = new WaterEdgeDetector(polygons);
    }
    
    return () => {
      // Clean up
      if (previewMeshRef.current) {
        scene.remove(previewMeshRef.current);
        previewMeshRef.current.geometry.dispose();
        if (Array.isArray(previewMeshRef.current.material)) {
          previewMeshRef.current.material.forEach(m => m.dispose());
        } else if (previewMeshRef.current.material) {
          previewMeshRef.current.material.dispose();
        }
        previewMeshRef.current = null;
      }
    };
  }, [polygons, scene]);
  
  // Create preview mesh
  useEffect(() => {
    if (active && !previewMeshRef.current) {
      // Create a simple dock mesh for preview
      const geometry = new THREE.BoxGeometry(2, 0.2, 5);
      const material = new THREE.MeshBasicMaterial({ 
        color: 0x8B4513, // Brown color for wood
        transparent: true,
        opacity: 0.7
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = 0.1; // Slightly above water level
      
      // Add to scene
      scene.add(mesh);
      previewMeshRef.current = mesh;
    }
    
    return () => {
      if (previewMeshRef.current) {
        scene.remove(previewMeshRef.current);
        previewMeshRef.current.geometry.dispose();
        if (Array.isArray(previewMeshRef.current.material)) {
          previewMeshRef.current.material.forEach(m => m.dispose());
        } else if (previewMeshRef.current.material) {
          previewMeshRef.current.material.dispose();
        }
        previewMeshRef.current = null;
      }
    };
  }, [active, scene]);
  
  // Update mouse position and find water edges
  const updateMousePosition = (clientX: number, clientY: number) => {
    if (!active || !camera) return;
    
    // Calculate normalized device coordinates
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    mouseRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update raycaster
    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    
    // Find intersection with ground plane
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectionPoint = new THREE.Vector3();
    raycasterRef.current.ray.intersectPlane(groundPlane, intersectionPoint);
    
    // Find nearest water edge
    if (waterEdgeDetectorRef.current && intersectionPoint) {
      const { position, landId, edge } = waterEdgeDetectorRef.current.findNearestWaterEdge(intersectionPoint);
      
      if (position && landId && edge) {
        setPreviewPosition(position);
        setAdjacentLandId(landId);
        setCurrentEdge(edge);
        setIsPlacementValid(true);
        
        // Calculate rotation based on edge direction
        const direction = new THREE.Vector3().subVectors(edge.end, edge.start).normalize();
        const angle = Math.atan2(direction.z, direction.x);
        setPreviewRotation(angle + Math.PI/2); // Perpendicular to edge
      } else {
        setPreviewPosition(intersectionPoint);
        setAdjacentLandId(null);
        setCurrentEdge(null);
        setIsPlacementValid(false);
      }
    } else {
      setPreviewPosition(intersectionPoint);
      setIsPlacementValid(false);
    }
  };
  
  // Update preview mesh position and rotation
  useEffect(() => {
    if (previewMeshRef.current && previewPosition) {
      previewMeshRef.current.position.x = previewPosition.x;
      previewMeshRef.current.position.z = previewPosition.z;
      previewMeshRef.current.rotation.y = previewRotation;
      
      // Update material color based on validity
      if (previewMeshRef.current.material instanceof THREE.MeshBasicMaterial) {
        previewMeshRef.current.material.color.set(isPlacementValid ? 0x8B4513 : 0xFF0000);
        previewMeshRef.current.material.opacity = isPlacementValid ? 0.7 : 0.5;
      }
    }
  }, [previewPosition, previewRotation, isPlacementValid]);
  
  // Handle mouse move
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      updateMousePosition(event.clientX, event.clientY);
    };
    
    if (active) {
      window.addEventListener('mousemove', handleMouseMove);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [active, camera]);
  
  // Handle click to place dock
  const handleClick = async () => {
    if (!isPlacementValid || !previewPosition || !adjacentLandId) {
      setError('Cannot place dock here. Please find a water edge adjacent to land.');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Get wallet address
      const walletAddress = getWalletAddress();
      if (!walletAddress) {
        setError('Please connect your wallet to place a dock');
        return;
      }
      
      // Create connection points (simplified for now)
      const connectionPoints = [];
      if (currentEdge) {
        // Add connection points at the midpoint of the edge
        const midpoint = new THREE.Vector3().addVectors(currentEdge.start, currentEdge.end).multiplyScalar(0.5);
        connectionPoints.push({ x: midpoint.x, y: midpoint.y, z: midpoint.z });
      }
      
      // Prepare dock data
      const dockData = {
        landId: adjacentLandId,
        position: {
          x: previewPosition.x,
          y: previewPosition.y,
          z: previewPosition.z
        },
        rotation: previewRotation,
        connectionPoints: connectionPoints.map(p => ({ x: p.x, y: p.y, z: p.z })),
        createdBy: walletAddress
      };
      
      // Send to server
      const response = await fetch(`${getApiBaseUrl()}/api/docks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dockData),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create dock: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Emit event
      eventBus.emit(EventTypes.DOCK_PLACED, {
        dockId: data.id,
        landId: adjacentLandId,
        position: previewPosition,
        rotation: previewRotation
      });
      
      // Call onComplete
      onComplete(data);
    } catch (error) {
      console.error('Error creating dock:', error);
      setError(`Failed to create dock: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!active) return null;

  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 text-white p-4 rounded-lg z-30 w-96">
      <h3 className="text-lg font-serif mb-4 text-center">Dock Placement</h3>
      
      {error && (
        <div className="bg-red-500/70 p-2 rounded mb-4 text-white text-sm">
          {error}
        </div>
      )}
      
      <div className="mb-4">
        <label className="block text-sm mb-1">Rotation</label>
        <input
          type="range"
          min="0"
          max={Math.PI * 2}
          step="0.1"
          value={previewRotation}
          onChange={(e) => setPreviewRotation(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>
      
      <div className="text-sm mb-4">
        <p>Position your cursor where you want to place the dock.</p>
        <p>Docks must be placed at the edge of land parcels adjacent to water.</p>
        {isPlacementValid && adjacentLandId && (
          <p className="text-green-400 mt-2">Valid placement on land parcel {adjacentLandId}</p>
        )}
      </div>
      
      <div className="flex justify-between">
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded transition-colors"
          disabled={isLoading}
        >
          Cancel
        </button>
        
        <button
          onClick={handleClick}
          disabled={!isPlacementValid || isLoading}
          className={`px-4 py-2 rounded ${
            isPlacementValid && !isLoading
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-gray-400 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Creating...
            </div>
          ) : (
            'Place Dock'
          )}
        </button>
      </div>
    </div>
  );
};

export default DockCreator;
