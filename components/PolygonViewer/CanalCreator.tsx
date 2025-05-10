'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CanalFacade, CanalPoint, CanalOptions } from '@/lib/threejs/CanalFacade';
import { FaTrash, FaInfoCircle, FaPlus } from 'react-icons/fa';

interface CanalCreatorProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  active: boolean;
  onComplete: (roadId: string, points: CanalPoint[], transferPointsData?: any[]) => void;
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
  
  // State for canal properties
  const [points, setPoints] = useState<CanalPoint[]>([]);
  const [width, setWidth] = useState<number>(3);
  const [depth, setDepth] = useState<number>(1);
  const [color, setColor] = useState<string>('#3366ff');
  const [curvature, setCurvature] = useState<number>(0.5);
  const [previewRoadId, setPreviewRoadId] = useState<string | null>(null);
  const [previewPoint, setPreviewPoint] = useState<THREE.Vector3 | null>(null);
  const [transferPoints, setTransferPoints] = useState<boolean[]>([]);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  
  // Refs for Three.js objects
  const canalFacadeRef = useRef<CanalFacade | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const planeRef = useRef<THREE.Mesh | null>(null);
  const pathHelperRef = useRef<THREE.Line | null>(null);
  
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
        if (canalFacadeRef.current && typeof canalFacadeRef.current.dispose === 'function') {
          canalFacadeRef.current.dispose();
        }
        if (planeRef.current) {
          scene.remove(planeRef.current);
          planeRef.current.geometry.dispose();
          planeRef.current.material.dispose();
        }
        if (pathHelperRef.current) {
          scene.remove(pathHelperRef.current);
          pathHelperRef.current.geometry.dispose();
          if (pathHelperRef.current.material instanceof THREE.Material) {
            pathHelperRef.current.material.dispose();
          } else if (Array.isArray(pathHelperRef.current.material)) {
            pathHelperRef.current.material.forEach(m => m.dispose());
          }
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
          opacity: 0.7, // More transparent for preview
          curvature // This property is now properly typed in CanalOptions
        }
      );
      
      setPreviewRoadId(roadId);
    }
  }, [active, points, width, depth, color, curvature]);
  
  // Clean up preview when component unmounts or becomes inactive
  useEffect(() => {
    return () => {
      if (canalFacadeRef.current && previewRoadId) {
        canalFacadeRef.current.removeCanal(previewRoadId);
      }
    };
  }, [previewRoadId]);
  
  // Create and update path helper line
  useEffect(() => {
    if (!active || !scene || points.length < 1) {
      // Remove existing path helper if it exists
      if (pathHelperRef.current) {
        scene.remove(pathHelperRef.current);
        pathHelperRef.current = null;
      }
      return;
    }
    
    // Create points for the path helper
    const pathPoints = points.map(p => p.position);
    
    // Add preview point if it exists
    if (previewPoint) {
      pathPoints.push(previewPoint);
    }
    
    // Create or update path helper
    if (pathPoints.length >= 2) {
      // Create geometry for the path
      const geometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
      
      // Create or update the line
      if (pathHelperRef.current) {
        // Update existing line
        scene.remove(pathHelperRef.current);
        pathHelperRef.current.geometry.dispose();
        
        const material = new THREE.LineBasicMaterial({
          color: new THREE.Color(color).getHex(),
          linewidth: 2,
          opacity: 0.7,
          transparent: true,
          depthTest: false
        });
        
        pathHelperRef.current = new THREE.Line(geometry, material);
        pathHelperRef.current.position.y += 0.2; // Position above water
        scene.add(pathHelperRef.current);
      } else {
        // Create new line
        const material = new THREE.LineBasicMaterial({
          color: new THREE.Color(color).getHex(),
          linewidth: 2,
          opacity: 0.7,
          transparent: true,
          depthTest: false
        });
        
        pathHelperRef.current = new THREE.Line(geometry, material);
        pathHelperRef.current.position.y += 0.2; // Position above water
        scene.add(pathHelperRef.current);
      }
    }
    
    return () => {
      if (pathHelperRef.current) {
        scene.remove(pathHelperRef.current);
        pathHelperRef.current.geometry.dispose();
        if (pathHelperRef.current.material instanceof THREE.Material) {
          pathHelperRef.current.material.dispose();
        }
        pathHelperRef.current = null;
      }
    };
  }, [active, scene, points, previewPoint, color]);
  
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
      
      // Check if Shift key is pressed to mark as transfer point
      const isTransferPoint = event.shiftKey;
      
      // Add the point
      const newPoint: CanalPoint = {
        position: new THREE.Vector3(
          intersectionPoint.x,
          intersectionPoint.y,
          intersectionPoint.z
        ),
        width,
        depth,
        isTransferPoint
      };
      
      setPoints(prevPoints => [...prevPoints, newPoint]);
      setTransferPoints(prev => [...prev, isTransferPoint]);
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
      
      // Create transfer points data
      const transferPointsData = points
        .filter(point => point.isTransferPoint)
        .map((point, index) => ({
          id: `transfer-point-${Date.now()}-${index}`,
          position: point.position,
          connectedRoadIds: [finalRoadId]
        }));
      
      // Call the onComplete callback with transfer points
      onComplete(finalRoadId, points, transferPointsData);
      
      // Reset points
      setPoints([]);
      setTransferPoints([]);
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
      setTransferPoints(prev => prev.slice(0, -1));
    }
  };
  
  // Handle removing a specific point
  const handleRemovePoint = (index: number) => {
    setPoints(prevPoints => prevPoints.filter((_, i) => i !== index));
    setTransferPoints(prev => prev.filter((_, i) => i !== index));
  };
  
  // Toggle transfer point status
  const toggleTransferPoint = (index: number) => {
    setTransferPoints(prev => {
      const newTransferPoints = [...prev];
      newTransferPoints[index] = !newTransferPoints[index];
      
      // Also update the point in the points array
      setPoints(prevPoints => {
        const newPoints = [...prevPoints];
        newPoints[index] = {
          ...newPoints[index],
          isTransferPoint: newTransferPoints[index]
        };
        return newPoints;
      });
      
      return newTransferPoints;
    });
  };
  
  if (!active) return null;
  
  return (
    <div className="absolute top-20 left-20 right-4 z-10 bg-black/70 text-white p-4 rounded-lg max-h-[80vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-serif">Create Canal</h3>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="p-2 text-amber-400 hover:text-amber-300 transition-colors"
          title="Show help"
        >
          <FaInfoCircle />
        </button>
      </div>
      
      {showHelp && (
        <div className="mb-4 bg-amber-900/30 p-3 rounded border border-amber-700/50 text-sm">
          <h4 className="font-medium text-amber-300 mb-2">Creating Realistic Canals</h4>
          <ul className="list-disc pl-5 space-y-1 text-amber-100">
            <li>Click on the map to add points along your canal path</li>
            <li>Add multiple points to create curved, realistic canals</li>
            <li>Hold <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">Shift</kbd> while clicking to mark a point as a transfer point</li>
            <li>Adjust the curvature slider to make your canal more natural</li>
            <li>You can remove individual points from the point list below</li>
          </ul>
        </div>
      )}
      
      <div className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col">
            <label className="text-sm mb-1">Width</label>
            <input
              type="range"
              min="0.5"
              max="10"
              step="0.5"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              className="w-full"
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
              className="w-full"
            />
            <span className="text-xs mt-1">{depth} meters</span>
          </div>
          
          <div className="flex flex-col">
            <label className="text-sm mb-1">Curvature</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={curvature}
              onChange={(e) => setCurvature(Number(e.target.value))}
              className="w-full"
            />
            <span className="text-xs mt-1">
              {curvature === 0 ? 'Straight lines' : 
               curvature < 0.3 ? 'Slight curves' :
               curvature < 0.7 ? 'Natural curves' : 'Pronounced curves'}
            </span>
          </div>
          
          <div className="flex flex-col">
            <label className="text-sm mb-1">Color</label>
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-10 h-8"
              />
              <select 
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
                onChange={(e) => setColor(e.target.value)}
                value={color}
              >
                <option value="#3366ff">Canal Blue</option>
                <option value="#0088cc">Deep Water</option>
                <option value="#66aaff">Light Blue</option>
                <option value="#006633">Venetian Green</option>
                <option value="#004466">Navy Blue</option>
              </select>
            </div>
          </div>
        </div>
        
        {/* Points list with ability to remove individual points */}
        <div className="mt-4">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-medium">Canal Points ({points.length})</h4>
            {points.length > 0 && (
              <button
                onClick={handleRemoveLastPoint}
                className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs flex items-center"
              >
                <FaTrash className="mr-1" size={10} />
                Remove Last
              </button>
            )}
          </div>
          
          {points.length > 0 ? (
            <div className="max-h-40 overflow-y-auto bg-black/30 rounded border border-gray-700 p-1">
              {points.map((point, index) => (
                <div 
                  key={index} 
                  className={`flex justify-between items-center p-1.5 text-xs mb-1 rounded ${
                    transferPoints[index] ? 'bg-amber-900/40 border border-amber-700/50' : 'bg-gray-800/60'
                  }`}
                >
                  <div className="flex items-center">
                    <span className="font-mono bg-gray-700 px-1.5 rounded mr-2">
                      {index + 1}
                    </span>
                    <span className="text-gray-300">
                      {point.position.x.toFixed(1)}, {point.position.z.toFixed(1)}
                    </span>
                    {transferPoints[index] && (
                      <span className="ml-2 text-amber-400 text-xs">Transfer Point</span>
                    )}
                  </div>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => toggleTransferPoint(index)}
                      className={`p-1 rounded ${
                        transferPoints[index] ? 'bg-amber-600 hover:bg-amber-700' : 'bg-gray-600 hover:bg-gray-700'
                      }`}
                      title={transferPoints[index] ? "Remove transfer point" : "Mark as transfer point"}
                    >
                      <FaPlus size={10} className={transferPoints[index] ? "rotate-45" : ""} />
                    </button>
                    <button
                      onClick={() => handleRemovePoint(index)}
                      className="p-1 bg-red-600 hover:bg-red-700 rounded"
                      title="Remove point"
                    >
                      <FaTrash size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-3 text-gray-400 text-sm italic bg-black/30 rounded border border-gray-700">
              Click on the map to add canal points
            </div>
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
      
      {/* Instructions for transfer points */}
      <div className="mt-4 text-sm text-gray-300 bg-black/50 p-2 rounded">
        <p>Tip: Hold <kbd className="px-2 py-1 bg-gray-700 rounded">Shift</kbd> while clicking to create a transfer point.</p>
        <p>Transfer points allow canals to connect with other transportation networks.</p>
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
