import React, { useState } from 'react';
import RoadCreator from '@/components/PolygonViewer/RoadCreator';

interface BuildingsToolbarProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  onRefreshBuildings?: () => void;
}

const BuildingsToolbar: React.FC<BuildingsToolbarProps> = ({
  scene,
  camera,
  onRefreshBuildings
}) => {
  const [isRoadCreatorActive, setIsRoadCreatorActive] = useState(false);

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col space-y-2">
      <button
        onClick={() => setIsRoadCreatorActive(true)}
        className="px-4 py-2 bg-amber-600 text-white rounded-md shadow-md hover:bg-amber-700 transition-colors flex items-center space-x-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
        </svg>
        <span>Create Road</span>
      </button>
      
      {isRoadCreatorActive && (
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
    </div>
  );
};

export default BuildingsToolbar;
