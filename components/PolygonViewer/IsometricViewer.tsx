'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { throttle, debounce } from '@/lib/utils/performanceUtils';
import ViewportCanvas from './ViewportCanvas';
import LandDetailsPanel from './LandDetailsPanel';
import BuildingDetailsPanel from './BuildingDetailsPanel';
import CitizenDetailsPanel from '../UI/CitizenDetailsPanel';
import ViewController from './ViewController';
import ViewportController from './ViewportController';
import { buildingService } from '@/lib/services/BuildingService';
import { transportService } from '@/lib/services/TransportService';
import { citizenService } from '@/lib/services/CitizenService';
import { incomeService } from '@/lib/services/IncomeService';
import { buildingPointsService } from '@/lib/services/BuildingPointsService';
import { viewportService } from '@/lib/services/ViewportService';
import { uiStateService } from '@/lib/services/UIStateService';
import { assetService } from '@/lib/services/AssetService';
import { dataService } from '@/lib/services/DataService';

interface IsometricViewerProps {
  activeView: 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';
}

// Define a type for all possible view types to use throughout the component
type ViewType = 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';

export default function IsometricViewer({ activeView }: IsometricViewerProps) {
  // Get UI state from service
  const [uiState, setUiState] = useState(uiStateService.getState());
  
  // Get viewport state from service
  const [scale, setScale] = useState(viewportService.getScale());
  const [offset, setOffset] = useState(viewportService.getOffset());
  
  // Data state
  const [polygons, setPolygons] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [emptyBuildingPoints, setEmptyBuildingPoints] = useState<{lat: number, lng: number}[]>([]);
  const [polygonsToRender, setPolygonsToRender] = useState<any[]>([]);
  
  // Transport state is now managed by TransportService
  const [transportMode, setTransportMode] = useState<boolean>(false);
  const [transportPath, setTransportPath] = useState<any[]>([]);
  const [mousePosition, setMousePosition] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{x: number, y: number}>({x: 0, y: 0});
  
  // Coat of arms state
  const [ownerCoatOfArmsMap, setOwnerCoatOfArmsMap] = useState<Record<string, string>>({});
  const [coatOfArmsImages, setCoatOfArmsImages] = useState<Record<string, HTMLImageElement>>({});
  const [citizens, setCitizens] = useState<any[]>([]);
  const [citizensLoaded, setCitizensLoaded] = useState<boolean>(false);
  const [citizensByBuilding, setCitizensByBuilding] = useState<Record<string, any[]>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderedCoatOfArmsCache = useRef<Record<string, {image: HTMLImageElement | null, x: number, y: number, size: number}>>({});
  
  // Building image path fetching is now handled by the UIStateService

  // Set up event listeners
  useEffect(() => {
    // Handle UI state changes
    const handleUIStateChange = () => {
      setUiState(uiStateService.getState());
    };
    
    // Handle viewport state changes
    const handleViewportScaleChanged = (data: any) => {
      setScale(data.scale);
    };
    
    const handleViewportOffsetChanged = (data: any) => {
      setOffset(data.offset);
    };
    
    // Handle transport mode events
    const handleShowTransportRoutes = () => {
      console.log('Activating transport route planning mode');
      
      // Force the active view to be 'transport' first
      if (activeView !== 'transport') {
        console.log('Switching to transport view');
        window.dispatchEvent(new CustomEvent('switchToTransportView', {
          detail: { view: 'transport' }
        }));
      }
      
      // Set a small timeout to ensure view has changed before activating transport mode
      setTimeout(() => {
        setTransportMode(true);
        // Notify other components about transport mode change
        eventBus.emit(EventTypes.TRANSPORT_MODE_CHANGED, { active: true });
        console.log('Transport mode state set to:', true);
      }, 100);
    };
    
    // Subscribe to events
    const subscriptions = [
      eventBus.subscribe(EventTypes.BUILDING_HOVER_STATE_CHANGED, handleUIStateChange),
      eventBus.subscribe(EventTypes.BUILDING_IMAGE_LOADING_STATE_CHANGED, handleUIStateChange),
      eventBus.subscribe(EventTypes.POLYGON_SELECTED, handleUIStateChange),
      eventBus.subscribe(EventTypes.BUILDING_SELECTED, handleUIStateChange),
      eventBus.subscribe(EventTypes.CITIZEN_SELECTED, handleUIStateChange),
      eventBus.subscribe(EventTypes.VIEWPORT_SCALE_CHANGED, handleViewportScaleChanged),
      eventBus.subscribe(EventTypes.VIEWPORT_OFFSET_CHANGED, handleViewportOffsetChanged)
    ];
    
    // Add window event listeners
    window.addEventListener('showTransportRoutes', handleShowTransportRoutes);
    
    // Cleanup function
    return () => {
      // Unsubscribe from all events
      subscriptions.forEach(sub => sub.unsubscribe());
      
      // Remove window event listeners
      window.removeEventListener('showTransportRoutes', handleShowTransportRoutes);
    };
  }, [activeView]);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      try {
        // Load polygons
        const polygonsData = await dataService.loadPolygons();
        setPolygons(polygonsData);
        
        // Load buildings
        const buildingsData = await dataService.loadBuildings();
        setBuildings(buildingsData);
        
        // Calculate empty building points
        const emptyPoints = dataService.getEmptyBuildingPoints(polygonsData, buildingsData);
        setEmptyBuildingPoints(emptyPoints);
        
        // Load citizens if in citizens view
        if (activeView === 'citizens') {
          const citizensData = await dataService.loadCitizens();
          setCitizens(citizensData.citizens);
          setCitizensByBuilding(citizensData.citizensByBuilding);
          setCitizensLoaded(true);
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };
    
    loadData();
  }, [activeView]);
  
  // Transport mode activation is now handled by TransportService
  useEffect(() => {
    const handleShowTransportRoutes = () => {
      console.log('Activating transport route planning mode');
      
      // Force the active view to be 'transport' first
      if (activeView !== 'transport') {
        console.log('Switching to transport view');
        window.dispatchEvent(new CustomEvent('switchToTransportView', {
          detail: { view: 'transport' }
        }));
      }
      
      // Reset transport service state
      transportService.reset();
      
      // Set transport mode to true
      setTransportMode(true);
      
      // Emit event for other components
      eventBus.emit(EventTypes.TRANSPORT_MODE_CHANGED, { active: true });
    };
    
    const eventListener = () => handleShowTransportRoutes();
    window.addEventListener('showTransportRoutes', eventListener);
    
    return () => {
      window.removeEventListener('showTransportRoutes', eventListener);
    };
  }, [activeView]);
  
  // Subscribe to transport service events
  useEffect(() => {
    const handleTransportCalculationCompleted = (data: any) => {
      setTransportPath(data.path);
    };
    
    const handleTransportReset = () => {
      setTransportPath([]);
      setTransportMode(false);
    };
    
    // Subscribe to events
    window.addEventListener('TRANSPORT_CALCULATION_COMPLETED', handleTransportCalculationCompleted as EventListener);
    window.addEventListener('TRANSPORT_RESET', handleTransportReset as EventListener);
    
    return () => {
      window.removeEventListener('TRANSPORT_CALCULATION_COMPLETED', handleTransportCalculationCompleted as EventListener);
      window.removeEventListener('TRANSPORT_RESET', handleTransportReset as EventListener);
    };
  }, []);
  
  // Fetch income data
  const fetchIncomeData = useCallback(async () => {
    try {
      console.log('Fetching income data...');
      setIncomeDataLoaded(false); // Reset to false when starting to fetch
      
      const response = await fetch('/api/get-income-data');
      if (response.ok) {
        const data = await response.json();
        if (data.incomeData && Array.isArray(data.incomeData)) {
          // Create a map of polygon ID to income
          const incomeMap: Record<string, number> = {};
          let min = Infinity;
          let max = -Infinity;
          
          data.incomeData.forEach((item: any) => {
            if (item.polygonId && typeof item.income === 'number') {
              incomeMap[item.polygonId] = item.income;
              min = Math.min(min, item.income);
              max = Math.max(max, item.income);
            }
          });
          
          // Set min/max income values (with reasonable defaults if needed)
          setMinIncome(min !== Infinity ? min : 0);
          setMaxIncome(max !== -Infinity ? max : 1000);
          setIncomeData(incomeMap);
          setIncomeDataLoaded(true); // Set to true when data is loaded
          console.log(`Income data loaded: ${Object.keys(incomeMap).length} entries, min=${min}, max=${max}`);
        }
      }
    } catch (error) {
      console.error('Error fetching income data:', error);
    }
  }, []);
  
  // Load coat of arms
  useEffect(() => {
    const loadCoatOfArms = async () => {
      try {
        const response = await fetch('/api/get-coat-of-arms');
        if (response.ok) {
          const data = await response.json();
          if (data.coatOfArms && typeof data.coatOfArms === 'object') {
            setOwnerCoatOfArmsMap(data.coatOfArms);
            
            // Load coat of arms images through AssetService
            const images = await assetService.loadCoatOfArmsImages(data.coatOfArms);
            setCoatOfArmsImages(images);
          }
        }
      } catch (error) {
        console.error('Error fetching coat of arms:', error);
      }
    };
    
    loadCoatOfArms();
  }, []);
  
  // Fetch income data when in land view
  useEffect(() => {
    if (activeView === 'land') {
      incomeService.loadIncomeData();
    }
  }, [activeView]);

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

  // Load users data
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const response = await fetch(`${apiUrl}/api/users`);
        
        if (response.ok) {
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
          }
        }
      } catch (error) {
        console.warn('Error loading users data:', error);
        
        // Create a default ConsiglioDeiDieci user as fallback
        const fallbackUsers = {
          'ConsiglioDeiDieci': {
            user_name: 'ConsiglioDeiDieci',
            color: '#8B0000', // Dark red
            coat_of_arms_image: null
          }
        };
        
        setUsers(fallbackUsers);
      }
    };
    
    loadUsers();
  }, []);

  // Load buildings regardless of active view
  useEffect(() => {
    const fetchBuildings = async () => {
      try {
        // First, ensure building points are loaded
        if (!buildingPointsService.isPointsLoaded()) {
          console.log('IsometricViewer: Loading building points service...');
          await buildingPointsService.loadBuildingPoints();
          console.log('IsometricViewer: Building points service loaded successfully');
        }
        
        console.log('%c FETCHING BUILDINGS: Starting API request', 'background: #4CAF50; color: white; padding: 4px 8px; font-weight: bold; border-radius: 4px;');
        const response = await fetch('/api/buildings');
        if (response.ok) {
          const data = await response.json();
          if (data.buildings) {
            console.log(`%c BUILDINGS RECEIVED: ${data.buildings.length} buildings from API`, 'background: #4CAF50; color: white; padding: 4px 8px; font-weight: bold; border-radius: 4px;');
            
            // Process buildings to ensure they all have position data
            const processedBuildings = data.buildings.map((building: any) => {
              // If building already has a position, use it
              if (building.position && 
                  ((typeof building.position === 'object' && 'lat' in building.position && 'lng' in building.position) || 
                   (typeof building.position === 'string' && building.position.includes('lat')))) {
                return building;
              }
              
              // If building has a point_id, try to get position from the service
              if (building.point_id) {
                const position = buildingPointsService.getPositionForPoint(building.point_id);
                if (position) {
                  return {
                    ...building,
                    position
                  };
                }
              }
              
              // If building has a Point field (new format), try to extract coordinates
              if (building.Point) {
                // Try to extract coordinates from the Point field (format: type_lat_lng)
                const parts = String(building.Point).split('_');
                if (parts.length >= 3) {
                  const lat = parseFloat(parts[1]);
                  const lng = parseFloat(parts[2]);
                  
                  if (!isNaN(lat) && !isNaN(lng)) {
                    return {
                      ...building,
                      position: { lat, lng }
                    };
                  }
                }
                
                // If we couldn't extract coordinates directly, try using the service
                const position = buildingPointsService.getPositionForPoint(String(building.Point));
                if (position) {
                  return {
                    ...building,
                    position
                  };
                }
              }
              
              // If we couldn't resolve a position, return the building as is
              return building;
            });
            
            setBuildings(processedBuildings);
            
            // Reset position calculation flag when new buildings are loaded
            setInitialPositionCalculated(false);
            
            // Dispatch event to ensure buildings are visible
            window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
          }
        }
      } catch (error) {
        console.error('Error fetching buildings:', error);
      }
    };
    
    // Call fetchBuildings once when the component mounts
    fetchBuildings();
    
    // Set up interval to refresh buildings
    const interval = setInterval(fetchBuildings, 30000);
    
    return () => clearInterval(interval);
  }, []); // Empty dependency array to run only on mount
  
  // Pre-calculate building positions when buildings are loaded
  useEffect(() => {
    if (buildings.length > 0 && !initialPositionCalculated) {
      console.log('Pre-calculating building positions for all buildings...');
      
      // Use a more efficient approach with a single pass
      const newPositionsCache = buildings.reduce((cache, building) => {
        if (!building.position) return cache;
        
        let position;
        try {
          position = typeof building.position === 'string' 
            ? JSON.parse(building.position) 
            : building.position;
        } catch (e) {
          return cache;
        }
        
        // Convert lat/lng to isometric coordinates
        let x, y;
        if ('lat' in position && 'lng' in position) {
          x = (position.lng - 12.3326) * 20000;
          y = (position.lat - 45.4371) * 20000;
        } else if ('x' in position && 'z' in position) {
          x = position.x;
          y = position.z;
        } else {
          return cache;
        }
        
        // Store the calculated position in the cache
        cache[building.id] = { x, y };
        return cache;
      }, {});
      
      setBuildingPositionsCache(newPositionsCache);
      setInitialPositionCalculated(true);
      console.log(`Pre-calculated positions for ${Object.keys(newPositionsCache).length} buildings`);
    }
  }, [buildings, initialPositionCalculated]);
  
  // Handle the ensureBuildingsVisible event
  useEffect(() => {
    const handleEnsureBuildingsVisible = () => {
      if (!initialPositionCalculated && buildings.length > 0) {
        console.log('Ensuring buildings are visible by calculating positions...');
        
        const newPositionsCache: Record<string, {x: number, y: number}> = {};
        
        buildings.forEach(building => {
          if (!building.position) return;
          
          let position;
          if (typeof building.position === 'string') {
            try {
              position = JSON.parse(building.position);
            } catch (e) {
              return;
            }
          } else {
            position = building.position;
          }
          
          // Convert lat/lng to isometric coordinates
          let x, y;
          if ('lat' in position && 'lng' in position) {
            x = (position.lng - 12.3326) * 20000;
            y = (position.lat - 45.4371) * 20000;
          } else if ('x' in position && 'z' in position) {
            x = position.x;
            y = position.z;
          } else {
            return;
          }
          
          // Store the calculated position in the cache
          newPositionsCache[building.id] = { x, y };
        });
        
        setBuildingPositionsCache(newPositionsCache);
        setInitialPositionCalculated(true);
      }
    };
    
    window.addEventListener('ensureBuildingsVisible', handleEnsureBuildingsVisible);
    
    return () => {
      window.removeEventListener('ensureBuildingsVisible', handleEnsureBuildingsVisible);
    };
  }, [buildings, initialPositionCalculated]);
  
  // Load citizens if in citizens view
  useEffect(() => {
    if (activeView === 'citizens') {
      loadCitizens();
    }
  }, [activeView]);
  
  // Define loadCitizens function
  const loadCitizens = useCallback(async () => {
    try {
      console.log('Loading citizens data...');
      setCitizensLoaded(false);
      
      const response = await fetch('/api/citizens');
      if (response.ok) {
        const data = await response.json();
        if (data.citizens && Array.isArray(data.citizens)) {
          setCitizens(data.citizens);
          
          // Group citizens by building
          const byBuilding: Record<string, any[]> = {};
          
          data.citizens.forEach((citizen: any) => {
            // Process home location
            if (citizen.HomeBuilding) {
              if (!byBuilding[citizen.HomeBuilding]) {
                byBuilding[citizen.HomeBuilding] = [];
              }
              
              byBuilding[citizen.HomeBuilding].push({
                ...citizen,
                markerType: 'home'
              });
            }
            
            // Process work location
            if (citizen.WorkBuilding && citizen.WorkBuilding !== citizen.HomeBuilding) {
              if (!byBuilding[citizen.WorkBuilding]) {
                byBuilding[citizen.WorkBuilding] = [];
              }
              
              byBuilding[citizen.WorkBuilding].push({
                ...citizen,
                markerType: 'work'
              });
            }
          });
          
          setCitizensByBuilding(byBuilding);
          setCitizensLoaded(true);
          console.log(`Loaded ${data.citizens.length} citizens`);
        }
      }
    } catch (error) {
      console.error('Error loading citizens:', error);
    }
  }, []);
  
  // Check image paths when citizens are loaded
  const checkImagePaths = async () => {
    console.log('Checking image paths...');
    
    // Check if the citizens directory exists
    try {
      const response = await fetch('/images/citizens/default.jpg', { method: 'HEAD' });
      console.log(`Default image check: ${response.ok ? 'EXISTS' : 'NOT FOUND'} (${response.status})`);
    } catch (error) {
      console.error('Error checking default image:', error);
    }
    
    // Check a few citizen images
    if (citizens.length > 0) {
      for (let i = 0; i < Math.min(5, citizens.length); i++) {
        const citizen = citizens[i];
        const imageUrl = citizen.ImageUrl || `/images/citizens/${citizen.CitizenId}.jpg`;
        
        // Try multiple possible paths for each citizen
        const urlsToTry = [
          imageUrl,
          `/images/citizens/${citizen.CitizenId}.jpg`,
          `/images/citizens/${citizen.CitizenId}.png`,
          `/images/citizens/default.jpg`
        ];
        
        for (const url of urlsToTry) {
          try {
            const response = await fetch(url, { method: 'HEAD' });
            console.log(`Citizen ${citizen.CitizenId} image check: ${url} - ${response.ok ? 'EXISTS' : 'NOT FOUND'} (${response.status})`);
            if (response.ok) break; // Stop checking if we found a working URL
          } catch (error) {
            console.error(`Error checking image for citizen ${citizen.CitizenId} at ${url}:`, error);
          }
        }
      }
    }
  };
  
  // Call image path check when citizens are loaded
  useEffect(() => {
    if (activeView === 'citizens' && citizensLoaded) {
      checkImagePaths();
    }
  }, [activeView, citizensLoaded, citizens]);
  
  
  // Listen for loadCitizens event
  useEffect(() => {
    const handleLoadCitizens = () => {
      console.log('Received loadCitizens event in IsometricViewer');
      loadCitizens();
    };
    
    window.addEventListener('loadCitizens', handleLoadCitizens);
    
    return () => {
      window.removeEventListener('loadCitizens', handleLoadCitizens);
    };
  }, [loadCitizens]);
  
  // Identify empty building points - now works in all views, not just buildings view
  useEffect(() => {
    if (polygons.length > 0 && buildings.length > 0) {
      // Collect all building points from all polygons
      const allBuildingPoints: {lat: number, lng: number}[] = [];
      
      polygons.forEach(polygon => {
        if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
          polygon.buildingPoints.forEach(point => {
            if (point && typeof point === 'object' && 'lat' in point && 'lng' in point) {
              allBuildingPoints.push({
                lat: point.lat,
                lng: point.lng
              });
            }
          });
        }
      });
      
      // Check which building points don't have buildings on them
      const emptyPoints = allBuildingPoints.filter(point => {
        // Check if there's no building at this point
        return !buildings.some(building => {
          if (!building.position) return false;
          
          let position;
          if (typeof building.position === 'string') {
            try {
              position = JSON.parse(building.position);
            } catch (e) {
              return false;
            }
          } else {
            position = building.position;
          }
          
          // Check if position matches the building point
          // Use a small threshold for floating point comparison
          const threshold = 0.0001;
          if ('lat' in position && 'lng' in position) {
            return Math.abs(position.lat - point.lat) < threshold && 
                   Math.abs(position.lng - point.lng) < threshold;
          }
          return false;
        });
      });
      
      setEmptyBuildingPoints(emptyPoints);
    } else {
      setEmptyBuildingPoints([]);
    }
  }, [polygons, buildings]); // Removed activeView dependency so it runs in all views

  // Handle mouse wheel for zooming - now delegated to ViewportService
  useEffect(() => {
    const handleWheel = throttle((e: WheelEvent) => {
      e.preventDefault();
      const newScale = viewportService.handleZoom(e.deltaY * -0.01);
      setScale(newScale);
    }, 50); // Throttle to 50ms (20 updates per second max)
    
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel);
    }
    
    return () => {
      if (canvas) {
        canvas.removeEventListener('wheel', handleWheel);
      }
      // Clean up the throttled function
      handleWheel.cancel();
    };
  }, []);

  // Handle mouse events for panning - now delegated to ViewportService
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleMouseDown = (e: MouseEvent) => {
      viewportService.startPan(e.clientX, e.clientY);
      setIsDragging(true);
      isDraggingRef.current = true;
      
      // Update interaction service state
      interactionService.setState({ isDragging: true });
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      
      const newOffset = viewportService.updatePan(e.clientX, e.clientY);
      setOffset(newOffset);
    };
    
    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        viewportService.endPan();
        setIsDragging(false);
        isDraggingRef.current = false;
        
        // Update interaction service state
        interactionService.setState({ isDragging: false });
      }
    };
    
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Emit map transformation events for other components to sync with - now using ViewportService
  useEffect(() => {
    // Create a function to emit the current map transformation state
    const emitMapTransform = () => {
      window.dispatchEvent(new CustomEvent('mapTransformed', {
        detail: {
          offset: viewportService.getOffset(),
          scale: viewportService.getScale(),
          rotation: 0, // Add rotation if implemented
          tilt: 0 // Add tilt if implemented
        }
      }));
    };
    
    // Emit on any transformation change
    emitMapTransform();
    
    // Listen for viewport changes
    const handleScaleChanged = () => emitMapTransform();
    const handleOffsetChanged = () => emitMapTransform();
    
    // Also listen for requests for the current transformation
    const handleRequestTransform = () => {
      emitMapTransform();
    };
    
    eventBus.subscribe(EventTypes.VIEWPORT_SCALE_CHANGED, handleScaleChanged);
    eventBus.subscribe(EventTypes.VIEWPORT_OFFSET_CHANGED, handleOffsetChanged);
    window.addEventListener('requestMapTransform', handleRequestTransform);
    
    return () => {
      eventBus.unsubscribe(EventTypes.VIEWPORT_SCALE_CHANGED, handleScaleChanged);
      eventBus.unsubscribe(EventTypes.VIEWPORT_OFFSET_CHANGED, handleOffsetChanged);
      window.removeEventListener('requestMapTransform', handleRequestTransform);
    };
  }, []);

  // Income color calculation is now fully delegated to IncomeService
  
  // Add this useEffect for mouse interactions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Create a memoized version of the mouse move handler that minimizes state updates
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Always update mouse position regardless of other hover states
      setMousePosition({ x: mouseX, y: mouseY });
      
      // Log mouse position when in transport mode
      if (transportMode) {
        console.log('Mouse position in transport mode:', { x: mouseX, y: mouseY });
      }
      
      // Skip hover detection while dragging
      if (isDragging) {
        canvas.style.cursor = 'grabbing';
        return;
      }
      
      // Use refs to track the current hover state to avoid dependency issues
      const currentHoveredPolygonId = hoveredPolygonIdRef.current;
      const currentHoveredBuildingId = hoveredBuildingIdRef.current;
      const currentHoveredCanalPoint = hoveredCanalPointRef.current;
      const currentHoveredBridgePoint = hoveredBridgePointRef.current;
      const currentHoveredCitizenBuilding = hoveredCitizenBuildingRef.current;
      const currentHoveredCitizenType = hoveredCitizenTypeRef.current;
      
      // Create local variables to track new hover states
      let newHoveredPolygonId = null;
      let newHoveredBuildingId = null;
      let foundHoveredBuilding = false;
      let foundHoveredCanalPoint = false;
      let newHoveredCanalPoint = null;
      let foundHoveredBridgePoint = false;
      let newHoveredBridgePoint = null;
      let foundHoveredCitizen = false;
      let newHoveredCitizenBuilding = null;
      let newHoveredCitizenType = null;
      
      // Only process hover detection in land view or buildings view
      if (activeView !== 'land' && activeView !== 'buildings') {
        // Reset hover states if not in land or buildings view
        if (currentHoveredPolygonId) {
          hoveredPolygonIdRef.current = null;
          setHoveredPolygonId(null);
        }
        if (currentHoveredBuildingId) {
          hoveredBuildingIdRef.current = null;
          setHoveredBuildingId(null);
        }
        canvas.style.cursor = isDragging ? 'grabbing' : 'grab';
        return;
      }
      
      // Check if mouse is over any polygon (for land view)
      if (activeView === 'land') {
        for (const { polygon, coords } of polygonsToRender) {
          if (isPointInPolygon(mouseX, mouseY, coords)) {
            newHoveredPolygonId = polygon.id;
            canvas.style.cursor = 'pointer';
            break;
          }
        }
        
        if (!newHoveredPolygonId) {
          canvas.style.cursor = isDragging ? 'grabbing' : 'grab';
        }
        
        // Only update state if the hovered polygon has changed
        if (newHoveredPolygonId !== currentHoveredPolygonId) {
          hoveredPolygonIdRef.current = newHoveredPolygonId;
          setHoveredPolygonId(newHoveredPolygonId);
        }
      }
      
      // Check if mouse is over any building (for buildings view)
      if (activeView === 'buildings') {
        // Calculate building positions and check if mouse is over any
        for (const building of buildings) {
          if (!building.position) continue;
      
          let position;
          if (typeof building.position === 'string') {
            try {
              position = JSON.parse(building.position);
            } catch (e) {
              continue;
            }
          } else {
            position = building.position;
          }
      
          // Convert lat/lng to isometric coordinates
          let x, y;
          if ('lat' in position && 'lng' in position) {
            x = (position.lng - 12.3326) * 20000;
            y = (position.lat - 45.4371) * 20000;
          } else if ('x' in position && 'z' in position) {
            x = position.x;
            y = position.z;
          } else {
            continue;
          }
      
          const isoPos = {
            x: calculateIsoX(x, y, scale, offset, canvas.width),
            y: calculateIsoY(x, y, scale, offset, canvas.height)
          };
      
          // Get building size
          const size = getBuildingSize(building.type);
          // Increase the hit area by 20% to make it easier to hover
          const squareSize = Math.max(size.width, size.depth) * scale * 0.6 * 1.2;
      
          // Check if mouse is over this building using a more generous hit area
          if (
            mouseX >= isoPos.x - squareSize/2 &&
            mouseX <= isoPos.x + squareSize/2 &&
            mouseY >= isoPos.y - squareSize/2 &&
            mouseY <= isoPos.y + squareSize/2
          ) {
            foundHoveredBuilding = true;
            newHoveredBuildingId = building.id;
            canvas.style.cursor = 'pointer';
            break; // Break after finding the first hovered building
          }
        }
        
        // Only update state if the hovered building has changed
        if (newHoveredBuildingId !== currentHoveredBuildingId) {
          hoveredBuildingIdRef.current = newHoveredBuildingId;
          setHoveredBuildingId(newHoveredBuildingId);
          
          // Building hover state is now handled by UIStateService
        }
        
        // Check if mouse is over any empty building point
        if (!foundHoveredBuilding) {
          for (const point of emptyBuildingPoints) {
            // Convert lat/lng to isometric coordinates
            const x = (point.lng - 12.3326) * 20000;
            const y = (point.lat - 45.4371) * 20000;
          
            const isoPos = {
              x: calculateIsoX(x, y, scale, offset, canvas.width),
              y: calculateIsoY(x, y, scale, offset, canvas.height)
            };
          
            // Check if mouse is over this building point
            const pointSize = 2.8 * scale;
            if (
              mouseX >= isoPos.x - pointSize && 
              mouseX <= isoPos.x + pointSize && 
              mouseY >= isoPos.y - pointSize && 
              mouseY <= isoPos.y + pointSize
            ) {
              foundHoveredBuilding = true;
              canvas.style.cursor = 'pointer';
              break;
            }
          }
        }
  
        // If no building is hovered, clear the hover state
        if (!foundHoveredBuilding && currentHoveredBuildingId !== null) {
          hoveredBuildingIdRef.current = null;
          setHoveredBuildingId(null);
          setHoveredBuildingName(null);
          setHoveredBuildingPosition(null);
          setHoveredBuildingImagePath(null);
          canvas.style.cursor = isDragging ? 'grabbing' : 'grab';
        }
      
        // Check if mouse is over any dock point
        for (const polygon of polygons) {
          if (foundHoveredCanalPoint) break;
        
          if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
            for (const point of polygon.canalPoints) {
              if (!point.edge) continue;
            
              // Convert lat/lng to isometric coordinates
              const x = (point.edge.lng - 12.3326) * 20000;
              const y = (point.edge.lat - 45.4371) * 20000;
            
              const isoPos = {
                x: calculateIsoX(x, y, scale, offset, canvas.width),
                y: calculateIsoY(x, y, scale, offset, canvas.height)
              };
            
              // Check if mouse is over this dock point
              const pointSize = 2 * scale;
              if (
                mouseX >= isoPos.x - pointSize && 
                mouseX <= isoPos.x + pointSize && 
                mouseY >= isoPos.y - pointSize && 
                mouseY <= isoPos.y + pointSize
              ) {
                foundHoveredCanalPoint = true;
                newHoveredCanalPoint = point.edge;
                canvas.style.cursor = 'pointer';
                break;
              }
            }
          }
        }
      
        // Only update if the hovered canal point has changed
        if (!foundHoveredCanalPoint && currentHoveredCanalPoint !== null) {
          hoveredCanalPointRef.current = null;
          setHoveredCanalPoint(null);
        } else if (foundHoveredCanalPoint && 
                  (currentHoveredCanalPoint === null || 
                   currentHoveredCanalPoint.lat !== newHoveredCanalPoint.lat || 
                   currentHoveredCanalPoint.lng !== newHoveredCanalPoint.lng)) {
          hoveredCanalPointRef.current = newHoveredCanalPoint;
          setHoveredCanalPoint(newHoveredCanalPoint);
        }
      
        // Check if mouse is over any bridge point
        for (const polygon of polygons) {
          if (foundHoveredBridgePoint) break;
        
          if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
            for (const point of polygon.bridgePoints) {
              if (!point.edge) continue;
            
              // Convert lat/lng to isometric coordinates
              const x = (point.edge.lng - 12.3326) * 20000;
              const y = (point.edge.lat - 45.4371) * 20000;
            
              const isoPos = {
                x: calculateIsoX(x, y, scale, offset, canvas.width),
                y: calculateIsoY(x, y, scale, offset, canvas.height)
              };
            
              // Check if mouse is over this bridge point
              const pointSize = 2 * scale;
              if (
                mouseX >= isoPos.x - pointSize && 
                mouseX <= isoPos.x + pointSize && 
                mouseY >= isoPos.y - pointSize && 
                mouseY <= isoPos.y + pointSize
              ) {
                foundHoveredBridgePoint = true;
                newHoveredBridgePoint = point.edge;
                canvas.style.cursor = 'pointer';
                break;
              }
            }
          }
        }
      
        // Only update if the hovered bridge point has changed
        if (!foundHoveredBridgePoint && currentHoveredBridgePoint !== null) {
          hoveredBridgePointRef.current = null;
          setHoveredBridgePoint(null);
        } else if (foundHoveredBridgePoint && 
                  (currentHoveredBridgePoint === null || 
                   currentHoveredBridgePoint.lat !== newHoveredBridgePoint.lat || 
                   currentHoveredBridgePoint.lng !== newHoveredBridgePoint.lng)) {
          hoveredBridgePointRef.current = newHoveredBridgePoint;
          setHoveredBridgePoint(newHoveredBridgePoint);
        }
      } else if (currentHoveredBuildingId !== null) {
        // If not in buildings view, ensure building hover state is cleared
        hoveredBuildingIdRef.current = null;
        setHoveredBuildingId(null);
      }
      
      // Check if mouse is over any citizen marker (for citizens view)
      if (activeView === 'citizens' as ViewType) {
        // Check each building with citizens
        for (const [buildingId, buildingCitizens] of Object.entries(citizensByBuilding)) {
          // Find the building position
          const position = findBuildingPosition(buildingId);
          if (!position) continue;
          
          // Check home citizens
          const homeCitizens = buildingCitizens.filter(c => c.markerType === 'home');
          if (homeCitizens.length > 0) {
            // Check if mouse is over the home marker
            const homeX = position.x - 15;
            const homeY = position.y;
            const homeRadius = homeCitizens.length > 1 ? 25 : 20;
            
            if (Math.sqrt(Math.pow(mouseX - homeX, 2) + Math.pow(mouseY - homeY, 2)) <= homeRadius) {
              foundHoveredCitizen = true;
              newHoveredCitizenBuilding = buildingId;
              newHoveredCitizenType = 'home';
              canvas.style.cursor = 'pointer';
              break;
            }
          }
          
          // Check work citizens
          const workCitizens = buildingCitizens.filter(c => c.markerType === 'work');
          if (workCitizens.length > 0) {
            // Check if mouse is over the work marker
            const workX = position.x + 15;
            const workY = position.y;
            const workRadius = workCitizens.length > 1 ? 25 : 20;
            
            if (Math.sqrt(Math.pow(mouseX - workX, 2) + Math.pow(mouseY - workY, 2)) <= workRadius) {
              foundHoveredCitizen = true;
              newHoveredCitizenBuilding = buildingId;
              newHoveredCitizenType = 'work';
              canvas.style.cursor = 'pointer';
              break;
            }
          }
        }
        
        // Only update if the hovered citizen has changed
        if (!foundHoveredCitizen && (currentHoveredCitizenBuilding !== null || currentHoveredCitizenType !== null)) {
          hoveredCitizenBuildingRef.current = null;
          hoveredCitizenTypeRef.current = null;
          setHoveredCitizenBuilding(null);
          setHoveredCitizenType(null);
          canvas.style.cursor = isDragging ? 'grabbing' : 'grab';
        } else if (foundHoveredCitizen && 
                  (currentHoveredCitizenBuilding !== newHoveredCitizenBuilding || 
                   currentHoveredCitizenType !== newHoveredCitizenType)) {
          hoveredCitizenBuildingRef.current = newHoveredCitizenBuilding;
          hoveredCitizenTypeRef.current = newHoveredCitizenType;
          setHoveredCitizenBuilding(newHoveredCitizenBuilding);
          setHoveredCitizenType(newHoveredCitizenType);
        }
      }
    };
    
    const handleClick = (e: MouseEvent) => {
      if (isDragging) return; // Skip click handling while dragging
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      console.log('Click detected at:', { x: mouseX, y: mouseY });
      console.log('Current mode:', { activeView, transportMode });
      
      // Handle transport mode clicks - make sure this is the first condition checked
      if (activeView === 'transport' && transportMode) {
        console.log('Transport mode click detected');
        // Convert screen coordinates to lat/lng
        const point = screenToLatLng(mouseX, mouseY, scale, offset, canvas.width, canvas.height);
        
        // Let the transport service handle the point selection
        transportService.handlePointSelected(point);
        
        return; // Skip other click handling when in transport mode
      }
      
      // Handle clicks in land view
      if (activeView === 'land') {
        // Check if click is on any polygon
        for (const { polygon, coords } of polygonsToRender) {
          if (isPointInPolygon(mouseX, mouseY, coords)) {
            // Set the selected polygon and show details panel
            setSelectedPolygonId(polygon.id);
            setShowLandDetailsPanel(true);
            
            // Dispatch an event for other components to respond to
            window.dispatchEvent(new CustomEvent('showLandDetailsPanel', {
              detail: { polygonId: polygon.id }
            }));
            
            return;
          }
        }
        
        // If click is not on any polygon, deselect
        setSelectedPolygonId(null);
      }
      
      // Handle clicks in buildings view
      if (activeView === 'buildings') {
        // Check if click is on any building
        for (const building of buildings) {
          if (!building.position) continue;
          
          let position;
          if (typeof building.position === 'string') {
            try {
              position = JSON.parse(building.position);
            } catch (e) {
              continue;
            }
          } else {
            position = building.position;
          }
          
          // Convert lat/lng to isometric coordinates
          let x, y;
          if ('lat' in position && 'lng' in position) {
            x = (position.lng - 12.3326) * 20000;
            y = (position.lat - 45.4371) * 20000;
          } else if ('x' in position && 'z' in position) {
            x = position.x;
            y = position.z;
          } else {
            continue;
          }
          
          const isoPos = {
            x: calculateIsoX(x, y, scale, offset, canvas.width),
            y: calculateIsoY(x, y, scale, offset, canvas.height)
          };
          
          // Get building size
          const size = getBuildingSize(building.type);
          const squareSize = Math.max(size.width, size.depth) * scale * 0.6;
          
          // Check if click is on this building
          if (
            mouseX >= isoPos.x - squareSize/2 &&
            mouseX <= isoPos.x + squareSize/2 &&
            mouseY >= isoPos.y - squareSize/2 &&
            mouseY <= isoPos.y + squareSize/2
          ) {
            // Set the selected building and show details panel
            setSelectedBuildingId(building.id);
            setShowBuildingDetailsPanel(true);
        
            // Clear hover state when clicking on a building - now using UIStateService
            uiStateService.handleBuildingHover(null, null, null);
        
            // Dispatch an event for other components to respond to
            window.dispatchEvent(new CustomEvent('showBuildingDetailsPanel', {
              detail: { buildingId: building.id }
            }));
        
            return;
          }
        }
        
        // Check if click is on any empty building point
        for (const point of emptyBuildingPoints) {
          // Convert lat/lng to isometric coordinates
          const x = (point.lng - 12.3326) * 20000;
          const y = (point.lat - 45.4371) * 20000;
          
          const isoPos = {
            x: calculateIsoX(x, y, scale, offset, canvas.width),
            y: calculateIsoY(x, y, scale, offset, canvas.height)
          };
          
          // Check if click is on this building point
          const pointSize = 2.8 * scale;
          if (
            mouseX >= isoPos.x - pointSize && 
            mouseX <= isoPos.x + pointSize && 
            mouseY >= isoPos.y - pointSize && 
            mouseY <= isoPos.y + pointSize
          ) {
            console.log('Building point clicked at position:', point);
                
            // Store the selected building point in window for the BuildingMenu to use
            (window as any).__selectedBuildingPoint = {
              pointId: `point-${point.lat}-${point.lng}`,
              polygonId: findPolygonIdForPoint(point),
              position: point
            };
                
            console.log('Dispatching buildingPointClick event with data:', { position: point });
                
            // Dispatch an event to open the building menu at this position
            const event = new CustomEvent('buildingPointClick', {
              detail: { position: point }
            });
            window.dispatchEvent(event);
                
            console.log('buildingPointClick event dispatched');
                
            // Deselect any selected building
            setSelectedBuildingId(null);
                
            return;
          }
        }
        
        // If click is not on any building, deselect
        setSelectedBuildingId(null);
      }
      
      // Check if click is on any dock point
      if (activeView === 'buildings') {
        let canalPointClicked = false;
        
        for (const polygon of polygons) {
          if (canalPointClicked) break;
          
          if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
            for (const point of polygon.canalPoints) {
              if (!point.edge) continue;
              
              // Convert lat/lng to isometric coordinates
              const x = (point.edge.lng - 12.3326) * 20000;
              const y = (point.edge.lat - 45.4371) * 20000;
              
              const isoPos = {
                x: calculateIsoX(x, y, scale, offset, canvas.width),
                y: calculateIsoY(x, y, scale, offset, canvas.height)
              };
              
              // Check if click is on this dock point
              const pointSize = 2 * scale;
              if (
                mouseX >= isoPos.x - pointSize && 
                mouseX <= isoPos.x + pointSize && 
                mouseY >= isoPos.y - pointSize && 
                mouseY <= isoPos.y + pointSize
              ) {
                console.log('Dock point clicked at position:', point.edge);
                
                // Store the selected point in window for the BuildingMenu to use
                (window as any).__selectedBuildingPoint = {
                  pointId: `dock-${point.edge.lat}-${point.edge.lng}`,
                  polygonId: findPolygonIdForPoint(point.edge),
                  position: point.edge,
                  pointType: 'canal'
                };
                
                // Dispatch an event to open the building menu at this position
                window.dispatchEvent(new CustomEvent('buildingPointClick', {
                  detail: { 
                    position: point.edge,
                    pointType: 'canal'
                  }
                }));
                
                // Deselect any selected building
                setSelectedBuildingId(null);
                
                canalPointClicked = true;
                break;
              }
            }
          }
        }
        
        if (canalPointClicked) return;
        
        // Check if click is on any bridge point
        let bridgePointClicked = false;
        
        for (const polygon of polygons) {
          if (bridgePointClicked) break;
          
          if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
            for (const point of polygon.bridgePoints) {
              if (!point.edge) continue;
              
              // Convert lat/lng to isometric coordinates
              const x = (point.edge.lng - 12.3326) * 20000;
              const y = (point.edge.lat - 45.4371) * 20000;
              
              const isoPos = {
                x: calculateIsoX(x, y, scale, offset, canvas.width),
                y: calculateIsoY(x, y, scale, offset, canvas.height)
              };
              
              // Check if click is on this bridge point
              const pointSize = 2 * scale;
              if (
                mouseX >= isoPos.x - pointSize && 
                mouseX <= isoPos.x + pointSize && 
                mouseY >= isoPos.y - pointSize && 
                mouseY <= isoPos.y + pointSize
              ) {
                console.log('Bridge point clicked at position:', point.edge);
                
                // Store the selected point in window for the BuildingMenu to use
                (window as any).__selectedBuildingPoint = {
                  pointId: `bridge-${point.edge.lat}-${point.edge.lng}`,
                  polygonId: findPolygonIdForPoint(point.edge),
                  position: point.edge,
                  pointType: 'bridge'
                };
                
                // Dispatch an event to open the building menu at this position
                window.dispatchEvent(new CustomEvent('buildingPointClick', {
                  detail: { 
                    position: point.edge,
                    pointType: 'bridge'
                  }
                }));
                
                // Deselect any selected building
                setSelectedBuildingId(null);
                
                bridgePointClicked = true;
                break;
              }
            }
          }
        }
        
        if (bridgePointClicked) return;
      }
      
      // Handle clicks in citizens view
      if (activeView === 'citizens') {
        // Check each building with citizens
        for (const [buildingId, buildingCitizens] of Object.entries(citizensByBuilding)) {
          // Find the building position
          const position = findBuildingPosition(buildingId);
          if (!position) continue;
          
          // Check home citizens
          const homeCitizens = buildingCitizens.filter(c => c.markerType === 'home');
          if (homeCitizens.length > 0) {
            // Check if click is on the home marker
            const homeX = position.x - 15;
            const homeY = position.y;
            const homeRadius = homeCitizens.length > 1 ? 25 : 20;
            
            if (Math.sqrt(Math.pow(mouseX - homeX, 2) + Math.pow(mouseY - homeY, 2)) <= homeRadius) {
              // If there's only one citizen, show details
              if (homeCitizens.length === 1) {
                setSelectedCitizen(homeCitizens[0]);
                setShowCitizenDetailsPanel(true);
              } else {
                // For multiple citizens, show a selection dialog
                console.log(`${homeCitizens.length} residents at building ${buildingId}`);
                // For now, just show the first citizen
                setSelectedCitizen(homeCitizens[0]);
                setShowCitizenDetailsPanel(true);
              }
              return;
            }
          }
          
          // Check work citizens
          const workCitizens = buildingCitizens.filter(c => c.markerType === 'work');
          if (workCitizens.length > 0) {
            // Check if click is on the work marker
            const workX = position.x + 15;
            const workY = position.y;
            const workRadius = workCitizens.length > 1 ? 25 : 20;
            
            if (Math.sqrt(Math.pow(mouseX - workX, 2) + Math.pow(mouseY - workY, 2)) <= workRadius) {
              // If there's only one citizen, show details
              if (workCitizens.length === 1) {
                setSelectedCitizen(workCitizens[0]);
                setShowCitizenDetailsPanel(true);
              } else {
                // For multiple citizens, show a selection dialog
                console.log(`${workCitizens.length} workers at building ${buildingId}`);
                // For now, just show the first citizen
                setSelectedCitizen(workCitizens[0]);
                setShowCitizenDetailsPanel(true);
              }
              return;
            }
          }
        }
        
        // If click is not on any citizen marker, deselect
        setSelectedCitizen(null);
        setShowCitizenDetailsPanel(false);
      }
    };
    
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
    
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [activeView, isDragging, scale, offset, emptyBuildingPoints, buildings, polygonsToRender, citizensByBuilding, transportMode, polygons]);

  // Helper function to check if a point is inside a polygon
  function isPointInPolygon(x: number, y: number, polygon: {x: number, y: number}[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      
      const intersect = ((yi > y) !== (yj > y))
          && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  
  // Helper function to convert screen coordinates to lat/lng
  const screenToLatLng = (
    screenX: number, 
    screenY: number, 
    currentScale: number, 
    currentOffset: {x: number, y: number}, 
    canvasWidth: number, 
    canvasHeight: number
  ): {lat: number, lng: number} => {
    // Reverse the isometric projection
    const x = (screenX - canvasWidth / 2 - currentOffset.x) / currentScale;
    const y = -(screenY - canvasHeight / 2 - currentOffset.y) / (currentScale * 1.4);
    
    // Convert back to lat/lng
    const lng = x / 20000 + 12.3326;
    const lat = y / 20000 + 45.4371;
    
    return { lat, lng };
  };
  
  // Transport route calculation is now handled by TransportService
  useEffect(() => {
    const handleTransportCalculationCompleted = (data: any) => {
      setTransportPath(data.path);
    };
    
    const handleTransportReset = () => {
      setTransportPath([]);
    };
    
    // Subscribe to events
    window.addEventListener('TRANSPORT_CALCULATION_COMPLETED', handleTransportCalculationCompleted as EventListener);
    window.addEventListener('TRANSPORT_RESET', handleTransportReset as EventListener);
    
    return () => {
      window.removeEventListener('TRANSPORT_CALCULATION_COMPLETED', handleTransportCalculationCompleted as EventListener);
      window.removeEventListener('TRANSPORT_RESET', handleTransportReset as EventListener);
    };
  }, []);
  
  // Function to find building position
  const findBuildingPosition = (buildingId: string): {x: number, y: number} | null => {
    // First check if any building in the buildings array matches
    const building = buildings.find(b => b.id === buildingId);
    if (building && building.position) {
      let position;
      if (typeof building.position === 'string') {
        try {
          position = JSON.parse(building.position);
        } catch (e) {
          return null;
        }
      } else {
        position = building.position;
      }
      
      // Convert lat/lng to isometric coordinates
      let x, y;
      if ('lat' in position && 'lng' in position) {
        x = (position.lng - 12.3326) * 20000;
        y = (position.lat - 45.4371) * 20000;
      } else if ('x' in position && 'z' in position) {
        x = position.x;
        y = position.z;
      } else {
        return null;
      }
      
      return {
        x: calculateIsoX(x, y, scale, offset, canvasRef.current?.width || 0),
        y: calculateIsoY(x, y, scale, offset, canvasRef.current?.height || 0)
      };
    }
    
    // If not found in buildings, check building points in polygons
    for (const polygon of polygons) {
      if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
        const buildingPoint = polygon.buildingPoints.find((bp: any) => 
          bp.BuildingId === buildingId || 
          bp.buildingId === buildingId || 
          bp.id === buildingId
        );
        
        if (buildingPoint) {
          // Convert lat/lng to isometric coordinates
          const x = (buildingPoint.lng - 12.3326) * 20000;
          const y = (buildingPoint.lat - 45.4371) * 20000;
          
          return {
            x: calculateIsoX(x, y, scale, offset, canvasRef.current?.width || 0),
            y: calculateIsoY(x, y, scale, offset, canvasRef.current?.height || 0)
          };
        }
      }
    }
    
    return null;
  };
  
  // Citizen marker creation is now fully delegated to RenderService

  // Isometric projection functions are now fully delegated to CoordinateService

  // Draw the isometric view
  useEffect(() => {
    if (loading || !canvasRef.current || polygons.length === 0) return;
    
    // Debug logging for hover state
    if (hoveredBuildingId) {
      //console.log('Drawing with hoveredBuildingId:', hoveredBuildingId);
    }
    
    // Reset hover and selection state when switching away from land view
    if (activeView !== 'land') {
      if (hoveredPolygonId) setHoveredPolygonId(null);
      if (selectedPolygonId) setSelectedPolygonId(null);
      if (showLandDetailsPanel) setShowLandDetailsPanel(false);
    }
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Create local shorthand functions that use the current state values
    const isoX = (x: number, y: number) => calculateIsoX(x, y, scale, offset, canvas.width);
    const isoY = (x: number, y: number) => calculateIsoY(x, y, scale, offset, canvas.height);
    
    // Draw water background
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Only recalculate polygonsToRender when necessary components change
    const newPolygonsToRender = polygons.map(polygon => {
      if (!polygon.coordinates || polygon.coordinates.length < 3) return null;
      
      // Get polygon owner color or income-based color
      let fillColor = '#FFF5D0'; // Default sand color
      if (activeView === 'land') {
        if (incomeDataLoaded && polygon.id && incomeData[polygon.id] !== undefined) {
          // Use income-based color in land view ONLY if income data is loaded
          fillColor = getIncomeColor(incomeData[polygon.id]);
        } else if (polygon.id && landOwners[polygon.id]) {
          // Use owner color in land view
          const owner = landOwners[polygon.id];
          const user = users[owner];
          if (user && user.color) {
            fillColor = user.color;
          }
        }
      }
      // For other views, keep the default yellow color
      
      // Convert lat/lng to isometric coordinates
      const coords = polygon.coordinates.map((coord: {lat: number, lng: number}) => {
        // Normalize coordinates relative to center of Venice
        // Scale factor adjusted to make the map more readable
        const x = (coord.lng - 12.3326) * 20000;
        const y = (coord.lat - 45.4371) * 20000; // Remove the 0.7 factor here since we're applying it in the projection
        
        return {
          x: isoX(x, y),
          y: isoY(x, y)
        };
      });
      
      // Use the polygon's center property if available, otherwise calculate centroid
      let centerX, centerY;
      
      if (polygon.center && polygon.center.lat && polygon.center.lng) {
        // Use the provided center
        const centerLat = polygon.center.lat;
        const centerLng = polygon.center.lng;
        
        // Convert center to isometric coordinates
        const x = (centerLng - 12.3326) * 20000;
        const y = (centerLat - 45.4371) * 20000;
        
        centerX = isoX(x, y);
        centerY = isoY(x, y);
      } else {
        // Calculate centroid as fallback
        centerX = 0;
        centerY = 0;
        coords.forEach(coord => {
          centerX += coord.x;
          centerY += coord.y;
        });
        centerX /= coords.length;
        centerY /= coords.length;
      }
      
      return {
        polygon,
        coords,
        fillColor,
        centroidX: centerX, // Store both for compatibility
        centroidY: centerY,
        centerX: centerX,    // Add these explicitly
        centerY: centerY
      };
    }).filter(Boolean);

    // Update the polygonsToRender state
    setPolygonsToRender(newPolygonsToRender);

    // Now render in two passes: first the polygons, then the text
    // First pass: Draw all polygon shapes
    newPolygonsToRender.forEach(({ polygon, coords, fillColor }) => {
      // Draw polygon path
      ctx.beginPath();
      ctx.moveTo(coords[0].x, coords[0].y);
      for (let i = 1; i < coords.length; i++) {
        ctx.lineTo(coords[i].x, coords[i].y);
      }
      ctx.closePath();
      
      // Determine if this polygon is hovered or selected
      const isHovered = hoveredPolygonId === polygon.id;
      const isSelected = selectedPolygonId === polygon.id;
      
      // Apply different styles for hover and selected states
      if (isSelected) {
        // Selected state: much brighter with a thicker border
        ctx.fillStyle = lightenColor(fillColor, 35); // Increased brightness for selection
        ctx.fill();
        ctx.strokeStyle = '#FF3300'; // Bright red-orange for selected
        ctx.lineWidth = 3.5;
      } else if (isHovered) {
        // Hover state: significantly brighter with a more vibrant border
        ctx.fillStyle = lightenColor(fillColor, 25); // Increased brightness for hover
        ctx.fill();
        ctx.strokeStyle = '#FFCC00'; // Bright yellow for hover
        ctx.lineWidth = 3; // Thicker border
      } else {
        // Normal state
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 1;
      }
      
      ctx.stroke();
    });

    // Second pass: Draw all polygon names (only in land view)
    if (activeView === 'land') {
      // Only show text if zoom level is above a certain threshold (closer zoom)
      const showText = scale >= 2.0; // Further reduced threshold to match new minimum zoom level
        
      if (showText) {
        polygonsToRender.forEach(({ polygon, centerX, centerY }) => {
          if (polygon.historicalName) {
            // Use a fixed font size regardless of zoom level
            ctx.font = `10px Arial`;
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            
            // Calculate offset to position text below coat of arms
            const coatOfArmsSize = Math.min(71, Math.max(35, Math.floor(scale * 18.84)));
            const fontSize = 10; // Define the font size to match the fixed font size we're using
            const textYOffset = coatOfArmsSize / 2 + fontSize + 5; // Half the coat of arms size + font size + padding
            
            // Draw text below the coat of arms at the center position
            ctx.fillText(polygon.historicalName, centerX, centerY + textYOffset);
          }
        });
      }
    }
      
    // Third pass: Draw coat of arms for lands with owners (only in land view)
    if (activeView === 'land') {
      // Clear the coat of arms cache when view changes
      if (Object.keys(renderedCoatOfArmsCache.current).length > 0 && 
          (prevActiveView.current !== activeView || prevScale.current !== scale)) {
        renderedCoatOfArmsCache.current = {};
      }
      
      // Always show coat of arms in land view regardless of zoom level
      polygonsToRender.forEach(({ polygon, centerX, centerY }) => {
        // Check if polygon has an owner
        const owner = landOwners[polygon.id];
        if (!owner) return;
          
        // Use a fixed size for coat of arms
        const size = 50;
        
        // Check if we already rendered this coat of arms at this position and size
        const cacheKey = `${owner}_${Math.round(centerX)}_${Math.round(centerY)}_${size}`;
        const cachedCoatOfArms = renderedCoatOfArmsCache.current[cacheKey];
        
        if (cachedCoatOfArms) {
          // Use the cached version if available
          if (cachedCoatOfArms.image) {
            createCircularImage(ctx, cachedCoatOfArms.image, centerX, centerY, size);
          } else {
            createDefaultCircularAvatar(ctx, owner, centerX, centerY, size);
          }
        } else {
          // Check if we have a coat of arms image for this owner
          if (owner in coatOfArmsImages && coatOfArmsImages[owner]) {
            // Draw circular coat of arms with error handling
            try {
              createCircularImage(ctx, coatOfArmsImages[owner], centerX, centerY, size);
              // Cache the result
              renderedCoatOfArmsCache.current[cacheKey] = {
                image: coatOfArmsImages[owner],
                x: centerX,
                y: centerY,
                size
              };
            } catch (error) {
              console.error(`Error rendering coat of arms for ${owner}:`, error);
              // Fallback to default avatar
              createDefaultCircularAvatar(ctx, owner, centerX, centerY, size);
              // Cache the fallback
              renderedCoatOfArmsCache.current[cacheKey] = {
                image: null,
                x: centerX,
                y: centerY,
                size
              };
            }
          } else {
            // Draw default avatar with initial
            createDefaultCircularAvatar(ctx, owner, centerX, centerY, size);
            // Cache the default avatar
            renderedCoatOfArmsCache.current[cacheKey] = {
              image: null,
              x: centerX,
              y: centerY,
              size
            };
          }
        }
      });
      
      // Store current view and scale for comparison in next render
      prevActiveView.current = activeView;
      prevScale.current = scale;
    }
    
    // Draw buildings in all views, not just buildings view
    if (buildings.length > 0) {
      // Count how many buildings will be drawn
      const buildingsWithValidPosition = buildings.filter(building => {
        if (!building.position) return false;
        
        let position;
        if (typeof building.position === 'string') {
          try {
            position = JSON.parse(building.position);
          } catch (e) {
            return false;
          }
        } else {
          position = building.position;
        }
        
        return (
          ('lat' in position && 'lng' in position) || 
          ('x' in position && 'z' in position)
        );
      });

      //console.log(`%c DRAWING BUILDINGS: ${buildingsWithValidPosition.length} of ${buildings.length} buildings have valid positions for drawing`, 'background: #9C27B0; color: white; padding: 4px 8px; font-weight: bold; border-radius: 4px;');
      
      buildings.forEach(building => {
        if (!building.position) return;
        
        // Use cached position if available
        let x, y;
        if (buildingPositionsCache[building.id]) {
          // Use the pre-calculated position from cache
          x = buildingPositionsCache[building.id].x;
          y = buildingPositionsCache[building.id].y;
        } else {
          // Fallback to calculating position if not in cache
          let position;
          if (typeof building.position === 'string') {
            try {
              position = JSON.parse(building.position);
            } catch (e) {
              return;
            }
          } else {
            position = building.position;
          }
          
          // Convert lat/lng to isometric coordinates
          if ('lat' in position && 'lng' in position) {
            // Normalize coordinates relative to center of Venice
            // Scale factor adjusted to match the map
            x = (position.lng - 12.3326) * 20000;
            y = (position.lat - 45.4371) * 20000; // Remove the 0.7 factor
          } else if ('x' in position && 'z' in position) {
            x = position.x;
            y = position.z;
          } else {
            return;
          }
          
          // Store in cache for future use
          if (initialPositionCalculated) {
            setBuildingPositionsCache(prev => ({
              ...prev,
              [building.id]: { x, y }
            }));
          }
        }
        
        const isoPos = {
          x: calculateIsoX(x, y, scale, offset, canvas.width),
          y: calculateIsoY(x, y, scale, offset, canvas.height)
        };
        
        // Get building size based on type
        const size = getBuildingSize(building.type);
        const color = getBuildingColor(building.type);
        
        // Determine if this building is hovered or selected with more explicit check
        const isHovered = hoveredBuildingId !== null && hoveredBuildingId === building.id;
        const isSelected = selectedBuildingId !== null && selectedBuildingId === building.id;
        
        // Determine the shape based on point_id or Point field
        const pointId = building.point_id || building.Point;
        let buildingShape = 'square'; // Default shape
        
        if (pointId) {
          if (typeof pointId === 'string') {
            if (pointId.startsWith('canal-') || pointId.includes('canal_')) {
              buildingShape = 'circle';
            } else if (pointId.startsWith('bridge-') || pointId.includes('bridge_')) {
              buildingShape = 'triangle';
            }
          }
        }
        
        // Debug logging for hover state
        if (isHovered) {
          console.log(`Building ${building.id} is hovered, applying hover style`);
        }
        
        // Draw simple square for building with hover/select states
        const squareSize = Math.max(size.width, size.depth) * scale * 0.6;
        
        // Apply different styles for hover and selected states
        if (isSelected) {
          // Selected state: much brighter with a thicker border
          ctx.fillStyle = lightenColor(color, 35); // Increased brightness for selection
          ctx.strokeStyle = '#FF3300'; // Bright red-orange for selected
          ctx.lineWidth = 3.5;
        } else if (isHovered) {
          // Make hover state MUCH more dramatic for testing
          ctx.fillStyle = '#FF00FF'; // Bright magenta for hover - very obvious
          ctx.strokeStyle = '#FFFF00'; // Bright yellow border
          ctx.lineWidth = 5; // Extra thick border
        } else {
          // Normal state
          ctx.fillStyle = color;
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
        }
        
        // Draw the appropriate shape based on the building's point type
        ctx.beginPath();
        
        if (buildingShape === 'circle') {
          // Draw circle for canal points
          ctx.arc(isoPos.x, isoPos.y, squareSize/2, 0, Math.PI * 2);
        } else if (buildingShape === 'triangle') {
          // Draw triangle for bridge points
          const halfSize = squareSize/2;
          ctx.moveTo(isoPos.x, isoPos.y - halfSize);
          ctx.lineTo(isoPos.x - halfSize, isoPos.y + halfSize);
          ctx.lineTo(isoPos.x + halfSize, isoPos.y + halfSize);
          ctx.closePath();
        } else {
          // Draw square for regular building points (default)
          ctx.rect(
            isoPos.x - squareSize/2, 
            isoPos.y - squareSize/2, 
            squareSize, 
            squareSize
          );
        }
        
        ctx.fill();
        ctx.stroke();
        
        // Add a small indicator for the building type with fixed font size
        ctx.fillStyle = isHovered ? '#FFFFFF' : '#000'; // White text on hover for better visibility
        ctx.font = `10px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Use first letter of building type as an indicator
        const typeIndicator = building.type.charAt(0).toUpperCase();
        ctx.fillText(
          typeIndicator, 
          isoPos.x, 
          isoPos.y
        );
      });
      
      //console.log(`%c BUILDINGS DRAWN: Completed drawing ${buildingsWithValidPosition.length} buildings`, 'background: #9C27B0; color: white; padding: 4px 8px; font-weight: bold; border-radius: 4px;');
    }
    
    // Draw transport points if in transport view
    if (activeView === 'transport') {
      polygons.forEach(polygon => {
        // Draw bridge points
        if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
          polygon.bridgePoints.forEach((point: any) => {
            if (!point.edge) return;
                
            // Normalize coordinates
            const x = (point.edge.lng - 12.3326) * 20000;
            const y = (point.edge.lat - 45.4371) * 20000; // Remove the 0.7 factor
                
            const isoPos = {
              x: calculateIsoX(x, y, scale, offset, canvas.width),
              y: calculateIsoY(x, y, scale, offset, canvas.height)
            };
                
            // Draw bridge point
            ctx.beginPath();
            ctx.arc(isoPos.x, isoPos.y, 5 * scale, 0, Math.PI * 2);
            ctx.fillStyle = '#FF5500';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();
          });
        }
            
        // Draw dock points
        if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
          polygon.canalPoints.forEach((point: any) => {
            if (!point.edge) return;
                
            // Normalize coordinates
            const x = (point.edge.lng - 12.3326) * 20000;
            const y = (point.edge.lat - 45.4371) * 20000; // Remove the 0.7 factor
                
            const isoPos = {
              x: calculateIsoX(x, y, scale, offset, canvas.width),
              y: calculateIsoY(x, y, scale, offset, canvas.height)
            };
                
            // Draw dock point
            ctx.beginPath();
            ctx.arc(isoPos.x, isoPos.y, 5 * scale, 0, Math.PI * 2);
            ctx.fillStyle = '#00AAFF';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();
          });
        }
      });
      
      // Draw transport mode UI when active
      if (activeView === 'transport' && transportMode) {
        console.log('Drawing transport mode UI', { 
          transportStartPoint, 
          transportEndPoint, 
          mousePosition,
          activeView,
          transportMode
        });
        
        // Add a prominent header to indicate transport mode is active
        const headerHeight = 40;
        const headerPadding = 20;
        
        // Draw header background
        ctx.fillStyle = 'rgba(30, 30, 50, 0.85)';
        ctx.fillRect(0, 0, canvas.width, headerHeight);
        
        // Draw gold border
        ctx.strokeStyle = 'rgba(218, 165, 32, 0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvas.width, headerHeight);
        
        // Draw header text
        ctx.font = '18px "Times New Roman", serif';
        ctx.fillStyle = 'rgba(218, 165, 32, 0.9)';
        ctx.textAlign = 'center';
        
        const headerText = !transportStartPoint 
          ? 'Modalità Trasporto: Seleziona punto di partenza' 
          : !transportEndPoint 
            ? 'Modalità Trasporto: Seleziona destinazione'
            : 'Modalità Trasporto: Percorso trovato';
        
        ctx.fillText(headerText, canvas.width / 2, headerHeight / 2 + 6);
        
        // If calculating, show the loading indicator
        if (calculatingPath) {
          // The loading animation is handled by the renderLoadingAnimation function
          // which is called in the calculateTransportRoute function
        }
        
        // Add a legend for path types
        if (transportMode && transportPath.length > 0) {
          const legendX = 20;
          const legendY = canvas.height - 120;
          const legendWidth = 150;
          const legendHeight = 100;
          const legendPadding = 10;
          
          // Draw legend background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(
            legendX - legendPadding,
            legendY - legendPadding,
            legendWidth + legendPadding * 2,
            legendHeight + legendPadding * 2
          );
          
          // Draw legend border
          ctx.strokeStyle = 'rgba(218, 165, 32, 0.8)';
          ctx.lineWidth = 1;
          ctx.strokeRect(
            legendX - legendPadding,
            legendY - legendPadding,
            legendWidth + legendPadding * 2,
            legendHeight + legendPadding * 2
          );
          
          // Draw legend title
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'left';
          ctx.font = '14px "Times New Roman", serif';
          ctx.fillText('Legenda', legendX, legendY + 15);
          
          // Draw legend items
          ctx.font = '12px "Times New Roman", serif';
          
          // Bridge point
          ctx.beginPath();
          ctx.arc(legendX + 10, legendY + 40, 3 * scale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(180, 100, 50, 0.8)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText('Ponte', legendX + 25, legendY + 43);
          
          // Building point
          ctx.beginPath();
          ctx.arc(legendX + 10, legendY + 60, 3 * scale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(70, 130, 180, 0.8)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText('Edificio', legendX + 25, legendY + 63);
          
          // Centroid point
          ctx.beginPath();
          ctx.arc(legendX + 10, legendY + 80, 2 * scale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0, 102, 153, 0.7)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText('Piazza', legendX + 25, legendY + 83);
        }
        
        // Draw instructions with Venetian styling
        ctx.font = '16px "Times New Roman", serif';
        ctx.textAlign = 'center';

        // Create a semi-transparent background for the text
        const instructionText = calculatingPath 
          ? 'Calcolando il percorso...' // "Calculating route..." in Italian
          : !transportStartPoint 
            ? 'Clicca per impostare il punto di partenza' // "Click to set starting point" in Italian
            : !transportEndPoint 
              ? 'Clicca per impostare la destinazione' // "Click to set destination" in Italian
              : 'Percorso trovato! Clicca per impostare un nuovo punto di partenza'; // "Route found!" in Italian

        const textWidth = ctx.measureText(instructionText).width;
        const textHeight = 20;
        const padding = 10;

        // Draw text background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(
          canvas.width / 2 - textWidth / 2 - padding,
          30 - padding,
          textWidth + padding * 2,
          textHeight + padding * 2
        );

        // Draw text border with Venetian gold
        ctx.strokeStyle = 'rgba(218, 165, 32, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          canvas.width / 2 - textWidth / 2 - padding,
          30 - padding,
          textWidth + padding * 2,
          textHeight + padding * 2
        );

        // Draw the text
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(instructionText, canvas.width / 2, 40);
        
        // Draw start point if set
        const currentTransportState = transportService.getState();
        if (currentTransportState.startPoint) {
          const startX = (currentTransportState.startPoint.lng - 12.3326) * 20000;
          const startY = (currentTransportState.startPoint.lat - 45.4371) * 20000;
          
          const startScreenX = isoX(startX, startY);
          const startScreenY = isoY(startX, startY);
          
          // Draw a gold circle for start point with Venetian styling
          ctx.beginPath();
          ctx.arc(startScreenX, startScreenY, 8 * scale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(218, 165, 32, 0.8)'; // Venetian gold
          ctx.fill();
          
          // Add a white border
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          // Add a subtle outer glow
          ctx.beginPath();
          ctx.arc(startScreenX, startScreenY, 10 * scale, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(218, 165, 32, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          
          // Add "Start" label with Venetian styling
          ctx.font = `${Math.max(10, 12 * scale)}px 'Times New Roman', serif`;
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.fillText('Partenza', startScreenX, startScreenY - 15 * scale); // Italian for "Departure"
        }
        
        // Draw end point if set
        if (currentTransportState.endPoint) {
          const endX = (currentTransportState.endPoint.lng - 12.3326) * 20000;
          const endY = (currentTransportState.endPoint.lat - 45.4371) * 20000;
          
          const endScreenX = isoX(endX, endY);
          const endScreenY = isoY(endX, endY);
          
          // Draw a red circle for end point with Venetian styling
          ctx.beginPath();
          ctx.arc(endScreenX, endScreenY, 8 * scale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(180, 30, 30, 0.8)'; // Venetian red
          ctx.fill();
          
          // Add a white border
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          // Add a subtle outer glow
          ctx.beginPath();
          ctx.arc(endScreenX, endScreenY, 10 * scale, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(180, 30, 30, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          
          // Add "End" label with Venetian styling
          ctx.font = `${Math.max(10, 12 * scale)}px 'Times New Roman', serif`;
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.fillText('Arrivo', endScreenX, endScreenY - 15 * scale); // Italian for "Arrival"
        }
        
        // Draw the calculated path if available
        if (transportPath.length > 0) {
          // First draw a subtle shadow/glow effect
          ctx.beginPath();

          // Start at the first point
          const firstPoint = transportPath[0];
          const firstX = (firstPoint.lng - 12.3326) * 20000;
          const firstY = (firstPoint.lat - 45.4371) * 20000;

          ctx.moveTo(isoX(firstX, firstY), isoY(firstX, firstY));

          // Connect all points
          for (let i = 1; i < transportPath.length; i++) {
            const point = transportPath[i];
            const x = (point.lng - 12.3326) * 20000;
            const y = (point.lat - 45.4371) * 20000;

            ctx.lineTo(isoX(x, y), isoY(x, y));
          }

          // Style the path shadow
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.lineWidth = 6 * scale;
          ctx.stroke();

          // Now draw segments with different colors based on transport mode
          for (let i = 0; i < transportPath.length - 1; i++) {
            const point1 = transportPath[i];
            const point2 = transportPath[i + 1];

            const x1 = (point1.lng - 12.3326) * 20000;
            const y1 = (point1.lat - 45.4371) * 20000;
            const x2 = (point2.lng - 12.3326) * 20000;
            const y2 = (point2.lat - 45.4371) * 20000;

            // For gondola paths, draw simple lines with distinctive color
            if (point1.transportMode === 'gondola') {
              // Draw a simple path for gondolas
              ctx.beginPath();
              ctx.moveTo(isoX(x1, y1), isoY(x1, y1));
              ctx.lineTo(isoX(x2, y2), isoY(x2, y2));
              
              // Venetian blue for water transport
              ctx.strokeStyle = 'rgba(0, 102, 153, 0.8)';
              ctx.lineWidth = 4 * scale;
              ctx.stroke();
            } else {
              // For walking paths, draw straight lines with texture
              ctx.beginPath();
              ctx.moveTo(isoX(x1, y1), isoY(x1, y1));
              ctx.lineTo(isoX(x2, y2), isoY(x2, y2));

              // Terracotta for walking paths
              ctx.strokeStyle = 'rgba(204, 85, 0, 0.8)';
              ctx.lineWidth = 4 * scale;
              ctx.stroke();

              // Add a subtle texture for walking paths
              ctx.beginPath();
              ctx.setLineDash([2 * scale, 2 * scale]);
              ctx.moveTo(isoX(x1, y1), isoY(x1, y1));
              ctx.lineTo(isoX(x2, y2), isoY(x2, y2));
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
              ctx.lineWidth = 1 * scale;
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }

          // Draw waypoints with improved styling
          for (let i = 0; i < transportPath.length; i++) {
            // Skip intermediate points for cleaner visualization
            if (transportPath[i].isIntermediatePoint) continue;

            const point = transportPath[i];
            const x = (point.lng - 12.3326) * 20000;
            const y = (point.lat - 45.4371) * 20000;

            const screenX = isoX(x, y);
            const screenY = isoY(x, y);

            // Determine node size based on type
            let nodeSize = 2.5 * scale;
            let nodeColor = 'rgba(218, 165, 32, 0.7)'; // Default gold

            // Color and size based on node type
            if (point.type === 'bridge') {
              nodeSize = 3 * scale;
              nodeColor = 'rgba(180, 100, 50, 0.8)'; // Brown for bridges
            } else if (point.type === 'building') {
              nodeSize = 3 * scale;
              nodeColor = 'rgba(70, 130, 180, 0.8)'; // Steel blue for buildings
            } else if (point.type === 'centroid') {
              nodeSize = 2 * scale;
              nodeColor = 'rgba(0, 102, 153, 0.7)'; // Venetian blue for centroids
            } else if (point.type === 'canal') {
              nodeSize = 3 * scale;
              nodeColor = 'rgba(0, 150, 200, 0.8)'; // Bright blue for canal points
            }

            // Draw a small circle for each waypoint
            ctx.beginPath();
            ctx.arc(screenX, screenY, nodeSize, 0, Math.PI * 2);
            ctx.fillStyle = nodeColor;
            ctx.fill();

            // Add a subtle white border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
              
          // Gondola animations have been removed for simplicity
            
          // Add a water-only indicator if applicable
          if (transportService.getState().waterOnlyMode) {
            const labelX = canvas.width - 200;
            const labelY = canvas.height - 200;
            
            // Draw background
            ctx.fillStyle = 'rgba(0, 102, 153, 0.8)'; // Venetian blue
            ctx.fillRect(labelX - 10, labelY - 10, 220, 40);
            
            // Draw border
            ctx.strokeStyle = 'rgba(218, 165, 32, 0.8)'; // Gold
            ctx.lineWidth = 2;
            ctx.strokeRect(labelX - 10, labelY - 10, 220, 40);
            
            // Draw text
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '16px "Times New Roman", serif';
            ctx.textAlign = 'center';
            ctx.fillText('Percorso Solo Acqua', labelX + 100, labelY + 15);
          }
          
          // Update the legend to include canal points and transport modes
          if (transportMode && transportPath.length > 0) {
            const legendX = 20;
            const legendY = canvas.height - 160; // Increased height for more items
            const legendWidth = 180;
            const legendHeight = 140;
            const legendPadding = 10;
              
            // Draw legend background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(
              legendX - legendPadding,
              legendY - legendPadding,
              legendWidth + legendPadding * 2,
              legendHeight + legendPadding * 2
            );
              
            // Draw legend border
            ctx.strokeStyle = 'rgba(218, 165, 32, 0.8)';
            ctx.lineWidth = 1;
            ctx.strokeRect(
              legendX - legendPadding,
              legendY - legendPadding,
              legendWidth + legendPadding * 2,
              legendHeight + legendPadding * 2
            );
              
            // Draw legend title
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'left';
            ctx.font = '14px "Times New Roman", serif';
            ctx.fillText('Legenda', legendX, legendY + 15);
              
            // Draw legend items
            ctx.font = '12px "Times New Roman", serif';
              
            // Bridge point
            ctx.beginPath();
            ctx.arc(legendX + 10, legendY + 40, 3 * scale, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(180, 100, 50, 0.8)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('Ponte', legendX + 25, legendY + 43);
              
            // Building point
            ctx.beginPath();
            ctx.arc(legendX + 10, legendY + 60, 3 * scale, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(70, 130, 180, 0.8)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('Edificio', legendX + 25, legendY + 63);
              
            // Centroid point
            ctx.beginPath();
            ctx.arc(legendX + 10, legendY + 80, 2 * scale, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 102, 153, 0.7)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('Piazza', legendX + 25, legendY + 83);
              
            // Canal point
            ctx.beginPath();
            ctx.arc(legendX + 10, legendY + 100, 3 * scale, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 150, 200, 0.8)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('Canale', legendX + 25, legendY + 103);
              
            // Walking path
            ctx.beginPath();
            ctx.moveTo(legendX + 5, legendY + 120);
            ctx.lineTo(legendX + 15, legendY + 120);
            ctx.strokeStyle = 'rgba(204, 85, 0, 0.8)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('A piedi', legendX + 25, legendY + 123);
              
            // Water path
            ctx.beginPath();
            ctx.moveTo(legendX + 5, legendY + 140);
            ctx.lineTo(legendX + 15, legendY + 140);
            ctx.strokeStyle = 'rgba(0, 102, 153, 0.8)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('In gondola', legendX + 25, legendY + 143);
          }
            
          // Calculate total distance and time
          let totalDistance = 0;
          let walkingDistance = 0;
          let waterDistance = 0;
            
          for (let i = 1; i < transportPath.length; i++) {
            const point1 = transportPath[i-1];
            const point2 = transportPath[i];
              
            // Calculate distance between consecutive points
            const distance = calculateDistance(
              { lat: point1.lat, lng: point1.lng },
              { lat: point2.lat, lng: point2.lng }
            );
              
            totalDistance += distance;
              
            // Track distance by mode
            if (point1.transportMode === 'gondola') {
              waterDistance += distance;
            } else {
              walkingDistance += distance;
            }
          }
            
          // Calculate estimated time (walking at 5 km/h, gondola at 10 km/h)
          const walkingTimeHours = walkingDistance / 1000 / 5;
          const waterTimeHours = waterDistance / 1000 / 10;
          const totalTimeMinutes = Math.round((walkingTimeHours + waterTimeHours) * 60);
            
          // Format distances for display
          let distanceText = '';
          if (totalDistance < 1000) {
            distanceText = `${Math.round(totalDistance)} metri`; // meters in Italian
          } else {
            distanceText = `${(totalDistance / 1000).toFixed(2)} km`;
          }
            
          // Create a distance and time indicator box
          const infoLabel = `Distanza: ${distanceText} | Tempo: ${totalTimeMinutes} min`;
          const walkingLabel = `A piedi: ${Math.round(walkingDistance)} m`;
          const gondolaLabel = `In gondola: ${Math.round(waterDistance)} m`;
            
          const labelWidth = Math.max(
            ctx.measureText(infoLabel).width,
            ctx.measureText(walkingLabel).width,
            ctx.measureText(gondolaLabel).width
          );
          const labelHeight = 60; // Height for three lines of text
          const labelPadding = 10;
            
          // Position in bottom right
          const labelX = canvas.width - labelWidth - labelPadding * 3;
          const labelY = canvas.height - labelHeight - labelPadding * 3;
            
          // Draw background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(
            labelX - labelPadding,
            labelY - labelPadding,
            labelWidth + labelPadding * 2,
            labelHeight + labelPadding * 2
          );
            
          // Draw border with Venetian gold
          ctx.strokeStyle = 'rgba(218, 165, 32, 0.8)';
          ctx.lineWidth = 1;
          ctx.strokeRect(
            labelX - labelPadding,
            labelY - labelPadding,
            labelWidth + labelPadding * 2,
            labelHeight + labelPadding * 2
          );
            
          // Draw text
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'left';
          ctx.fillText(infoLabel, labelX, labelY + 15);
          ctx.fillText(walkingLabel, labelX, labelY + 35);
          ctx.fillText(gondolaLabel, labelX, labelY + 55);
        }
        
        // Draw hover indicator for transport mode - ALWAYS draw this when in transport mode
        if (activeView === 'transport' && transportMode) {
          // Draw a circle at mouse position with Venetian styling
          ctx.beginPath();
          ctx.arc(mousePosition.x, mousePosition.y, 6 * scale, 0, Math.PI * 2);
          
          // Use Venetian colors - gold for start point, red for end point
          const transportState = transportService.getState();
          const fillColor = transportState.startPoint 
            ? 'rgba(180, 30, 30, 0.6)'  // Red for end point
            : 'rgba(218, 165, 32, 0.6)'; // Gold for start point
          
          ctx.fillStyle = fillColor;
          ctx.fill();
          
          // Add a subtle white border
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.stroke();
          
          // Add a pulsing effect to make it more noticeable
          const pulseSize = 8 * scale * (0.8 + 0.2 * Math.sin(Date.now() / 300));
          ctx.beginPath();
          ctx.arc(mousePosition.x, mousePosition.y, pulseSize, 0, Math.PI * 2);
          ctx.strokeStyle = fillColor;
          ctx.lineWidth = 0.8;
          ctx.stroke();
          
          // Change cursor style to crosshair for better precision
          canvas.style.cursor = 'crosshair';
        }
      }
    }
    
    // Draw empty building points in all views, not just buildings view
    // But make them even more subtle in non-buildings views
    if (emptyBuildingPoints.length > 0) {
      emptyBuildingPoints.forEach(point => {
        // Convert lat/lng to isometric coordinates
        const x = (point.lng - 12.3326) * 20000;
        const y = (point.lat - 45.4371) * 20000;
        
        const isoPos = {
          x: calculateIsoX(x, y, scale, offset, canvas.width),
          y: calculateIsoY(x, y, scale, offset, canvas.height)
        };
        
        // Check if mouse is over this building point
        const pointSize = activeView === 'buildings' ? 2.2 * scale : 1.8 * scale; // Smaller in non-buildings views
        const isHovered = 
          mousePosition.x >= isoPos.x - pointSize && 
          mousePosition.x <= isoPos.x + pointSize && 
          mousePosition.y >= isoPos.y - pointSize && 
          mousePosition.y <= isoPos.y + pointSize;
        
        // Draw a small circle for empty building points with even more subtle colors
        ctx.beginPath();
        ctx.arc(isoPos.x, isoPos.y, pointSize, 0, Math.PI * 2);
    
        // Apply different opacity and color based on hover state and active view
        // Use an even more muted, earthy color that better blends with the map
        // Make points more visible in buildings view, more subtle in other views
        const baseOpacity = activeView === 'buildings' ? 0.15 : 0.08;
        const hoverOpacity = activeView === 'buildings' ? 0.3 : 0.2;
        
        ctx.fillStyle = isHovered 
          ? `rgba(160, 140, 120, ${hoverOpacity})` // Hovered state
          : `rgba(160, 140, 120, ${baseOpacity})`; // Normal state
        
        ctx.fill();
        
        // Add a subtle border when hovered, but only in buildings view
        if (isHovered && activeView === 'buildings') {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; // Less opaque white
          ctx.lineWidth = 0.8; // Thinner line
          ctx.stroke();
          
          // Update cursor to pointer when hovering over a building point
          canvas.style.cursor = 'pointer';
        }
      });
    }
    
    // Draw dock points and bridge points in all views, but more discreet in non-buildings view
    if (polygons.length > 0) {
      // Draw dock points with subtle styling
      polygons.forEach(polygon => {
        if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
          polygon.canalPoints.forEach((point: any) => {
            if (!point.edge) return;
            
            // Convert lat/lng to isometric coordinates
            const x = (point.edge.lng - 12.3326) * 20000;
            const y = (point.edge.lat - 45.4371) * 20000;
            
            const isoPos = {
              x: calculateIsoX(x, y, scale, offset, canvas.width),
              y: calculateIsoY(x, y, scale, offset, canvas.height)
            };
            
            // Check if this point is hovered
            const isHovered = hoveredCanalPoint && 
              Math.abs(hoveredCanalPoint.lat - point.edge.lat) < 0.0001 && 
              Math.abs(hoveredCanalPoint.lng - point.edge.lng) < 0.0001;
            
            // Draw a small, semi-transparent circle for dock points
            ctx.beginPath();
            ctx.arc(isoPos.x, isoPos.y, 2 * scale, 0, Math.PI * 2);
            
            // Use a subtle blue color with low opacity, brighter when hovered
            // Make points more visible in buildings view, more subtle in other views
            const baseOpacity = activeView === 'buildings' ? 0.3 : 0.15;
            const hoverOpacity = activeView === 'buildings' ? 0.7 : 0.4;
            
            ctx.fillStyle = isHovered 
              ? `rgba(0, 120, 215, ${hoverOpacity})` // Brighter and more opaque when hovered
              : `rgba(0, 120, 215, ${baseOpacity})`;
            ctx.fill();
            
            // Add a border, more visible when hovered
            ctx.strokeStyle = isHovered
              ? 'rgba(255, 255, 255, 0.8)' // White border when hovered
              : 'rgba(0, 120, 215, 0.4)';
            ctx.lineWidth = isHovered ? 1.5 : 0.5;
            ctx.stroke();
          });
        }
        
        // Draw bridge points with subtle styling
        if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
          polygon.bridgePoints.forEach((point: any) => {
            if (!point.edge) return;
            
            // Convert lat/lng to isometric coordinates
            const x = (point.edge.lng - 12.3326) * 20000;
            const y = (point.edge.lat - 45.4371) * 20000;
            
            const isoPos = {
              x: calculateIsoX(x, y, scale, offset, canvas.width),
              y: calculateIsoY(x, y, scale, offset, canvas.height)
            };
            
            // Check if this point is hovered
            const isHovered = hoveredBridgePoint && 
              Math.abs(hoveredBridgePoint.lat - point.edge.lat) < 0.0001 && 
              Math.abs(hoveredBridgePoint.lng - point.edge.lng) < 0.0001;
            
            // Draw a small, semi-transparent square for bridge points
            const pointSize = 2 * scale;
            
            // Use a subtle orange/brown color with low opacity, brighter when hovered
            // Make points more visible in buildings view, more subtle in other views
            const baseOpacity = activeView === 'buildings' ? 0.3 : 0.15;
            const hoverOpacity = activeView === 'buildings' ? 0.7 : 0.4;
            
            ctx.fillStyle = isHovered
              ? `rgba(180, 120, 60, ${hoverOpacity})` // Brighter and more opaque when hovered
              : `rgba(180, 120, 60, ${baseOpacity})`;
            ctx.beginPath();
            ctx.rect(
              isoPos.x - pointSize/2, 
              isoPos.y - pointSize/2, 
              pointSize, 
              pointSize
            );
            ctx.fill();
            
            // Add a border, more visible when hovered
            ctx.strokeStyle = isHovered
              ? 'rgba(255, 255, 255, 0.8)' // White border when hovered
              : 'rgba(180, 120, 60, 0.4)';
            ctx.lineWidth = isHovered ? 1.5 : 0.5;
            ctx.stroke();
          });
        }
      });
    }
    
    // Draw citizen markers if in citizens view
    if (activeView === 'citizens' && citizensLoaded) {
      // Draw citizens at their home and work locations
      Object.entries(citizensByBuilding).forEach(([buildingId, buildingCitizens]) => {
        // Find the building position
        const position = findBuildingPosition(buildingId);
        if (!position) return;
        
        // Group citizens by marker type
        const homeCitizens = buildingCitizens.filter(c => c.markerType === 'home');
        const workCitizens = buildingCitizens.filter(c => c.markerType === 'work');
        
        // Draw home citizens
        if (homeCitizens.length > 0) {
          // If multiple citizens, draw a group marker
          if (homeCitizens.length > 1) {
            // Determine color based on social class of the first citizen
            const socialClass = homeCitizens[0].SocialClass || homeCitizens[0].socialClass || '';
            const baseClass = socialClass.toLowerCase();
            
            // Choose color based on social class
            let fillColor = 'rgba(100, 150, 255, 0.8)'; // Default blue
            if (baseClass.includes('nobili')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'home'
                ? 'rgba(255, 215, 0, 0.9)' // Gold for nobility (hovered)
                : 'rgba(218, 165, 32, 0.8)'; // Gold for nobility
            } else if (baseClass.includes('cittadini')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'home'
                ? 'rgba(70, 130, 180, 0.9)' // Blue for citizens (hovered)
                : 'rgba(70, 130, 180, 0.8)'; // Blue for citizens
            } else if (baseClass.includes('popolani')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'home'
                ? 'rgba(205, 133, 63, 0.9)' // Brown for common people (hovered)
                : 'rgba(205, 133, 63, 0.8)'; // Brown for common people
            } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'home'
                ? 'rgba(128, 128, 128, 0.9)' // Gray for laborers (hovered)
                : 'rgba(128, 128, 128, 0.8)'; // Gray for laborers
            }
            
            // Draw a slightly larger marker with count
            ctx.beginPath();
            ctx.arc(position.x - 15, position.y, 25, 0, Math.PI * 2);
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'home'
              ? '#FFFF00'
              : '#FFFFFF';
            ctx.lineWidth = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'home' ? 3 : 2;
            ctx.stroke();
            
            // Add count
            ctx.font = 'bold 20px Arial';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(homeCitizens.length.toString(), position.x - 15, position.y);
            
            // Add home icon
            ctx.beginPath();
            ctx.arc(position.x - 15 + 15, position.y - 15, 10, 0, Math.PI * 2);
            ctx.fillStyle = '#4b70e2';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Draw a house icon instead of just the letter 'H'
            ctx.fillStyle = '#FFFFFF';
            
            // Calculate house dimensions
            const houseWidth = 8;
            const houseHeight = 6;
            const roofHeight = 4;
            const iconX = position.x - 15 + 15;
            const iconY = position.y - 15;
            
            // Draw the roof (triangle)
            ctx.beginPath();
            ctx.moveTo(iconX - houseWidth/2, iconY - houseHeight/2 + roofHeight/2);
            ctx.lineTo(iconX, iconY - houseHeight/2 - roofHeight/2);
            ctx.lineTo(iconX + houseWidth/2, iconY - houseHeight/2 + roofHeight/2);
            ctx.closePath();
            ctx.fill();
            
            // Draw the house body (rectangle)
            ctx.fillRect(
              iconX - houseWidth/2, 
              iconY - houseHeight/2 + roofHeight/2, 
              houseWidth, 
              houseHeight
            );
            
            // Draw a small door
            ctx.fillStyle = '#4b70e2'; // Same as background color
            const doorWidth = houseWidth * 0.4;
            const doorHeight = houseHeight * 0.6;
            ctx.fillRect(
              iconX - doorWidth/2,
              iconY - houseHeight/2 + roofHeight/2 + houseHeight - doorHeight,
              doorWidth,
              doorHeight
            );
          } else {
            // Draw a single citizen marker
            createCitizenMarker(
              ctx, 
              position.x - 15, 
              position.y, 
              homeCitizens[0], 
              'home', 
              20, 
              hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'home'
            );
          }
        }
        
        // Draw work citizens
        if (workCitizens.length > 0) {
          // If multiple citizens, draw a group marker
          if (workCitizens.length > 1) {
            // Determine color based on social class of the first citizen
            const socialClass = workCitizens[0].SocialClass || workCitizens[0].socialClass || '';
            const baseClass = socialClass.toLowerCase();
            
            // Choose color based on social class
            let fillColor = 'rgba(255, 150, 100, 0.8)'; // Default orange
            if (baseClass.includes('nobili')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'work'
                ? 'rgba(255, 215, 0, 0.9)' // Gold for nobility (hovered)
                : 'rgba(218, 165, 32, 0.8)'; // Gold for nobility
            } else if (baseClass.includes('cittadini')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'work'
                ? 'rgba(70, 130, 180, 0.9)' // Blue for citizens (hovered)
                : 'rgba(70, 130, 180, 0.8)'; // Blue for citizens
            } else if (baseClass.includes('popolani')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'work'
                ? 'rgba(205, 133, 63, 0.9)' // Brown for common people (hovered)
                : 'rgba(205, 133, 63, 0.8)'; // Brown for common people
            } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'work'
                ? 'rgba(128, 128, 128, 0.9)' // Gray for laborers (hovered)
                : 'rgba(128, 128, 128, 0.8)'; // Gray for laborers
            }
            
            // Draw a slightly larger marker with count
            ctx.beginPath();
            ctx.arc(position.x + 15, position.y, 25, 0, Math.PI * 2);
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'work'
              ? '#FFFF00'
              : '#FFFFFF';
            ctx.lineWidth = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'work' ? 3 : 2;
            ctx.stroke();
            
            // Add count
            ctx.font = 'bold 20px Arial';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(workCitizens.length.toString(), position.x + 15, position.y);
            
            // Add work icon
            ctx.beginPath();
            ctx.arc(position.x + 15 + 15, position.y - 15, 10, 0, Math.PI * 2);
            ctx.fillStyle = '#e27a4b';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 10px Arial';
            ctx.fillText('W', position.x + 15 + 15, position.y - 15);
          } else {
            // Draw a single citizen marker
            createCitizenMarker(
              ctx, 
              position.x + 15, 
              position.y, 
              workCitizens[0], 
              'work', 
              20, 
              hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'work'
            );
          }
        }
      });
      
      // Add a legend for citizen markers
      const legendX = 20;
      const legendY = canvas.height - 100;
      
      // Home marker legend
      createCitizenMarker(ctx, legendX + 15, legendY, { FirstName: 'H', LastName: 'M' }, 'home', 15);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '14px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Home', legendX + 40, legendY);
      
      // Work marker legend
      createCitizenMarker(ctx, legendX + 15, legendY + 40, { FirstName: 'W', LastName: 'K' }, 'work', 15);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '14px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Work', legendX + 40, legendY + 40);
    }
    
  }, [loading, polygons, landOwners, users, activeView, buildings, scale, offset, incomeData, minIncome, maxIncome, hoveredPolygonId, selectedPolygonId, hoveredBuildingId, selectedBuildingId, emptyBuildingPoints, mousePosition, citizensLoaded, citizensByBuilding, hoveredCitizenBuilding, hoveredCitizenType, incomeDataLoaded, polygonsToRender]);
  

  // Handle window resize
  useEffect(() => {
    const handleResize = debounce(() => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        
        // Clear the coat of arms cache when resizing
        renderedCoatOfArmsCache.current = {};
        
        // Redraw everything
        const event = new Event('redraw');
        window.dispatchEvent(event);
      }
    }, 200);
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      handleResize.cancel(); // Clean up the debounced function
    };
  }, []);

  // Building size and color functions are now fully delegated to BuildingService

  // Helper function to draw a building (simplified for 2D view)
  function drawBuildingSquare(
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    size: number,
    color: string,
    typeIndicator: string
  ) {
    // Draw square
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x - size/2, y - size/2, size, size);
    ctx.fill();
    ctx.stroke();
    
    // Add type indicator
    ctx.fillStyle = '#000';
    ctx.font = `${Math.max(8, 10 * (size/20))}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typeIndicator, x, y);
  }

  // Color utility functions are now fully delegated to RenderService

  return (
    <div className="w-screen h-screen">
      <ViewportCanvas 
        activeView={activeView}
        scale={scale}
        offset={offset}
        onScaleChange={(newScale) => {
          viewportService.setScale(newScale);
          setScale(newScale);
        }}
        onOffsetChange={(newOffset) => {
          viewportService.setOffset(newOffset);
          setOffset(newOffset);
        }}
      />
      
      {uiState.hoveredBuildingName && uiState.hoveredBuildingPosition && (
        <div 
          className="absolute bg-black/80 text-white rounded text-sm pointer-events-none z-50 overflow-hidden"
          style={{
            left: uiState.hoveredBuildingPosition.x + 15, // Offset from cursor
            top: uiState.hoveredBuildingPosition.y - 10,
            maxWidth: '200px',
            width: '200px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
          }}
        >
          {/* Building image */}
          {uiState.hoveredBuildingImagePath && (
            <div className="w-full aspect-square overflow-hidden">
              <img 
                src={uiState.hoveredBuildingImagePath}
                alt={uiState.hoveredBuildingName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  console.error('Error loading building image in hover tooltip:', e);
                  e.currentTarget.src = '/images/buildings/market_stall.jpg';
                }}
              />
            </div>
          )}
          
          {/* Building name */}
          <div className="px-2 py-1 text-center font-medium">
            {uiState.hoveredBuildingName}
          </div>
          
          {/* Loading indicator */}
          {uiState.isLoadingBuildingImage && !uiState.hoveredBuildingImagePath && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="w-6 h-6 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      )}
      
      {/* Land Details Panel */}
      {uiState.showLandDetailsPanel && uiState.selectedPolygonId && (
        <LandDetailsPanel
          selectedPolygonId={uiState.selectedPolygonId}
          onClose={() => uiStateService.setSelectedPolygon(null, false)}
          visible={uiState.showLandDetailsPanel}
        />
      )}
      
      {/* Building Details Panel */}
      {uiState.showBuildingDetailsPanel && uiState.selectedBuildingId && (activeView === 'buildings' || activeView === 'land' || activeView === 'citizens') && (
        <BuildingDetailsPanel
          selectedBuildingId={uiState.selectedBuildingId}
          onClose={() => uiStateService.setSelectedBuilding(null, false)}
          visible={uiState.showBuildingDetailsPanel}
        />
      )}
      
      {/* Citizen Details Panel */}
      {uiState.showCitizenDetailsPanel && uiState.selectedCitizen && (
        <CitizenDetailsPanel
          citizen={uiState.selectedCitizen}
          onClose={() => uiStateService.setSelectedCitizen(null, false)}
        />
      )}
      
      {/* Income Legend - only visible in land view */}
      {activeView === 'land' && (
        <div className="absolute top-20 left-20 bg-black/70 text-white px-3 py-2 rounded text-sm pointer-events-none">
          <p>Income per building point</p>
          <div className="w-full h-2 mt-1 rounded" style={{background: 'linear-gradient(to right, #6699CC, #CCB266, #A54A2A)'}}></div>
          <div className="flex justify-between text-xs mt-1">
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
          </div>
        </div>
      )}
      
      {/* Controls */}
      <div className="absolute bottom-4 right-4 bg-black/70 text-white p-3 rounded-lg shadow-lg">
        <div className="flex items-center space-x-2">
          <span className="text-sm">{Math.round(scale * 100)}%</span>
          <button 
            onClick={() => viewportService.resetViewport()}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white ml-2"
          >
            Reset
          </button>
        </div>
      </div>
      
      {/* Exit Transport Mode button */}
      {activeView === 'transport' && transportService.getState().startPoint !== null && (
        <button
          onClick={() => {
            transportService.reset();
            // Dispatch event to notify components that transport mode has been exited
            window.dispatchEvent(new CustomEvent('transportModeExited'));
          }}
          className="absolute top-20 right-4 bg-red-600 text-white px-3 py-1 rounded text-sm"
        >
          Exit Transport Mode
        </button>
      )}
    </div>
  );
}
