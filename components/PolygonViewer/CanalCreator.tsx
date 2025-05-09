'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CanalFacade, CanalPoint } from '@/lib/threejs/CanalFacade';

interface CanalCreatorProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  active: boolean;
  onComplete: (roadId: string, points: CanalPoint[]) => void;
  onCancel: () => void;
}

const CanalCreator: React.FC<CanalCreatorProps> = ({
  scene,
  camera,
  active,
  onComplete,
  onCancel
}) => {
  // Log when component is mounted or active state changes
  useEffect(() => {
    console.log('CanalCreator component active state:', active);
  }, [active]);
  const [points, setPoints] = useState<CanalPoint[]>([]);
  const [width, setWidth] = useState<number>(5);
  const [depth, setDepth] = useState<number>(1);
  const [color, setColor] = useState<string>('#3366ff');
  const [previewRoadId, setPreviewRoadId] = useState<string | null>(null);
  const [previewPoint, setPreviewPoint] = useState<THREE.Vector3 | null>(null);
  
  const canalFacadeRef = useRef<CanalFacade | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const planeRef = useRef<THREE.Mesh | null>(null);
  
  // Initialize canal facade
  useEffect(() => {
    if (scene && camera) {
      canalFacadeRef.current = new CanalFacade({
        scene,
        camera,
        waterLevel: 0.1 // Slightly above water level
      });
      
      // Create an invisible plane for raycasting
      const planeGeometry = new THREE.PlaneGeometry(10000, 10000);
      const planeMaterial = new THREE.MeshBasicMaterial({
        visible: false,
        side: THREE.DoubleSide
      });
      const plane = new THREE.Mesh(planeGeometry, planeMaterial);
      plane.rotation.x = -Math.PI / 2; // Make it horizontal
      plane.position.y = 0.1; // Slightly above water level
      scene.add(plane);
      planeRef.current = plane;
      
      return () => {
        if (canalFacadeRef.current) {
          canalFacadeRef.current.dispose();
        }
        if (planeRef.current) {
          scene.remove(planeRef.current);
          planeRef.current.geometry.dispose();
          planeRef.current.material.dispose();
        }
      };
    }
  }, [scene, camera]);
  
  // Update preview when points change
  useEffect(() => {
    if (active && canalFacadeRef.current && points.length >= 2) {
      // Remove previous preview
      if (previewRoadId) {
        canalFacadeRef.current.removeCanal(previewRoadId);
      }
      
      // Create new preview
      const roadId = `preview-canal-${Date.now()}`;
      canalFacadeRef.current.createCanal(
        roadId,
        points,
        {
          width,
          depth,
          color: new THREE.Color(color).getHex(),
          opacity: 0.7 // More transparent for preview
        }
      );
      
      setPreviewRoadId(roadId);
    }
  }, [active, points, width, depth, color]);
  
  // Clean up preview when component unmounts or becomes inactive
  useEffect(() => {
    return () => {
      if (canalFacadeRef.current && previewRoadId) {
        canalFacadeRef.current.removeCanal(previewRoadId);
      }
    };
  }, [previewRoadId]);
  
  // Add a useEffect to create and update the preview circle
  useEffect(() => {
    if (!active || !scene || !previewPoint) return;
    
    // Create a circle geometry to show where the point will be placed
    const circleGeometry = new THREE.CircleGeometry(width / 2, 32);
    const circleMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });
    
    const previewCircle = new THREE.Mesh(circleGeometry, circleMaterial);
    previewCircle.position.copy(previewPoint);
    previewCircle.rotation.x = -Math.PI / 2; // Make it horizontal
    previewCircle.position.y += 0.1; // Slightly above the water
    previewCircle.name = 'preview-circle';
    
    // Remove any existing preview circle
    const existingPreview = scene.getObjectByName('preview-circle');
    if (existingPreview) {
      scene.remove(existingPreview);
      if (existingPreview instanceof THREE.Mesh) {
        existingPreview.geometry.dispose();
        existingPreview.material.dispose();
      }
    }
    
    // Add the new preview circle
    scene.add(previewCircle);
    
    return () => {
      // Clean up
      if (previewCircle) {
        scene.remove(previewCircle);
        previewCircle.geometry.dispose();
        previewCircle.material.dispose();
      }
    };
  }, [active, scene, previewPoint, width, color]);
  
  // Add a useEffect to clean up the preview circle when component unmounts
  useEffect(() => {
    return () => {
      if (scene) {
        const existingPreview = scene.getObjectByName('preview-circle');
        if (existingPreview) {
          scene.remove(existingPreview);
          if (existingPreview instanceof THREE.Mesh) {
            existingPreview.geometry.dispose();
            existingPreview.material.dispose();
          }
        }
      }
    };
  }, [scene]);
  
  // Handle mouse move to show potential point placement
  const handleMouseMove = (event: React.MouseEvent) => {
    if (!active || !scene || !camera || !planeRef.current) return;
    
    // Calculate mouse position in normalized device coordinates
    const rect = event.currentTarget.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update the raycaster
    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    
    // Check for intersections with the plane
    const intersects = raycasterRef.current.intersectObject(planeRef.current);
    
    if (intersects.length > 0) {
      const intersectionPoint = intersects[0].point;
      
      // Update preview point
      setPreviewPoint(new THREE.Vector3(
        intersectionPoint.x,
        intersectionPoint.y,
        intersectionPoint.z
      ));
      
      // Update the last point in the preview if we have at least one point
      if (points.length > 0 && previewRoadId && canalFacadeRef.current) {
        const updatedPoints = [...points.slice(0, -1), {
          position: new THREE.Vector3(
            intersectionPoint.x,
            intersectionPoint.y,
            intersectionPoint.z
          ),
          width,
          depth
        }];
        
        canalFacadeRef.current.updateCanal(
          previewRoadId,
          updatedPoints
        );
      }
    }
  };
  
  // Handle click to add a point
  const handleClick = (event: React.MouseEvent) => {
    if (!active || !scene || !camera || !planeRef.current) return;
    
    // Calculate mouse position in normalized device coordinates
    const rect = event.currentTarget.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update the raycaster
    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    
    // Check for intersections with the plane
    const intersects = raycasterRef.current.intersectObject(planeRef.current);
    
    if (intersects.length > 0) {
      const intersectionPoint = intersects[0].point;
      
      // Add the point
      const newPoint: CanalPoint = {
        position: new THREE.Vector3(
          intersectionPoint.x,
          intersectionPoint.y,
          intersectionPoint.z
        ),
        width,
        depth
      };
      
      setPoints(prevPoints => [...prevPoints, newPoint]);
    }
  };
  
  // Handle complete button click
  const handleComplete = () => {
    if (points.length >= 2 && canalFacadeRef.current && previewRoadId) {
      // Create a final canal
      const finalRoadId = `canal-${Date.now()}`;
      
      // Remove preview
      canalFacadeRef.current.removeCanal(previewRoadId);
      setPreviewRoadId(null);
      
      // Call the onComplete callback
      onComplete(finalRoadId, points);
      
      // Reset points
      setPoints([]);
    }
  };
  
  // Handle cancel button click
  const handleCancel = () => {
    if (canalFacadeRef.current && previewRoadId) {
      canalFacadeRef.current.removeCanal(previewRoadId);
      setPreviewRoadId(null);
    }
    
    setPoints([]);
    onCancel();
  };
  
  // Handle removing the last point
  const handleRemoveLastPoint = () => {
    if (points.length > 0) {
      setPoints(prevPoints => prevPoints.slice(0, -1));
    }
  };
  
  if (!active) return null;
  
  return (
    <div className="absolute top-20 left-20 right-4 z-10 bg-black/70 text-white p-4 rounded-lg">
      <h3 className="text-xl font-serif mb-4">Create Canal</h3>
      
      <div className="mb-4">
        <p className="text-sm mb-2">
          Click on the map to place points for your canal. Add at least 2 points.
        </p>
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex flex-col">
            <label className="text-sm mb-1">Width</label>
            <input
              type="range"
              min="1"
              max="20"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              className="w-32"
            />
            <span className="text-xs mt-1">{width} meters</span>
          </div>
          
          <div className="flex flex-col">
            <label className="text-sm mb-1">Depth</label>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="w-32"
            />
            <span className="text-xs mt-1">{depth} meters</span>
          </div>
          
          <div className="flex flex-col">
            <label className="text-sm mb-1">Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-32 h-8"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          <span>Points: {points.length}</span>
          {points.length > 0 && (
            <button
              onClick={handleRemoveLastPoint}
              className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
            >
              Remove Last Point
            </button>
          )}
        </div>
      </div>
      
      <div className="flex justify-between">
        <button
          onClick={handleCancel}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
        >
          Cancel
        </button>
        
        <button
          onClick={handleComplete}
          disabled={points.length < 2}
          className={`px-4 py-2 rounded ${
            points.length < 2
              ? 'bg-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          Complete Canal
        </button>
      </div>
      
      {/* Add this div to capture mouse events across the entire screen */}
      <div 
        className="fixed inset-0 z-0 cursor-crosshair" 
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />
    </div>
  );
};

export default CanalCreator;
