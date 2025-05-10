import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import RoadCreator from '@/components/PolygonViewer/RoadCreator';
import BuildingRenderer from '@/components/BuildingRenderer';
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
  const [isRoadCreatorActive, setIsRoadCreatorActive] = useState(false);
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
            
            // Add a visible marker at the market stall position
            const markerGeometry = new THREE.SphereGeometry(1, 16, 16);
            const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.position.set(45.42623684734749, 10, 12.33922034185465);
            marker.userData.id = 'market-stall-marker';
            scene.add(marker);
            console.log('Market stall position marker added:', marker);
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
          if (!scene) {
            console.error('Scene not available');
            return;
          }
          
          console.log('Creating debug building');
          
          // Create a visible box at the origin
          const geometry = new THREE.BoxGeometry(2, 2, 2);
          const material = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            wireframe: true
          });
          const debugBox = new THREE.Mesh(geometry, material);
          debugBox.position.set(0, 0.1, 0);
          scene.add(debugBox);
          console.log('Added debug box at position:', debugBox.position);
          
          // Create a sphere to mark the position
          const sphereGeometry = new THREE.SphereGeometry(1, 16, 16);
          const sphereMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00
          });
          const debugSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
          debugSphere.position.set(0, 2, 0);
          scene.add(debugSphere);
          console.log('Added debug sphere at position:', debugSphere.position);
          
          // Create the market stall data
          const marketStallData = {
            id: 'debug-market-stall',
            type: 'market-stall',
            land_id: 'polygon-1746052711032',
            position: { 
              lat: 45.4371, 
              lng: 12.3358
            },
            rotation: 0,
            created_by: 'ConsiglioDeiDieci',
            created_at: new Date().toISOString()
          };
          
          // Dispatch an event to add the building
          eventBus.emit(EventTypes.BUILDING_PLACED, {
            buildingId: marketStallData.id,
            type: marketStallData.type,
            data: marketStallData
          });
          
          console.log('Debug building creation event dispatched');
        }}
        className="px-4 py-2 bg-purple-600 text-white rounded-md shadow-md hover:bg-purple-700 transition-colors flex items-center space-x-2"
        title="Create Debug Building"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <span>Create Debug Building</span>
      </button>
      
      <button
        onClick={() => {
          // Focus camera on the market stall building
          if (camera) {
            // Get the actual camera - either from props or from the canvas element
            const actualCamera = camera || (document.querySelector('canvas')?.__camera as THREE.PerspectiveCamera);
            
            if (actualCamera) {
              console.log('Repositioning camera to view market stall');
              
              // Set camera position to look at the origin (where market stall should be)
              // Position camera at a good viewing angle
              actualCamera.position.set(10, 10, 10);
              
              // Get the orbit controls
              const controls = actualCamera.userData?.controls;
              if (controls && controls.target) {
                // Set the target to the origin
                controls.target.set(0, 0, 0);
                controls.update();
                console.log('Camera controls updated to target market stall');
              } else {
                // If we can't find controls on the camera, try to find them on the scene
                const sceneControls = scene?.userData?.controls;
                if (sceneControls) {
                  sceneControls.target.set(0, 0, 0);
                  sceneControls.update();
                  console.log('Scene controls updated to target market stall');
                } else {
                  // Last resort - try to find controls on the document
                  const canvasElement = document.querySelector('canvas');
                  if (canvasElement) {
                    const canvasControls = (canvasElement as any).__controls;
                    if (canvasControls) {
                      canvasControls.target.set(0, 0, 0);
                      canvasControls.update();
                      console.log('Canvas controls updated to target market stall');
                    }
                  }
                }
              }
              
              // Force a render update
              if (scene) {
                const renderer = scene.userData?.renderer;
                if (renderer) {
                  renderer.render(scene, actualCamera);
                  console.log('Forced renderer update');
                }
              }
              
              console.log('Camera repositioned to:', actualCamera.position);
              console.log('Looking at market stall position:', {
                x: 0,
                y: 0,
                z: 0
              });
            } else {
              console.warn('Could not find camera to reposition');
            }
          } else {
            console.warn('Camera not available for repositioning');
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
          // Dispatch event to focus on all buildings
          if (typeof window !== 'undefined') {
            console.log('Dispatching focusOnBuildings event');
            window.dispatchEvent(new CustomEvent('focusOnBuildings'));
          }
        }}
        className="px-4 py-2 bg-green-600 text-white rounded-md shadow-md hover:bg-green-700 transition-colors flex items-center space-x-2"
        title="Focus on all buildings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
        <span>View All Buildings</span>
      </button>
      
      <button
        onClick={() => {
          // Focus camera on all debug spheres
          if (camera) {
            // Get the actual camera
            const actualCamera = camera || (document.querySelector('canvas')?.__camera as THREE.PerspectiveCamera);
            
            if (actualCamera && scene) {
              console.log('Repositioning camera to view all debug spheres');
              
              // Find all debug spheres in the scene
              const debugSpheres: THREE.Object3D[] = [];
              scene.traverse((object) => {
                if (object.userData && object.name && object.name.includes('debug_sphere')) {
                  debugSpheres.push(object);
                } else if (object instanceof THREE.Mesh && 
                          object.geometry instanceof THREE.SphereGeometry) {
                  // Also include any sphere geometries as they might be our debug spheres
                  debugSpheres.push(object);
                }
              });
              
              console.log(`Found ${debugSpheres.length} debug spheres`);
              
              if (debugSpheres.length > 0) {
                // Calculate the center and size of all debug spheres
                const box = new THREE.Box3();
                debugSpheres.forEach(sphere => {
                  box.expandByObject(sphere);
                });
                
                const center = new THREE.Vector3();
                box.getCenter(center);
                const size = new THREE.Vector3();
                box.getSize(size);
                
                // Position camera to see all debug spheres
                const maxDim = Math.max(size.x, size.y, size.z);
                const distance = maxDim * 2; // Distance based on size
                
                // Position camera at an angle to see height differences
                actualCamera.position.set(
                  center.x + distance, 
                  center.y + distance * 0.7, 
                  center.z + distance
                );
                
                // Look at the center
                actualCamera.lookAt(center);
                
                // Update controls if available
                const controls = actualCamera.userData?.controls;
                if (controls && controls.target) {
                  controls.target.copy(center);
                  controls.update();
                }
                
                console.log('Camera repositioned to view all debug spheres');
                console.log('Camera position:', actualCamera.position);
                console.log('Looking at:', center);
              } else {
                console.log('No debug spheres found');
              }
            }
          }
        }}
        className="px-4 py-2 bg-purple-600 text-white rounded-md shadow-md hover:bg-purple-700 transition-colors flex items-center space-x-2"
        title="Focus on Debug Spheres"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
        </svg>
        <span>Focus on Debug Spheres</span>
      </button>
      
      <button
        onClick={() => {
          // Dispatch an event to regenerate building markers
          if (typeof window !== 'undefined') {
            console.log('Dispatching regenerateBuildingMarkers event');
            window.dispatchEvent(new CustomEvent('regenerateBuildingMarkers'));
          }
        }}
        className="px-4 py-2 bg-orange-600 text-white rounded-md shadow-md hover:bg-orange-700 transition-colors flex items-center space-x-2"
        title="Regenerate all building markers"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
        </svg>
        <span>Regenerate Building Markers</span>
      </button>
      
      <button
        onClick={() => {
          // Focus camera on the expected building position
          if (camera) {
            // Get the actual camera
            const actualCamera = camera || (document.querySelector('canvas')?.__camera as THREE.PerspectiveCamera);
            
            if (actualCamera) {
              console.log('Repositioning camera to view expected building position');
              
              // Position camera to see the expected building location
              actualCamera.position.set(55, 20, 22);
              
              // Look at the expected building position
              const targetPosition = new THREE.Vector3(45, 10, 12);
              actualCamera.lookAt(targetPosition);
              
              // Update controls if available
              const controls = actualCamera.userData?.controls;
              if (controls && controls.target) {
                controls.target.copy(targetPosition);
                controls.update();
              } else {
                // If we can't find controls on the camera, try to find them on the scene
                const sceneControls = scene?.userData?.controls;
                if (sceneControls) {
                  sceneControls.target.copy(targetPosition);
                  sceneControls.update();
                }
              }
              
              console.log('Camera repositioned to view expected building position');
            }
          }
        }}
        className="px-4 py-2 bg-yellow-600 text-white rounded-md shadow-md hover:bg-yellow-700 transition-colors flex items-center space-x-2"
        title="Focus on expected building position"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
        </svg>
        <span>Focus on Building Position</span>
      </button>
      
      <button
        onClick={() => {
          // Dispatch event to add debug markers for all buildings
          if (typeof window !== 'undefined') {
            console.log('Dispatching addDebugMarkers event');
            window.dispatchEvent(new CustomEvent('addDebugMarkers'));
          }
          
          // If no buildings found, create some test markers at expected positions
          if (!buildings || buildings.length === 0) {
            console.log('No buildings found, creating test markers at expected positions');
            
            // Create markers at positions where buildings should be
            const testPositions = [
              // Convert a few lat/lng coordinates from the database to Three.js coordinates
              { lat: 45.43003055172295, lng: 12.334953915713706 }, // public_dock
              { lat: 45.4303915139355, lng: 12.334878695899736 },  // harbor_chain_tower
              { lat: 45.43046224860791, lng: 12.335395042644379 }  // dye_works
            ];
            
            testPositions.forEach((pos, index) => {
              // Convert lat/lng to Three.js coordinates using the shared normalizeCoordinates function
              const bounds = {
                centerLat: 45.4371,
                centerLng: 12.3358,
                scale: 100000,
                latCorrectionFactor: 0.7
              };
              
              const normalizedCoord = normalizeCoordinates(
                [pos],
                bounds.centerLat,
                bounds.centerLng,
                bounds.scale,
                bounds.latCorrectionFactor
              )[0];
              
              const x = normalizedCoord.x;
              const z = -normalizedCoord.y;
              
              // Create marker
              const markerGeometry = new THREE.SphereGeometry(2, 16, 16);
              const markerMaterial = new THREE.MeshBasicMaterial({ 
                color: 0x00ff00,
                transparent: false
              });
              const marker = new THREE.Mesh(markerGeometry, markerMaterial);
              marker.position.set(x, 10, z); // Position at y=10 to be visible
              marker.userData.id = `test-marker-${index}`;
              scene.add(marker);
              console.log(`Created test marker ${index} at position: ${marker.position.x}, ${marker.position.y}, ${marker.position.z}`);
              console.log(`  From lat/lng: ${pos.lat}, ${pos.lng}`);
            });
          }
        }}
        className="px-4 py-2 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
        title="Check building positions"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
        </svg>
        <span>Check Building Positions</span>
      </button>
      
      <button
        onClick={() => {
          console.log('Triggering building position fix...');
          
          // Dispatch a custom event to trigger position fixing
          window.dispatchEvent(new CustomEvent('fixBuildingPositions'));
          
          // Also force a refresh of buildings
          if (onRefreshBuildings) {
            onRefreshBuildings();
          }
        }}
        className="px-4 py-2 bg-green-600 text-white rounded-md shadow-md hover:bg-green-700 transition-colors flex items-center space-x-2"
        title="Fix building positions"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
        <span>Fix Building Positions</span>
      </button>
      
      <button
        onClick={() => {
          console.log('Triggering ensureBuildingsVisible...');
          window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
          
          // Also create some test buildings at known positions
          if (scene) {
            // Create a test building at the origin
            const geometry = new THREE.BoxGeometry(5, 5, 5);
            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const testBuilding = new THREE.Mesh(geometry, material);
            testBuilding.position.set(0, 5, 0);
            testBuilding.userData.buildingId = 'test-building-origin';
            scene.add(testBuilding);
            
            // Create another test building at a known position
            const testBuilding2 = new THREE.Mesh(geometry.clone(), material.clone());
            testBuilding2.position.set(10, 5, 10);
            testBuilding2.userData.buildingId = 'test-building-10-10';
            scene.add(testBuilding2);
            
            console.log('Added test buildings at origin and (10,5,10)');
          }
        }}
        className="px-4 py-2 bg-red-600 text-white rounded-md shadow-md hover:bg-red-700 transition-colors flex items-center space-x-2"
        title="Make buildings visible"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
        </svg>
        <span>Make Buildings Visible</span>
      </button>
      
      <button
        onClick={() => {
          // Check if buildings are in view
          if (scene && camera) {
            console.log('Checking if buildings are in camera view...');
            
            // Create a frustum to represent camera's view
            const frustum = new THREE.Frustum();
            const matrix = new THREE.Matrix4().multiplyMatrices(
              camera.projectionMatrix,
              camera.matrixWorldInverse
            );
            frustum.setFromProjectionMatrix(matrix);
            
            // Find all buildings in the scene
            const buildings: THREE.Object3D[] = [];
            scene.traverse((object) => {
              if (object.userData && object.userData.buildingId) {
                buildings.push(object);
              }
            });
            
            console.log(`Found ${buildings.length} buildings in the scene`);
            
            // Check each building against the frustum
            let visibleCount = 0;
            buildings.forEach(building => {
              // Create a bounding box for the building
              const bbox = new THREE.Box3().setFromObject(building);
              const isVisible = frustum.intersectsBox(bbox);
              
              console.log(`Building ${building.userData.buildingId}: ${isVisible ? 'VISIBLE' : 'NOT VISIBLE'}`);
              console.log(`  Position: ${building.position.x}, ${building.position.y}, ${building.position.z}`);
              console.log(`  Bounding box: min(${bbox.min.x}, ${bbox.min.y}, ${bbox.min.z}), max(${bbox.max.x}, ${bbox.max.y}, ${bbox.max.z})`);
              
              if (isVisible) {
                visibleCount++;
              }
            });
            
            console.log(`${visibleCount} out of ${buildings.length} buildings are visible in camera view`);
            
            // If no buildings are visible, log camera details
            if (visibleCount === 0 && buildings.length > 0) {
              console.log('Camera details:');
              console.log(`  Position: ${camera.position.x}, ${camera.position.y}, ${camera.position.z}`);
              console.log(`  Rotation: ${camera.rotation.x}, ${camera.rotation.y}, ${camera.rotation.z}`);
              console.log(`  FOV: ${camera.fov}`);
              console.log(`  Near/Far: ${camera.near}/${camera.far}`);
              
              // Try to get the target if it's an orbit camera
              const controls = camera.userData?.controls;
              if (controls && controls.target) {
                console.log(`  Target: ${controls.target.x}, ${controls.target.y}, ${controls.target.z}`);
              }
            }
          } else {
            console.warn('Scene or camera not available');
          }
        }}
        className="px-4 py-2 bg-indigo-600 text-white rounded-md shadow-md hover:bg-indigo-700 transition-colors flex items-center space-x-2"
        title="Check if buildings are in camera view"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
        </svg>
        <span>Check Building Visibility</span>
      </button>
      
      <button
        onClick={() => {
          console.log('Rerendering all buildings...');
          
          // First, dispatch an event to refresh buildings
          eventBus.emit(EventTypes.BUILDING_PLACED, { refresh: true });
          
          // Then force a scene update if possible
          if (scene) {
            // Find the renderer
            const renderer = scene.userData?.renderer;
            if (renderer) {
              console.log('Forcing renderer update');
              renderer.render(scene, camera || (document.querySelector('canvas')?.__camera as THREE.PerspectiveCamera));
            }
            
            // Log all buildings in the scene after refresh
            console.log('Buildings in scene after refresh:');
            scene.traverse((object) => {
              if (object.userData && object.userData.buildingId) {
                console.log(`- Building ${object.userData.buildingId}:`, object);
              }
            });
          }
          
          // Also trigger the BuildingRenderer to recreate all buildings
          if (typeof window !== 'undefined') {
            console.log('Dispatching custom event to force building rerender');
            window.dispatchEvent(new CustomEvent('forceRerenderBuildings'));
          }
          
          // Call the onRefreshBuildings callback if provided
          if (onRefreshBuildings) {
            onRefreshBuildings();
          }
        }}
        className="px-4 py-2 bg-pink-600 text-white rounded-md shadow-md hover:bg-pink-700 transition-colors flex items-center space-x-2"
        title="Force rerender all buildings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
        </svg>
        <span>Rerender Buildings</span>
      </button>
      
      <button
        onClick={() => {
          // Focus camera on the expected building position
          if (camera) {
            // Get the actual camera
            const actualCamera = camera || (document.querySelector('canvas')?.__camera as THREE.PerspectiveCamera);
            
            if (actualCamera) {
              console.log('Repositioning camera to view expected building position');
              
              // Position camera to see the expected building location
              actualCamera.position.set(55, 20, 22);
              
              // Look at the expected building position
              const targetPosition = new THREE.Vector3(45, 10, 12);
              actualCamera.lookAt(targetPosition);
              
              // Update controls if available
              const controls = actualCamera.userData?.controls;
              if (controls && controls.target) {
                controls.target.copy(targetPosition);
                controls.update();
              } else {
                // If we can't find controls on the camera, try to find them on the scene
                const sceneControls = scene?.userData?.controls;
                if (sceneControls) {
                  sceneControls.target.copy(targetPosition);
                  sceneControls.update();
                }
              }
              
              console.log('Camera repositioned to view expected building position');
            }
          }
        }}
        className="px-4 py-2 bg-yellow-600 text-white rounded-md shadow-md hover:bg-yellow-700 transition-colors flex items-center space-x-2"
        title="Focus on expected building position"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
        </svg>
        <span>Focus on Building Position</span>
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
          if (!scene) {
            console.error('Scene not available');
            return;
          }
          
          console.log('Creating market stall directly');
          
          // Create the market stall data with fixed coordinates
          const marketStallData = {
            id: 'market-stall-direct',
            type: 'market-stall',
            land_id: 'polygon-1746052711032',
            position: { 
              lat: 45.4371, // Center of Venice
              lng: 12.3358
            },
            rotation: 0,
            created_by: 'ConsiglioDeiDieci',
            created_at: new Date().toISOString()
          };
          
          // Dispatch an event to add the building
          eventBus.emit(EventTypes.BUILDING_PLACED, {
            buildingId: marketStallData.id,
            type: marketStallData.type,
            data: marketStallData
          });
          
          console.log('Market stall creation event dispatched');
          
          // Add a visible marker at the same position
          const markerGeometry = new THREE.SphereGeometry(3, 16, 16);
          const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
          const marker = new THREE.Mesh(markerGeometry, markerMaterial);
          marker.position.set(45, 10, 12);
          scene.add(marker);
          console.log('Added marker at position:', marker.position);
        }}
        className="px-4 py-2 bg-green-600 text-white rounded-md shadow-md hover:bg-green-700 transition-colors flex items-center space-x-2"
        title="Create Market Stall"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
        </svg>
        <span>Create Market Stall</span>
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
      {showBuildingRenderer ? (
        <BuildingRenderer 
          active={true} 
        />
      ) : (
        <div className="hidden">
          {console.warn('BuildingsToolbar: BuildingRenderer is not shown')}
        </div>
      )}
    </div>
  );
};

export default BuildingsToolbar;
