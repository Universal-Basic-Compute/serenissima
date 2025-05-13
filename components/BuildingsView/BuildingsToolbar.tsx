import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import BuildingRenderer from './BuildingRenderer';
import PlaceableObjectManager from '@/lib/components/PlaceableObjectManager';
import { useBuildingMenu } from '@/hooks/useBuildingMenu';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';
import { FaWater } from 'react-icons/fa';
import { normalizeCoordinates } from '@/components/PolygonViewer/utils';
import { useSceneReady } from '@/lib/components/SceneReadyProvider';

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
  const [isRoadCreatorActive, setIsRoadCreatorActive] = useState(false); // Kept for state compatibility but not used
  const [placeableObjectType, setPlaceableObjectType] = useState<'dock' | 'building' | null>(null);
  const [showBuildingRenderer, setShowBuildingRenderer] = useState(true);
  const [selectedBuildingType, setSelectedBuildingType] = useState<string>('');
  const [showCanalCreator, setShowCanalCreator] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string>('model');
  const [buildings, setBuildings] = useState<any[]>([]);

  // Use the scene ready hook instead of trying to find the scene directly
  const { isSceneReady, scene: readyScene, camera: readyCamera } = useSceneReady();
  
  // Use the scene from the hook
  const actualScene = readyScene || scene;
  const actualCamera = readyCamera || camera;

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
          
          // Store buildings in state
          if (data.buildings) {
            setBuildings(data.buildings);
          }
          
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
      
      {/* Road creator functionality removed due to missing component */}
      
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
      {showBuildingRenderer ? (
        <BuildingRenderer 
          active={true} 
        />
      ) : (
        <div className="hidden">
          {(() => {
            console.warn('BuildingsToolbar: BuildingRenderer is not shown');
            return null;
          })()}
        </div>
      )}
    </div>
  );
};

export default BuildingsToolbar;
