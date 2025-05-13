'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import SimpleCamera from './SimpleCamera';
import { WaterFacade as SimpleWater, WaterQualityLevel } from '../../lib/threejs/WaterFacade';
import SimplePolygonRenderer from './SimplePolygonRenderer';
import { IncomePolygonRenderer } from '../../lib/threejs/IncomePolygonRenderer';
import { ResourceDisplayManager } from '../../lib/threejs/ResourceDisplayManager';
import { CitizenDisplayManager } from '../../lib/threejs/CitizenDisplayManager';
import { calculateBounds } from './utils';
import LandDetailsPanel from './LandDetailsPanel'; // Import the existing panel
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';
import { getIncomeDataService } from '@/lib/services/IncomeDataService';

export default function SimpleViewer({ qualityMode = 'high', waterQuality = 'high', activeView = 'land' }: {
  qualityMode: 'high' | 'performance';
  waterQuality?: 'high' | 'medium' | 'low';
  activeView: 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'loans' | 'knowledge' | 'citizens';
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [polygons, setPolygons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Record<string, any>>({});
  
  // References to our scene components
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraControllerRef = useRef<SimpleCamera | null>(null);
  const waterRef = useRef<SimpleWater | null>(null);
  const polygonRendererRef = useRef<SimplePolygonRenderer | null>(null);
  const incomeRendererRef = useRef<IncomePolygonRenderer | null>(null);
  const resourceDisplayRef = useRef<ResourceDisplayManager | null>(null);
  const citizenDisplayRef = useRef<CitizenDisplayManager | null>(null);
  
  // State for land selection and details panel
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
  const [landOwners, setLandOwners] = useState<Record<string, string>>({});
  
  // State for tooltips
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    content: string;
    x: number;
    y: number;
  }>({
    visible: false,
    content: '',
    x: 0,
    y: 0
  });
  
  // Define loadUsers as a reusable function
  const loadUsers = useCallback(async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      // Try to fetch from the API
      console.log(`Attempting to fetch users from ${apiUrl}/api/users`);
      
      // Add a timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${apiUrl}/api/users`, {
        signal: controller.signal
      }).catch(error => {
        console.warn('Fetch request failed:', error);
        return null; // Return null to indicate fetch failed
      });
      
      clearTimeout(timeoutId);
      
      // If fetch failed or returned non-OK status, use fallback data
      if (!response || !response.ok) {
        console.warn(`Using fallback user data because API is unavailable (${response ? response.status : 'connection failed'})`);
        
        // Create default users as fallback
        const defaultUsers = {
          'ConsiglioDeiDieci': {
            user_name: 'ConsiglioDeiDieci',
            color: '#8B0000', // Dark red
            coat_of_arms_image: null
          }
        };
        
        setUsers(defaultUsers);
        console.log('Using default users data due to API error');
        return defaultUsers;
      }
      
      const data = await response.json();
      if (data && Array.isArray(data)) {
        const usersMap: Record<string, any> = {};
        data.forEach(user => {
          if (user.user_name) {
            usersMap[user.user_name] = user;
          }
        });
        
        // Ensure ConsiglioDeiDieci is always present
        if (!usersMap['ConsiglioDeiDieci']) {
          usersMap['ConsiglioDeiDieci'] = {
            user_name: 'ConsiglioDeiDieci',
            color: '#8B0000', // Dark red
            coat_of_arms_image: null
          }
        }
        
        setUsers(usersMap);
        console.log('Loaded users data:', Object.keys(usersMap).length, 'users');
        return usersMap;
      } else {
        console.warn('Invalid users data format received:', data);
        
        // Return fallback data
        const fallbackUsers = {
          'ConsiglioDeiDieci': {
            user_name: 'ConsiglioDeiDieci',
            color: '#8B0000',
            coat_of_arms_image: null
          }
        };
        
        setUsers(fallbackUsers);
        return fallbackUsers;
      }
    } catch (error) {
      console.error('Error loading users data:', error);
      
      // Create a default ConsiglioDeiDieci user as fallback
      const fallbackUsers = {
        'ConsiglioDeiDieci': {
          user_name: 'ConsiglioDeiDieci',
          color: '#8B0000', // Dark red
          coat_of_arms_image: null
        }
      };
      
      setUsers(fallbackUsers);
      console.log('Using fallback users data due to error');
      return fallbackUsers;
    }
  }, []);
  
  // Load users data on mount
  useEffect(() => {
    loadUsers();
    
    // Load income data after users
    try {
      const { getIncomeDataService } = require('../../lib/services/IncomeDataService');
      const incomeService = getIncomeDataService();
      
      // Load income data or generate simulated data
      incomeService.loadIncomeData().catch(error => {
        console.error('Error loading income data:', error);
        // Generate simulated data as fallback
        incomeService.generateLastIncomeData(polygons);
      });
    } catch (error) {
      console.warn('Error initializing income data service:', error);
    }
  }, [loadUsers, polygons]);
  
  // Load polygons (still needed to calculate bounds)
  useEffect(() => {
    fetch('/api/get-polygons')
      .then(response => response.json())
      .then(data => {
        if (data.polygons) {
          // Check for building points in the loaded polygons
          let polygonsWithBuildingPoints = 0;
          let totalBuildingPoints = 0;
          
          data.polygons.forEach(polygon => {
            if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints) && polygon.buildingPoints.length > 0) {
              polygonsWithBuildingPoints++;
              totalBuildingPoints += polygon.buildingPoints.length;
            }
          });
          
          console.log(`Loaded ${data.polygons.length} polygons`);
          console.log(`Found ${polygonsWithBuildingPoints} polygons with building points (${totalBuildingPoints} total points)`);
          
          // Log a sample of the first polygon with building points for debugging
          const samplePolygon = data.polygons.find(p => p.buildingPoints && p.buildingPoints.length > 0);
          if (samplePolygon) {
            console.log('Sample polygon with building points:', samplePolygon.id);
            console.log('First building point:', samplePolygon.buildingPoints[0]);
          }
          
          setPolygons(data.polygons);
        }
        setLoading(false);
      })
      .catch(error => {
        console.error('Error loading polygons:', error);
        setLoading(false);
      });
  }, []);
  
  // Fetch land owners
  useEffect(() => {
    const fetchLandOwners = async () => {
      try {
        const response = await fetch('/api/get-land-owners');
        if (response.ok) {
          const data = await response.json();
          if (data.lands && Array.isArray(data.lands)) {
            const ownersMap: Record<string, string> = {};
            data.lands.forEach((land: any) => {
              if (land.id && land.owner) {
                ownersMap[land.id] = land.owner;
              }
            });
            setLandOwners(ownersMap);
          }
        }
      } catch (error) {
        console.error('Error fetching land owners:', error);
      }
    };
    
    fetchLandOwners();
  }, []);
  
  // Event handlers for mouse interaction
  const handleMouseMove = (event: MouseEvent) => {
    if (polygonRendererRef.current && canvasRef.current) {
      polygonRendererRef.current.handleMouseMove(event, canvasRef.current);
    }
  };

  const handleMouseClick = (event: MouseEvent) => {
    if (polygonRendererRef.current && canvasRef.current) {
      polygonRendererRef.current.handleMouseClick(event, canvasRef.current);
    }
  };
  
  // Add event listeners for mouse interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      console.log("Setting up mouse event listeners on canvas");
      
      // Define the handlers with debug logging
      const handleMouseMoveWithDebug = (event: MouseEvent) => {
        // console.log("Mouse move event detected"); // Uncomment if needed
        if (polygonRendererRef.current && canvasRef.current) {
          polygonRendererRef.current.handleMouseMove(event, canvasRef.current);
        }
      };
      
      const handleMouseClickWithDebug = (event: MouseEvent) => {
        console.log(`Mouse click event detected: button=${event.button}, clientX=${event.clientX}, clientY=${event.clientY}`);
        if (polygonRendererRef.current && canvasRef.current) {
          polygonRendererRef.current.handleMouseClick(event, canvasRef.current);
        }
      };
      
      const handleContextMenuWithDebug = (e: MouseEvent) => {
        console.log("Context menu event prevented");
        // Prevent the context menu from appearing when right-clicking
        e.preventDefault();
      };
      
      // Add the event listeners
      canvas.addEventListener('mousemove', handleMouseMoveWithDebug);
      canvas.addEventListener('click', handleMouseClickWithDebug);
      canvas.addEventListener('contextmenu', handleContextMenuWithDebug);
      
      console.log("All mouse event listeners attached to canvas");
      
      return () => {
        console.log("Removing mouse event listeners from canvas");
        canvas.removeEventListener('mousemove', handleMouseMoveWithDebug);
        canvas.removeEventListener('click', handleMouseClickWithDebug);
        canvas.removeEventListener('contextmenu', handleContextMenuWithDebug);
      };
    }
  }, []);
  
  // Set up Three.js scene
  useEffect(() => {
    if (!canvasRef.current || loading || polygons.length === 0) return;
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#87CEEB'); // Light sky blue
    sceneRef.current = scene;
    
    // Create renderer with logarithmic depth buffer
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current,
      antialias: true,
      logarithmicDepthBuffer: true  // Enable logarithmic depth buffer to prevent z-fighting
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    // Enable shadows
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
    rendererRef.current = renderer;
    
    // Calculate bounds for all polygons (still needed for water size)
    const bounds = calculateBounds(polygons);
    
    // Create camera controller
    const cameraController = new SimpleCamera(renderer.domElement);
    cameraControllerRef.current = cameraController;
    
    // Position camera to see the buildings
    cameraController.camera.position.set(45, 20, 12); // Position camera to see the market stall
    cameraController.controls.target.set(45, 0, 12); // Look at the market stall position
    
    // IMPORTANT: Expose scene, camera, and polygons to window object
    if (typeof window !== 'undefined') {
      window.__threeContext = {
        scene,
        camera: cameraController.camera,
        renderer
      };
      
      // Also expose on canvas element for backward compatibility
      if (canvasRef.current) {
        canvasRef.current.__scene = scene;
        canvasRef.current.__camera = cameraController.camera;
        canvasRef.current.__renderer = renderer;
      }
      
      // Store polygon data on window
      window.__polygonData = polygons;
      
      // IMPORTANT: Dispatch a custom event to signal that the scene is ready
      window.dispatchEvent(new CustomEvent('sceneReady', {
        detail: {
          scene,
          camera: cameraController.camera
        }
      }));
      console.log('SimpleViewer: Dispatched sceneReady event');
    }
    
    // Force refresh buildings when the component mounts
    eventBus.emit(EventTypes.BUILDING_PLACED, { refresh: true });
    
    // Log the scene and camera for debugging
    console.log('SimpleViewer scene:', scene);
    console.log('SimpleViewer camera:', cameraController.camera);
    
    // Create water first (so it's rendered first)
    const waterSize = Math.max(bounds.scale * 500, 1000);
    const water = new SimpleWater({
      scene,
      size: waterSize,
      quality: waterQuality || (qualityMode === 'high' ? 'high' : 'medium'),
      position: { y: 0 } // Explicitly set y position to 0
    });
    waterRef.current = water;
    
    // Log water quality for debugging
    console.log('Water created with quality:', water.getQualityString());
    
    // Create polygon renderer after water, passing activeView, users, camera, and selection callback
    const polygonRenderer = new SimplePolygonRenderer({
      scene,
      polygons,
      bounds,
      activeView,
      users,
      camera: cameraController.camera, // Pass the camera
      onLandSelected: (landId) => {
        // Handle land selection
        setSelectedPolygonId(landId);
      },
      sandColor: 0xfff0c0 // Add this line to make land lighter and more yellow
    });
    polygonRendererRef.current = polygonRenderer;
    
    // Create income renderer if in land view
    if (activeView === 'land') {
      console.log('Creating income renderer for land view');
      const incomeRenderer = new IncomePolygonRenderer({
        scene,
        polygons,
        bounds
      });
      incomeRendererRef.current = incomeRenderer;
    }
    
    // Create resource display manager
    const resourceDisplay = new ResourceDisplayManager({
      scene,
      camera: cameraController.camera,
      bounds: {
        centerLat: bounds.centerLat || 45.4371, // Default to Venice coordinates if undefined
        centerLng: bounds.centerLng || 12.3326,
        scale: bounds.scale || 1000, // Use the existing scale or default
        latCorrectionFactor: bounds.latCorrectionFactor || 1.0
      }
    });
    
    // Initialize the resource display
    resourceDisplay.initialize().then(() => {
      console.log('Resource display initialized');
      
      // Set active if we're in resources view
      if (activeView === 'resources') {
        resourceDisplay.setActive(true);
      }
    });
    
    resourceDisplayRef.current = resourceDisplay;
    
    // Create citizen display manager
    const citizenDisplay = new CitizenDisplayManager({
      scene,
      camera: cameraController.camera,
      bounds: {
        centerLat: bounds.centerLat || 45.4371, // Default to Venice coordinates if undefined
        centerLng: bounds.centerLng || 12.3326,
        scale: bounds.scale || 1000, // Use the existing scale or default
        latCorrectionFactor: bounds.latCorrectionFactor || 1.0
      }
    });
    
    // Initialize the citizen display
    citizenDisplay.initialize().then(() => {
      console.log('Citizen display initialized');
      
      // Set active if we're in citizens view
      if (activeView === 'citizens') {
        citizenDisplay.setActive(true);
      }
    });
    
    citizenDisplayRef.current = citizenDisplay;
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    // Enable shadows from the directional light
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    scene.add(directionalLight);
    
    // Animation loop
    const animate = () => {
      try {
        requestAnimationFrame(animate);
        
        if (cameraController) {
          cameraController.update();
        }
        
        if (waterRef.current) {
          waterRef.current.update();
        }
        
        renderer.render(scene, cameraController.camera);
      } catch (error) {
        console.error('Error in animation loop:', error);
        // Don't rethrow to keep animation going
      }
    };
    
    animate();
    
    // Handle window resize
    const handleResize = () => {
      if (!cameraController || !renderer) return;
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      cameraController.camera.aspect = width / height;
      cameraController.camera.updateProjectionMatrix();
      
      renderer.setSize(width, height);
    };
    
    window.addEventListener('resize', handleResize);
    
    // IMPORTANT: Create transport markers at the end of initialization
    // This ensures they're not removed by other operations
    setTimeout(() => {
      if (activeView === 'transport' && polygonRendererRef.current) {
        console.log('Creating transport markers after initialization');
        polygonRendererRef.current.forceCreateBridgeAndDockPoints();
      }
      
      // Also ensure building markers are visible if in buildings view
      if (activeView === 'buildings' && polygonRendererRef.current) {
        console.log('Ensuring building markers are visible after initialization');
        polygonRendererRef.current.createBuildingPoints();
        polygonRendererRef.current.forceShowBuildingMarkers();
        
        // Force a scene update
        renderer.render(scene, cameraController.camera);
      }
    }, 1000); // Delay by 1 second to ensure everything else is loaded
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (polygonRendererRef.current) polygonRendererRef.current.cleanup();
      if (incomeRendererRef.current) incomeRendererRef.current.cleanup();
      if (resourceDisplayRef.current) resourceDisplayRef.current.dispose();
      if (citizenDisplayRef.current) citizenDisplayRef.current.dispose();
      if (waterRef.current) waterRef.current.dispose();
      if (cameraController) cameraController.cleanup();
      if (renderer) renderer.dispose();
      
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(material => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });
      
      // Clean up window references
      if (typeof window !== 'undefined') {
        delete window.__threeContext;
        delete window.__polygonData;
        
        if (canvasRef.current) {
          delete canvasRef.current.__scene;
          delete canvasRef.current.__camera;
          delete canvasRef.current.__renderer;
        }
      }
    };
  }, [polygons, loading, qualityMode, activeView, users]);
  
  // Update view mode when activeView changes
  useEffect(() => {
    console.log(`SimpleViewer: activeView changed to ${activeView}`);
    
    if (polygonRendererRef.current) {
      console.log(`Updating polygon renderer view mode to ${activeView}`);
      polygonRendererRef.current.updateViewMode(activeView);
      
      // Force building points to be visible in transport view
      if (activeView === 'transport') {
        console.log('Forcing building points to be visible in transport view');
        polygonRendererRef.current.forceBuildingPointsVisible();
      }
    } else {
      console.warn('polygonRendererRef.current is null, cannot update view mode');
    }
    
    // Show/hide income visualization based on view mode
    if (incomeRendererRef.current) {
      console.log(`Setting income renderer visibility to ${activeView === 'land'}`);
      incomeRendererRef.current.setVisible(activeView === 'land');
    } else {
      console.warn('incomeRendererRef.current is null, cannot update visibility');
    }
    
    // Update resource display active state
    if (resourceDisplayRef.current) {
      const shouldBeActive = activeView === 'resources';
      resourceDisplayRef.current.setActive(shouldBeActive);
    
      // If activating resources view, refresh resources
      if (shouldBeActive) {
        resourceDisplayRef.current.refreshResources();
      }
    }
    
    // Update citizen display active state
    if (citizenDisplayRef.current) {
      const shouldBeActive = activeView === 'citizens';
  
      if (shouldBeActive) {
        // If we're activating the citizens view, make sure it's active
        citizenDisplayRef.current.setActive(true);
      
        // Force markers to be visible after a short delay to ensure everything is loaded
        setTimeout(() => {
          if (citizenDisplayRef.current) {
            citizenDisplayRef.current.forceMarkersVisible();
          }
        }, 500);
      } else if (citizenDisplayRef.current.isActiveView()) {
        // Only deactivate if it's currently active
        citizenDisplayRef.current.setActive(false);
      }
    }
    
    // If we're switching to buildings view, ensure the BuildingRenderer is active
    if (activeView === 'buildings') {
      console.log('Dispatching event to refresh buildings');
      // Dispatch an event to refresh buildings
      eventBus.emit(EventTypes.BUILDING_PLACED, { refresh: true });
    }
    
    // If we're switching to transport view, log additional information
    if (activeView === 'transport') {
      console.log('Switched to transport view - checking for bridge and dock points');
      
      // Check if we have any polygons with bridge or dock points
      if (polygons && polygons.length > 0) {
        let bridgePointCount = 0;
        let dockPointCount = 0;
        let polygonsWithBridgePoints = 0;
        let polygonsWithDockPoints = 0;
        
        polygons.forEach(polygon => {
          if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints) && polygon.bridgePoints.length > 0) {
            bridgePointCount += polygon.bridgePoints.length;
            polygonsWithBridgePoints++;
          }
          if (polygon.dockPoints && Array.isArray(polygon.dockPoints) && polygon.dockPoints.length > 0) {
            dockPointCount += polygon.dockPoints.length;
            polygonsWithDockPoints++;
          }
        });
        
        console.log(`Found ${bridgePointCount} bridge points in ${polygonsWithBridgePoints} polygons`);
        console.log(`Found ${dockPointCount} dock points in ${polygonsWithDockPoints} polygons`);
        
        // Log a sample of the first polygon with dock points for debugging
        const samplePolygon = polygons.find(p => p.dockPoints && p.dockPoints.length > 0);
        if (samplePolygon) {
          console.log('Sample polygon with dock points:', samplePolygon.id);
          console.log('First dock point:', samplePolygon.dockPoints[0]);
        }
      } else {
        console.warn('No polygons available to check for bridge/dock points');
      }
    }
    
    // Add a handler for ensuring building markers are visible
    const handleEnsureBuildingsVisible = () => {
      console.log('Received ensureBuildingsVisible event');
      if (polygonRendererRef.current && activeView === 'buildings') {
        // Force building markers to be visible
        polygonRendererRef.current.forceShowBuildingMarkers();
        console.log('Forced building markers to be visible');
      }
    };
    
    window.addEventListener('ensureBuildingsVisible', handleEnsureBuildingsVisible);
    
    // If we're in buildings view, dispatch the event immediately
    if (activeView === 'buildings') {
      window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
    }
    
    return () => {
      window.removeEventListener('ensureBuildingsVisible', handleEnsureBuildingsVisible);
    };
  }, [activeView, polygons]);
  
  
  // Add debug helper function for transport markers
  const debugTransportMarkers = () => {
    if (!sceneRef.current) {
      console.log("No scene reference available");
      return;
    }
    
    console.log("Debugging transport markers...");
    
    // First, check if we're in transport view
    if (activeView !== 'transport') {
      console.log("Not in transport view! Current view:", activeView);
      console.log("Switching to transport view...");
      
      // Force switch to transport view
      if (polygonRendererRef.current) {
        polygonRendererRef.current.updateViewMode('transport');
      }
    }
    
    // Count all objects in the scene
    let totalObjects = 0;
    let meshes = 0;
    let lines = 0;
    let visibleObjects = 0;
    let highYObjects = 0;
    
    sceneRef.current.traverse(object => {
      totalObjects++;
      if (object instanceof THREE.Mesh) meshes++;
      if (object instanceof THREE.Line) lines++;
      if (object.visible) visibleObjects++;
      if (object.position.y > 5) highYObjects++;
    });
    
    console.log(`Scene statistics:
      - Total objects: ${totalObjects}
      - Meshes: ${meshes}
      - Lines: ${lines}
      - Visible objects: ${visibleObjects}
      - Objects with y > 5: ${highYObjects}
    `);
    
    // Now specifically look for transport markers
    let visibleMarkers = 0;
    let invisibleMarkers = 0;
    let potentialMarkers = [];
    
    sceneRef.current.traverse(object => {
      // Check if this is likely a transport marker based on position and render order
      if ((object instanceof THREE.Mesh || object instanceof THREE.Line) && 
          object.position.y > 0.5 && object.renderOrder >= 90) {
        potentialMarkers.push(object);
        
        if (object.visible) {
          visibleMarkers++;
        } else {
          invisibleMarkers++;
          // Force visibility
          object.visible = true;
        }
      }
    });
    
    console.log(`Found ${visibleMarkers} visible markers and ${invisibleMarkers} invisible markers`);
    console.log(`Forced visibility on ${invisibleMarkers} markers`);
    
    if (potentialMarkers.length === 0) {
      console.log("No transport markers found! Creating emergency markers...");
      
      // Create emergency markers that will definitely be visible
      for (let i = 0; i < 5; i++) {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ 
          color: 0xFF00FF, // Bright magenta
          transparent: false
        });
        
        const marker = new THREE.Mesh(geometry, material);
        marker.position.set(i * 20 - 40, 5, 0); // Position high above the center
        marker.renderOrder = 3000; // Super high render order
        
        sceneRef.current.add(marker);
        console.log(`Created emergency marker at position: ${i * 20 - 40}, 5, 0`);
      }
      
      // Force a scene update
      if (rendererRef.current) {
        rendererRef.current.render(sceneRef.current, cameraControllerRef.current.camera);
      }
      
      // If we have a polygon renderer, try to force create transport markers
      if (polygonRendererRef.current) {
        console.log("Attempting to force create transport markers...");
        
        // Use the public forceCreateBridgeAndDockPoints method
        polygonRendererRef.current.forceCreateBridgeAndDockPoints();
      }
    }
    
    // Force a scene update
    if (rendererRef.current) {
      rendererRef.current.render(sceneRef.current, cameraControllerRef.current.camera);
    }
  };
  
  // Add effect to listen for tooltip events
  useEffect(() => {
    const handleShowTooltip = (data: any) => {
      let content = '';
      
      if (data.type === 'bridge') {
        content = `Bridge Point\nPolygon: ${data.polygonId}\nPosition: ${data.position}`;
      } else if (data.type === 'dock-edge') {
        content = `Dock Edge Point\nPolygon: ${data.polygonId}\nPosition: ${data.position}`;
      } else if (data.type === 'dock-water') {
        content = `Dock Water Point\nPolygon: ${data.polygonId}\nPosition: ${data.position}`;
      } else if (data.type === 'building-point') {
        content = `Building Point\nPolygon: ${data.polygonId}\nPosition: ${data.position}`;
      } else if (data.type === 'delete') {
        // Handle the new delete tooltip type
        content = data.content || 'Deleting transport point...';
      }
      
      setTooltip({
        visible: true,
        content,
        x: data.screenX,
        y: data.screenY
      });
    };
    
    const handleHideTooltip = () => {
      setTooltip(prev => ({ ...prev, visible: false }));
    };
    
    const tooltipShowSubscription = eventBus.subscribe(
      EventTypes.SHOW_TOOLTIP,
      handleShowTooltip
    );
    
    const tooltipHideSubscription = eventBus.subscribe(
      EventTypes.HIDE_TOOLTIP,
      handleHideTooltip
    );
    
    return () => {
      tooltipShowSubscription.unsubscribe();
      tooltipHideSubscription.unsubscribe();
    };
  }, []);
  
  // Add effect to listen for income data events
  useEffect(() => {
    // Handle income data fetching event
    const handleFetchIncomeData = () => {
      console.log('Received fetchIncomeData event');
      if (incomeRendererRef.current) {
        const incomeService = getIncomeDataService();
        incomeService.loadIncomeData().then(() => {
          console.log('Income data loaded successfully');
          
          // If we have an income renderer, update it
          if (incomeRendererRef.current) {
            incomeRendererRef.current.updateIncomeVisualization();
          }
        });
      }
    };
    
    // Handle showing income visualization event
    const handleShowIncomeVisualization = () => {
      console.log('Received showIncomeVisualization event');
      if (incomeRendererRef.current) {
        incomeRendererRef.current.setVisible(true);
      }
    };
    
    // Handle income data updated event from event bus
    const handleIncomeDataUpdated = (data: any) => {
      console.log('Received income data updated event:', data);
      if (incomeRendererRef.current && activeView === 'land') {
        incomeRendererRef.current.updateIncomeVisualization();
      }
    };
    
    window.addEventListener('fetchIncomeData', handleFetchIncomeData);
    window.addEventListener('showIncomeVisualization', handleShowIncomeVisualization);
    
    // Subscribe to income data updated event using string literal instead of enum
    // since INCOME_DATA_UPDATED might not be defined in EventTypes
    const incomeDataSubscription = eventBus.subscribe(
      'INCOME_DATA_UPDATED',
      handleIncomeDataUpdated
    );
    
    // Also fetch income data immediately if we're in land view
    if (activeView === 'land') {
      const incomeService = getIncomeDataService();
      incomeService.loadIncomeData().then(() => {
        console.log('Income data loaded on initial mount');
      });
    }
    
    return () => {
      window.removeEventListener('fetchIncomeData', handleFetchIncomeData);
      window.removeEventListener('showIncomeVisualization', handleShowIncomeVisualization);
      incomeDataSubscription.unsubscribe();
    };
  }, [activeView]);
  
  // Add effect to update coat of arms when user data changes
  useEffect(() => {
    const handleUserProfileUpdated = (event: CustomEvent) => {
      console.log('User profile updated event detected in SimpleViewer');
      if (polygonRendererRef.current) {
        // Reload users data
        loadUsers().then(() => {
          // Only update coat of arms in the renderer if we're in land view
          if (polygonRendererRef.current && activeView === 'land') {
            // Force a refresh by updating the coat of arms map
            const updatedUsers = users || {};
            const coatOfArmsMap: Record<string, string> = {};
            
            Object.values(updatedUsers).forEach(user => {
              if (user.user_name && user.coat_of_arms_image) {
                coatOfArmsMap[user.user_name] = user.coat_of_arms_image;
              }
            });
            
            if (Object.keys(coatOfArmsMap).length > 0) {
              polygonRendererRef.current.updateCoatOfArms(coatOfArmsMap);
            }
          }
        });
      }
    };
    
    window.addEventListener('userProfileUpdated', handleUserProfileUpdated as EventListener);
    
    return () => {
      window.removeEventListener('userProfileUpdated', handleUserProfileUpdated as EventListener);
    };
  }, [loadUsers, activeView, users]);
  
  
  // Update water quality when parent component changes quality mode
  useEffect(() => {
    if (waterRef.current) {
      waterRef.current.setQuality(qualityMode === 'high' ? 'high' : 'medium');
    }
  }, [qualityMode]);
  
  
  // Update quality mode when it changes from parent
  useEffect(() => {
    console.log('Quality mode changed to:', qualityMode);
    if (waterRef.current) {
      waterRef.current.setQuality(qualityMode === 'high' ? 'high' : 'medium');
    }
  }, [qualityMode]);
  
  
  // Listen for water quality change events
  useEffect(() => {
    const handleWaterQualityChanged = (event: CustomEvent) => {
      if (event.detail && event.detail.waterQuality && waterRef.current) {
        console.log('SimpleViewer: Updating water quality to:', event.detail.waterQuality);
        waterRef.current.setQuality(event.detail.waterQuality, true);
      }
    };
    
    window.addEventListener('waterQualityChanged', handleWaterQualityChanged as EventListener);
    
    return () => {
      window.removeEventListener('waterQualityChanged', handleWaterQualityChanged as EventListener);
    };
  }, []);
  
  
  return (
    <div className="w-screen h-screen">
      <canvas ref={canvasRef} className="w-full h-full" />
      
      {/* Land Details Panel */}
      <LandDetailsPanel
        selectedPolygonId={selectedPolygonId}
        onClose={() => {
          setSelectedPolygonId(null);
          // Also deselect in the renderer
          if (polygonRendererRef.current) {
            polygonRendererRef.current.deselectLand();
          }
        }}
        polygons={polygons}
        landOwners={landOwners}
      />
      
      {/* Resources View Legend */}
      {activeView === 'resources' && (
        <div className="absolute bottom-4 right-4 bg-black/70 text-white p-3 rounded-lg shadow-lg">
          <h3 className="text-lg font-serif mb-2">Resources</h3>
          <div className="text-sm space-y-1">
            <p>Hover over resource icons to see details</p>
            <p>Click on resources to select them</p>
            <p>Resources are grouped by location</p>
            <p>Red badge shows number of resources at location</p>
            <p>Black badge shows resource quantity</p>
          </div>
          <div className="mt-3 pt-2 border-t border-gray-600">
            <h4 className="text-sm font-bold mb-1">Resource Categories:</h4>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-[#8B4513] mr-1"></div>
                <span>Raw Materials</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-[#228B22] mr-1"></div>
                <span>Food</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-[#B8860B] mr-1"></div>
                <span>Crafted Goods</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-[#9932CC] mr-1"></div>
                <span>Luxury Goods</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-[#708090] mr-1"></div>
                <span>Building Materials</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-[#4682B4] mr-1"></div>
                <span>Tools</span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Land Income View Legend */}
      {activeView === 'land' && (
        <div className="absolute bottom-4 right-4 bg-black/70 text-white p-3 rounded-lg shadow-lg">
          <h3 className="text-lg font-serif mb-2">Land Income</h3>
          <div className="text-sm space-y-1">
            <p>Land parcels are colored by income level</p>
            <p>Click on a parcel to see detailed information</p>
          </div>
          <div className="mt-3 pt-2 border-t border-gray-600">
            <h4 className="text-sm font-bold mb-1">Income Levels:</h4>
            <div className="flex items-center mt-1">
              <div className="w-full h-4 rounded bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"></div>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span>Low</span>
              <span>Medium</span>
              <span>High</span>
            </div>
            <button 
              onClick={() => {
                const incomeService = getIncomeDataService();
                incomeService.loadIncomeData().then(() => {
                  if (incomeRendererRef.current) {
                    incomeRendererRef.current.updateIncomeVisualization();
                  }
                });
              }}
              className="mt-3 w-full py-1 px-2 bg-amber-600 hover:bg-amber-700 rounded text-sm transition-colors"
            >
              Refresh Income Data
            </button>
          </div>
        </div>
      )}
      
      {/* Transport View Legend */}
      {activeView === 'transport' && (
        <div className="absolute bottom-4 right-4 bg-black/70 text-white p-3 rounded-lg shadow-lg">
          <h3 className="text-lg font-serif mb-2">Transport Points</h3>
          <div className="flex items-center mb-1">
            <div className="w-4 h-4 rounded-full bg-[#00AAFF] mr-2"></div>
            <span>Dock Points</span>
          </div>
          <div className="flex items-center mb-1">
            <div className="w-4 h-4 rounded-full bg-[#FF5500] mr-2"></div>
            <span>Bridge Points</span>
          </div>
          <div className="flex items-center mb-1">
            <div className="w-4 h-4 rounded-full bg-[#FFFFFF] mr-2"></div>
            <span>Building Points</span>
          </div>
          <div className="flex items-center mb-3">
            <div className="w-4 h-4 rounded-full bg-[#FFFF00] mr-2"></div>
            <span>Distance Measurement</span>
          </div>
          <div className="text-xs text-gray-300 mb-2">
            Click on building points to measure distances between buildings
          </div>
          <button 
            onClick={debugTransportMarkers}
            className="px-2 py-1 bg-amber-600 text-white rounded text-sm hover:bg-amber-700"
          >
            Debug Markers
          </button>
        </div>
      )}
      
      {/* Tooltip */}
      {tooltip.visible && (
        <div 
          className="absolute bg-black/80 text-white p-2 rounded text-sm pointer-events-none whitespace-pre-line"
          style={{
            left: tooltip.x + 10,
            top: tooltip.y + 10,
            zIndex: 1000
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}
