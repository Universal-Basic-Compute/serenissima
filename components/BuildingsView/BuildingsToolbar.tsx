import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import RoadCreator from '@/components/PolygonViewer/RoadCreator';
import BuildingRenderer from '@/components/BuildingRenderer';
import PlaceableObjectManager from '@/lib/components/PlaceableObjectManager';
import { useBuildingMenu } from '@/hooks/useBuildingMenu';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';
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
  const [showCanalCreator, setShowCanalCreator] = useState(false);
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
  
  // Fetch buildings when the component mounts
  useEffect(() => {
    const fetchBuildings = async () => {
      try {
        console.log('BuildingsToolbar: Fetching buildings from: /api/buildings');
        const response = await fetch('/api/buildings');
        
        console.log('BuildingsToolbar: API response status:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`BuildingsToolbar: Loaded ${data.buildings?.length || 0} buildings`);
          
          // Log each building for debugging
          if (data.buildings && data.buildings.length > 0) {
            data.buildings.forEach((building: any, index: number) => {
              console.log(`BuildingsToolbar: Building ${index + 1}:`, building);
            });
          } else {
            console.warn('BuildingsToolbar: No buildings returned from API');
          }
          
          // Dispatch an event to notify the BuildingRenderer to update
          console.log('BuildingsToolbar: Dispatching BUILDING_PLACED event with refresh=true');
          eventBus.emit(EventTypes.BUILDING_PLACED, { refresh: true });
        } else {
          console.warn(`BuildingsToolbar: Failed to fetch buildings: ${response.status}`);
        }
      } catch (error) {
        console.error('BuildingsToolbar: Error fetching buildings:', error);
        console.error('BuildingsToolbar: Stack trace:', error.stack);
      }
    };
    
    fetchBuildings();
  }, []);

  return (
    <div className="absolute bottom-4 left-4 z-20 flex flex-col space-y-2">
      <button
        onClick={() => {
          setIsRoadCreatorActive(true);
          setPlaceableObjectType(null);
          setShowCanalCreator(false);
        }}
        className="px-4 py-2 bg-amber-600 text-white rounded-md shadow-md hover:bg-amber-700 transition-colors flex items-center space-x-2"
        title="Create roads to connect buildings and docks"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
        </svg>
        <span>Create Road</span>
      </button>
      
      {/* Add debug button */}
      <button
        onClick={() => {
          console.log('Debug button clicked');
          console.log('Current scene:', scene);
          console.log('Current camera:', camera);
          console.log('Current polygons:', polygons);
          
          // Force refresh buildings
          if (onRefreshBuildings) {
            console.log('Forcing refresh of buildings');
            onRefreshBuildings();
          }
          
          // Log all buildings in the scene
          if (scene) {
            console.log('Buildings in scene:');
            scene.traverse((object) => {
              if (object.userData && object.userData.buildingId) {
                console.log(`- Building ${object.userData.buildingId}:`, object);
              }
            });
          }
          
          // Add a test building directly to the scene
          if (scene) {
            console.log('Adding test building to scene');
            const geometry = new THREE.BoxGeometry(5, 5, 5);
            const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const testBuilding = new THREE.Mesh(geometry, material);
            testBuilding.position.set(45.42623684734749, 5, 12.33922034185465);
            testBuilding.userData.buildingId = 'test-building';
            scene.add(testBuilding);
            console.log('Test building added:', testBuilding);
          }
        }}
        className="px-4 py-2 bg-red-600 text-white rounded-md shadow-md hover:bg-red-700 transition-colors flex items-center space-x-2"
        title="Debug buildings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <span>Debug Buildings</span>
      </button>
      
      <button
        onClick={() => {
          // Focus camera on the market stall building
          if (camera) {
            camera.position.set(45, 20, 12);
            // If controls exist, update the target
            const controls = (camera as any).userData?.controls;
            if (controls && controls.target) {
              controls.target.set(45, 0, 12);
            }
            console.log('Camera repositioned to view market stall');
          }
        }}
        className="px-4 py-2 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
        title="Focus on market stall"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
        </svg>
        <span>Focus on Market Stall</span>
      </button>
      
      
      <button
        onClick={() => {
          // Trigger the building menu to open
          const event = new CustomEvent('showBuildingMenu');
          window.dispatchEvent(event);
          
          // Reset other active states
          setPlaceableObjectType(null);
          setIsRoadCreatorActive(false);
          setShowCanalCreator(false);
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
          setShowCanalCreator(true);
          setIsRoadCreatorActive(false);
          setPlaceableObjectType(null);
          
          // Dispatch custom event for canal creation
          window.dispatchEvent(new CustomEvent('buildingToolbarAction', {
            detail: { action: 'canal' }
          }));
        }}
        className="px-4 py-2 bg-cyan-600 text-white rounded-md shadow-md hover:bg-cyan-700 transition-colors flex items-center space-x-2"
        title="Create canals (canals)"
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
      
      {showCanalCreator && scene && camera && (
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
      
      
      
      {/* Always render the BuildingRenderer to show existing buildings */}
      {showBuildingRenderer && actualScene && (
        <BuildingRenderer scene={actualScene} active={true} />
      )}
    </div>
  );
};

export default BuildingsToolbar;
