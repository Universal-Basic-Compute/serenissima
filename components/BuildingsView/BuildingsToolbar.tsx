import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import RoadCreator from '@/components/PolygonViewer/RoadCreator';
import DockCreator from '@/components/DockCreator';
import DockRenderer from '@/components/DockCreator/DockRenderer';
import BuildingCreationManager from '@/components/BuildingCreationManager';
import BuildingRenderer from '@/components/BuildingRenderer';
import { useBuildingMenu } from '@/hooks/useBuildingMenu';
import { eventBus } from '@/lib/eventBus';

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
  const [isDockCreatorActive, setIsDockCreatorActive] = useState(false);
  const [isBuildingCreatorActive, setIsBuildingCreatorActive] = useState(false);
  const [showDockRenderer, setShowDockRenderer] = useState(true);
  const [showBuildingRenderer, setShowBuildingRenderer] = useState(true);
  const [selectedBuildingType, setSelectedBuildingType] = useState<string>('');
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
  }, [loadBuildingCategories]);

  return (
    <div className="absolute bottom-4 left-4 z-20 flex flex-col space-y-2">
      <button
        onClick={() => {
          setIsRoadCreatorActive(true);
          setIsDockCreatorActive(false);
          setIsBuildingCreatorActive(false);
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
          console.log('Create Dock button clicked');
          setIsDockCreatorActive(true);
          setIsRoadCreatorActive(false);
          setIsBuildingCreatorActive(false);
        }}
        className="px-4 py-2 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
        title="Place docks along shorelines to connect water and land transportation"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M11 17a1 1 0 001.447.894l4-2A1 1 0 0017 15V9.236a1 1 0 00-1.447-.894l-4 2a1 1 0 00-.553.894V17zM15.211 6.276a1 1 0 000-1.788l-4.764-2.382a1 1 0 00-.894 0L4.789 4.488a1 1 0 000 1.788l4.764 2.382a1 1 0 00.894 0l4.764-2.382zM4.447 8.342A1 1 0 003 9.236V15a1 1 0 00.553.894l4 2A1 1 0 009 17v-5.764a1 1 0 00-.553-.894l-4-2z" />
        </svg>
        <span>Create Dock</span>
      </button>
      
      <button
        onClick={() => {
          // Trigger the building menu to open
          const event = new CustomEvent('showBuildingMenu');
          window.dispatchEvent(event);
          
          // Reset other active states
          setIsBuildingCreatorActive(false);
          setIsRoadCreatorActive(false);
          setIsDockCreatorActive(false);
        }}
        className="px-4 py-2 bg-amber-600 text-white rounded-md shadow-md hover:bg-amber-700 transition-colors flex items-center space-x-2"
        title="Browse and place buildings on your land"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm3 1h6v4H7V5zm8 8v-4H7v4h8z" clipRule="evenodd" />
        </svg>
        <span>Browse Buildings</span>
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
      
      {isDockCreatorActive && (
        <DockCreator
          scene={scene}
          camera={camera}
          polygons={polygons}
          active={isDockCreatorActive}
          onComplete={(dockData) => {
            console.log('Dock created:', dockData);
            setIsDockCreatorActive(false);
            if (onRefreshBuildings) {
              onRefreshBuildings();
            }
          }}
          onCancel={() => {
            setIsDockCreatorActive(false);
          }}
        />
      )}
      
      {isBuildingCreatorActive && (
        <BuildingCreationManager
          scene={scene}
          camera={camera}
          polygons={polygons}
          active={isBuildingCreatorActive}
          buildingName={selectedBuildingType}
          variant={selectedVariant}
          onComplete={(buildingData) => {
            console.log('Building created:', buildingData);
            setIsBuildingCreatorActive(false);
            if (onRefreshBuildings) {
              onRefreshBuildings();
            }
          }}
          onCancel={() => {
            setIsBuildingCreatorActive(false);
          }}
        />
      )}
      
      {/* Always render the DockRenderer to show existing docks */}
      {showDockRenderer && actualScene && (
        <DockRenderer scene={actualScene} active={true} />
      )}
      
      {/* Always render the BuildingRenderer to show existing buildings */}
      {showBuildingRenderer && actualScene && (
        <BuildingRenderer scene={actualScene} active={true} />
      )}
    </div>
  );
};

export default BuildingsToolbar;
