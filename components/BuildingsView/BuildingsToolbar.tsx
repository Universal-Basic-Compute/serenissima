import React, { useState, useEffect, useRef } from 'react';
import RoadCreator from '@/components/PolygonViewer/RoadCreator';
import DockCreator from '@/components/DockCreator';

interface BuildingsToolbarProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  polygons: any[];
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
  const [isSceneReady, setIsSceneReady] = useState(false);
  
  // Function to get scene and camera with retries
  const getSceneAndCameraWithRetry = async () => {
    // Try to get scene and camera with retries
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      const canvas = document.querySelector('canvas');
      const currentScene = canvas?.__scene;
      const currentCamera = canvas?.__camera;
      const currentPolygons = window.__polygonData || [];
      
      console.log(`Attempt ${attempts + 1}: Scene:`, !!currentScene, 'Camera:', !!currentCamera, 'Polygons:', currentPolygons?.length);
      
      if (currentScene && currentCamera && currentPolygons.length > 0) {
        return { scene: currentScene, camera: currentCamera, polygons: currentPolygons };
      }
      
      // Wait before trying again
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    
    return { scene: null, camera: null, polygons: [] };
  };
  
  // Check if scene and camera are ready
  useEffect(() => {
    // Wait for scene and camera to be properly initialized
    if (scene && camera && polygons && polygons.length > 0) {
      console.log('BuildingsToolbar: Scene and camera are ready');
      setIsSceneReady(true);
    } else {
      console.warn('BuildingsToolbar: Missing scene, camera, or polygons');
      setIsSceneReady(false);
    }
  }, [scene, camera, polygons]);

  // Function to find scene and camera if not provided as props
  const getSceneAndCamera = () => {
    // Try to get scene and camera from canvas element
    const canvas = document.querySelector('canvas');
    const sceneFromCanvas = canvas?.__scene;
    const cameraFromCanvas = canvas?.__camera;
    
    console.log('Getting scene and camera from canvas:', 
      !!sceneFromCanvas, !!cameraFromCanvas);
    
    return {
      scene: scene || sceneFromCanvas,
      camera: camera || cameraFromCanvas,
      polygons: polygons || window.__polygonData || []
    };
  };

  return (
    <div className="absolute bottom-4 left-4 z-20 flex flex-col space-y-2">
      <button
        onClick={() => {
          setIsRoadCreatorActive(true);
          setIsDockCreatorActive(false);
        }}
        className="px-4 py-2 bg-amber-600 text-white rounded-md shadow-md hover:bg-amber-700 transition-colors flex items-center space-x-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
        </svg>
        <span>Create Road</span>
      </button>
      
      <button
        onClick={async () => {
          console.log('Create Dock button clicked');
          
          // Show loading indicator
          const loadingMessage = document.createElement('div');
          loadingMessage.textContent = 'Initializing dock creator...';
          loadingMessage.style.position = 'fixed';
          loadingMessage.style.bottom = '100px';
          loadingMessage.style.left = '50%';
          loadingMessage.style.transform = 'translateX(-50%)';
          loadingMessage.style.backgroundColor = 'rgba(0,0,0,0.7)';
          loadingMessage.style.color = 'white';
          loadingMessage.style.padding = '10px 20px';
          loadingMessage.style.borderRadius = '5px';
          loadingMessage.style.zIndex = '1000';
          document.body.appendChild(loadingMessage);
          
          // Try to get scene and camera with retries
          const { scene: currentScene, camera: currentCamera, polygons: currentPolygons } = 
            await getSceneAndCameraWithRetry();
          
          // Remove loading indicator
          document.body.removeChild(loadingMessage);
          
          if (currentScene && currentCamera) {
            console.log('Scene and camera ready, activating dock creator');
            setIsDockCreatorActive(true);
            setIsRoadCreatorActive(false);
          } else {
            alert('Scene or camera not ready. Please try again in a moment.');
          }
        }}
        className="px-4 py-2 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M11 17a1 1 0 001.447.894l4-2A1 1 0 0017 15V9.236a1 1 0 00-1.447-.894l-4 2a1 1 0 00-.553.894V17zM15.211 6.276a1 1 0 000-1.788l-4.764-2.382a1 1 0 00-.894 0L4.789 4.488a1 1 0 000 1.788l4.764 2.382a1 1 0 00.894 0l4.764-2.382zM4.447 8.342A1 1 0 003 9.236V15a1 1 0 00.553.894l4 2A1 1 0 009 17v-5.764a1 1 0 00-.553-.894l-4-2z" />
        </svg>
        <span>Create Dock</span>
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
      
      {isDockCreatorActive && (
        <DockCreator
          scene={getSceneAndCamera().scene}
          camera={getSceneAndCamera().camera}
          polygons={getSceneAndCamera().polygons}
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
    </div>
  );
};

export default BuildingsToolbar;
