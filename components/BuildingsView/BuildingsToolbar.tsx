import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import BuildingRenderer from './BuildingRenderer';
import BuildingRendererManager from './BuildingRendererManager';
import PlaceableObjectManager from '@/lib/components/PlaceableObjectManager';
import { useBuildingMenu } from '@/hooks/useBuildingMenu';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';
import { FaWater, FaRoad, FaBuilding, FaShip } from 'react-icons/fa';
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
  // State for different creation tools
  const [placeableObjectType, setPlaceableObjectType] = useState<'building' | 'road' | null>(null);
  const [showBuildingRenderer, setShowBuildingRenderer] = useState(true);
  const [selectedBuildingType, setSelectedBuildingType] = useState<string>('');
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
    // Listen for building placement activation
    const handleActivateBuildingPlacement = (event: CustomEvent) => {
      const { buildingName, variant } = event.detail;
      setSelectedBuildingType(buildingName);
      setSelectedVariant(variant || 'model');
      setPlaceableObjectType('building');
    };
    
    window.addEventListener('activateBuildingPlacement', handleActivateBuildingPlacement as EventListener);
    
    return () => {
      window.removeEventListener('activateBuildingPlacement', handleActivateBuildingPlacement as EventListener);
    };
  }, []);
  
  // Fetch buildings when the component mounts
  useEffect(() => {
    const fetchBuildings = async () => {
      try {
        console.log('%c BuildingsToolbar: Fetching buildings from: /api/buildings', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
        const response = await fetch('/api/buildings');
        
        console.log('%c BuildingsToolbar: API response status:', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`%c BuildingsToolbar: Loaded ${data.buildings?.length || 0} buildings`, 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
          
          // Store buildings in state
          if (data.buildings) {
            setBuildings(data.buildings);
          }
          
          // Log each building for debugging
          if (data.buildings && data.buildings.length > 0) {
            data.buildings.forEach((building: any, index: number) => {
              console.log(`%c BuildingsToolbar: Building ${index + 1}:`, 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;', building);
            });
          } else {
            console.warn('%c BuildingsToolbar: No buildings returned from API', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
          }
          
          // Dispatch an event to notify the BuildingRenderer to update
          console.log('%c BuildingsToolbar: Dispatching BUILDING_PLACED event with refresh=true', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
          eventBus.emit(EventTypes.BUILDING_PLACED, { refresh: true });
        } else {
          console.warn(`%c BuildingsToolbar: Failed to fetch buildings: ${response.status}`, 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
        }
      } catch (error) {
        console.error('%c BuildingsToolbar: Error fetching buildings:', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;', error);
        console.error('BuildingsToolbar: Stack trace:', error.stack);
      }
    };
    
    fetchBuildings();
    
    // Listen for building point clicks
    const handleBuildingPointClick = (event: CustomEvent) => {
      if (event.detail && event.detail.pointId) {
        console.log('%c BuildingsToolbar: Building point clicked:', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;', event.detail);
        // Trigger the building menu to open
        const showBuildingMenuEvent = new CustomEvent('showBuildingMenu');
        window.dispatchEvent(showBuildingMenuEvent);
      }
    };
    
    window.addEventListener('buildingPointClick', handleBuildingPointClick as EventListener);
    
    return () => {
      window.removeEventListener('buildingPointClick', handleBuildingPointClick as EventListener);
    };
  }, []);

  return (
    <div className="absolute bottom-4 left-4 z-20 flex flex-col space-y-2">
      {/* Building Browser Button */}
      <button
        onClick={() => {
          // Trigger the building menu to open
          const event = new CustomEvent('showBuildingMenu');
          window.dispatchEvent(event);
          
          // Reset other active states
          setPlaceableObjectType(null);
        }}
        className="px-4 py-2 bg-amber-600 text-white rounded-md shadow-md hover:bg-amber-700 transition-colors flex items-center space-x-2"
        title="Browse and place buildings on your land"
      >
        <FaBuilding className="h-5 w-5" />
        <span>Browse Buildings</span>
      </button>
      
      
      {/* Road Creator Button */}
      <button
        onClick={() => {
          setPlaceableObjectType(prev => prev === 'road' ? null : 'road');
        }}
        className={`px-4 py-2 ${placeableObjectType === 'road' ? 'bg-gray-700' : 'bg-gray-600'} text-white rounded-md shadow-md hover:bg-gray-700 transition-colors flex items-center space-x-2`}
        title="Create roads between buildings"
      >
        <FaRoad className="h-5 w-5" />
        <span>{placeableObjectType === 'road' ? 'Cancel Road' : 'Create Road'}</span>
      </button>
      
      {/* Transport Route Button */}
      <button
        onClick={() => {
          window.dispatchEvent(new CustomEvent('showTransportRoutes'));
        }}
        className="px-4 py-2 bg-purple-600 text-white rounded-md shadow-md hover:bg-purple-700 transition-colors flex items-center space-x-2"
        title="Find transport routes between locations"
      >
        <FaShip className="h-5 w-5" />
        <span>Transport Routes</span>
      </button>
      
      {/* Placeable Object Manager - handles all object types */}
      {placeableObjectType && (
        <PlaceableObjectManager
          scene={actualScene}
          camera={actualCamera}
          polygons={polygons}
          active={true}
          type={placeableObjectType}
          objectData={{
            name: placeableObjectType === 'building' ? selectedBuildingType : placeableObjectType,
            variant: placeableObjectType === 'building' ? selectedVariant : 'default'
          }}
          constraints={{
            requireLandOwnership: placeableObjectType === 'building'
          }}
          onComplete={(objectData) => {
            console.log(`${placeableObjectType} created:`, objectData);
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
      
      {/* Only render the BuildingRendererManager to show existing buildings */}
      {showBuildingRenderer && (
        <BuildingRendererManager active={true} debug={true} />
      )}
    </div>
  );
};

export default BuildingsToolbar;
