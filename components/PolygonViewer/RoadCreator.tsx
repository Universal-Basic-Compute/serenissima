import React, { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';

interface RoadCreatorProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  active: boolean;
  onComplete: (points: THREE.Vector3[]) => void;
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
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [previewLine, setPreviewLine] = useState<THREE.Line | null>(null);
  const [roadLines, setRoadLines] = useState<THREE.Line[]>([]);
  const [roadPoints, setRoadPoints] = useState<THREE.Mesh[]>([]);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const planeRef = useRef<THREE.Mesh | null>(null);

  // Initialize the road creation plane
  useEffect(() => {
    if (!active) return;

    // Create an invisible plane for raycasting
    const planeGeometry = new THREE.PlaneGeometry(10000, 10000);
    const planeMaterial = new THREE.MeshBasicMaterial({ 
      visible: false,
      side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2; // Make it horizontal
    plane.position.y = 0.1; // Slightly above ground level
    plane.name = 'roadCreationPlane';
    scene.add(plane);
    planeRef.current = plane;

    // Add event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);

    // Clean up
    return () => {
      scene.remove(plane);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
      
      // Clean up preview line
      if (previewLine) {
        scene.remove(previewLine);
      }
      
      // Clean up road lines and points
      roadLines.forEach(line => scene.remove(line));
      roadPoints.forEach(point => scene.remove(point));
    };
  }, [active, scene]);

  // Update preview line when points change
  useEffect(() => {
    if (!active || points.length === 0) return;

    // Clean up previous preview line
    if (previewLine) {
      scene.remove(previewLine);
    }

    // Create new preview line
    const material = new THREE.LineBasicMaterial({ 
      color: 0xffaa00,
      linewidth: 3
    });
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 100; // Ensure it renders on top
    scene.add(line);
    setPreviewLine(line);

    return () => {
      scene.remove(line);
    };
  }, [active, points, scene]);

  // Handle mouse move for preview
  const handleMouseMove = (event: MouseEvent) => {
    if (!active || !planeRef.current) return;

    // Calculate mouse position in normalized device coordinates
    mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Update raycaster
    raycasterRef.current.setFromCamera(mouseRef.current, camera);

    // Check for intersection with the plane
    const intersects = raycasterRef.current.intersectObject(planeRef.current);
    
    if (intersects.length > 0) {
      const intersectionPoint = intersects[0].point;
      
      // If we're drawing, update the preview
      if (isDrawing && points.length > 0) {
        const updatedPoints = [...points.slice(0, -1), intersectionPoint];
        setPoints(updatedPoints);
      }
    }
  };

  // Handle click to add points
  const handleClick = (event: MouseEvent) => {
    if (!active || !planeRef.current) return;

    // Calculate mouse position in normalized device coordinates
    mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Update raycaster
    raycasterRef.current.setFromCamera(mouseRef.current, camera);

    // Check for intersection with the plane
    const intersects = raycasterRef.current.intersectObject(planeRef.current);
    
    if (intersects.length > 0) {
      const intersectionPoint = intersects[0].point;
      
      // If we're not drawing yet, start drawing
      if (!isDrawing) {
        setIsDrawing(true);
        setPoints([intersectionPoint, intersectionPoint]); // Start with two identical points
        
        // Add a visual marker for the first point
        addPointMarker(intersectionPoint);
      } else {
        // Add the point to our list
        const updatedPoints = [...points.slice(0, -1), intersectionPoint, intersectionPoint];
        setPoints(updatedPoints);
        
        // Add a visual marker for this point
        addPointMarker(intersectionPoint);
        
        // Add a line segment
        addLineSegment(points[points.length - 2], intersectionPoint);
      }
    }
  };

  // Add a visual marker for a point
  const addPointMarker = (position: THREE.Vector3) => {
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(position);
    sphere.renderOrder = 101; // Ensure it renders on top
    scene.add(sphere);
    setRoadPoints(prev => [...prev, sphere]);
  };

  // Add a line segment between two points
  const addLineSegment = (start: THREE.Vector3, end: THREE.Vector3) => {
    const material = new THREE.LineBasicMaterial({ 
      color: 0xff6600,
      linewidth: 5
    });
    
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 100; // Ensure it renders on top
    scene.add(line);
    setRoadLines(prev => [...prev, line]);
  };

  // Handle keyboard events
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!active) return;

    // Escape key cancels
    if (event.key === 'Escape') {
      cleanupAndCancel();
    }
    
    // Enter key completes
    if (event.key === 'Enter') {
      completeRoad();
    }
  };

  // Clean up and cancel
  const cleanupAndCancel = () => {
    // Clean up preview line
    if (previewLine) {
      scene.remove(previewLine);
      setPreviewLine(null);
    }
    
    // Clean up road lines and points
    roadLines.forEach(line => scene.remove(line));
    roadPoints.forEach(point => scene.remove(point));
    setRoadLines([]);
    setRoadPoints([]);
    
    // Reset state
    setPoints([]);
    setIsDrawing(false);
    
    // Call onCancel
    onCancel();
  };

  // Complete the road
  const completeRoad = () => {
    if (points.length < 3) {
      alert('Please add at least 2 points to create a road');
      return;
    }
    
    // Remove the duplicate last point that's used for preview
    const finalPoints = points.slice(0, -1);
    
    // Call onComplete with the points
    onComplete(finalPoints);
    
    // Clean up
    cleanupAndCancel();
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {active && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-amber-600 text-white px-4 py-2 rounded-lg shadow-lg pointer-events-auto">
          <div className="flex items-center justify-between">
            <div className="mr-4">
              <h3 className="font-bold">Road Creation Mode</h3>
              <p className="text-sm">Click to add points, Enter to complete, Esc to cancel</p>
            </div>
            <div className="flex space-x-2">
              <button 
                onClick={completeRoad}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded"
              >
                Complete
              </button>
              <button 
                onClick={cleanupAndCancel}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoadCreator;
