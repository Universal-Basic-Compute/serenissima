import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';

interface RoadCreatorProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  active: boolean;
  onComplete: (roadPoints: THREE.Vector3[]) => void;
  onCancel: () => void;
}

const RoadCreator: React.FC<RoadCreatorProps> = ({
  scene,
  camera,
  active,
  onComplete,
  onCancel
}) => {
  const [points, setPoints] = useState<THREE.Vector3[]>([]);
  const [curvature, setCurvature] = useState<number>(0.5); // 0 to 1
  const [isPlacing, setIsPlacing] = useState<boolean>(false);
  const [previewMesh, setPreviewMesh] = useState<THREE.Mesh | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  // Clean up when component unmounts or becomes inactive
  useEffect(() => {
    return () => {
      if (previewMesh && scene) {
        scene.remove(previewMesh);
        if (previewMesh.geometry) previewMesh.geometry.dispose();
        if (previewMesh.material) {
          if (Array.isArray(previewMesh.material)) {
            previewMesh.material.forEach(m => m.dispose());
          } else {
            previewMesh.material.dispose();
          }
        }
      }
    };
  }, [scene, previewMesh]);

  // Set up event listeners when active
  useEffect(() => {
    if (!active) return;

    const handleMouseMove = (event: MouseEvent) => {
      // Calculate mouse position in normalized device coordinates
      mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      updateRoadPreview();
    };

    const handleClick = (event: MouseEvent) => {
      if (!active || event.button !== 0) return; // Only handle left clicks
      
      console.log('Road Creator: Click detected');
      
      // Calculate mouse position in normalized device coordinates
      mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      // Update the raycaster with the camera and mouse position
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      
      console.log('Road Creator: Raycasting for polygon intersections');
      
      // First, check for intersections with polygon meshes
      const intersects = raycasterRef.current.intersectObjects(scene.children, true);
      console.log(`Road Creator: Found ${intersects.length} intersections`);
      
      // Find the first intersection that is a polygon mesh
      let validIntersection = null;
      for (const intersect of intersects) {
        // Check if this is a polygon mesh (not water, not clouds, etc.)
        // Polygons are positioned at y=0.1 and have a small height
        console.log(`Road Creator: Checking intersection with object:`, 
          intersect.object.type, 
          intersect.point.y, 
          intersect.object.userData);
        
        if (intersect.object instanceof THREE.Mesh && 
            Math.abs(intersect.point.y - 0.1) < 0.2 && // Increased tolerance from 0.1 to 0.2
            !intersect.object.userData?.isRoad) { // Make sure it's not another road
          
          console.log('Road Creator: Valid polygon intersection found');
          validIntersection = intersect;
          break;
        }
      }
      
      // If we found a valid intersection with a polygon
      if (validIntersection) {
        console.log('Road Creator: Processing valid intersection', validIntersection.point);
        
        // Use the intersection point instead of the ground plane
        const intersectionPoint = validIntersection.point;
        
        // Add point to the road
        const newPoints = [...points, intersectionPoint];
        console.log(`Road Creator: Adding point at (${intersectionPoint.x}, ${intersectionPoint.y}, ${intersectionPoint.z})`);
        console.log(`Road Creator: Total points now: ${newPoints.length}`);
        setPoints(newPoints);
        
        // If this is the first point, start placing mode
        if (newPoints.length === 1) {
          console.log('Road Creator: Starting placing mode');
          setIsPlacing(true);
        }
        
        // If we have at least 2 points, update the preview
        if (newPoints.length >= 2) {
          console.log('Road Creator: Creating road mesh preview');
          createRoadMesh(newPoints);
        }
        
        // Clear any error message
        setErrorMessage(null);
      } else {
        console.log('Road Creator: No valid polygon intersection found');
        // Show error message
        setErrorMessage("Please click on a land polygon to place road points");
        
        // Clear the message after 2 seconds
        setTimeout(() => {
          setErrorMessage(null);
        }, 2000);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Cancel road creation
        onCancel();
      } else if (event.key === 'Enter' && points.length >= 2) {
        // Complete road creation
        onComplete(points);
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        // Remove the last point
        if (points.length > 0) {
          const newPoints = [...points];
          newPoints.pop();
          setPoints(newPoints);
          
          if (newPoints.length < 2) {
            // Remove preview if we don't have enough points
            if (previewMesh) {
              scene.remove(previewMesh);
              setPreviewMesh(null);
            }
          } else {
            // Update preview with remaining points
            createRoadMesh(newPoints);
          }
          
          if (newPoints.length === 0) {
            setIsPlacing(false);
          }
        }
      }
    };

    const handleRightClick = (event: MouseEvent) => {
      event.preventDefault();
      
      if (points.length >= 2) {
        // Complete the road on right-click
        onComplete(points);
      } else {
        // Cancel if we don't have enough points
        onCancel();
      }
    };

    // Add this function to stop event propagation for all clicks
    const preventLandSelection = (event: MouseEvent) => {
      // Only stop propagation, don't prevent default
      // This allows our own click handler to still work
      console.log('Road Creator: Preventing click propagation to land selection');
      event.stopPropagation();
    };

    // Add event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleRightClick);
    // Add this event listener to capture clicks before they reach other handlers
    window.addEventListener('click', preventLandSelection, true); // true for capture phase

    return () => {
      // Remove event listeners
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleRightClick);
      window.removeEventListener('click', preventLandSelection, true); // true for capture phase
    };
  }, [active, camera, points, scene, onComplete, onCancel, previewMesh]);

  // Update road preview when mouse moves
  const updateRoadPreview = () => {
    if (!isPlacing || points.length === 0) return;
    
    // Update the raycaster with the camera and mouse position
    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    
    // First, check for intersections with polygon meshes
    const intersects = raycasterRef.current.intersectObjects(scene.children, true);
    
    // Find the first intersection that is a polygon mesh
    let validIntersection = null;
    for (const intersect of intersects) {
      // Check if this is a polygon mesh (not water, not clouds, etc.)
      if (intersect.object instanceof THREE.Mesh && 
          Math.abs(intersect.point.y - 0.1) < 0.2 && // Increased tolerance from 0.1 to 0.2
          !intersect.object.userData?.isRoad) { // Make sure it's not another road
        
        validIntersection = intersect;
        break;
      }
    }
    
    // If we found a valid intersection with a polygon
    if (validIntersection) {
      // Use the intersection point instead of the ground plane
      const intersectionPoint = validIntersection.point;
      
      // Create a temporary array with the current points plus the mouse position
      const previewPoints = [...points, intersectionPoint];
      
      // Update the preview mesh if we have at least 2 points
      if (previewPoints.length >= 2) {
        createRoadMesh(previewPoints);
      }
    }
  };

  // Create a road mesh from the given points
  const createRoadMesh = (roadPoints: THREE.Vector3[]) => {
    if (roadPoints.length < 2) {
      console.log('Road Creator: Not enough points to create road mesh');
      return;
    }
    
    console.log(`Road Creator: Creating road mesh with ${roadPoints.length} points`);
    
    // Remove existing preview mesh
    if (previewMesh) {
      console.log('Road Creator: Removing existing preview mesh');
      scene.remove(previewMesh);
      if (previewMesh.geometry) previewMesh.geometry.dispose();
      if (previewMesh.material) {
        if (Array.isArray(previewMesh.material)) {
          previewMesh.material.forEach(m => m.dispose());
        } else {
          previewMesh.material.dispose();
        }
      }
    }
    
    // Create a curved path based on the points
    const curve = createCurvedPath(roadPoints);
    
    // Create road geometry
    const roadWidth = 0.3; // Changed from 1.5 to 0.3 (5 times thinner)
    const roadGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const uvs: number[] = [];
    
    // Sample points along the curve
    const numPoints = Math.max(roadPoints.length * 10, 50);
    const points = curve.getPoints(numPoints);
    console.log(`Road Creator: Generated ${points.length} points along curve`);
    
    // Create road segments
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      
      // Calculate direction vector
      const direction = new THREE.Vector3()
        .subVectors(next, current)
        .normalize();
      
      // Calculate perpendicular vector
      const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x)
        .normalize()
        .multiplyScalar(roadWidth / 2);
      
      // Create quad vertices
      const v1 = new THREE.Vector3().addVectors(current, perpendicular);
      const v2 = new THREE.Vector3().subVectors(current, perpendicular);
      const v3 = new THREE.Vector3().addVectors(next, perpendicular);
      const v4 = new THREE.Vector3().subVectors(next, perpendicular);
      
      // First triangle
      positions.push(v1.x, v1.y + 0.15, v1.z); // Slightly above polygons (0.15 instead of 0.05)
      positions.push(v2.x, v2.y + 0.15, v2.z);
      positions.push(v3.x, v3.y + 0.15, v3.z);
      
      // Second triangle
      positions.push(v2.x, v2.y + 0.15, v2.z);
      positions.push(v4.x, v4.y + 0.15, v4.z);
      positions.push(v3.x, v3.y + 0.15, v3.z);
      
      // UVs for texture mapping
      const segmentLength = current.distanceTo(next);
      const uOffset = i / (points.length - 1);
      
      uvs.push(0, uOffset);
      uvs.push(1, uOffset);
      uvs.push(0, uOffset + segmentLength);
      
      uvs.push(1, uOffset);
      uvs.push(1, uOffset + segmentLength);
      uvs.push(0, uOffset + segmentLength);
    }
    
    // Set attributes
    roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeometry.computeVertexNormals();
    
    // Create road material
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.8,
      metalness: 0.2,
      side: THREE.DoubleSide
    });
    
    // Create road mesh
    const road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.renderOrder = 15; // Above ground, below buildings
    
    // Mark as road for special handling
    road.userData.isRoad = true;
    
    // Add to scene
    console.log('Road Creator: Adding road mesh to scene');
    scene.add(road);
    setPreviewMesh(road);
  };

  // Create a curved path based on the points and curvature setting
  const createCurvedPath = (roadPoints: THREE.Vector3[]) => {
    if (roadPoints.length === 2) {
      // For just two points, use a straight line
      return new THREE.LineCurve3(roadPoints[0], roadPoints[1]);
    }
    
    // For more points, use a curved path
    if (curvature === 0) {
      // No curvature - use a polyline
      return new THREE.CatmullRomCurve3(roadPoints, false, 'centripetal', 0);
    } else {
      // Use Catmull-Rom curve with tension based on curvature
      return new THREE.CatmullRomCurve3(
        roadPoints,
        false,
        'centripetal',
        1 - curvature // Convert curvature to tension (1 = straight, 0 = curved)
      );
    }
  };

  // Render UI controls
  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-30 bg-white p-4 rounded-lg shadow-lg border-2 border-amber-600">
      <div className="text-center mb-2 font-medium text-amber-800">
        Road Creator
      </div>
      
      <div className="flex items-center mb-3">
        <span className="mr-2 text-sm">Curvature:</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={curvature}
          onChange={(e) => setCurvature(parseFloat(e.target.value))}
          className="w-32"
        />
        <span className="ml-2 text-sm">{Math.round(curvature * 100)}%</span>
      </div>
      
      <div className="flex justify-between">
        <button
          onClick={onCancel}
          className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
        
        <button
          onClick={() => onComplete(points)}
          disabled={points.length < 2}
          className={`px-3 py-1 rounded ${
            points.length < 2
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-amber-600 text-white hover:bg-amber-700 transition-colors'
          }`}
        >
          Complete Road
        </button>
      </div>
      
      <div className="mt-2 text-xs text-gray-600 text-center">
        Click to place points • Press ESC to cancel • Press Backspace to remove last point
      </div>
      
      {/* Error message */}
      {errorMessage && (
        <div className="mt-2 text-red-600 text-sm text-center">
          {errorMessage}
        </div>
      )}
    </div>
  );
};

export default RoadCreator;
