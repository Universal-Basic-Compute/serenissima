import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import RoadCreator from '@/components/PolygonViewer/RoadCreator';
import BuildingRenderer from '@/components/BuildingRenderer';
import PlaceableObjectManager from '@/lib/components/PlaceableObjectManager';
import { useBuildingMenu } from '@/hooks/useBuildingMenu';
import { eventBus } from '@/lib/eventBus';
import { FaWater } from 'react-icons/fa';

interface BuildingsToolbarProps {
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  polygons?: any[];
  onRefreshBuildings?: () => void;
}

const BuildingsToolbar: React.FC<BuildingsToolbarProps> = ({
  scene,
  camera,
  polygons,
  onRefreshBuildings
}) => {
  const [isRoadCreatorActive, setIsRoadCreatorActive] = useState(false);
  const [placeableObjectType, setPlaceableObjectType] = useState<'dock' | 'building' | null>(null);
  const [showBuildingRenderer, setShowBuildingRenderer] = useState(true);
  const [selectedBuildingType, setSelectedBuildingType] = useState<string>('');
  const [showWaterRoadCreator, setShowWaterRoadCreator] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string>('model');

  // Get scene with fallback
  const actualScene = scene || (document.querySelector('canvas')?.__scene as THREE.Scene);

  // Use the building menu hook to access building data
  const { 
    categories, 
    loadBuildingCategories 
  } = useBuildingMenu(true);

  // Load building categories when component mounts
  useEffect(() => {
    loadBuildingCategories();
    
    // Listen for building placement activation
    const handleActivateBuildingPlacement = (event: CustomEvent) => {
      const { buildingName, variant } = event.detail;
      setSelectedBuildingType(buildingName);
      setSelectedVariant(variant || 'model');
      setPlaceableObjectType('building');
      setIsRoadCreatorActive(false);
    };
    
    window.addEventListener('activateBuildingPlacement', handleActivateBuildingPlacement as EventListener);
    
    return () => {
      window.removeEventListener('activateBuildingPlacement', handleActivateBuildingPlacement as EventListener);
    };
  }, [loadBuildingCategories]);

  return (
    <div className="absolute bottom-4 left-4 z-20 flex flex-col space-y-2">
      <button
        onClick={() => {
          setIsRoadCreatorActive(true);
          setPlaceableObjectType(null);
          setShowWaterRoadCreator(false);
        }}
        className="px-4 py-2 bg-amber-600 text-white rounded-md shadow-md hover:bg-amber-700 transition-colors flex items-center space-x-2"
        title="Create roads to connect buildings and docks"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
        </svg>
        <span>Create Road</span>
      </button>
      
      
      <button
        onClick={() => {
          // Trigger the building menu to open
          const event = new CustomEvent('showBuildingMenu');
          window.dispatchEvent(event);
          
          // Reset other active states
          setPlaceableObjectType(null);
          setIsRoadCreatorActive(false);
          setShowWaterRoadCreator(false);
        }}
        className="px-4 py-2 bg-amber-600 text-white rounded-md shadow-md hover:bg-amber-700 transition-colors flex items-center space-x-2"
        title="Browse and place buildings on your land"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm3 1h6v4H7V5zm8 8v-4H7v4h8z" clipRule="evenodd" />
        </svg>
        <span>Browse Buildings</span>
      </button>
      
      <button
        onClick={() => {
          setPlaceableObjectType('dock');
          setIsRoadCreatorActive(false);
          setShowWaterRoadCreator(false);
        }}
        className="px-4 py-2 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
        title="Create docks for water transportation"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6 3a2 2 0 00-2 2v1h10V5a2 2 0 00-2-2H6zM4 7v9a2 2 0 002 2h8a2 2 0 002-2V7H4z" />
        </svg>
        <span>Create Dock</span>
      </button>
      
      <button
        onClick={() => {
          setShowWaterRoadCreator(true);
          setIsRoadCreatorActive(false);
          setPlaceableObjectType(null);
          
          // Dispatch custom event for water road creation
          window.dispatchEvent(new CustomEvent('buildingToolbarAction', {
            detail: { action: 'waterRoad' }
          }));
        }}
        className="px-4 py-2 bg-cyan-600 text-white rounded-md shadow-md hover:bg-cyan-700 transition-colors flex items-center space-x-2"
        title="Create water roads (canals)"
      >
        <FaWater className="h-5 w-5" />
        <span>Create Canal</span>
      </button>
      
      {isRoadCreatorActive && scene && camera && (
        <RoadCreator
          scene={scene}
          camera={camera}
          active={isRoadCreatorActive}
          onComplete={(roadPoints, roadId) => {
            console.log('Road created with ID:', roadId);
            setIsRoadCreatorActive(false);
            if (onRefreshBuildings) {
              onRefreshBuildings();
            }
          }}
          onCancel={() => {
            setIsRoadCreatorActive(false);
          }}
        />
      )}
      
      {showWaterRoadCreator && scene && camera && (
        <div className="absolute top-0 left-0 right-0 bottom-0 z-30">
          {/* This div captures clicks to prevent interaction with the map */}
          <div 
            className="absolute inset-0"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      
      
      {placeableObjectType === 'building' && (
        <PlaceableObjectManager
          scene={scene}
          camera={camera}
          polygons={polygons}
          active={true}
          type="building"
          objectData={{
            name: selectedBuildingType,
            variant: selectedVariant
          }}
          constraints={{
            requireLandOwnership: true
          }}
          onComplete={(buildingData) => {
            console.log('Building created:', buildingData);
            setPlaceableObjectType(null);
            if (onRefreshBuildings) {
              onRefreshBuildings();
            }
          }}
          onCancel={() => {
            setPlaceableObjectType(null);
          }}
        />
      )}
      
      {placeableObjectType === 'dock' && (
        <PlaceableObjectManager
          scene={scene}
          camera={camera}
          polygons={polygons}
          active={true}
          type="dock"
          objectData={{
            name: 'dock',
            variant: 'model'
          }}
          constraints={{
            requireWaterEdge: true,
            requireAdminPermission: true
          }}
          onComplete={(dockData) => {
            console.log('Dock created:', dockData);
            setPlaceableObjectType(null);
            if (onRefreshBuildings) {
              onRefreshBuildings();
            }
          }}
          onCancel={() => {
            setPlaceableObjectType(null);
          }}
        />
      )}
      
      
      {/* Always render the BuildingRenderer to show existing buildings */}
      {showBuildingRenderer && actualScene && (
        <BuildingRenderer scene={actualScene} active={true} />
      )}
    </div>
  );
};

export default BuildingsToolbar;
