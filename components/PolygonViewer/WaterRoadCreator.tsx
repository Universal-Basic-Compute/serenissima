'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { WaterRoadFacade, WaterRoadPoint } from '@/lib/threejs/WaterRoadFacade';

interface WaterRoadCreatorProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  active: boolean;
  onComplete: (roadId: string, points: WaterRoadPoint[]) => void;
  onCancel: () => void;
}

const WaterRoadCreator: React.FC<WaterRoadCreatorProps> = ({
  scene,
  camera,
  active,
  onComplete,
  onCancel
}) => {
  const [points, setPoints] = useState<WaterRoadPoint[]>([]);
  const [width, setWidth] = useState<number>(5);
  const [depth, setDepth] = useState<number>(1);
  const [color, setColor] = useState<string>('#3366ff');
  const [previewRoadId, setPreviewRoadId] = useState<string | null>(null);
  
  const waterRoadFacadeRef = useRef<WaterRoadFacade | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const planeRef = useRef<THREE.Mesh | null>(null);
  
  // Initialize water road facade
  useEffect(() => {
    if (scene && camera) {
      waterRoadFacadeRef.current = new WaterRoadFacade({
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
        if (waterRoadFacadeRef.current) {
          waterRoadFacadeRef.current.dispose();
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
    if (active && waterRoadFacadeRef.current && points.length >= 2) {
      // Remove previous preview
      if (previewRoadId) {
        waterRoadFacadeRef.current.removeWaterRoad(previewRoadId);
      }
      
      // Create new preview
      const roadId = `preview-water-road-${Date.now()}`;
      waterRoadFacadeRef.current.createWaterRoad(
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
      if (waterRoadFacadeRef.current && previewRoadId) {
        waterRoadFacadeRef.current.removeWaterRoad(previewRoadId);
      }
    };
  }, [previewRoadId]);
  
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
      
      // Update the last point in the preview if we have at least one point
      if (points.length > 0 && previewRoadId && waterRoadFacadeRef.current) {
        const updatedPoints = [...points.slice(0, -1), {
          position: new THREE.Vector3(
            intersectionPoint.x,
            intersectionPoint.y,
            intersectionPoint.z
          ),
          width,
          depth
        }];
        
        waterRoadFacadeRef.current.updateWaterRoad(
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
      const newPoint: WaterRoadPoint = {
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
    if (points.length >= 2 && waterRoadFacadeRef.current && previewRoadId) {
      // Create a final water road
      const finalRoadId = `water-road-${Date.now()}`;
      
      // Remove preview
      waterRoadFacadeRef.current.removeWaterRoad(previewRoadId);
      setPreviewRoadId(null);
      
      // Call the onComplete callback
      onComplete(finalRoadId, points);
      
      // Reset points
      setPoints([]);
    }
  };
  
  // Handle cancel button click
  const handleCancel = () => {
    if (waterRoadFacadeRef.current && previewRoadId) {
      waterRoadFacadeRef.current.removeWaterRoad(previewRoadId);
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
      <h3 className="text-xl font-serif mb-4">Create Water Road</h3>
      
      <div className="mb-4">
        <p className="text-sm mb-2">
          Click on the map to place points for your water road. Add at least 2 points.
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
          Complete Water Road
        </button>
      </div>
    </div>
  );
};

export default WaterRoadCreator;
