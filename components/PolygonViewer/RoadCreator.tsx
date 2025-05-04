/**
 * TODO: Refactor according to architecture
 * - Separate UI from road creation logic
 * - Move Three.js specific code to rendering layer
 * - Use service layer for road data persistence
 * - Implement proper error handling
 * - Add performance optimizations
 */
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
  const [snapPoint, setSnapPoint] = useState<THREE.Vector3 | null>(null);
  const [indicatorMesh, setIndicatorMesh] = useState<THREE.Mesh | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  // Create indicator mesh for road placement
  const createIndicatorMesh = (position: THREE.Vector3) => {
    // Remove existing indicator if any
    if (indicatorMesh) {
      scene.remove(indicatorMesh);
      if (indicatorMesh.geometry) indicatorMesh.geometry.dispose();
      if (indicatorMesh.material) {
        if (Array.isArray(indicatorMesh.material)) {
          indicatorMesh.material.forEach(m => m.dispose());
        } else {
          indicatorMesh.material.dispose();
        }
      }
    }

    // Create a circle geometry for the indicator
    const geometry = new THREE.CircleGeometry(0.3, 32);
    const material = new THREE.MeshBasicMaterial({
      color: snapPoint ? 0x00ff00 : 0xffaa00, // Green if snapped, orange otherwise
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const indicator = new THREE.Mesh(geometry, material);
    
    // Position the indicator
    indicator.position.copy(position);
    indicator.position.y += 0.25; // Position slightly above the ground
    
    // Rotate to be horizontal
    indicator.rotation.x = -Math.PI / 2;
    
    // Set high render order to ensure visibility
    indicator.renderOrder = 100;
    
    // Add to scene
    scene.add(indicator);
    setIndicatorMesh(indicator);
  };

  // Clean up when component unmounts or becomes inactive
  useEffect(() => {
    return () => {
      // First check if previewMesh exists and remove it
      if (previewMesh) {
        try {
          if (scene) {
            console.log("Road Creator: Cleaning up preview mesh on unmount");
            scene.remove(previewMesh);
          }
          
          if (previewMesh.geometry) {
            previewMesh.geometry.dispose();
          }
          
          if (previewMesh.material) {
            if (Array.isArray(previewMesh.material)) {
              previewMesh.material.forEach(m => m.dispose());
            } else {
              previewMesh.material.dispose();
            }
          }
        } catch (error) {
          console.error('Error cleaning up preview mesh:', error);
        }
      }
      
      // Clean up indicator mesh
      if (indicatorMesh) {
        scene.remove(indicatorMesh);
        if (indicatorMesh.geometry) indicatorMesh.geometry.dispose();
        if (indicatorMesh.material) {
          if (Array.isArray(indicatorMesh.material)) {
            indicatorMesh.material.forEach(m => m.dispose());
          } else {
            indicatorMesh.material.dispose();
          }
        }
      }
      
      // We don't want to remove actual roads, only the preview mesh
      // Removing the section that finds and removes all road meshes
    };
  }, [scene, previewMesh, indicatorMesh]);

  // Set up event listeners when active
  useEffect(() => {
    if (!active) return;

    // Add a small delay before enabling click handling to prevent the initial click from being registered
    let clickEnabled = false;
    const enableClickTimeout = setTimeout(() => {
      clickEnabled = true;
    }, 100);

    const handleMouseMove = (event: MouseEvent) => {
      // Calculate mouse position in normalized device coordinates
      mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      updateRoadPreview();
    };

    const handleClick = (event: MouseEvent) => {
      if (!active || event.button !== 0 || !clickEnabled) return; // Only handle left clicks and only if clicks are enabled
      
      console.log('Road Creator: Click detected');
      
      // Mark this event as handled by the road creator to prevent other handlers from processing it
      (event as any).isRoadCreationClick = true;
      
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

    // Add this function to mark events for road creation
    const preventLandSelection = (event: MouseEvent) => {
      // Don't stop propagation here, as it's preventing our own click handler from working
      // Instead, we'll use a flag to indicate that the click is for road creation
      console.log('Road Creator: Marking event for road creation');
      // Add a custom property to the event to mark it
      (event as any).isRoadCreationClick = true;
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
      clearTimeout(enableClickTimeout); // Clear the timeout on cleanup
      
      // Clean up any remaining preview mesh
      if (previewMesh) {
        console.log('Road Creator: Cleaning up preview mesh on unmount');
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
      
      // We'll rely on the RoadManager to handle cleanup of road meshes
      // Removing the scene traversal code that was causing errors
    };
  }, [active, camera, points, scene, onComplete, onCancel, previewMesh]);

  // Update road preview when mouse moves
  const updateRoadPreview = () => {
    if (!isPlacing || points.length === 0) return;
    
    // Always remove existing preview mesh before creating a new one
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
      setPreviewMesh(null);
    }
    
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
      const intersectionPoint = validIntersection.point;
      
      // Check for snapping to polygon edges or existing roads
      let snappedPoint = null;
      const SNAP_THRESHOLD_WORLD = 0.5; // Distance in world units to snap
      
      // 1. Try to snap to polygon edges
      const polygonMeshes = scene.children.filter(
        child => child instanceof THREE.Mesh && 
        !child.userData?.isRoad && 
        Math.abs(child.position.y - 0.1) < 0.2
      );
      
      let closestEdgePoint = null;
      let minEdgeDistance = SNAP_THRESHOLD_WORLD;
      
      for (const mesh of polygonMeshes) {
        if (!(mesh instanceof THREE.Mesh) || !mesh.geometry) continue;
        
        // Extract polygon vertices
        const position = mesh.geometry.attributes.position;
        const vertices = [];
        
        for (let i = 0; i < position.count; i++) {
          vertices.push(new THREE.Vector3(
            position.getX(i),
            position.getY(i),
            position.getZ(i)
          ));
        }
        
        // Convert to world coordinates
        const worldVertices = vertices.map(v => {
          const worldVertex = v.clone();
          mesh.localToWorld(worldVertex);
          return worldVertex;
        });
        
        // Find closest point on edges
        for (let i = 0; i < worldVertices.length; i++) {
          const start = worldVertices[i];
          const end = worldVertices[(i + 1) % worldVertices.length];
          
          // Find closest point on this edge segment
          const edge = new THREE.Line3(start, end);
          const closestPoint = new THREE.Vector3();
          edge.closestPointToPoint(intersectionPoint, true, closestPoint);
          
          const distance = closestPoint.distanceTo(intersectionPoint);
          
          if (distance < minEdgeDistance) {
            minEdgeDistance = distance;
            closestEdgePoint = closestPoint;
          }
        }
      }
      
      // 2. Try to snap to existing roads
      const roadMeshes = scene.children.filter(
        child => child instanceof THREE.Mesh && child.userData?.isRoad
      );
      
      let closestRoadPoint = null;
      let minRoadDistance = SNAP_THRESHOLD_WORLD;
      
      for (const mesh of roadMeshes) {
        if (!(mesh instanceof THREE.Mesh) || !mesh.geometry) continue;
        
        // Extract road vertices
        const position = mesh.geometry.attributes.position;
        const vertices = [];
        
        for (let i = 0; i < position.count; i++) {
          vertices.push(new THREE.Vector3(
            position.getX(i),
            position.getY(i),
            position.getZ(i)
          ));
        }
        
        // Convert to world coordinates
        const worldVertices = vertices.map(v => {
          const worldVertex = v.clone();
          mesh.localToWorld(worldVertex);
          return worldVertex;
        });
        
        // Find closest point on road segments
        for (let i = 0; i < worldVertices.length - 1; i += 3) {
          // Roads are triangles, so we need to check each edge of the triangle
          const v1 = worldVertices[i];
          const v2 = worldVertices[i + 1];
          const v3 = worldVertices[i + 2];
          
          const edges = [
            new THREE.Line3(v1, v2),
            new THREE.Line3(v2, v3),
            new THREE.Line3(v3, v1)
          ];
          
          for (const edge of edges) {
            const closestPoint = new THREE.Vector3();
            edge.closestPointToPoint(intersectionPoint, true, closestPoint);
            
            const distance = closestPoint.distanceTo(intersectionPoint);
            
            if (distance < minRoadDistance) {
              minRoadDistance = distance;
              closestRoadPoint = closestPoint;
            }
          }
        }
      }
      
      // 3. Also try to snap to existing points in the current road
      let closestExistingPoint = null;
      let minExistingDistance = SNAP_THRESHOLD_WORLD;
      
      for (const point of points) {
        const distance = point.distanceTo(intersectionPoint);
        
        if (distance < minExistingDistance) {
          minExistingDistance = distance;
          closestExistingPoint = point;
        }
      }
      
      // Choose the closest snap point among all options
      if (closestEdgePoint && minEdgeDistance < minRoadDistance && minEdgeDistance < minExistingDistance) {
        snappedPoint = closestEdgePoint;
      } else if (closestRoadPoint && minRoadDistance < minExistingDistance) {
        snappedPoint = closestRoadPoint;
      } else if (closestExistingPoint) {
        snappedPoint = closestExistingPoint;
      }
      
      // Use the snapped point if available, otherwise use the intersection point
      const finalPoint = snappedPoint || intersectionPoint;
      
      // Create a temporary array with the current points plus the mouse position
      const previewPoints = [...points, finalPoint];
      
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
      setPreviewMesh(null); // Add this line to ensure we clear the reference
    }
    
    // Import the 3D utilities
    import('../PolygonViewer/utils3D').then(({ smoothPath }) => {
      // Smooth the road points for a more natural curve
      const smoothedPoints = smoothPath(roadPoints, curvature, Math.max(roadPoints.length * 5, 20));
      
      // Create a curved path based on the smoothed points
      const curve = createCurvedPath(smoothedPoints);
      
      // Create road geometry
      const roadWidth = 0.15; // Changed from 0.0735 back to 0.15 (make it thicker)
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
        positions.push(v1.x, v1.y + 0.2, v1.z); // Increased from 0.15 to 0.2 to prevent z-fighting
        positions.push(v2.x, v2.y + 0.2, v2.z);
        positions.push(v3.x, v3.y + 0.2, v3.z);
        
        // Second triangle
        positions.push(v2.x, v2.y + 0.2, v2.z);
        positions.push(v4.x, v4.y + 0.2, v4.z);
        positions.push(v3.x, v3.y + 0.2, v3.z);
        
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
      
      // Create road material with better visibility
      const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x555555,
        roughness: 0.8,
        metalness: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false, // Keep this to prevent z-fighting
        depthTest: true,   // Make sure depth testing is enabled
        transparent: false, // Disable transparency for better visibility
        polygonOffset: true, // Add polygon offset to prevent z-fighting
        polygonOffsetFactor: -4, // Use a negative value to push roads above terrain
        polygonOffsetUnits: -4
      });
      
      // Create road mesh
      const road = new THREE.Mesh(roadGeometry, roadMaterial);
      road.renderOrder = 30; // Increased from 25 to 30 for even higher priority
      
      // Mark as road for special handling
      road.userData.isRoad = true;
      road.userData.alwaysVisible = true; // Add this flag for special handling
      
      // Force the mesh to be visible
      road.visible = true;
      
      // Add to scene
      console.log('Road Creator: Adding road mesh to scene');
      scene.add(road);
      setPreviewMesh(road);
    }).catch(error => {
      console.error('Error importing utils3D:', error);
      
      // Fallback to original method if import fails
      const curve = createCurvedPath(roadPoints);
      
      // Create road geometry
      const roadWidth = 0.15;
      const roadGeometry = new THREE.BufferGeometry();
      const positions: number[] = [];
      const uvs: number[] = [];
      
      // Sample points along the curve
      const numPoints = Math.max(roadPoints.length * 10, 50);
      const points = curve.getPoints(numPoints);
      
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
        positions.push(v1.x, v1.y + 0.2, v1.z);
        positions.push(v2.x, v2.y + 0.2, v2.z);
        positions.push(v3.x, v3.y + 0.2, v3.z);
        
        // Second triangle
        positions.push(v2.x, v2.y + 0.2, v2.z);
        positions.push(v4.x, v4.y + 0.2, v4.z);
        positions.push(v3.x, v3.y + 0.2, v3.z);
        
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
    
    // Create road material with better visibility
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.8,
      metalness: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false, // Keep this to prevent z-fighting
      depthTest: true,   // Make sure depth testing is enabled
      transparent: false, // Disable transparency for better visibility
      polygonOffset: true, // Add polygon offset to prevent z-fighting
      polygonOffsetFactor: -4, // Use a negative value to push roads above terrain
      polygonOffsetUnits: -4
    });
    
    // Create road mesh
    const road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.renderOrder = 30; // Increased from 25 to 30 for even higher priority
    
    // Mark as road for special handling
    road.userData.isRoad = true;
    road.userData.alwaysVisible = true; // Add this flag for special handling
    
    // Force the mesh to be visible
    road.visible = true;
    
    // Add to scene
    console.log('Road Creator: Adding road mesh to scene');
    scene.add(road);
    setPreviewMesh(road);
  }); // Added missing closing bracket for the catch block
};

  // Create a curved path based on the points and curvature setting
  const createCurvedPath = (roadPoints: THREE.Vector3[]) => {
    // For Venice, we want straighter roads regardless of the curvature setting
    if (roadPoints.length === 2) {
      // For just two points, use a straight line
      return new THREE.LineCurve3(roadPoints[0], roadPoints[1]);
    }
    
    // For more points, use a polyline with minimal curvature
    // Use the curvature value from the slider to control the tension
    return new THREE.CatmullRomCurve3(
      roadPoints,
      false,
      'centripetal',
      Math.max(0.05, curvature * 0.2) // Scale curvature to a reasonable range (0.05-0.2)
    );
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
          onChange={(e) => {
            const newValue = parseFloat(e.target.value);
            setCurvature(newValue);
            // Update the preview if we have points
            if (points.length >= 2) {
              createRoadMesh(points);
            }
          }}
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
      
      {/* Snapping indicator */}
      {snapPoint && (
        <div className="mt-2 text-green-600 text-sm text-center">
          Snapping to nearest edge or road
        </div>
      )}
      
      {/* Snapping indicator */}
      {snapPoint && (
        <div className="mt-2 text-green-600 text-sm text-center">
          Snapping to nearest edge or road
        </div>
      )}
    </div>
  );
};

export default RoadCreator;
