import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import BuildingRenderer from './BuildingRenderer';
import { useBuildingMenu } from '@/hooks/useBuildingMenu';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { FaWater, FaRoad, FaBuilding, FaShip } from 'react-icons/fa';
import { normalizeCoordinates } from '@/components/PolygonViewer/utils';

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
  const [selectedBuildingType, setSelectedBuildingType] = useState<string>('');
  const [selectedVariant, setSelectedVariant] = useState<string>('model');
  const [buildings, setBuildings] = useState<any[]>([]);
  const [forceUpdate, setForceUpdate] = useState(false);

  // Use the scene and camera props directly

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
  
  // Listen for transport mode changes
  useEffect(() => {
    const handleTransportModeChange = () => {
      // Force re-render when transport mode changes
      setForceUpdate(prev => !prev);
    };
    
    window.addEventListener('transportModeChanged', handleTransportModeChange);
    
    return () => {
      window.removeEventListener('transportModeChanged', handleTransportModeChange);
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
      
      {/* Regenerate Building Points Button */}
      <button
        onClick={async () => {
          if (confirm('Are you sure you want to regenerate all building points? This may take a moment.')) {
            try {
              const response = await fetch('/api/building-points', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ regenerate: true }),
              });
              
              if (response.ok) {
                const data = await response.json();
                alert(`Building points regenerated successfully!\n${data.counts.buildingPoints} building points\n${data.counts.canalPoints} canal points\n${data.counts.bridgePoints} bridge points`);
                
                // Refresh buildings if callback provided
                if (onRefreshBuildings) {
                  onRefreshBuildings();
                }
              } else {
                alert('Failed to regenerate building points. Please try again later.');
              }
            } catch (error) {
              console.error('Error regenerating building points:', error);
              alert('An error occurred while regenerating building points.');
            }
          }
        }}
        className="px-4 py-2 bg-amber-700 text-white rounded-md shadow-md hover:bg-amber-800 transition-colors flex items-center space-x-2"
        title="Regenerate all building points"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span>Regenerate Points</span>
      </button>
      
      {/* Transport Route Button */}
      <button
        onClick={() => {
          console.log('Transport Routes button clicked');
          // Toggle transport mode state
          if (typeof window !== 'undefined') {
            const isActive = window.__transportModeActive || false;
            window.__transportModeActive = !isActive;
            
            const event = new CustomEvent('showTransportRoutes');
            window.dispatchEvent(event);
            console.log('showTransportRoutes event dispatched');
          }
          
          // Force re-render
          setForceUpdate(prev => !prev);
        }}
        className={`px-4 py-2 ${typeof window !== 'undefined' && window.__transportModeActive ? 'bg-purple-800 border-2 border-yellow-400' : 'bg-purple-600'} text-white rounded-md shadow-md hover:bg-purple-700 transition-colors flex items-center space-x-2`}
        title="Find transport routes between locations"
      >
        <FaShip className="h-5 w-5" />
        <span>{typeof window !== 'undefined' && window.__transportModeActive ? 'Transport Mode Active' : 'Transport Routes'}</span>
      </button>
      
      {/* Placeholder for object placement */}
      {placeableObjectType && (
        <div className="px-4 py-2 bg-amber-100 text-amber-800 rounded-md shadow-md">
          <p>Placing {placeableObjectType} mode active. Click to place or press ESC to cancel.</p>
          <button 
            onClick={() => setPlaceableObjectType(null)}
            className="mt-2 px-3 py-1 bg-amber-600 text-white rounded-md hover:bg-amber-700"
          >
            Cancel
          </button>
        </div>
      )}
      
    </div>
  );
};

export default BuildingsToolbar;
