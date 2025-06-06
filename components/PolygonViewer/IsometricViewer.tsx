'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { debounce, throttle } from 'lodash';
import { useWalletContext } from '@/components/UI/WalletProvider'; // Import useWalletContext
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { fetchCoatOfArmsImageUrl } from '@/app/utils/coatOfArmsUtils';
import { buildingPointsService } from '@/lib/services/BuildingPointsService';
import { citizenService } from '@/lib/services/CitizenService'; // Added import
import { interactionService } from '@/lib/services/InteractionService';
import { hoverStateService, HOVER_STATE_CHANGED, HoverState } from '@/lib/services/HoverStateService';
import { CitizenRenderService } from '@/lib/services/CitizenRenderService';
import { landService } from '@/lib/services/LandService'; // Import LandService
import LandDetailsPanel from './LandDetailsPanel';
import BuildingDetailsPanel from './BuildingDetailsPanel';
import CitizenDetailsPanel from '../UI/CitizenDetailsPanel';
import CoatOfArmsMarkers from './CoatOfArmsMarkers';
import CitizenMarkers from './CitizenMarkers';
import ResourceMarkers from './ResourceMarkers';
import BuildingMarkers from './BuildingMarkers';
import LandMarkers from './LandMarkers';
// import FeaturePointMarkers, { FeaturePoint } from './FeaturePointMarkers'; // Removed FeaturePointMarkers
import ContractMarkers from '@/components/PolygonViewer/ContractMarkers';
import { HoverTooltip } from '../UI/HoverTooltip';
import TransportDebugPanel from '../UI/TransportDebugPanel';
import TransportErrorMessage from '../UI/TransportErrorMessage';
import ProblemMarkers from './ProblemMarkers';
import ProblemDetailsPanel from '../UI/ProblemDetailsPanel';
import BuildingCreationPanel from './BuildingCreationPanel';
import { renderService } from '@/lib/services/RenderService';
import { CoordinateService } from '@/lib/services/CoordinateService';
import { ambientAudioManager } from '@/lib/services/AmbientAudioManager'; // Import AmbientAudioManager

interface IsometricViewerProps {
  activeView: 'buildings' | 'land' | 'transport' | 'resources' | 'contracts' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';
  setActiveView: (view: ViewType) => void; // Add setActiveView prop
  fullWaterGraphData: { waterPoints: any[] } | null; // Add this prop
}

// Define a type for all possible view types to use throughout the component
type ViewType = 'buildings' | 'land' | 'transport' | 'resources' | 'contracts' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';

// Cache constants and helpers for loading images (moved outside component)
const LOADING_IMAGE_CACHE_KEY = 'loadingScreenImageCache';
const LOADING_IMAGE_CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface LoadingImageCacheItem {
  src: string;
  timestamp: number;
  failed?: boolean;
  lastAttempt?: number;
}
type LoadingImageCache = Record<string, LoadingImageCacheItem>; // Keyed by image filename

// Helper to get loading image cache
const getLoadingImageCache = (): LoadingImageCache => {
  if (typeof window === 'undefined') return {};
  try {
    const cached = localStorage.getItem(LOADING_IMAGE_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (e) {
    console.error("Error reading loading image cache:", e);
    return {};
  }
};

// Helper to set loading image cache
const setLoadingImageCache = (cache: LoadingImageCache) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOADING_IMAGE_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error("Error writing loading image cache:", e);
  }
};

export default function IsometricViewer({ activeView, setActiveView, fullWaterGraphData }: IsometricViewerProps) { // Add setActiveView to destructuring
  const wrapperRef = useRef<HTMLDivElement>(null); // Ref for the main wrapper div
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [polygons, setPolygons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [polygonsDataLoaded, setPolygonsDataLoaded] = useState(false);
  const [bgImageReady, setBgImageReady] = useState(false);
  const [minLoadingTimeElapsed, setMinLoadingTimeElapsed] = useState(false); // New state for minimum display time
  const [landOwners, setLandOwners] = useState<Record<string, string>>({});
  const [citizens, setCitizens] = useState<Record<string, any>>({});
  const [scale, setScale] = useState(3); // Start with a 3x zoom for a closer view
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [canvasDims, setCanvasDims] = useState({ width: typeof window !== 'undefined' ? window.innerWidth : 0, height: typeof window !== 'undefined' ? window.innerHeight : 0 });
  const [currentLoadingImage, setCurrentLoadingImage] = useState<string | null>(null); // Initialize to null
  const [currentLoadingTip, setCurrentLoadingTip] = useState<string>('');

  // Add refs to track previous state
  const prevActiveView = useRef<ViewType | null>(null); // Peut être conservé si utilisé ailleurs
  const prevScale = useRef<number>(3); // Peut être conservé si utilisé ailleurs
  // Le cache renderedCoatOfArmsCache est supprimé car géré par le nouveau composant ou non nécessaire avec JSX
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [buildings, setBuildings] = useState<any[]>([]);
  const [incomeData, setIncomeData] = useState<Record<string, number>>({});
  const [minIncome, setMinIncome] = useState<number>(0);
  const [maxIncome, setMaxIncome] = useState<number>(1000);
  const [incomeDataLoaded, setIncomeDataLoaded] = useState<boolean>(false);
  const [landGroups, setLandGroups] = useState<Record<string, string>>({});
  const [landGroupColors, setLandGroupColors] = useState<Record<string, string>>({});
  const [ownerCoatOfArmsMap, setOwnerCoatOfArmsMap] = useState<Record<string, string>>({});
  const [coatOfArmsImageUrls, setCoatOfArmsImageUrls] = useState<Record<string, HTMLImageElement>>({});
  const [loadingCoatOfArms, setLoadingCoatOfArms] = useState<boolean>(false);
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
  const [showLandDetailsPanel, setShowLandDetailsPanel] = useState<boolean>(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null); // This will store BuildingId
  const [showBuildingDetailsPanel, setShowBuildingDetailsPanel] = useState<boolean>(false);
  const [mousePosition, setMousePosition] = useState<{x: number, y: number}>({ x: 0, y: 0 });
  const [buildingPositionsCache, setBuildingPositionsCache] = useState<Record<string, {x: number, y: number}>>({}); // Keyed by BuildingId
  const [initialPositionCalculated, setInitialPositionCalculated] = useState<boolean>(false);
  const [buildingFilterMode, setBuildingFilterMode] = useState<'city' | 'me'>('city');
  const [buildingFinancialAspect, setBuildingFinancialAspect] = useState<'default' | 'lease' | 'rent' | 'wages'>('default');
  const [financialDataRange, setFinancialDataRange] = useState<{ min: number, max: number } | null>(null);

  const [polygonsToRender, setPolygonsToRender] = useState<{
    polygon: any;
    coords: {x: number, y: number}[];
    fillColor: string;
    centroidX: number;
    centroidY: number;
    centerX: number;
    centerY: number;
    polygonWorldMapCenterX?: number; // For land marker custom positions
    polygonWorldMapCenterY?: number; // For land marker custom positions
    hasPublicDock?: boolean; // Add this property to the type definition
  }[]>([]);
  const [emptyBuildingPoints, setEmptyBuildingPoints] = useState<{lat: number, lng: number}[]>([]);
  const [showTransportDebugPanel, setShowTransportDebugPanel] = useState<boolean>(false);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [showProblemDetailsPanel, setShowProblemDetailsPanel] = useState<boolean>(false);
  const [currentHoverState, setCurrentHoverState] = useState<HoverState>(hoverStateService.getState());
  const [isNight, setIsNight] = useState(false);
  
  // State for BuildingCreationPanel
  const [showBuildingCreationPanel, setShowBuildingCreationPanel] = useState<boolean>(false);
  const [selectedPointForCreation, setSelectedPointForCreation] = useState<{
    lat: number;
    lng: number;
    polygonId: string;
    pointType: 'land' | 'canal' | 'bridge';
  } | null>(null);
  
  // State for path statistics
  const [pathStats, setPathStats] = useState<{
    totalDistance: number;
    walkingDistance: number;
    waterDistance: number;
    estimatedTimeMinutes: number;
    transportCost: number;
  } | null>(null);

  // State for bridge orientation (now part of interactionMode)
  const [selectedBridgeForOrientationId, setSelectedBridgeForOrientationId] = useState<string | null>(null);
  const [orientingBridgeAngle, setOrientingBridgeAngle] = useState<number | null>(null);
  const [isUserConsiglioDeiDieci, setIsUserConsiglioDeiDieci] = useState<boolean>(false); // This will be updated by context

  // New state for unified interaction mode
  type InteractionMode = 'normal' | 'orient_bridge' | 'place_water_point' | 'create_water_route';

  const { citizenProfile } = useWalletContext(); // Use wallet context

  // Helper function to get current hour and month in Venice (approximated by Rome timezone)
  const getVeniceDateTimeParts = () => {
    const options: Intl.DateTimeFormatOptions = { 
      timeZone: 'Europe/Rome', 
      hour: 'numeric', 
      hour12: false,
      month: 'numeric' // 1-indexed month
    };
    const formatter = new Intl.DateTimeFormat([], options);
    try {
      const parts = formatter.formatToParts(new Date());
      const hourPart = parts.find(part => part.type === 'hour');
      const monthPart = parts.find(part => part.type === 'month');
      
      const hour = hourPart ? parseInt(hourPart.value, 10) : new Date().getHours(); // Fallback to local hour
      // Intl.DateTimeFormat month is 1-indexed, convert to 0-indexed for array access
      const month = monthPart ? parseInt(monthPart.value, 10) - 1 : new Date().getMonth(); // Fallback to local month

      return { hour, month };
    } catch (e) {
      console.error("Error getting Venice time parts:", e);
      // Fallback to local time parts on error
      const now = new Date();
      return { hour: now.getHours(), month: now.getMonth() };
    }
  };
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('normal');


  // Effect to listen for land marker settings updates
  useEffect(() => {
    const handleLandMarkerSettingsUpdate = (eventDetail: { polygonId: string, settings: any }) => {
      const { polygonId, settings } = eventDetail;
      console.log(`[IsometricViewer] Received LAND_MARKER_SETTINGS_UPDATED for ${polygonId}`, settings);
      setPolygons(prevPolygons =>
        prevPolygons.map(p => {
          if (p.id === polygonId) {
            // Ensure we are updating the correct polygon object structure
            // The 'polygons' state holds the raw polygon data which includes 'imageSettings' directly
            return { ...p, imageSettings: settings };
          }
          return p;
        })
      );
    };

    const subscription = eventBus.subscribe(EventTypes.LAND_MARKER_SETTINGS_UPDATED, handleLandMarkerSettingsUpdate);
    return () => {
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array, runs once on mount

  const handleInteractionModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMode = e.target.value as InteractionMode;
    console.log(`[BRIDGE_ORIENT_DEBUG] Switching interaction mode from ${interactionMode} to ${newMode}`);

    // Cleanup for the OLD mode
    if (interactionMode === 'orient_bridge') {
      setSelectedBridgeForOrientationId(null);
      setOrientingBridgeAngle(null);
    }
    if (interactionMode === 'create_water_route') {
      setWaterRouteStartPoint(null);
      setWaterRouteEndPoint(null);
      setWaterRouteIntermediatePoints([]);
      setWaterRoutePath([]);
    }
    // Add any cleanup for 'place_water_point' if needed

    // Setup for the NEW mode
    if (newMode === 'orient_bridge') {
      if (transportMode) setTransportMode(false); // Disable general transport mode
    }
    if (newMode === 'place_water_point') {
      if (transportMode) setTransportMode(false);
    }
    if (newMode === 'create_water_route') {
      if (transportMode) setTransportMode(false);
      setWaterRouteStartPoint(null); // Reset route state when entering mode
      setWaterRouteEndPoint(null);
      setWaterRouteIntermediatePoints([]);
      setWaterRoutePath([]);
    }
    
    // If switching to 'normal', ensure general transport mode is also reset if it was tied to a special mode
    if (newMode === 'normal' && (interactionMode === 'place_water_point' || interactionMode === 'create_water_route')) {
        // if transportMode was implicitly active due to a special water mode, consider resetting it or managing its state explicitly.
        // For now, general transportMode is toggled by its own button.
    }


    setInteractionMode(newMode);
  };
  
  // Add handler function for closing the transport debug panel
  const handleTransportDebugPanelClose = () => {
    setShowTransportDebugPanel(false);
  };
  
  // Add refs to track current state without causing re-renders
  const isDraggingRef = useRef<boolean>(false);

  // Function to get the current citizen's secondaryColor
  const getCurrentCitizenSecondaryColor = useCallback(() => {
    return citizenProfile?.secondaryColor || '#FF8C00'; // Default to orange if not found
  }, [citizenProfile]);
  
  // Function to get the current citizen's identifier
  const getCurrentCitizenIdentifier = useCallback(() => {
    return citizenProfile?.username || citizenProfile?.walletAddress || null;
  }, [citizenProfile]);
  
  // Function to get color based on building category
  const getBuildingCategoryColor = (category: string): string => {
    // Default to black if no category
    if (!category) return '#000000';
    
    // Convert to lowercase for case-insensitive comparison
    const lowerCategory = category.toLowerCase();
    
    // Return color based on category
    switch(lowerCategory) {
      case 'bridge':
        return '#8B4513'; // Brown for bridges
      case 'business':
        return '#4B0082'; // Indigo for businesses
      case 'dock':
        return '#1E90FF'; // Dodger blue for docks
      case 'home':
        return '#228B22'; // Forest green for homes
      case 'well':
        return '#4682B4'; // Steel blue for wells
      default:
        return '#000000'; // Black for unknown categories
    }
  };
  
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
  

  
  // Function to load citizens data - declared early to avoid reference before declaration
  const loadCitizens = useCallback(async () => {
    try {
      console.log('Loading citizens data...');
      const response = await fetch('/api/citizens');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setCitizensList(data);
          
          // Remove building grouping completely
          setCitizensByBuilding({});
          setCitizensLoaded(true);
          console.log(`Loaded ${data.length} citizens`);
        }
      }
    } catch (error) {
      console.error('Error loading citizens:', error);
    }
  }, []);
  
  // Citizen-related state
  const [citizensList, setCitizensList] = useState<any[]>([]);
  const [citizensByBuilding, setCitizensByBuilding] = useState<Record<string, any[]>>({});
  const [citizensLoaded, setCitizensLoaded] = useState<boolean>(false);
  const [selectedCitizen, setSelectedCitizen] = useState<any>(null);
  const [showCitizenDetailsPanel, setShowCitizenDetailsPanel] = useState<boolean>(false);
  const [showContractMarkers, setShowContractMarkers] = useState<boolean>(true); // Default to true
  const [occupantLine, setOccupantLine] = useState<{ startWorld: { x: number; y: number; z: number }; endWorld: { x:
number; y: number; z: number }; color: string } | null>(null);

  const handleCloseCitizenDetailsPanel = useCallback(() => {
    setShowCitizenDetailsPanel(false);
    setSelectedCitizen(null);
  }, []); // setShowCitizenDetailsPanel and setSelectedCitizen are stable state setters
  
  // No replacement - removing hover state for dock and bridge points

  const fetchBuildingsData = useCallback(async () => {
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
          setInitialPositionCalculated(false); // This will trigger re-calculation of buildingPositionsCache
          window.dispatchEvent(new CustomEvent('ensureBuildingsVisible')); // This seems to also trigger position calculation
        }
      }
    } catch (error) {
      console.error('Error fetching buildings:', error);
    }
  }, [setBuildings, setInitialPositionCalculated]); // Dependencies for useCallback
  
  // Transport route planning state
  const [transportMode, setTransportMode] = useState<boolean>(false);
  const [transportStartPoint, setTransportStartPoint] = useState<{lat: number, lng: number} | null>(null);
  const [transportEndPoint, setTransportEndPoint] = useState<{lat: number, lng: number} | null>(null);
  const [transportPath, setTransportPath] = useState<any[]>([]);
  const [calculatingPath, setCalculatingPath] = useState<boolean>(false);
  const [waterOnlyMode, setWaterOnlyMode] = useState<boolean>(false);
  const [pathfindingMode, setPathfindingMode] = useState<'all' | 'real'>('real'); // Default to 'real' mode
  
  // Water point mode state (now part of interactionMode)
  // const [waterPoints, setWaterPoints] = useState<any[]>([]); // Removed: waterPoints will come from fullWaterGraphData prop

  // Refs for immersive loading text
  const loadingTitleRef = useRef<string>('');
  const loadingSubtitleRef = useRef<string>('');
  
  // Water route mode state (now part of interactionMode)
  const [waterRouteStartPoint, setWaterRouteStartPoint] = useState<any>(null);
  const [waterRouteEndPoint, setWaterRouteEndPoint] = useState<any>(null);
  const [waterRouteIntermediatePoints, setWaterRouteIntermediatePoints] = useState<any[]>([]);
  const [waterRoutePath, setWaterRoutePath] = useState<any[]>([]);
  
  const calculateDistance = (point1: {lat: number, lng: number}, point2: {lat: number, lng: number}):
number => {
    const R = 6371000; // Earth radius in meters
    const lat1 = point1.lat * Math.PI / 180;
    const lat2 = point2.lat * Math.PI / 180;
    const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
    const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };


  // Function to save a new water point
  const saveWaterPoint = useCallback(async (point: {lat: number, lng: number}) => {
    try {
      console.log('Saving new water point at:', point);
      
      // Create a new water point object
      const newWaterPoint = {
        id: `waterpoint_${point.lat}_${point.lng}`,
        position: {
          lat: point.lat,
          lng: point.lng
        },
        connections: []
      };
      
      // Add to local state first for immediate visual feedback - REMOVED as setWaterPoints is removed
      // setWaterPoints(prev => [...prev, newWaterPoint]); 
      
      // Save to server
      const response = await fetch('/api/water-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ waterPoint: newWaterPoint }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log('Water point saved successfully');
        } else {
          console.error('Failed to save water point:', data.error);
        }
      } else {
        console.error(`API error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error saving water point:', error);
    }
  }, []);
  

  
  
  
  // Helper function to calculate the total distance of a path
  const calculateTotalDistance = useCallback((path: any[]) => {
    if (!path || path.length < 2) {
      return 0;
    }
    let totalDistance = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const point1 = path[i];
      const point2 = path[i+1];
      // Ensure points have lat and lng properties
      if (point1 && typeof point1.lat === 'number' && typeof point1.lng === 'number' &&
          point2 && typeof point2.lat === 'number' && typeof point2.lng === 'number') {
        totalDistance += calculateDistance(point1, point2);
      } else {
        console.warn('Invalid point in path for distance calculation:', point1, point2);
      }
    }
    return totalDistance;
  }, [calculateDistance]); // Added calculateDistance to dependency array
  
  // Function to save a water route
  const saveWaterRoute = useCallback(async () => {
    try {
      if (!waterRouteStartPoint || !waterRouteEndPoint || waterRoutePath.length < 2) {
        console.error('Cannot save water route: incomplete route data', {
          startPoint: waterRouteStartPoint,
          endPoint: waterRouteEndPoint,
          pathLength: waterRoutePath.length
        });
        return;
      }
      
      console.log('Saving water route...', {
        startPoint: waterRouteStartPoint,
        endPoint: waterRouteEndPoint,
        intermediatePoints: waterRouteIntermediatePoints,
        pathLength: waterRoutePath.length
      });
      
      // Calculate the centroid of the route
      const allPoints = [
        waterRouteStartPoint.position,
        ...waterRouteIntermediatePoints,
        waterRouteEndPoint.position
      ];
      
      const centroidLat = allPoints.reduce((sum, pt) => sum + pt.lat, 0) / allPoints.length;
      const centroidLng = allPoints.reduce((sum, pt) => sum + pt.lng, 0) / allPoints.length;
      
      // Calculate total length of the route
      const totalLength = calculateTotalDistance(waterRoutePath);
      
      // Create a unique ID for the route
      const routeId = `waterroute_${centroidLat.toFixed(6)}_${centroidLng.toFixed(6)}`;
      
      // Create the connection objects for start and end points
      const startPointConnection = {
        targetId: waterRouteEndPoint.id,
        intermediatePoints: waterRouteIntermediatePoints.map(pt => ({
          lat: pt.lat,
          lng: pt.lng
        })),
        distance: totalLength,
        id: routeId
      };
      
      const endPointConnection = {
        targetId: waterRouteStartPoint.id,
        intermediatePoints: [...waterRouteIntermediatePoints].reverse().map(pt => ({
          lat: pt.lat,
          lng: pt.lng
        })),
        distance: totalLength,
        id: routeId
      };
      
      // Update the water points with the new connections
      const updatedStartPoint = {
        ...waterRouteStartPoint,
        connections: [
          ...(waterRouteStartPoint.connections || []),
          startPointConnection
        ]
      };
      
      const updatedEndPoint = {
        ...waterRouteEndPoint,
        connections: [
          ...(waterRouteEndPoint.connections || []),
          endPointConnection
        ]
      };
      
      console.log('Saving updated water points:', {
        startPoint: updatedStartPoint,
        endPoint: updatedEndPoint
      });
      
      // Save the updated water points
      const startResponse = await fetch('/api/water-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ waterPoint: updatedStartPoint }),
      });
      
      if (!startResponse.ok) {
        throw new Error(`Failed to save start point: ${startResponse.status} ${startResponse.statusText}`);
      }
      
      const endResponse = await fetch('/api/water-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ waterPoint: updatedEndPoint }),
      });
      
      if (!endResponse.ok) {
        throw new Error(`Failed to save end point: ${endResponse.status} ${endResponse.statusText}`);
      }
      
      // Update local state - REMOVED as waterPoints now comes from fullWaterGraphData prop
      // The parent component should be notified to refresh fullWaterGraphData.
      // For example, by dispatching an event:
      // eventBus.dispatch(EventTypes.WATER_DATA_UPDATED);
      
      // Reset water route state but keep water route mode active
      setWaterRouteStartPoint(null);
      setWaterRouteEndPoint(null);
      setWaterRouteIntermediatePoints([]);
      setWaterRoutePath([]);
      
      // Show a subtle notification instead of an alert
      console.log(`Water route saved successfully! Total length: ${Math.round(totalLength)}m`);
      
      // Create a small notification that will disappear after a few seconds
      const notification = document.createElement('div');
      notification.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-50';
      notification.textContent = `Route saved! Length: ${Math.round(totalLength)}m`;
      document.body.appendChild(notification);
      
      // Remove the notification after 3 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 3000);
      
      // Don't disable water route mode - keep it active
      // setWaterRouteMode(false); - Remove this line
      
      // Refresh water points - REMOVED as fetchWaterPoints is removed
      // fetchWaterPoints(); 
      // Consider dispatching an event to app/page.tsx to reload fullWaterGraphData if immediate update is needed
      
    } catch (error) {
      console.error('Error saving water route:', error);
      alert('Failed to save water route. Please try again.');
    }
  }, [waterRouteStartPoint, waterRouteEndPoint, waterRouteIntermediatePoints, waterRoutePath, calculateTotalDistance, fullWaterGraphData]); // Added fullWaterGraphData
  
  // Add a new function to save water route with explicit data
  const saveWaterRouteWithData = useCallback(async (routeData: {
    startPoint: any,
    endPoint: any,
    intermediatePoints: any[],
    path: any[]
  }) => {
    try {
      if (!routeData.startPoint || !routeData.endPoint || routeData.path.length < 2) {
        console.error('Cannot save water route: incomplete route data', {
          startPoint: routeData.startPoint,
          endPoint: routeData.endPoint,
          pathLength: routeData.path.length
        });
        return;
      }
      
      console.log('Saving water route with explicit data...', {
        startPoint: routeData.startPoint,
        endPoint: routeData.endPoint,
        intermediatePoints: routeData.intermediatePoints,
        pathLength: routeData.path.length
      });
      
      // Calculate the centroid of the route
      const allPoints = [
        routeData.startPoint.position,
        ...routeData.intermediatePoints,
        routeData.endPoint.position
      ];
      
      const centroidLat = allPoints.reduce((sum, pt) => sum + pt.lat, 0) / allPoints.length;
      const centroidLng = allPoints.reduce((sum, pt) => sum + pt.lng, 0) / allPoints.length;
      
      // Calculate total length of the route
      const totalLength = calculateTotalDistance(routeData.path);
      
      // Create a unique ID for the route
      const routeId = `waterroute_${centroidLat.toFixed(6)}_${centroidLng.toFixed(6)}`;
      
      // Create the connection objects for start and end points
      const startPointConnection = {
        targetId: routeData.endPoint.id,
        intermediatePoints: routeData.intermediatePoints.map(pt => ({
          lat: pt.lat,
          lng: pt.lng
        })),
        distance: totalLength,
        id: routeId
      };
      
      const endPointConnection = {
        targetId: routeData.startPoint.id,
        intermediatePoints: [...routeData.intermediatePoints].reverse().map(pt => ({
          lat: pt.lat,
          lng: pt.lng
        })),
        distance: totalLength,
        id: routeId
      };
      
      // Update the water points with the new connections
      const updatedStartPoint = {
        ...routeData.startPoint,
        connections: [
          ...(routeData.startPoint.connections || []),
          startPointConnection
        ]
      };
      
      const updatedEndPoint = {
        ...routeData.endPoint,
        connections: [
          ...(routeData.endPoint.connections || []),
          endPointConnection
        ]
      };
      
      console.log('Saving updated water points:', {
        startPoint: updatedStartPoint,
        endPoint: updatedEndPoint
      });
      
      // Save the updated water points
      const startResponse = await fetch('/api/water-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ waterPoint: updatedStartPoint }),
      });
      
      if (!startResponse.ok) {
        throw new Error(`Failed to save start point: ${startResponse.status} ${startResponse.statusText}`);
      }
      
      const endResponse = await fetch('/api/water-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ waterPoint: updatedEndPoint }),
      });
      
      if (!endResponse.ok) {
        throw new Error(`Failed to save end point: ${endResponse.status} ${endResponse.statusText}`);
      }
      
      // Update local state - REMOVED as waterPoints now comes from fullWaterGraphData prop
      // The parent component should be notified to refresh fullWaterGraphData.
      // For example, by dispatching an event:
      // eventBus.dispatch(EventTypes.WATER_DATA_UPDATED);
      
      // Reset water route state but keep water route mode active
      setWaterRouteStartPoint(null);
      setWaterRouteEndPoint(null);
      setWaterRouteIntermediatePoints([]);
      setWaterRoutePath([]);
      
      // Show a subtle notification instead of an alert
      console.log(`Water route saved successfully! Total length: ${Math.round(totalLength)}m`);
      
      // Create a small notification that will disappear after a few seconds
      const notification = document.createElement('div');
      notification.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-50';
      notification.textContent = `Route saved! Length: ${Math.round(totalLength)}m`;
      document.body.appendChild(notification);
      
      // Remove the notification after 3 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 3000);
      
      // Don't disable water route mode - keep it active
      // setWaterRouteMode(false); - Remove this line
      
      // Refresh water points - REMOVED as fetchWaterPoints is removed
      // fetchWaterPoints();
      // Consider dispatching an event to app/page.tsx to reload fullWaterGraphData if immediate update is needed
      
    } catch (error) {
      console.error('Error saving water route:', error);
      alert('Failed to save water route. Please try again.');
    }
  }, [calculateTotalDistance]); // Removed fetchWaterPoints
  
  // Effect to check user role on mount
  useEffect(() => {
    if (citizenProfile) {
      const isConsiglio = citizenProfile.username === 'ConsiglioDeiDieci';
      setIsUserConsiglioDeiDieci(isConsiglio);
      console.log(`[IsometricViewer] User role check: ${citizenProfile.username}, IsConsiglio: ${isConsiglio}`);
    } else {
      setIsUserConsiglioDeiDieci(false);
      console.log('[IsometricViewer] User role check: No citizen profile, not Consiglio.');
    }
  }, [citizenProfile]); // Re-run when citizenProfile from context changes
  
  // Function to handle water route clicks
  const handleWaterRouteClick = useCallback((point: {lat: number, lng: number}, isWaterPoint: boolean, waterPointId?: string) => {
    console.log('Water route click:', { point, isWaterPoint, waterPointId });
    
    // If clicked on a water point
    if (isWaterPoint && waterPointId) {
      // Find the water point in our state (now from props)
      const currentWaterPoints = fullWaterGraphData?.waterPoints || [];
      const clickedWaterPoint = currentWaterPoints.find(wp => wp.id === waterPointId);
      if (!clickedWaterPoint) {
        console.error(`Water point with ID ${waterPointId} not found in fullWaterGraphData`);
        return;
      }
      
      // If no start point is set, set it
      if (!waterRouteStartPoint) {
        console.log('Setting water route start point:', clickedWaterPoint);
        setWaterRouteStartPoint(clickedWaterPoint);
        setWaterRoutePath([clickedWaterPoint.position]);
        return;
      }
      
      // If start point is already set but no end point, set the end point
      if (waterRouteStartPoint && !waterRouteEndPoint) {
        // Don't allow connecting to the same point
        if (waterPointId === waterRouteStartPoint.id) {
          console.log('Cannot connect a water point to itself');
          return;
        }
        
        console.log('Setting water route end point:', clickedWaterPoint);
        
        // Create the complete path
        const fullPath = [
          waterRouteStartPoint.position,
          ...waterRouteIntermediatePoints,
          clickedWaterPoint.position
        ];
        
        // Update all state in one batch, then save the route
        setWaterRouteEndPoint(clickedWaterPoint);
        setWaterRoutePath(fullPath);
        
        // IMPORTANT CHANGE: Use the actual values instead of relying on state
        // This ensures we have the correct data when saving
        setTimeout(() => {
          const routeToSave = {
            startPoint: waterRouteStartPoint,
            endPoint: clickedWaterPoint,
            intermediatePoints: waterRouteIntermediatePoints,
            path: fullPath
          };
          
          console.log('Saving water route with data:', routeToSave);
          
          // Call a modified version of saveWaterRoute that takes the data directly
          saveWaterRouteWithData(routeToSave);
        }, 100);
        
        return;
      }
      
      // If both start and end points are set, reset and start over
      console.log('Resetting water route and setting new start point');
      setWaterRouteStartPoint(clickedWaterPoint);
      setWaterRouteEndPoint(null);
      setWaterRouteIntermediatePoints([]);
      setWaterRoutePath([clickedWaterPoint.position]);
      return;
    }
    
    // If clicked on water (not a water point) and we have a start point but no end point
    if (!isWaterPoint && waterRouteStartPoint && !waterRouteEndPoint) {
      console.log('Adding intermediate point:', point);
      // Add an intermediate point
      const updatedIntermediatePoints = [...waterRouteIntermediatePoints, point];
      setWaterRouteIntermediatePoints(updatedIntermediatePoints);
      
      // Update the path
      const updatedPath = [
        waterRouteStartPoint.position,
        ...updatedIntermediatePoints,
        point
      ];
      setWaterRoutePath(updatedPath);
    }
  }, [fullWaterGraphData, waterRouteStartPoint, waterRouteEndPoint, waterRouteIntermediatePoints, saveWaterRouteWithData]); // Replaced waterPoints with fullWaterGraphData
  
  // Function to visualize the transport path
  const visualizeTransportPath = useCallback((path: any[]) => {
    if (!path || path.length < 2) return;
    
    console.log(`Visualizing transport path with ${path.length} points`);
    
    // Set the transport path state
    setTransportPath(path);
    
    // Force a redraw
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Redraw everything
        const event = new Event('redraw');
        window.dispatchEvent(event);
      }
    }
    
    // Also dispatch an event for the debug panel
    const pathUpdateEvent = new CustomEvent('MANUAL_PATH_UPDATE', {
      detail: { path }
    });
    window.dispatchEvent(pathUpdateEvent);
  }, []);

  // Effect for initial setup: setting loading states and starting timers/image load/tip selection
  useEffect(() => {
    // Client-side selection of initial loading image
    const loadingImageFiles = [ // Define loadingImageFiles here
      'renaissance-architectural-construction.png',
      'renaissance-venetian-merchant-s-ledger.png',
      'secretive-venetian-council-of-ten-meeting.png',
      '1.png',
      '2.png',
      '3.png',
      '4.png',
      '5.png',
      '6.png',
      '7.png',
      '8.png',
      '9.png',
      '10.png',
      '11.png'
    ];
    const selectInitialLoadingImage = () => {
      if (loadingImageFiles.length === 0) return null;
      const cache = getLoadingImageCache(); // Assumes getLoadingImageCache is defined above or globally
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      const viableImageFiles = loadingImageFiles.filter(fileName => {
        const cacheEntry = cache[fileName];
        if (cacheEntry?.failed && cacheEntry.lastAttempt && (now - cacheEntry.lastAttempt < oneDayMs)) {
          return false;
        }
        return true;
      });

      let selectedFileName: string;
      if (viableImageFiles.length > 0) {
        selectedFileName = viableImageFiles[Math.floor(Math.random() * viableImageFiles.length)];
        console.log("IsometricViewer: Selected a viable loading image (client-side):", selectedFileName);
      } else {
        selectedFileName = loadingImageFiles[Math.floor(Math.random() * loadingImageFiles.length)];
        console.log("IsometricViewer: All images failed recently, retrying a random one (client-side):", selectedFileName);
      }
      return `https://backend.serenissima.ai/public_assets/images/loading/${selectedFileName}`;
    };
    const newLoadingImage = selectInitialLoadingImage();
    // Only set if currentLoadingImage is still null (i.e., this is the first client-side run for this)
    // This check might be redundant if the useEffect has an empty dependency array,
    // but it's safer if this effect were to run more than once for other reasons.
    if (currentLoadingImage === null && newLoadingImage) {
        setCurrentLoadingImage(newLoadingImage);
    }


    console.log('IsometricViewer: Initial setup effect running...');
    setLoading(true);
    setPolygonsDataLoaded(false);
    setBgImageReady(false);
    setMinLoadingTimeElapsed(false);

    // Start timer for minimum display duration
    const minTimeTimer = setTimeout(() => {
      console.log('IsometricViewer: Minimum loading time elapsed.');
      setMinLoadingTimeElapsed(true);
    }, 4000); // 4 seconds

    // Define and select a loading tip
    const loadingTips = [
      "Connect your wallet to establish your identity and access your $COMPUTE tokens.",
      "Acquire land parcels to start building your Venetian empire; location is key!",
      "Construct workshops to produce goods like textiles, glassware, or woodworking items.",
      "Secure your supply chain: use the Contracts View to buy raw materials.",
      "Sell your produced goods via the Contracts View or directly to other players.",
      "The economic cycle: Land -> Buildings -> Businesses -> Resources -> Citizens -> Land. Master it!",
      "Diversify your investments across districts and building types to mitigate risk.",
      "Form strategic partnerships with other merchants for efficient supply chains.",
      "Monitor contract price fluctuations in the Contracts View to maximize profits.",
      "Consider vertical integration: control more steps in your supply chain for higher profits.",
      "Fund public works to gain favor and influence decree proposals.",
      "Guilds can coordinate buying/selling to influence contract prices collectively.",
      "As a landowner, set strategic lease prices to attract tenants or block competitors.",
      "Control transportation by acquiring land at chokepoints or building docks.",
      "Higher social classes receive larger shares of daily treasury redistribution.",
      "Achieve Nobili status by gaining over 10,000 Influence through city contributions.",
      "Earning over 100,000 Ducats daily can elevate you to Cittadini status.",
      "Owning business buildings or running them can elevate you to Popolani status.",
      "Cultivate a network for contract intelligence; information is power.",
      "Use strategic lending for influence; debtors can become valuable allies.",
      "Manipulate public perception by funding infrastructure that benefits your businesses.",
      "Control access to Guild Leadership to shape industry regulations in your favor.",
      "Weaponize decree proposals: craft rules that favor your business model.",
      "Prepare for crises: stockpiling resources can turn disruptions into opportunities.",
      "Layer your strategies: combine intelligence, alliances, and economic control for maximum effect."
    ];
    setCurrentLoadingTip(loadingTips[Math.floor(Math.random() * loadingTips.length)]);

    // Load the initially selected background image
    if (currentLoadingImage) {
      const img = new Image();
      const imageName = currentLoadingImage.substring(currentLoadingImage.lastIndexOf('/') + 1);

      img.onload = () => {
        console.log('App Page: Background image loaded successfully:', currentLoadingImage);
        setBgImageReady(true);
        const cache = getLoadingImageCache();
        cache[imageName] = { src: currentLoadingImage, timestamp: Date.now(), failed: false };
        setLoadingImageCache(cache);
      };
      img.onerror = () => {
        console.warn(`App Page: Failed to load background image: ${currentLoadingImage}`);
        setBgImageReady(true); // Mark as ready even on error to not block UI
        const cache = getLoadingImageCache();
        cache[imageName] = { 
          src: currentLoadingImage, 
          timestamp: cache[imageName]?.timestamp || 0, // Preserve old success timestamp if any
          failed: true, 
          lastAttempt: Date.now() 
        };
        setLoadingImageCache(cache);
        // Optionally, try to load a different image here if the selected one fails
      };
      img.src = currentLoadingImage;
    } else {
      console.log('App Page: No background image to load, marking as ready.');
      setBgImageReady(true); // No image to load
    }

    return () => {
      clearTimeout(minTimeTimer); // Clear the timer if the component unmounts
    };
  }, [currentLoadingImage]); // currentLoadingImage is stable after initial set, so this runs once

  // Effect to fetch polygons AFTER the background image is ready
  useEffect(() => {
    if (bgImageReady && !polygonsDataLoaded) { // Only fetch if bg image is ready and polygons not yet loaded
      console.log('IsometricViewer: Background image ready, now fetching polygons...');
      fetch('/api/get-polygons')
        .then(response => {
          console.log(`IsometricViewer: API response status: ${response.status} ${response.statusText}`);
          return response.json();
        })
        .then(async data => {
          console.log(`IsometricViewer: API data received, polygons property exists: ${!!data.polygons}`);
          if (data.polygons) {
            console.log(`IsometricViewer: Setting ${data.polygons.length} polygons to state`);
            setPolygons(data.polygons);
            
            // Précharger les images des terres immédiatement après avoir reçu les polygones
            console.log('IsometricViewer: Preloading land images...');
            try {
              await landService.preloadLandImages(data.polygons);
              console.log('IsometricViewer: Land images preloaded successfully');
            } catch (error) {
              console.error('IsometricViewer: Error preloading land images:', error);
            }
            
            if (typeof window !== 'undefined') {
              console.log(`IsometricViewer: Setting window.__polygonData with ${data.polygons.length} polygons`);
              (window as any).__polygonData = data.polygons;
              
              try {
                const { transportService } = require('@/lib/services/TransportService');
                console.log('IsometricViewer: Directly initializing transport service with polygon data');
                const success = transportService.initializeWithPolygonData(data.polygons);
                console.log(`IsometricViewer: Direct transport service initialization ${success ? 'succeeded' : 'failed'}`);
                if (!success) {
                  console.log('IsometricViewer: Trying setPolygonsData as fallback');
                  const fallbackSuccess = transportService.setPolygonsData(data.polygons);
                  console.log(`IsometricViewer: Fallback initialization ${fallbackSuccess ? 'succeeded' : 'failed'}`);
                }
              } catch (error) {
                console.error('IsometricViewer: Error initializing transport service:', error);
              }
            } else {
              console.warn('IsometricViewer: window is not defined, running in non-browser environment');
            }
          } else {
            console.error('IsometricViewer: No polygons found in API response');
          }
          setPolygonsDataLoaded(true);
        })
        .catch(error => {
          console.error('IsometricViewer: Error loading polygons:', error);
          setPolygonsDataLoaded(true); // Mark as attempt complete even on error
        });
    }
  }, [bgImageReady, polygonsDataLoaded]); // Runs when bgImageReady changes or polygonsDataLoaded changes

  // Effect to manage the main loading state based on data, image readiness, and minimum time
  useEffect(() => {
    const allConditionsMet = polygonsDataLoaded && bgImageReady && minLoadingTimeElapsed;
    if (allConditionsMet) {
      if (loading) { // Only set if it's currently true to avoid unnecessary re-renders
        console.log('IsometricViewer: All loading conditions met. Hiding loader.');
        setLoading(false);
      }
    } else {
      if (!loading) { // Only set if it's currently false
        console.log(`IsometricViewer: Waiting for resources. Polygons: ${polygonsDataLoaded}, BG Image: ${bgImageReady}, Min Time: ${minLoadingTimeElapsed}`);
        setLoading(true);
      }
    }
  }, [polygonsDataLoaded, bgImageReady, minLoadingTimeElapsed, loading]);

  // Handle transport mode activation
  useEffect(() => {
    const handleShowTransportRoutes = () => {
      console.log('Activating transport route planning mode');
      
      // Force the active view to be 'transport' first
      if (activeView !== 'transport') {
        console.log('Switching to transport view');
        // Assuming setActiveView is available and correctly updates the view
        setActiveView('transport'); 
      }
      
      // Set a small timeout to ensure view has changed before activating transport mode
      setTimeout(() => {
        setTransportMode(true);
        // Transport start/end points are managed within IsometricViewer or TransportService
        // Reset local path state here
        setTransportPath([]); 
        console.log('Transport mode state set to true in TwoDPage');
      }, 100);
    };
    
    const eventListener = () => handleShowTransportRoutes();
    window.addEventListener('showTransportRoutes', eventListener);
    
    // Add listener for transport route calculated events
    const handleTransportRouteCalculated = (event: CustomEvent) => {
      console.log('TRANSPORT_ROUTE_CALCULATED event received in TwoDPage:', event.detail);
      if (event.detail && event.detail.path) {
        setTransportPath(event.detail.path); // Update local transportPath state
      }
    };
    
    window.addEventListener('TRANSPORT_ROUTE_CALCULATED', handleTransportRouteCalculated as EventListener);
    
    return () => {
      window.removeEventListener('showTransportRoutes', eventListener);
      window.removeEventListener('TRANSPORT_ROUTE_CALCULATED', handleTransportRouteCalculated as EventListener);
    };
  }, [activeView, setActiveView]); // Removed visualizeTransportPath, added setActiveView

    // Fetch land groups data
  const fetchLandGroups = useCallback(async () => {
    try {
      console.log('Fetching land groups data...');
      const response = await fetch('/api/land-groups?includeUnconnected=true&minSize=1');
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.landGroups) {
          console.log(`Loaded ${data.landGroups.length} land groups`);
          
          // Create a mapping of polygon ID to group ID
          const groupMapping: Record<string, string> = {};
          data.landGroups.forEach((group: any) => {
            if (group.lands && Array.isArray(group.lands)) {
              group.lands.forEach((landId: string) => {
                groupMapping[landId] = group.groupId;
              });
            }
          });
          
          // Generate distinct colors for each group
          const colors: Record<string, string> = {};
          data.landGroups.forEach((group: any, index: number) => {
            // Generate a color based on index to ensure distinctness
            const hue = (index * 137.5) % 360; // Golden angle approximation for good distribution
            colors[group.groupId] = `hsl(${hue}, 70%, 65%)`;
          });
          
          setLandGroups(groupMapping);
          setLandGroupColors(colors);
        }
      }
    } catch (error) {
      console.error('Error fetching land groups:', error);
    }
  }, []);

  // Dispatch event when transport mode changes
  useEffect(() => {
    // Dispatch event when transport mode changes
    if (transportMode !== undefined) {
      (window as any).__transportModeActive = transportMode;
      window.dispatchEvent(new CustomEvent('transportModeChanged'));
    }
    
    // Fetch land groups when switching to transport view
    if (activeView === 'transport') {
      fetchLandGroups();
      // fetchWaterPoints(); // Removed: Water points are now passed via fullWaterGraphData prop
    }
  }, [transportMode, activeView, fetchLandGroups]); // Removed fetchWaterPoints from dependencies
  
  // Transport path rendering is now handled directly in the drawing code
  
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
  
  // Add these refs to track image loading state and prevent re-entrancy
  const loadingImagesRef = useRef(false);
  const isRunningCoatOfArmsRef = useRef(false);
  
  // Fetch coat of arms data
  useEffect(() => {
    const fetchCoatOfArms = async () => {
      // Prevent concurrent executions of this effect
      if (isRunningCoatOfArmsRef.current) return;
      isRunningCoatOfArmsRef.current = true;
      
      try {
        if (!loadingCoatOfArms) {
          setLoadingCoatOfArms(true);
        }
        
        const response = await fetch('/api/get-coat-of-arms');
        if (response.ok) {
          const data = await response.json();
          if (data.coatOfArms && typeof data.coatOfArms === 'object') {
            // Store the coat of arms map without triggering a re-render if it's the same
            const newOwnerCoatOfArmsMap = data.coatOfArms;
            // Only update state if the map has actually changed
            if (JSON.stringify(newOwnerCoatOfArmsMap) !== JSON.stringify(ownerCoatOfArmsMap)) {
              setOwnerCoatOfArmsMap(newOwnerCoatOfArmsMap);
            }
            
            // Only proceed with image loading if we're not already doing it
            if (!loadingImagesRef.current) {
              loadingImagesRef.current = true;
              
              // Create a copy of the current images to avoid modifying state directly
              const updatedImages = {...coatOfArmsImageUrls};
              let hasNewImages = false;
              
              // Process each coat of arms entry sequentially to avoid too many parallel requests
              for (const [owner, url] of Object.entries(data.coatOfArms)) {
                // Skip if we already have this image loaded
                if (updatedImages[owner]) {
                  continue;
                }
                
                if (url) {
                  try {
                    // Create an array of URLs to try in order
                    // The URL from the API (/api/get-coat-of-arms) is now the primary and correctly formatted one.
                    // The second URL is a fallback to a default image on the correct domain.
                    const urlsToTry = [
                      url as string, // This will be https://backend.serenissima.ai/public_assets/images/coat-of-arms/OwnerName.png
                      `https://backend.serenissima.ai/public_assets/images/coat-of-arms/default.png` // Corrected path
                    ];
                    
                    let imageLoadedSuccessfully = false;
                    for (const currentUrlToTry of urlsToTry) {
                      if (imageLoadedSuccessfully) break;
                      
                      try {
                        const img = new Image();
                        img.crossOrigin = "anonymous"; // Important for CORS
                        
                        await new Promise<void>((resolve, reject) => {
                          const timeoutId = setTimeout(() => {
                            reject(new Error(`Timeout loading image from ${currentUrlToTry}`));
                          }, 5000); // 5 second timeout
                          
                          img.onload = () => {
                            clearTimeout(timeoutId);
                            const resizedImg = resizeImageToCanvas(img, 100);
                            updatedImages[owner] = resizedImg;
                            hasNewImages = true;
                            imageLoadedSuccessfully = true;
                            resolve();
                          };
                          img.onerror = (err) => { // Add error object to log
                            clearTimeout(timeoutId);
                            console.warn(`Failed to load image from ${currentUrlToTry} for owner ${owner}:`, err);
                            reject(new Error(`Failed to load image from ${currentUrlToTry}`));
                          };
                          img.src = currentUrlToTry;
                        });
                      } catch (error) {
                        // Log error and continue to the next URL (e.g., the default.png)
                        console.warn(`Error processing URL ${currentUrlToTry} for ${owner}:`, error);
                      }
                    }
                    
                    // If all URLs failed (including default.png), create a generative avatar
                    if (!imageLoadedSuccessfully) {
                      console.warn(`All image URLs failed for ${owner} (including default.png), using generated avatar.`);
                      updatedImages[owner] = createDefaultCircularAvatarForCache(owner, 100);
                      hasNewImages = true;
                    }
                  } catch (error) {
                    console.error(`Error processing coat of arms entry for ${owner}:`, error);
                  }
                }
              }
              
              // Only update state if we have new images
              if (hasNewImages) {
                setCoatOfArmsImageUrls(updatedImages);
              }
              
              loadingImagesRef.current = false;
            }
          }
        }
      } catch (error) {
        console.error('Error fetching coat of arms:', error);
      } finally {
        setLoadingCoatOfArms(false);
        isRunningCoatOfArmsRef.current = false;
      }
    };
    
    fetchCoatOfArms();
    
    // Return a cleanup function
    return () => {
      // Cancel any pending image loads if component unmounts
    };
  }, []); // Empty dependency array - only run once on mount
  
  // Les fonctions createCircularImage et createDefaultCircularAvatar sont supprimées
  // car cette logique est maintenant gérée par CoatOfArmsMarkers.tsx avec JSX.
  // La fonction resizeImageToCanvas est conservée car elle est utilisée dans fetchCoatOfArms.
  
  // Helper function to resize an image using canvas
  const resizeImageToCanvas = (img: HTMLImageElement, targetSize: number): HTMLImageElement => {
    // Create a canvas element
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.warn('Could not get canvas context for image resizing');
      return img; // Return original if canvas context not available
    }
    
    // Determine dimensions while maintaining aspect ratio
    let width = targetSize;
    let height = targetSize;
    
    if (img.width > img.height) {
      // Landscape image
      height = (img.height / img.width) * targetSize;
    } else if (img.height > img.width) {
      // Portrait image
      width = (img.width / img.height) * targetSize;
    }
    
    // Set canvas size
    canvas.width = width;
    canvas.height = height;
    
    // Draw the image on the canvas, resized
    ctx.drawImage(img, 0, 0, width, height);
    
    // Create a new image from the canvas
    const resizedImg = new Image();
    resizedImg.src = canvas.toDataURL('image/png');
    
    return resizedImg;
  };
  
  // Fonction pour créer un avatar circulaire par défaut (utilisée dans fetchCoatOfArms)
  // Note: Cette fonction dessine sur un canvas temporaire pour générer une data URL,
  // elle est différente de celle qui dessinait directement sur le canvas principal.
  const createDefaultCircularAvatarForCache = (owner: string, size: number): HTMLImageElement => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size;
    tempCanvas.height = size;
    const tempCtx = tempCanvas.getContext('2d');
    const generatedImg = new Image();

    if (tempCtx) {
      const centerX = size / 2;
      const centerY = size / 2;
      // Logique de dessin similaire à l'ancienne createDefaultCircularAvatar
      const getColorFromString = (str: string): string => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 70%, 60%)`;
      };
      const baseColor = getColorFromString(owner);
      tempCtx.beginPath();
      tempCtx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
      tempCtx.fillStyle = baseColor;
      tempCtx.fill();
      tempCtx.strokeStyle = 'white';
      tempCtx.lineWidth = 2; // Ajustez si nécessaire
      tempCtx.stroke();
      tempCtx.font = `bold ${size * 0.4}px Arial`;
      tempCtx.fillStyle = 'white';
      tempCtx.textAlign = 'center';
      tempCtx.textBaseline = 'middle';
      const initial = owner && owner.length > 0 ? owner.charAt(0).toUpperCase() : '?';
      tempCtx.fillText(initial, centerX, centerY);
      generatedImg.src = tempCanvas.toDataURL('image/png');
    } else {
      // Fallback si le contexte du canvas n'est pas disponible (peu probable)
      // Vous pourriez retourner une image par défaut statique ici si nécessaire
      console.warn("Impossible d'obtenir le contexte du canvas pour l'avatar par défaut.");
    }
    return generatedImg;
  };
  
  // Fetch income data when in land view
  useEffect(() => {
    if (activeView === 'land') {
      fetchIncomeData();
    }
  }, [activeView, fetchIncomeData]);

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

  // Load citizens data
  useEffect(() => {
    const loadCitizens = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const response = await fetch(`${apiUrl}/api/citizens`);
        
        if (response.ok) {
          const data = await response.json();
          if (data && Array.isArray(data)) {
            const citizensMap: Record<string, any> = {};
            data.forEach(citizen => {
              if (citizen.citizen_name) {
                citizensMap[citizen.citizen_name] = citizen;
              }
            });
            
            // Ensure ConsiglioDeiDieci is always present
            if (!citizensMap['ConsiglioDeiDieci']) {
              citizensMap['ConsiglioDeiDieci'] = {
                citizen_name: 'ConsiglioDeiDieci',
                color: '#8B0000', // Dark red
                coat_of_arms_image: null
              }
            }
            
            setCitizens(citizensMap);
          }
        }
      } catch (error) {
        console.warn('Error loading citizens data:', error);
        
        // Create a default ConsiglioDeiDieci citizen as fallback
        const fallbackCitizens = {
          'ConsiglioDeiDieci': {
            citizen_name: 'ConsiglioDeiDieci',
            color: '#8B0000', // Dark red
            coat_of_arms_image: null
          }
        };
        
        setCitizens(fallbackCitizens);
      }
    };
    
    loadCitizens();
  }, []);

  // Load buildings regardless of active view
  useEffect(() => {
    fetchBuildingsData();
  }, [fetchBuildingsData]); // Empty dependency array to run only on mount
  
  // Listen for BUILDING_PLACED event to refresh buildings
  useEffect(() => {
    const handleBuildingPlaced = (eventData: any) => {
      console.log('[IsometricViewer] BUILDING_PLACED event received, re-fetching buildings.', eventData);
      fetchBuildingsData();
    };

    const subscription = eventBus.subscribe(EventTypes.BUILDING_PLACED, handleBuildingPlaced);
    return () => {
      subscription.unsubscribe();
    };
  }, [fetchBuildingsData]);
  
  // Fetch bridge data and merge with buildings
  useEffect(() => {
    if (buildings.length === 0) return;

    // Check if any bridge actually needs an orientation update
    const needsOrientationUpdate = buildings.some(b => 
        b.type && b.type.toLowerCase().includes('bridge') && b.orientation === undefined
    );

    if (!needsOrientationUpdate) {
        // console.log('Bridge orientation data seems up-to-date, skipping fetch.');
        return;
    }

    const fetchBridgeData = async () => {
      try {
        console.log('Fetching bridge orientation data...');
        const response = await fetch('/api/bridges');
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.bridges && Array.isArray(data.bridges)) {
            console.log(`Loaded orientation data for ${data.bridges.length} bridges`);
            
            const bridgeOrientationsMap: Record<string, number> = {};
            data.bridges.forEach((bridge: any) => {
              // Key the map by the Airtable record ID (bridge.id from /api/bridges response)
              if (bridge.id && bridge.orientation !== undefined) {
                bridgeOrientationsMap[bridge.id] = bridge.orientation;
              }
            });
            
            let hasChanges = false;
            const updatedBuildings = buildings.map(building => {
              if (building.type && building.type.toLowerCase().includes('bridge') && building.orientation === undefined) {
                // Lookup using building.id (which should be the Airtable record ID)
                const orientation = bridgeOrientationsMap[building.id];
                
                if (orientation !== undefined) {
                  hasChanges = true;
                  return { ...building, orientation };
                }
              }
              return building;
            });
            
            if (hasChanges) {
              console.log('Updating buildings state with new bridge orientation data.');
              setBuildings(updatedBuildings);
            } else {
              // console.log('No new bridge orientation data to apply.');
            }
          }
        }
      } catch (error) {
        console.error('Error fetching bridge orientation data:', error);
      }
    };
    
    fetchBridgeData();
  }, [buildings]); // Changed dependency to `buildings`
  
  // useCallback for saving bridge orientation
  const saveSelectedBridgeOrientation = useCallback(async () => {
    if (interactionMode === 'orient_bridge' && selectedBridgeForOrientationId && orientingBridgeAngle !== null) {
      const bridgeIdToSave = selectedBridgeForOrientationId;
      const angleToSave = orientingBridgeAngle;

      console.log(`[BRIDGE_ORIENT_DEBUG] saveSelectedBridgeOrientation: Attempting to save for bridge ${bridgeIdToSave}, angle: ${angleToSave} radians.`);

      try {
        console.log(`[BRIDGE_ORIENT_DEBUG] API Call: PATCH /api/bridges/${bridgeIdToSave}/orient with body:`, JSON.stringify({ orientation: angleToSave }));
        const response = await fetch(`/api/bridges/${bridgeIdToSave}/orient`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orientation: angleToSave }),
        });

        console.log(`[BRIDGE_ORIENT_DEBUG] API Response Status: ${response.status}`);
        const responseBodyText = await response.text(); // Read body as text first
        console.log(`[BRIDGE_ORIENT_DEBUG] API Response Body: ${responseBodyText}`);

        if (!response.ok) {
          let errorData;
          try {
            errorData = JSON.parse(responseBodyText);
          } catch (e) {
            errorData = { error: `API Error: ${response.status}, Body: ${responseBodyText}` };
          }
          console.error('[BRIDGE_ORIENT_DEBUG] API Error Data:', errorData);
          throw new Error(errorData.error || `API Error: ${response.status}`);
        }

        const data = JSON.parse(responseBodyText); // Parse text to JSON
        if (data.success) {
          console.log('[BRIDGE_ORIENT_DEBUG] Bridge orientation saved successfully via API:', data.bridge);
          setBuildings(prevBuildings => {
            const newBuildings = prevBuildings.map(b =>
              b.id === bridgeIdToSave ? { ...b, orientation: angleToSave, rotation: angleToSave } : b
            );
            console.log(`[BRIDGE_ORIENT_DEBUG] Updated local buildings state for ${bridgeIdToSave}. New orientation: ${angleToSave}.`);
            // Log the specific bridge object after update
            const updatedBridge = newBuildings.find(b => b.id === bridgeIdToSave);
            console.log('[BRIDGE_ORIENT_DEBUG] Bridge object after local update:', updatedBridge);
            return newBuildings;
          });
          // Optionally, show a success notification
        } else {
          console.error('[BRIDGE_ORIENT_DEBUG] API reported failure to save bridge orientation:', data.error);
          // Optionally, show an error notification
        }
      } catch (error) {
        console.error('[BRIDGE_ORIENT_DEBUG] Error in saveSelectedBridgeOrientation catch block:', error);
        // Optionally, show an error notification
      }
      // Do not reset selectedBridgeForOrientationId or orientingBridgeAngle here,
      // let 'Enter' or 'Escape' key handlers do that.
    } else {
      console.log(`[BRIDGE_ORIENT_DEBUG] saveSelectedBridgeOrientation: Conditions not met. Mode: ${interactionMode}, SelectedBridge: ${selectedBridgeForOrientationId}, Angle: ${orientingBridgeAngle}`);
    }
  }, [interactionMode, selectedBridgeForOrientationId, orientingBridgeAngle, buildings, setBuildings]);

  // Handle mouse up for bridge orientation saving
  useEffect(() => {
    const handleMouseUpGlobal = async () => {
      // Check if interactionService indicates a drag just ended.
      // This is a conceptual check; actual implementation depends on how InteractionService signals this.
      // For now, we assume if mode is correct and a bridge is selected with an angle, mouse up implies finalization of a mouse drag.
      if (interactionMode === 'orient_bridge' && selectedBridgeForOrientationId && orientingBridgeAngle !== null) {
        // We might want to check a flag from interactionService if a mouse drag was *actually* happening.
        // For now, let's assume mouse up after a click-select and potential drag should save.
        // The InteractionService itself handles the mousemove part of dragging.
        // This global mouseup is to catch the end of that drag.
        console.log(`IsometricViewer: MouseUp detected during bridge orientation.`);
        // await saveSelectedBridgeOrientation(); // Potentially save on mouse-up if that's desired UX for mouse users.
                                             // Or, rely solely on Enter key for saving.
                                             // For now, let's not save on mouse-up to give keyboard a chance.
                                             // The InteractionService should stop updating the angle on its mouseup.
      }
    };

    window.addEventListener('mouseup', handleMouseUpGlobal);
    return () => {
      window.removeEventListener('mouseup', handleMouseUpGlobal);
    };
  }, [interactionMode, selectedBridgeForOrientationId, orientingBridgeAngle, saveSelectedBridgeOrientation]);

  // Effect for handling keyboard controls for bridge orientation
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (interactionMode === 'orient_bridge' && selectedBridgeForOrientationId) {
        let angleChanged = false;
        // Ensure orientingBridgeAngle is not null; default to 0 or current building orientation if null
        const currentBuilding = buildings.find(b => b.id === selectedBridgeForOrientationId);
        let newAngle = orientingBridgeAngle !== null 
          ? orientingBridgeAngle 
          : (currentBuilding?.orientation !== undefined ? currentBuilding.orientation : 0);
        console.log(`[BRIDGE_ORIENT_DEBUG] KeyDown: Initial angle for ${selectedBridgeForOrientationId}: ${newAngle} (orientingBridgeAngle: ${orientingBridgeAngle}, currentBuilding.orientation: ${currentBuilding?.orientation})`);

        const increment = Math.PI / 90; // 2 degrees increment

        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          newAngle -= increment;
          angleChanged = true;
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          newAngle += increment;
          angleChanged = true;
        }

        if (angleChanged) {
          // Normalize angle to be between 0 and 2*PI
          newAngle = (newAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
          console.log(`[BRIDGE_ORIENT_DEBUG] KeyDown: Angle changed. New angle: ${newAngle}. Calling setOrientingBridgeAngle.`);
          setOrientingBridgeAngle(newAngle);
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          console.log(`[BRIDGE_ORIENT_DEBUG] KeyDown: Enter pressed. Current orientingBridgeAngle: ${orientingBridgeAngle}`);
          if (orientingBridgeAngle !== null) { // Only save if an angle has been set/changed
            await saveSelectedBridgeOrientation();
          }
          // Optionally, deselect the bridge after saving
          // setSelectedBridgeForOrientationId(null);
          // setOrientingBridgeAngle(null);
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          // Cancel orientation for the current bridge
          setSelectedBridgeForOrientationId(null);
          setOrientingBridgeAngle(null);
          // Optionally, switch back to normal interaction mode
          // setInteractionMode('normal');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [interactionMode, selectedBridgeForOrientationId, orientingBridgeAngle, saveSelectedBridgeOrientation, buildings]);

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
        
        // Store the calculated position in the cache, keyed by BuildingId if available, else by id
        const key = building.BuildingId || building.id;
        cache[key] = { x, y };
        return cache;
      }, {});
      
      setBuildingPositionsCache(newPositionsCache);
      setInitialPositionCalculated(true);
      console.log(`Pre-calculated positions for ${Object.keys(newPositionsCache).length} buildings`);
    }
  }, [buildings, initialPositionCalculated]);

  // Effect to update isNight state based on Venice time
  useEffect(() => {
    const updateNightState = () => {
      const { hour: currentHour, month: currentMonth } = getVeniceDateTimeParts(); // Get both hour and month

      // Approximate night hours (local time) for Venice per month [NightEndHour, NightStartHour]
      // Night if currentHour < NightEndHour OR currentHour >= NightStartHour
      // Index 0 = January, 11 = December
      const monthlyNightHours: [number, number][] = [
        [8, 17], // Jan: Nuit si < 8h ou >= 17h
        [7, 18], // Feb: Nuit si < 7h ou >= 18h
        [7, 19], // Mar: Nuit si < 7h ou >= 19h (DST commence fin mars)
        [6, 20], // Apr: Nuit si < 6h ou >= 20h
        [6, 21], // May: Nuit si < 6h ou >= 21h
        [5, 21], // Jun: Nuit si < 5h ou >= 21h
        [6, 21], // Jul: Nuit si < 6h ou >= 21h
        [6, 20], // Aug: Nuit si < 6h ou >= 20h
        [7, 19], // Sep: Nuit si < 7h ou >= 19h
        [8, 18], // Oct: Nuit si < 8h ou >= 18h (DST finit fin octobre)
        [7, 17], // Nov: Nuit si < 7h ou >= 17h
        [8, 17]  // Dec: Nuit si < 8h ou >= 17h
      ];

      const [nightEndHour, nightStartHour] = monthlyNightHours[currentMonth];
      const nightTime = currentHour < nightEndHour || currentHour >= nightStartHour;
      
      if (nightTime !== isNight) {
        setIsNight(nightTime);
        console.log(`Venice time update: Month ${currentMonth + 1}, Hour ${currentHour}. It is now ${nightTime ? 'night' : 'day'}. (Night ends <${nightEndHour}, starts >=${nightStartHour})`);
      }
    };

    // Store current scale in window for other components to access
    if (typeof window !== 'undefined') {
      window.currentScale = scale;
    }

    updateNightState(); // Initial check
    const intervalId = setInterval(updateNightState, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(intervalId);
  }, [isNight, scale]); // Re-run if isNight or scale changes
  
  // Land images are now handled by LandService and LandMarkers component
  
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
          // Key by BuildingId if available, else by id
          const key = building.BuildingId || building.id;
          newPositionsCache[key] = { x, y };
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
  }, [activeView, loadCitizens]);
  
  // Check image paths when citizens are loaded
  const checkImagePaths = async () => {
    console.log('Checking image paths...');
    
    // Check if the citizens directory exists
    try {
      const response = await fetch('https://backend.serenissima.ai/public_assets/images/citizens/default.jpg', { method: 'HEAD' });
      console.log(`Default image check: ${response.ok ? 'EXISTS' : 'NOT FOUND'} (${response.status})`);
    } catch (error) {
      console.error('Error checking default image:', error);
    }
    
    // Check a few citizen images
    if (citizensList.length > 0) {
      for (let i = 0; i < Math.min(5, citizensList.length); i++) {
        const citizen = citizensList[i];
        // Skip citizens without valid IDs
        if (!citizen || !citizen.citizenid) {
          console.warn('Skipping citizen without valid ID:', citizen);
          continue;
        }
        
        const citizenId = citizen.citizenid;
        const imageUrl = citizen.imageurl || `https://backend.serenissima.ai/public_assets/images/citizens/${citizenId}.jpg`;
        
        // Try multiple possible paths for each citizen
        const urlsToTry = [
          imageUrl,
          `https://backend.serenissima.ai/public_assets/images/citizens/${citizenId}.jpg`,
          `https://backend.serenissima.ai/public_assets/images/citizens/${citizenId}.png`,
          `https://backend.serenissima.ai/public_assets/images/citizens/default.jpg`
        ];
        
        for (const url of urlsToTry) {
          try {
            const response = await fetch(url, { method: 'HEAD' });
            console.log(`Citizen ${citizenId} image check: ${url} - ${response.ok ? 'EXISTS' : 'NOT FOUND'} (${response.status})`);
            if (response.ok) break; // Stop checking if we found a working URL
          } catch (error) {
            console.error(`Error checking image for citizen ${citizenId} at ${url}:`, error);
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
  }, [activeView, citizensLoaded, citizensList]);
  
  
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
      // Use a debounced function to prevent too frequent updates
      const calculateEmptyPoints = debounce(() => {
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
        
        // Use a deep comparison to avoid unnecessary state updates
        if (JSON.stringify(emptyPoints) !== JSON.stringify(emptyBuildingPoints)) {
          setEmptyBuildingPoints(emptyPoints);
        }
      }, 500); // Debounce for 500ms
      
      calculateEmptyPoints();
      
      return () => {
        calculateEmptyPoints.cancel(); // Cancel any pending debounced calls
      };
    } else {
      setEmptyBuildingPoints([]);
    }
  }, [polygons, buildings]); // Removed activeView dependency so it runs in all views

  // Handle mouse wheel for zooming
  useEffect(() => {
    const currentWrapper = wrapperRef.current; // Use the wrapper ref

    // Create a throttled version of the zoom handler
    const handleWheel = throttle((e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * -0.01;
      // Change the minimum zoom to 1.0 to allow one more level of unzoom
      // Keep the maximum zoom at 10.8
      setScale(prevScale => {
        const newScale = Math.max(1.0, Math.min(10.8, prevScale + delta));
        
        // Only trigger a redraw if the scale changed significantly
        if (Math.abs(newScale - prevScale) > 0.05) {
          // Force a redraw with the new scale
          requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent('scaleChanged', { 
              detail: { scale: newScale } 
            }));
          });
        
          // Update ambient audio manager with new zoom level
          // Map scale (1.0 to 10.8) to zoomPercent (0 to 100)
          const minScale = 1.0;
          const maxScale = 10.8;
          const zoomPercent = ((newScale - minScale) / (maxScale - minScale)) * 100;
          ambientAudioManager.updateZoom(Math.max(0, Math.min(100, zoomPercent)));
        }
      
        return newScale;
      });
    }, 50); // Throttle to 50ms (20 updates per second max)
    
    if (currentWrapper) { // Attach listener to the wrapper div
      currentWrapper.addEventListener('wheel', handleWheel);
    }
    
    return () => {
      if (currentWrapper) { // Clean up listener from the wrapper div
        currentWrapper.removeEventListener('wheel', handleWheel);
      }
      // Clean up the throttled function
      handleWheel.cancel();
    };
  }, []); // Empty dependency array, runs once

  // Handle mouse events for panning
  useEffect(() => {
    const currentWrapper = wrapperRef.current; // Use wrapperRef
    if (!currentWrapper) return;
    
    const handleMouseDown_ViewerPanning = (e: MouseEvent) => {
      // If in orient_bridge mode, do not initiate map panning.
      // The InteractionService's mousedown (on canvas) will handle bridge selection and set its own state.
      if (interactionMode === 'orient_bridge') {
        return;
      }

      // Prevent starting a pan if the click is on a UI element that should capture clicks,
      // like buttons within the wrapper but outside the canvas.
      // For ThoughtBubble, it has data-ui-panel="true". If we want panning to work *over* it,
      // we should not check for data-ui-panel here.
      // If specific UI elements within wrapperRef need to prevent panning, they should stopPropagation.
      // const targetElement = e.target as HTMLElement;
      // if (targetElement.closest('[data-ui-panel="true"], button, select, input')) {
      //   return;
      // }

      setIsDragging(true);
      isDraggingRef.current = true; 
      setDragStart({ x: e.clientX, y: e.clientY });
    };
    
    const handleMouseMove_ViewerPanning = (e: MouseEvent) => { 
      if (!isDraggingRef.current) return; 
      
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setDragStart({ x: e.clientX, y: e.clientY });
    };
    
    const handleMouseUp_ViewerPanning = () => { 
      if (isDraggingRef.current) {
        setIsDragging(false);
        isDraggingRef.current = false; 
      }
    };
    
    currentWrapper.addEventListener('mousedown', handleMouseDown_ViewerPanning); // Attach to wrapper
    window.addEventListener('mousemove', handleMouseMove_ViewerPanning);
    window.addEventListener('mouseup', handleMouseUp_ViewerPanning);
    
    return () => {
      currentWrapper.removeEventListener('mousedown', handleMouseDown_ViewerPanning); // Clean up from wrapper
      window.removeEventListener('mousemove', handleMouseMove_ViewerPanning);
      window.removeEventListener('mouseup', handleMouseUp_ViewerPanning);
    };
  }, [dragStart, interactionMode]); // Added interactionMode to dependencies

  // Emit map transformation events for other components to sync with
  useEffect(() => {
    // Create a function to emit the current map transformation state
    const emitMapTransform = () => {
      window.dispatchEvent(new CustomEvent('mapTransformed', {
        detail: {
          offset,
          scale,
          rotation: 0, // Add rotation if implemented
          tilt: 0 // Add tilt if implemented
        }
      }));
    };
    
    // Emit on any transformation change
    emitMapTransform();
    
    // Also listen for requests for the current transformation
    const handleRequestTransform = () => {
      emitMapTransform();
    };
    
    window.addEventListener('requestMapTransform', handleRequestTransform);
    
    return () => {
      window.removeEventListener('requestMapTransform', handleRequestTransform);
    };
  }, [offset, scale]);

  // Get color based on income using a gradient with softer, Renaissance-appropriate colors
  // Income is normalized by building points count for better comparison
  const getIncomeColor = useCallback((income: number | undefined): string => {
    if (income === undefined) return '#E8DCC0'; // Softer parchment color for no data
    
    // Normalize income to a 0-1 scale
    const normalizedIncome = Math.min(Math.max((income - minIncome) / (maxIncome - minIncome), 0), 1);
    
    // Create a gradient from soft blue (low) to muted gold (medium) to terracotta red (high)
    // These colors are more appropriate for Renaissance Venice
    if (normalizedIncome <= 0.5) {
      // Soft blue to muted gold (0-0.5)
      const t = normalizedIncome * 2; // Scale 0-0.5 to 0-1
      const r = Math.floor(102 + t * (204 - 102)); // 102 to 204
      const g = Math.floor(153 + t * (178 - 153)); // 153 to 178
      const b = Math.floor(204 - t * (204 - 102)); // 204 to 102
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Muted gold to terracotta red (0.5-1)
      const t = (normalizedIncome - 0.5) * 2; // Scale 0.5-1 to 0-1
      const r = Math.floor(204 + t * (165 - 204)); // 204 to 165
      const g = Math.floor(178 - t * (178 - 74)); // 178 to 74
      const b = Math.floor(102 - t * (102 - 42)); // 102 to 42
      return `rgb(${r}, ${g}, ${b})`;
    }
  }, [minIncome, maxIncome]);
  
  // Use the InteractionService to handle mouse interactions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Initialize interaction handlers with the canvas
    const cleanup = interactionService.initializeInteractions(
      canvas,
      activeView,
      scale,
      offset,
      transportMode,
      {
        polygonsToRender,
        buildings,
        emptyBuildingPoints,
        polygons,
        citizensByBuilding,
        transportStartPoint,
        transportEndPoint,
        waterPoints: fullWaterGraphData?.waterPoints || [], // Use prop for water points
        waterPointMode: interactionMode === 'place_water_point',
        waterRouteMode: interactionMode === 'create_water_route',
        waterRouteStartPoint,
        waterRouteIntermediatePoints,
        orientBridgeModeActive: interactionMode === 'orient_bridge', // Pass derived boolean
        selectedBridgeForOrientationId, // Pass this state
      },
      {
        setMousePosition,
        setSelectedPolygonId,
        setShowLandDetailsPanel,
        setSelectedBuildingId: (buildingId: string | null) => setSelectedBuildingId(buildingId), // Ensure this receives BuildingId
        setShowBuildingDetailsPanel,
        setTransportStartPoint,
        setTransportEndPoint,
        setTransportPath,
        setSelectedCitizen: (citizen) => {
          // Use the CitizenRenderService to sanitize the citizen object
          if (citizen) {
            const safeCitizen = CitizenRenderService.sanitizeCitizen(citizen);
            setSelectedCitizen(safeCitizen);
          } else {
            setSelectedCitizen(null);
          }
        },
        // setHoveredCitizen is removed as it's not an expected property
        // The interactionService might handle citizen hover internally
        // or it's managed by hoverStateService directly elsewhere.
        setShowCitizenDetailsPanel,
        calculateTransportRoute,
        findBuildingPosition,
        findPolygonIdForPoint,
        screenToLatLng,
        saveWaterPoint,
        handleWaterRouteClick,
        // Add bridge orientation callbacks (setOrientBridgeModeActive is removed as mode is controlled by dropdown)
        setSelectedBridgeForOrientationId: (bridgeId) => {
          console.log(`[BRIDGE_ORIENT_DEBUG] setSelectedBridgeForOrientationId called with: ${bridgeId}`);
          setSelectedBridgeForOrientationId(bridgeId);
        },
        setOrientingBridgeAngle: (angle) => {
          console.log(`[BRIDGE_ORIENT_DEBUG] setOrientingBridgeAngle called with: ${angle}`);
          setOrientingBridgeAngle(angle);
        },
        onEmptyBuildingPointSelected: (point, polygonId) => {
          console.log('Empty building point selected:', point, polygonId);
          let finalPolygonId = polygonId;
          if (polygonId === 'unknown' || !polygonId) {
            console.warn(`[IsometricViewer] Empty building point selected with unknown polygonId. Attempting to find it.`);
            finalPolygonId = findPolygonIdForPoint(point);
            console.log(`[IsometricViewer] findPolygonIdForPoint returned: ${finalPolygonId}`);
          }
          setSelectedPointForCreation({ ...point, polygonId: finalPolygonId, pointType: 'land' });
          setShowBuildingCreationPanel(true);
        },
        onCanalPointSelected: (point, polygonId) => {
          console.log('Canal point selected:', point, polygonId);
          let finalPolygonId = polygonId;
          if (polygonId === 'unknown' || !polygonId) {
            console.warn(`[IsometricViewer] Canal point selected with unknown polygonId. Attempting to find it.`);
            finalPolygonId = findPolygonIdForPoint(point);
            console.log(`[IsometricViewer] findPolygonIdForPoint returned: ${finalPolygonId}`);
          }
          setSelectedPointForCreation({ ...point, polygonId: finalPolygonId, pointType: 'canal' });
          setShowBuildingCreationPanel(true);
        },
        onBridgePointSelected: (point, polygonId) => {
          console.log('Bridge point selected:', point, polygonId);
          let finalPolygonId = polygonId;
          if (polygonId === 'unknown' || !polygonId) {
            console.warn(`[IsometricViewer] Bridge point selected with unknown polygonId. Attempting to find it.`);
            finalPolygonId = findPolygonIdForPoint(point);
            console.log(`[IsometricViewer] findPolygonIdForPoint returned: ${finalPolygonId}`);
          }
          setSelectedPointForCreation({ ...point, polygonId: finalPolygonId, pointType: 'bridge' });
          setShowBuildingCreationPanel(true);
        }
      }
    );
    
    // Return the cleanup function
    return cleanup;
  }, [
    activeView, 
    scale, 
    offset, 
    transportMode, 
    interactionMode, // Added interactionMode
    waterRouteStartPoint,
    waterRouteIntermediatePoints,
    polygonsToRender, 
    buildings, 
    emptyBuildingPoints, 
    polygons, 
    citizensByBuilding,
    transportStartPoint,
    transportEndPoint,
    fullWaterGraphData, 
    handleWaterRouteClick,
    selectedBridgeForOrientationId // Add to dependency array
  ]);

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
  
  // Function to toggle pathfinding mode
  const togglePathfindingMode = () => {
    const newMode = pathfindingMode === 'all' ? 'real' : 'all';
    setPathfindingMode(newMode);
    
    // Update the transport service
    const { transportService } = require('@/lib/services/TransportService');
    transportService.setPathfindingMode(newMode);
    
    // If there's an active route, recalculate it
    if (transportStartPoint && transportEndPoint) {
      calculateTransportRoute(transportStartPoint, transportEndPoint, newMode);
    }
  };

  // Function to calculate the transport route
  const calculateTransportRoute = async (start: {lat: number, lng: number}, end: {lat: number, lng: number}, mode?: 'all' | 'real') => {
    try {
      // Set calculating state to true to show loading indicator
      setCalculatingPath(true);

      // Immersive loading messages
      const loadingTitles = [
        "Consulting Ancient Maps...",
        "Charting Venetian Routes...",
        "Navigating Secret Canals...",
        "Seeking Gondoliers' Counsel...",
        "Deciphering Lagoon Mysteries..."
      ];
      const loadingSubtitles = [
        "One moment, please, as the cartographer sketches the way...",
        "The lagoon's currents are complex, but we shall find the path...",
        "Every bridge and waterway is being surveyed for the optimal journey...",
        "La Serenissima unveils its hidden passages...",
        "Patience, citizen, we are rowing as swiftly as oars allow!"
      ];
      loadingTitleRef.current = loadingTitles[Math.floor(Math.random() * loadingTitles.length)];
      loadingSubtitleRef.current = loadingSubtitles[Math.floor(Math.random() * loadingSubtitles.length)];

      console.log('Calculating transport route from', start, 'to', end);
      
      // First, check if we have polygon data available in state
      if (polygons.length > 0) {
        console.log(`We have ${polygons.length} polygons in state, ensuring transport service is initialized`);
        
        // Try to initialize the transport service directly with our polygon data
        try {
          const { transportService } = require('@/lib/services/TransportService');
          
          // Check if the service is already initialized
          if (!transportService.isPolygonsLoaded()) {
            console.log('Transport service not initialized, initializing with polygon data from state');
            const success = transportService.initializeWithPolygonData(polygons);
            console.log(`Direct transport service initialization ${success ? 'succeeded' : 'failed'}`);
          } else {
            console.log('Transport service is already initialized');
          }
        } catch (error) {
          console.error('Error initializing transport service:', error);
        }
      }
      
      // Add this code to render a loading animation on the canvas
      const renderLoadingAnimation = () => {
        if (!canvasRef.current || !calculatingPath) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Draw a semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw a Venetian-styled loading message
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        // Draw ornate frame
        ctx.fillStyle = 'rgba(30, 30, 50, 0.85)';
        ctx.fillRect(centerX - 200, centerY - 100, 400, 200);
        
        // Gold border
        ctx.strokeStyle = 'rgba(218, 165, 32, 0.9)';
        ctx.lineWidth = 4;
        ctx.strokeRect(centerX - 200, centerY - 100, 400, 200);
        
        // Inner border
        ctx.strokeStyle = 'rgba(218, 165, 32, 0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(centerX - 190, centerY - 90, 380, 180);
        
        // Title
        ctx.font = '24px "Times New Roman", serif';
        ctx.fillStyle = 'rgba(218, 165, 32, 0.9)';
        ctx.textAlign = 'center';
        ctx.fillText(loadingTitleRef.current || 'Calculating Route...', centerX, centerY - 50);
        
        // Subtitle
        ctx.font = '16px "Times New Roman", serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(loadingSubtitleRef.current || 'Finding the best path through the canals...', centerX, centerY - 10);
        
        // Animated dots
        const dots = Math.floor((Date.now() / 500) % 4);
        let dotsText = '';
        for (let i = 0; i < dots; i++) dotsText += '.';
        ctx.fillText(dotsText, centerX, centerY + 30);
        
        // Draw gondola icon
        const gondolaSize = 40;
        const gondolaX = centerX;
        const gondolaY = centerY + 60;
        
        // Animate gondola position
        const oscillation = Math.sin(Date.now() / 300) * 5;
        
        // Draw gondola silhouette
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(
          gondolaX + oscillation, 
          gondolaY, 
          gondolaSize, 
          gondolaSize/4, 
          0, 0, Math.PI * 2
        );
        ctx.fill();
        
        // Draw gondolier
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(
          gondolaX + oscillation + gondolaSize/3, 
          gondolaY - gondolaSize/8, 
          gondolaSize/6, 
          0, Math.PI * 2
        );
        ctx.fill();
        
        // Request next animation frame if still calculating
        if (calculatingPath) {
          requestAnimationFrame(renderLoadingAnimation);
        }
      };
      
      // Start the loading animation
      renderLoadingAnimation();
      
      const response = await fetch('/api/transport', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startPoint: start,
          endPoint: end,
          pathfindingMode: mode || pathfindingMode
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Transport route calculated:', data);
        
        if (data.success && data.path) {
          setTransportPath(data.path);
          // Set water-only mode if the API indicates it's a water-only route
          setWaterOnlyMode(!!data.waterOnly);
        } else {
          console.error('Failed to calculate route:', data.error);
          
          // If the error is about points not being within polygons, try to use water-only pathfinding
          if (data.error === 'Start or end point is not within any polygon') {
            console.log('Points not within polygons, attempting water-only pathfinding');
            
            // Show a message to the citizen
            alert('Points are not on land. Attempting to find a water route...');
            
            // Make a direct request to the water-only pathfinding endpoint
            const waterResponse = await fetch('/api/transport/water-only', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                startPoint: start,
                endPoint: end,
                pathfindingMode: mode || 'real'
              }),
            });
            
            if (waterResponse.ok) {
              const waterData = await waterResponse.json();
              
              if (waterData.success && waterData.path) {
                setTransportPath(waterData.path);
                setWaterOnlyMode(true);
                return;
              }
            }
          }
          
          // If we get here, both regular and water-only pathfinding failed
          alert(`Could not find a route: ${data.error || 'Unknown error'}`);
          // Reset end point to allow trying again
          setTransportEndPoint(null);
        }
      } else {
        console.error('API error:', response.status);
        alert('Error calculating route. Please try again.');
        setTransportEndPoint(null);
      }
    } catch (error) {
      console.error('Error calculating transport route:', error);
      alert('Error calculating route. Please try again.');
      setTransportEndPoint(null);
    } finally {
      // Set calculating state to false to hide loading indicator
      setCalculatingPath(false);
    }
  };
  
  // Function to find building position
  const findBuildingPosition = useCallback((targetBuildingId: string): {x: number, y: number} | null => {
    // First check if any building in the buildings array matches by BuildingId
    // Assuming building objects have a 'BuildingId' field and 'id' might be the Airtable record ID.
    const building = buildings.find(b => b.BuildingId === targetBuildingId || b.id === targetBuildingId); // Check both for flexibility
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
        x: calculateIsoX(x, y, scale, offset, canvasDims.width),
        y: calculateIsoY(x, y, scale, offset, canvasDims.height)
      };
    }
    
    // If not found in buildings, check building points in polygons
    for (const polygon of polygons) {
      if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
        const buildingPoint = polygon.buildingPoints.find((bp: any) => 
          bp.BuildingId === targetBuildingId || 
          bp.buildingId === targetBuildingId || 
          bp.id === targetBuildingId
        );
        
        if (buildingPoint) {
          // Convert lat/lng to isometric coordinates
          const x = (buildingPoint.lng - 12.3326) * 20000;
          const y = (buildingPoint.lat - 45.4371) * 20000;
          
          return {
            x: calculateIsoX(x, y, scale, offset, canvasDims.width),
            y: calculateIsoY(x, y, scale, offset, canvasDims.height)
          };
        }
      }
    }
    
    return null;
  }, [buildings, polygons, scale, offset, canvasDims.width, canvasDims.height]); // Added dependencies
  
  // Function to create a citizen marker
  const createCitizenMarker = (
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    citizen: any,
    size: number = 20
  ) => {
    // Use the service to create the marker
    CitizenRenderService.createCitizenMarker(ctx, x, y, citizen, size);
  };

  // Define isometric projection functions at the component level
  // These now take currentCanvasWidth and currentCanvasHeight to be explicit
  const calculateIsoX = (x: number, y: number, currentScale: number, currentOffset: {x: number, y: number}, currentCanvasWidth: number) => {
    return x * currentScale + currentCanvasWidth / 2 + currentOffset.x; // Correct east-west orientation
  };
  
  const calculateIsoY = (x: number, y: number, currentScale: number, currentOffset: {x: number, y: number}, currentCanvasHeight: number) => {
    return (-y) * currentScale * 1.4 + currentCanvasHeight / 2 + currentOffset.y; // Multiply by 1.4 to stretch vertically
  };

// Helper function to darken a color string (hex, rgb, rgba, hsl, hsla)
const darkenColor = (colorStr: string, percent: number): string => {
  let r = 0, g = 0, b = 0, h = 0, s = 0, l = 0, a = 1;
  const p = Math.max(0, Math.min(1, 1 - percent)); // Ensure p is between 0 and 1

  if (colorStr.startsWith('#')) {
    const hex = colorStr.replace('#', '');
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    } else { return colorStr; }

    r = Math.round(r * p);
    g = Math.round(g * p);
    b = Math.round(b * p);

    return `#${(r < 0 ? 0 : r > 255 ? 255 : r).toString(16).padStart(2, '0')}${(g < 0 ? 0 : g > 255 ? 255 : g).toString(16).padStart(2, '0')}${(b < 0 ? 0 : b > 255 ? 255 : b).toString(16).padStart(2, '0')}`;
  } else if (colorStr.startsWith('rgb')) {
    const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return colorStr;
    r = parseInt(match[1]);
    g = parseInt(match[2]);
    b = parseInt(match[3]);
    a = match[4] !== undefined ? parseFloat(match[4]) : 1;

    r = Math.round(r * p);
    g = Math.round(g * p);
    b = Math.round(b * p);
    
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));

    return `rgba(${r}, ${g}, ${b}, ${a})`;
  } else if (colorStr.startsWith('hsl')) {
    const match = colorStr.match(/hsla?\((\d+),\s*([\d.]+)%,\s*([\d.]+)%(?:,\s*([\d.]+))?\)/);
    if (!match) return colorStr;
    h = parseInt(match[1]);
    s = parseFloat(match[2]);
    l = parseFloat(match[3]);
    a = match[4] !== undefined ? parseFloat(match[4]) : 1;

    l = Math.max(0, Math.min(100, l * p));

    return `hsla(${h}, ${s}%, ${l}%, ${a})`;
  }
  return colorStr;
};

  // Helper function to convert lat/lng to screen coordinates, now uses canvasDims state
  const latLngToScreen = useCallback((lat: number, lng: number) => {
    const world = {
      x: (lng - 12.3326) * 20000,
      y: (lat - 45.4371) * 20000
    };
    // Use CoordinateService.worldToScreen which should internally use calculateIsoX/Y or similar logic
    // Pass canvasDims from state to ensure consistency
    return {
      x: CoordinateService.worldToScreen(world.x, world.y, scale, offset, canvasDims.width, canvasDims.height).x,
      y: CoordinateService.worldToScreen(world.x, world.y, scale, offset, canvasDims.width, canvasDims.height).y
    };
  }, [scale, offset, canvasDims.width, canvasDims.height]);

  // Create a memoized function to calculate polygonsToRender
  const calculatePolygonsToRender = useCallback(() => {
    return polygons.map(polygon => {
      if (!polygon.coordinates || polygon.coordinates.length < 3) return null;
    
      // Get polygon owner color or income-based color or land group color
      let fillColor = '#FFF5D0'; // Default sand color
      
      // Check if this polygon has a public dock
      const hasPublicDock = polygon.canalPoints && Array.isArray(polygon.canalPoints) && 
        polygon.canalPoints.some(point => {
          if (!point.edge) return false;
          const pointId = point.id || `canal-${point.edge.lat}-${point.edge.lng}`;
          return pointId.includes('public_dock') || pointId.includes('dock-constructed');
        });
      
      if (activeView === 'land') {
        if (incomeDataLoaded && polygon.id && incomeData[polygon.id] !== undefined) {
          fillColor = getIncomeColor(incomeData[polygon.id]);
        } else if (polygon.id && landOwners[polygon.id]) {
          const owner = landOwners[polygon.id];
          const citizen = citizens[owner];
          if (citizen && citizen.color) {
            fillColor = citizen.color;
          }
        }
      } else if (activeView === 'transport' && polygon.id && landGroups[polygon.id]) {
        const groupId = landGroups[polygon.id];
        if (landGroupColors[groupId]) {
          fillColor = landGroupColors[groupId];
        }
      }
      // For other views, keep the default sand color, which will be darkened if it's night

      // Apply night effect to land polygons, except for income view
      if (isNight && !(activeView === 'land' && incomeDataLoaded)) {
        fillColor = darkenColor(fillColor, 0.2); // Darken by 20%
      }
    
      // Create local shorthand functions that use the current state values
      // Pass canvasDims from state to ensure calculations use the correct, most up-to-date dimensions
      const localIsoX = (x: number, y: number) => calculateIsoX(x, y, scale, offset, canvasDims.width);
      const localIsoY = (x: number, y: number) => calculateIsoY(x, y, scale, offset, canvasDims.height);
    
      // Convert lat/lng to isometric coordinates
      const coords = polygon.coordinates.map((coord: {lat: number, lng: number}) => {
        // Normalize coordinates relative to center of Venice
        // Scale factor adjusted to make the map more readable
        const x = (coord.lng - 12.3326) * 20000;
        const y = (coord.lat - 45.4371) * 20000; // Remove the 0.7 factor here since we're applying it in the projection
      
        return {
          x: localIsoX(x, y),
          y: localIsoY(x, y)
        };
      });
    
      // Use the polygon's center property if available, otherwise calculate centroid
      let centerX_screen, centerY_screen;
      let worldMapX, worldMapY; // To store world coordinates of the center
    
      // Prefer polygon.center, fallback to polygon.centroid if available
      const centerLat = polygon.center?.lat || polygon.centroid?.lat;
      const centerLng = polygon.center?.lng || polygon.centroid?.lng;

      if (centerLat && centerLng) {
        // Convert center to world map coordinates
        worldMapX = (centerLng - 12.3326) * 20000;
        worldMapY = (centerLat - 45.4371) * 20000;
      
        // Convert world map center to screen coordinates
        centerX_screen = localIsoX(worldMapX, worldMapY);
        centerY_screen = localIsoY(worldMapX, worldMapY);
      } else {
        // Calculate screen centroid as fallback if no geographic center/centroid is defined
        // This case means worldMapX/Y will be undefined, and custom positioning might not work for these.
        centerX_screen = 0;
        centerY_screen = 0;
        // centerY = 0; // This was an error, should be using centerY_screen
        coords.forEach(coord => {
          centerX_screen += coord.x;
          centerY_screen += coord.y;
        });
        centerX_screen /= coords.length;
        centerY_screen /= coords.length;
        // worldMapX/Y would be harder to derive accurately from screen centroid, so they remain undefined here.
      }
    
      return {
        polygon,
        coords,
        fillColor,
        centroidX: centerX_screen, // Store both for compatibility
        centroidY: centerY_screen,
        centerX: centerX_screen,    // Add these explicitly
        centerY: centerY_screen,
        polygonWorldMapCenterX: worldMapX, // Pass world map center X
        polygonWorldMapCenterY: worldMapY, // Pass world map center Y
        hasPublicDock        // Add this flag to identify polygons with public docks
      };
    }).filter(Boolean);
  }, [polygons, landOwners, citizens, activeView, scale, offset, incomeData, incomeDataLoaded, landGroups, landGroupColors, canvasDims.width, canvasDims.height, getIncomeColor, isNight]); // Added isNight

  // Update polygonsToRender when the dependencies of calculatePolygonsToRender change
  useEffect(() => {
    const newPolygonsToRender = calculatePolygonsToRender();
    setPolygonsToRender(newPolygonsToRender);
  }, [calculatePolygonsToRender]);

  // Draw the isometric view
  useEffect(() => {
    if (loading || !canvasRef.current || polygons.length === 0) return;
    
    // Remove debug logging for hover state
    
    // Reset selection state when switching away from land view
    if (activeView !== 'land') {
      if (selectedPolygonId) setSelectedPolygonId(null);
      if (showLandDetailsPanel) setShowLandDetailsPanel(false);
    }
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Reset any transformations
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Canvas size is now set by the resize effect.
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw water background
    ctx.fillStyle = isNight ? '#001A33' : '#4A9BC1'; // Very Dark Blue for night, Darker desaturated cyan for day
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  
    // Draw water route in all views, but only if there's a path to show
    if (waterRoutePath.length > 0) {
      // Draw the path
      ctx.beginPath();
          
      // Start at the first point
      const firstPoint = waterRoutePath[0];
      const firstX = (firstPoint.lng - 12.3326) * 20000;
      const firstY = (firstPoint.lat - 45.4371) * 20000;
          
      const firstIsoPos = {
        x: calculateIsoX(firstX, firstY, scale, offset, canvas.width),
        y: calculateIsoY(firstX, firstY, scale, offset, canvas.height)
      };
          
      ctx.moveTo(firstIsoPos.x, firstIsoPos.y);
          
      // Connect all points
      for (let i = 1; i < waterRoutePath.length; i++) {
        const point = waterRoutePath[i];
        const x = (point.lng - 12.3326) * 20000;
        const y = (point.lat - 45.4371) * 20000;
            
        const isoPos = {
          x: calculateIsoX(x, y, scale, offset, canvas.width),
          y: calculateIsoY(x, y, scale, offset, canvas.height)
        };
            
        ctx.lineTo(isoPos.x, isoPos.y);
      }
          
      // Save context before applying dash pattern
      ctx.save();
          
      // Style the path with dotted line - thinner lines and more transparent in non-transport views
      ctx.strokeStyle = activeView === 'transport' ? 'rgba(0, 150, 255, 0.8)' : 'rgba(0, 150, 255, 0.3)';
      ctx.lineWidth = 1.5 * scale; // Reduced from 2 to 1.5 for thinner lines
      ctx.setLineDash([10 * scale, 8 * scale]); // Larger values for more visible dots with larger gaps
      ctx.stroke();
          
      // Add a second stroke with different pattern for emphasis
      ctx.strokeStyle = 'rgba(0, 180, 220, 0.6)'; // Lighter blue
      ctx.lineWidth = 0.8 * scale; // Reduced from 1 to 0.8
      ctx.setLineDash([5 * scale, 12 * scale]); // Different pattern with larger gaps
      ctx.stroke();
          
      // Restore context to remove dash pattern
      ctx.restore();
      
      // Draw dots for intermediate points
      if (waterRouteIntermediatePoints.length > 0) {
        for (const point of waterRouteIntermediatePoints) {
          const x = (point.lng - 12.3326) * 20000;
          const y = (point.lat - 45.4371) * 20000;
          
          const isoPos = {
            x: calculateIsoX(x, y, scale, offset, canvas.width),
            y: calculateIsoY(x, y, scale, offset, canvas.height)
          };
          
          // Draw a small circle for intermediate points
          ctx.beginPath();
          ctx.arc(isoPos.x, isoPos.y, 2 * scale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.fill();
        }
      }
      
      // If we have a start point but no end point yet, draw a line from the last point to the mouse
      if (waterRouteStartPoint && !waterRouteEndPoint && waterRoutePath.length > 0) {
        // Get the last point in the path
        const lastPoint = waterRoutePath[waterRoutePath.length - 1];
        const lastX = (lastPoint.lng - 12.3326) * 20000;
        const lastY = (lastPoint.lat - 45.4371) * 20000;
        
        const lastIsoPos = {
          x: calculateIsoX(lastX, lastY, scale, offset, canvas.width),
          y: calculateIsoY(lastX, lastY, scale, offset, canvas.height)
        };
        
        // Draw a line from the last point to the mouse
        ctx.beginPath();
        ctx.moveTo(lastIsoPos.x, lastIsoPos.y);
        ctx.lineTo(mousePosition.x, mousePosition.y);
        ctx.strokeStyle = 'rgba(0, 150, 255, 0.5)';
        ctx.lineWidth = 1.5 * scale;
        ctx.setLineDash([5 * scale, 5 * scale]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Don't try to load images directly in the render loop - use preloaded images only
    // The preloaded images are handled in the next section
    
    // Land images are now rendered by the LandMarkers component
    
    // Draw polygons using RenderService, incorporating currentHoverState
    // This handles the primary drawing of polygons, including their fill color,
    // selection, and hover states.
    // L'appel à renderService.drawPolygons est commenté pour rendre les polygones non affichés.
    // Les LandMarkers (images des terrains) sont gérés séparément.
    /*
    renderService.drawPolygons(ctx, polygonsToRender, {
      selectedPolygonId,
      hoveredPolygonId: currentHoverState.type === 'polygon' ? currentHoverState.id : null,
      fillOpacity: 0, // Set opacity to 0 to make polygons invisible
      strokeOpacity: 0 // Set stroke opacity to 0 to hide polygon borders
    });
    */
    
    // We don't need to draw land images twice - the first pass above is sufficient
    // This second pass is removed to avoid drawing the images twice

    // Land names are no longer displayed.
      
    // Le rendu des blasons est maintenant géré par le composant CoatOfArmsMarkers (voir plus bas dans le JSX)

    // Draw the full water graph (all connections)
    if (fullWaterGraphData && fullWaterGraphData.waterPoints) {
      ctx.save();
      // ctx.setLineDash([3 * scale, 3 * scale]); // Removed: Use continuous lines
      ctx.strokeStyle = 'rgba(0, 100, 200, 0.2)'; // Light blue, slightly reduced opacity
      ctx.lineWidth = 0.7 * scale; // Thin lines

      const waterPointPositionsMap: Record<string, { lat: number, lng: number }> = {};
      fullWaterGraphData.waterPoints.forEach(wp => {
        if (wp.id && wp.position) {
          waterPointPositionsMap[wp.id] = wp.position;
        }
      });

      fullWaterGraphData.waterPoints.forEach(sourceWaterPoint => {
        if (!sourceWaterPoint.position || !sourceWaterPoint.connections) return;

        const sourceScreenPos = {
          x: calculateIsoX((sourceWaterPoint.position.lng - 12.3326) * 20000, (sourceWaterPoint.position.lat - 45.4371) * 20000, scale, offset, canvas.width),
          y: calculateIsoY((sourceWaterPoint.position.lng - 12.3326) * 20000, (sourceWaterPoint.position.lat - 45.4371) * 20000, scale, offset, canvas.height)
        };

        sourceWaterPoint.connections.forEach((connection: any) => {
          const targetPosition = waterPointPositionsMap[connection.targetId];
          if (!targetPosition) return;

          let lastScreenPos = sourceScreenPos;
          ctx.beginPath();
          ctx.moveTo(lastScreenPos.x, lastScreenPos.y);

          if (connection.intermediatePoints && connection.intermediatePoints.length > 0) {
            connection.intermediatePoints.forEach((intPoint: { lat: number, lng: number }) => {
              const intScreenPos = {
                x: calculateIsoX((intPoint.lng - 12.3326) * 20000, (intPoint.lat - 45.4371) * 20000, scale, offset, canvas.width),
                y: calculateIsoY((intPoint.lng - 12.3326) * 20000, (intPoint.lat - 45.4371) * 20000, scale, offset, canvas.height)
              };
              ctx.lineTo(intScreenPos.x, intScreenPos.y);
              lastScreenPos = intScreenPos;
            });
          }
          
          const targetScreenPos = {
            x: calculateIsoX((targetPosition.lng - 12.3326) * 20000, (targetPosition.lat - 45.4371) * 20000, scale, offset, canvas.width),
            y: calculateIsoY((targetPosition.lng - 12.3326) * 20000, (targetPosition.lat - 45.4371) * 20000, scale, offset, canvas.height)
          };
          ctx.lineTo(targetScreenPos.x, targetScreenPos.y);
          ctx.stroke();
        });
      });
      ctx.restore(); // Restore line dash style
    }

    // MOVED SECTIONS WILL BE INSERTED HERE
    // Draw water points in all views, but with different styling based on view
    const currentWaterPoints = fullWaterGraphData?.waterPoints || [];
    if (currentWaterPoints.length > 0) {
      // Get the hovered water point ID from the hover state service
      const hoveredWaterPointId = hoverStateService.getHoveredWaterPointId();
      
      currentWaterPoints.forEach(waterPoint => {
        if (!waterPoint.position) return;

        // Only draw water points that have fish
        if (!waterPoint.hasFish) {
          return;
        }
        
        // Convert lat/lng to isometric coordinates
        const x = (waterPoint.position.lng - 12.3326) * 20000;
        const y = (waterPoint.position.lat - 45.4371) * 20000;
        
        const isoPos = {
          x: calculateIsoX(x, y, scale, offset, canvas.width),
          y: calculateIsoY(x, y, scale, offset, canvas.height)
        };
        
        // Check if this water point is hovered
        const isHovered = waterPoint.id === hoveredWaterPointId;
        
        // Draw a distinctive circle for water points
        ctx.beginPath();
        const pointSize = isHovered ? 2 * scale : 1.25 * scale;
        ctx.arc(isoPos.x, isoPos.y, pointSize, 0, Math.PI * 2);
        
        // Adjusted opacity for water points
        const pointBaseOpacity = activeView === 'transport' ? 0.4 : 0.2;
        const opacity = isHovered || (interactionMode === 'create_water_route') ? 0.8 : pointBaseOpacity; // Use interactionMode
        ctx.fillStyle = isHovered ? 'rgba(0, 200, 255, 0.8)' : `rgba(0, 150, 255, ${opacity})`;
        ctx.fill();
      
        // Add a white border, more prominent when hovered
        ctx.strokeStyle = isHovered ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = isHovered ? 1 : 0.5; // Keep lineWidth as is, or slightly increase for non-hovered if needed
        ctx.stroke();

        // Draw fish icon if hasFish is true
        if (waterPoint.hasFish) {
          const emojiSize = Math.max(12, 10 * scale); // Assure une taille minimale, s'adapte au zoom
          ctx.font = `${emojiSize}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          // Positionne l'emoji au-dessus du cercle du point d'eau
          const emojiYPosition = isoPos.y - pointSize - (emojiSize * 0.6);
          ctx.fillText('🐟', isoPos.x, emojiYPosition);
        }
        
        // Add a pulsing effect when hovered
        if (isHovered) {
          const pulseSize = 3 * scale * (0.8 + 0.2 * Math.sin(Date.now() / 300));
          ctx.beginPath();
          ctx.arc(isoPos.x, isoPos.y, pulseSize, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(0, 200, 255, 0.4)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          
          // Add tooltip for hovered water point in water route mode
          if (interactionMode === 'create_water_route') { // Use interactionMode
            // Draw tooltip background
            const tooltipText = !waterRouteStartPoint ? 
              "Click to start route" : 
              !waterRouteEndPoint ? 
                "Click to end route" : 
                "Click to reset route";
            
            const textWidth = ctx.measureText(tooltipText).width;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(
              isoPos.x + 15, 
              isoPos.y - 10, 
              textWidth + 10, 
              20
            );
            
            // Draw tooltip text
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(
              tooltipText, 
              isoPos.x + 20, 
              isoPos.y
            );
          }
        }
      
        // Connections are now drawn by the fullWaterGraphData loop earlier.
        // This loop will only draw the water point nodes themselves.
      });
    }

    // Building points, canal points, and bridge points are now rendered by FeaturePointMarkers component.
    // The canvas drawing logic for these points has been removed from here.

    // Draw buildings on canvas (bridges, galleys)
    const currentFilteredBuildings = filterBuildings(); 

    if (currentFilteredBuildings.length > 0) {
        let canvasDrawableBuildings: any[] = [];
        
        // Canvas drawing should now consistently only handle specific types like bridges and merchant galleys.
        canvasDrawableBuildings = currentFilteredBuildings.filter(
            b => b.type && (b.type.toLowerCase().includes('bridge') || b.type.toLowerCase() === 'merchant_galley')
        );

        // DEBUG: Log canvasDrawableBuildings and their isConstructed status
        if (canvasDrawableBuildings.length > 0) {
            //console.log('[IsometricViewer] Canvas Drawable Buildings (bridges, galleys):', canvasDrawableBuildings.map(b => ({ id: b.id, type: b.type, isConstructed: b.isConstructed })));
        }

        if (canvasDrawableBuildings.length > 0) {
            const unconstructedCanvasBuildings = canvasDrawableBuildings.filter(b => b.isConstructed === false);
            // DEBUG: Log unconstructedCanvasBuildings
            if (unconstructedCanvasBuildings.length > 0) {
                //console.log('[IsometricViewer] Unconstructed Canvas Buildings for 0.3 opacity:', unconstructedCanvasBuildings.map(b => ({ id: b.id, type: b.type, isConstructed: b.isConstructed })));
            } else if (canvasDrawableBuildings.some(b => b.isConstructed !== false)) {
                // Log if there are canvas buildings but none are marked as unconstructed (isConstructed === false)
                //console.log('[IsometricViewer] No "unconstructed" (isConstructed === false) canvas buildings found. All are considered constructed.');
            }
            const constructedCanvasBuildings = canvasDrawableBuildings.filter(b => b.isConstructed !== false); // Includes true or undefined (defaulted to true by API)

            const renderOptions = {
              selectedBuildingId,
              hoveredBuildingId: currentHoverState.type === 'building' ? currentHoverState.id : null,
              buildingPositionsCache,
              buildingColorMode: 'owner', // Default to owner-based coloring
              getBuildingColor, 
              getBuildingOwnerColor,
              getBuildingCategoryColor,
              isColorDark,
              getCurrentCitizenIdentifier,
              polygonsToRender,
              orientingBridgeAngle: interactionMode === 'orient_bridge' ? orientingBridgeAngle : null,
              selectedBridgeForOrientationId: interactionMode === 'orient_bridge' ? selectedBridgeForOrientationId : null,
            };

            // Draw unconstructed buildings with opacity
            if (unconstructedCanvasBuildings.length > 0) {
                const unconstructedOther = unconstructedCanvasBuildings.filter(b => !b.type || b.type.toLowerCase() !== 'merchant_galley');
                const unconstructedGalleys = unconstructedCanvasBuildings.filter(b => b.type && b.type.toLowerCase() === 'merchant_galley');
                
                ctx.save();
                ctx.globalAlpha = 0.3;
                if (unconstructedOther.length > 0) {
                    renderService.drawBuildings(ctx, unconstructedOther, scale, offset, canvas.width, canvas.height, renderOptions);
                }
                if (unconstructedGalleys.length > 0) {
                    renderService.drawBuildings(ctx, unconstructedGalleys, scale, offset, canvas.width, canvas.height, renderOptions);
                }
                ctx.restore();
            }

            // Draw constructed buildings normally
            if (constructedCanvasBuildings.length > 0) {
                const constructedOther = constructedCanvasBuildings.filter(b => !b.type || b.type.toLowerCase() !== 'merchant_galley');
                const constructedGalleys = constructedCanvasBuildings.filter(b => b.type && b.type.toLowerCase() === 'merchant_galley');

                if (constructedOther.length > 0) {
                    renderService.drawBuildings(ctx, constructedOther, scale, offset, canvas.width, canvas.height, renderOptions);
                }
                if (constructedGalleys.length > 0) {
                    renderService.drawBuildings(ctx, constructedGalleys, scale, offset, canvas.width, canvas.height, renderOptions);
                }
            }
        }
    }
    // BuildingMarkers component is rendered in the JSX. 
    // It will filter out bridges and merchant_galleys itself if activeView === 'buildings'.

    // Draw the calculated transport path if available
    // This is now drawn if a path exists, regardless of transportMode,
    // with styling adjusted based on activeView.
    if (transportPath.length > 0) {
      const localIsoX = (x: number, y: number) => calculateIsoX(x, y, scale, offset, canvas.width);
      const localIsoY = (x: number, y: number) => calculateIsoY(x, y, scale, offset, canvas.height);

      // First draw a subtle shadow/glow effect
      ctx.beginPath();
      const firstPointPath = transportPath[0];
      const firstXPath = (firstPointPath.lng - 12.3326) * 20000;
      const firstYPath = (firstPointPath.lat - 45.4371) * 20000;
      ctx.moveTo(localIsoX(firstXPath, firstYPath), localIsoY(firstXPath, firstYPath));

      for (let i = 1; i < transportPath.length; i++) {
        const point = transportPath[i];
        const xPath = (point.lng - 12.3326) * 20000;
        const yPath = (point.lat - 45.4371) * 20000;
        ctx.lineTo(localIsoX(xPath, yPath), localIsoY(xPath, yPath));
      }

      // Style the path shadow (more subtle if not in transport view)
      ctx.strokeStyle = activeView === 'transport' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.15)';
      ctx.lineWidth = (activeView === 'transport' ? 6 : 4) * scale;
      ctx.stroke();

      // Now draw segments with different colors based on transport mode
      for (let i = 0; i < transportPath.length - 1; i++) {
        const point1 = transportPath[i];
        const point2 = transportPath[i + 1];

        const x1 = (point1.lng - 12.3326) * 20000;
        const y1 = (point1.lat - 45.4371) * 20000;
        const x2 = (point2.lng - 12.3326) * 20000;
        const y2 = (point2.lat - 45.4371) * 20000;

        if (point1.transportMode === 'gondola') {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(localIsoX(x1, y1), localIsoY(x1, y1));
          ctx.lineTo(localIsoX(x2, y2), localIsoY(x2, y2));
          
          ctx.strokeStyle = activeView === 'transport' ? 'rgba(0, 102, 153, 0.8)' : 'rgba(0, 102, 153, 0.5)';
          ctx.lineWidth = (activeView === 'transport' ? 2 : 1.5) * scale;
          ctx.setLineDash([10 * scale, 8 * scale]);
          ctx.stroke();
          
          ctx.strokeStyle = activeView === 'transport' ? 'rgba(0, 180, 220, 0.6)' : 'rgba(0, 180, 220, 0.3)';
          ctx.lineWidth = (activeView === 'transport' ? 1 : 0.7) * scale;
          ctx.setLineDash([5 * scale, 12 * scale]);
          ctx.stroke();
          ctx.restore();
        } else { // Walking paths
          ctx.beginPath();
          ctx.moveTo(localIsoX(x1, y1), localIsoY(x1, y1));
          ctx.lineTo(localIsoX(x2, y2), localIsoY(x2, y2));

          ctx.strokeStyle = activeView === 'transport' ? 'rgba(204, 85, 0, 0.8)' : 'rgba(204, 85, 0, 0.5)';
          ctx.lineWidth = (activeView === 'transport' ? 4 : 2.5) * scale;
          ctx.stroke();

          ctx.beginPath();
          ctx.setLineDash([2 * scale, 2 * scale]);
          ctx.moveTo(localIsoX(x1, y1), localIsoY(x1, y1));
          ctx.lineTo(localIsoX(x2, y2), localIsoY(x2, y2));
          ctx.strokeStyle = activeView === 'transport' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = (activeView === 'transport' ? 1 : 0.7) * scale;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Draw waypoints with adjusted styling
      for (let i = 0; i < transportPath.length; i++) {
        if (transportPath[i].isIntermediatePoint && activeView !== 'transport') continue; // Hide intermediate points outside transport view

        const point = transportPath[i];
        const x = (point.lng - 12.3326) * 20000;
        const y = (point.lat - 45.4371) * 20000;
        const screenX = localIsoX(x, y);
        const screenY = localIsoY(x, y);

        let nodeSize = (activeView === 'transport' ? 2.5 : 1.8) * scale;
        let baseOpacity = activeView === 'transport' ? 0.8 : 0.5;
        let nodeColor = `rgba(218, 165, 32, ${baseOpacity})`; // Default gold

        if (point.type === 'bridge') {
          nodeSize = (activeView === 'transport' ? 3 : 2) * scale;
          nodeColor = `rgba(180, 100, 50, ${baseOpacity})`; 
        } else if (point.type === 'building') {
          nodeSize = (activeView === 'transport' ? 3 : 2) * scale;
          nodeColor = `rgba(70, 130, 180, ${baseOpacity})`;
        } else if (point.type === 'centroid' || point.type === 'center') { // Added 'center'
          nodeSize = (activeView === 'transport' ? 2 : 1.5) * scale;
          nodeColor = `rgba(0, 102, 153, ${baseOpacity - 0.1})`;
        } else if (point.type === 'canal') {
          nodeSize = (activeView === 'transport' ? 3 : 2) * scale;
          nodeColor = `rgba(0, 150, 200, ${baseOpacity})`;
        }
        
        if (transportPath[i].isIntermediatePoint) { // Make intermediate points even smaller
             nodeSize *= 0.7;
        }

        ctx.beginPath();
        ctx.arc(screenX, screenY, nodeSize, 0, Math.PI * 2);
        ctx.fillStyle = nodeColor;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 255, 255, ${baseOpacity - 0.1})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Indicators (legend, distance, etc.) only in transport view
      if (activeView === 'transport') {
        if (waterOnlyMode) {
          const labelX = canvas.width - 200;
          const labelY = canvas.height - 200;
          ctx.fillStyle = 'rgba(0, 102, 153, 0.8)'; 
          ctx.fillRect(labelX - 10, labelY - 10, 220, 40);
          ctx.strokeStyle = 'rgba(218, 165, 32, 0.8)'; 
          ctx.lineWidth = 2;
          ctx.strokeRect(labelX - 10, labelY - 10, 220, 40);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '16px "Times New Roman", serif';
          ctx.textAlign = 'center';
          ctx.fillText('Percorso Solo Acqua', labelX + 100, labelY + 15);
        }

        const legendX = 20;
        const legendY = canvas.height - 160; 
        const legendWidth = 180;
        const legendHeight = 140;
        const legendPadding = 10;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(legendX - legendPadding, legendY - legendPadding, legendWidth + legendPadding * 2, legendHeight + legendPadding * 2);
        ctx.strokeStyle = 'rgba(218, 165, 32, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(legendX - legendPadding, legendY - legendPadding, legendWidth + legendPadding * 2, legendHeight + legendPadding * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.font = '14px "Times New Roman", serif';
        ctx.fillText('Legenda', legendX, legendY + 15);
        ctx.font = '12px "Times New Roman", serif';
        // Bridge point
        ctx.beginPath(); ctx.arc(legendX + 10, legendY + 40, 3 * scale, 0, Math.PI * 2); ctx.fillStyle = 'rgba(180, 100, 50, 0.8)'; ctx.fill(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; ctx.lineWidth = 0.8; ctx.stroke(); ctx.fillStyle = '#FFFFFF'; ctx.fillText('Ponte', legendX + 25, legendY + 43);
        // Building point
        ctx.beginPath(); ctx.arc(legendX + 10, legendY + 60, 3 * scale, 0, Math.PI * 2); ctx.fillStyle = 'rgba(70, 130, 180, 0.8)'; ctx.fill(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; ctx.lineWidth = 0.8; ctx.stroke(); ctx.fillStyle = '#FFFFFF'; ctx.fillText('Edificio', legendX + 25, legendY + 63);
        // Centroid point
        ctx.beginPath(); ctx.arc(legendX + 10, legendY + 80, 2 * scale, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0, 102, 153, 0.7)'; ctx.fill(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; ctx.lineWidth = 0.8; ctx.stroke(); ctx.fillStyle = '#FFFFFF'; ctx.fillText('Piazza', legendX + 25, legendY + 83);
        // Canal point
        ctx.beginPath(); ctx.arc(legendX + 10, legendY + 100, 3 * scale, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0, 150, 200, 0.8)'; ctx.fill(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; ctx.lineWidth = 0.8; ctx.stroke(); ctx.fillStyle = '#FFFFFF'; ctx.fillText('Canale', legendX + 25, legendY + 103);
        // Walking path
        ctx.beginPath(); ctx.moveTo(legendX + 5, legendY + 120); ctx.lineTo(legendX + 15, legendY + 120); ctx.strokeStyle = 'rgba(204, 85, 0, 0.8)'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#FFFFFF'; ctx.fillText('A piedi', legendX + 25, legendY + 123);
        // Water path
        ctx.beginPath(); ctx.moveTo(legendX + 5, legendY + 140); ctx.lineTo(legendX + 15, legendY + 140); ctx.strokeStyle = 'rgba(0, 102, 153, 0.8)'; ctx.lineWidth = 3; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#FFFFFF'; ctx.fillText('In gondola', legendX + 25, legendY + 143);

        let totalDistance = 0; let walkingDistance = 0; let waterDistance = 0;
        for (let i = 1; i < transportPath.length; i++) {
          const point1 = transportPath[i-1]; const point2 = transportPath[i];
          const distance = calculateDistance({ lat: point1.lat, lng: point1.lng }, { lat: point2.lat, lng: point2.lng });
          totalDistance += distance;
          if (point1.transportMode === 'gondola') waterDistance += distance; else walkingDistance += distance;
        }
        const walkingTimeHours = walkingDistance / 1000 / 5; const waterTimeHours = waterDistance / 1000 / 10;
        const totalTimeMinutes = Math.round((walkingTimeHours + waterTimeHours) * 60);
        let distanceText = totalDistance < 1000 ? `${Math.round(totalDistance)} metri` : `${(totalDistance / 1000).toFixed(2)} km`;
        const infoLabel = `Distanza: ${distanceText} | Tempo: ${totalTimeMinutes} min`;
        const walkingLabel = `A piedi: ${Math.round(walkingDistance)} m`;
        const gondolaLabel = `In gondola: ${Math.round(waterDistance)} m`;
        const labelWidthInfo = Math.max(ctx.measureText(infoLabel).width, ctx.measureText(walkingLabel).width, ctx.measureText(gondolaLabel).width);
        const labelHeightInfo = 60; const labelPaddingInfo = 10;
        const labelXInfo = canvas.width - labelWidthInfo - labelPaddingInfo * 3;
        const labelYInfo = canvas.height - labelHeightInfo - labelPaddingInfo * 3;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(labelXInfo - labelPaddingInfo, labelYInfo - labelPaddingInfo, labelWidthInfo + labelPaddingInfo * 2, labelHeightInfo + labelPaddingInfo * 2);
        ctx.strokeStyle = 'rgba(218, 165, 32, 0.8)'; ctx.lineWidth = 1;
        ctx.strokeRect(labelXInfo - labelPaddingInfo, labelYInfo - labelPaddingInfo, labelWidthInfo + labelPaddingInfo * 2, labelHeightInfo + labelPaddingInfo * 2);
        ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'left';
        ctx.fillText(infoLabel, labelXInfo, labelYInfo + 15);
        ctx.fillText(walkingLabel, labelXInfo, labelYInfo + 35);
        ctx.fillText(gondolaLabel, labelXInfo, labelYInfo + 55);
      }
    }
    
    // Store current view and scale for comparison in next render
    prevActiveView.current = activeView;
    prevScale.current = scale;
    
    // The 'forceRedraw' event listener is removed as reactivity should handle redraws.

    // Draw occupant line if data is available
    if (occupantLine) {
      const startCanvas = latLngToScreen(CoordinateService.worldToLatLng(occupantLine.startWorld.x, occupantLine.startWorld.z).lat, CoordinateService.worldToLatLng(occupantLine.startWorld.x, occupantLine.startWorld.z).lng);
      const endCanvas = latLngToScreen(CoordinateService.worldToLatLng(occupantLine.endWorld.x, occupantLine.endWorld.z).lat, CoordinateService.worldToLatLng(occupantLine.endWorld.x, occupantLine.endWorld.z).lng);
      
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4 * scale, 2 * scale]); // Dotted line style, scaled
      ctx.moveTo(startCanvas.x, startCanvas.y);
      ctx.lineTo(endCanvas.x, endCanvas.y);
      ctx.strokeStyle = occupantLine.color;
      ctx.lineWidth = 1.5; // Line width
      ctx.stroke();
      ctx.setLineDash([]); // Reset line dash
      ctx.restore();
    }
    
  }, [
    loading, polygons, landOwners, citizens, activeView, buildings, scale, offset, 
    incomeData, minIncome, maxIncome, selectedPolygonId, selectedBuildingId, 
    emptyBuildingPoints, mousePosition, citizensLoaded, citizensByBuilding, 
    incomeDataLoaded, polygonsToRender, getIncomeColor, getCurrentCitizenSecondaryColor,
    fullWaterGraphData, 
    interactionMode, 
    waterRoutePath, transportPath, currentHoverState, 
    buildingPositionsCache, canvasDims, // Added canvasDims to ensure re-draw if it changes
    occupantLine, latLngToScreen, // Added occupantLine and latLngToScreen
    isNight // Added isNight
  ]);
  

  // Handle window resize and initial canvas setup
  useEffect(() => {
    const updateCanvasDimensions = () => {
      if (canvasRef.current) {
        const newWidth = window.innerWidth;
        const newHeight = window.innerHeight;
        canvasRef.current.width = newWidth;
        canvasRef.current.height = newHeight;
        setCanvasDims({ width: newWidth, height: newHeight });
        // renderedCoatOfArmsCache.current = {}; // Supprimé car le cache n'est plus utilisé ici
      }
    };

    updateCanvasDimensions(); // Initial sizing on mount

    const handleResize = debounce(() => {
      updateCanvasDimensions();
    }, 200);
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      handleResize.cancel(); // Clean up debounce
    };
  }, []); // Empty dependency array, runs once on mount for setup and cleanup
  
  // Listen for problem details panel events, building selection, and polygon selection
  useEffect(() => {
    const handleShowProblemDetailsPanel = (event: CustomEvent) => {
      if (event.detail && event.detail.problemId) {
        setSelectedProblemId(event.detail.problemId);
        setShowProblemDetailsPanel(true);
      }
    };
    
    window.addEventListener('showProblemDetailsPanel', handleShowProblemDetailsPanel as EventListener);

    const handleBuildingSelectedFromMarkers = (eventData: any) => {
      if (eventData && eventData.buildingId) {
        console.log(`IsometricViewer: Received BUILDING_SELECTED event for ${eventData.buildingId}`);
        setSelectedBuildingId(eventData.buildingId);
        setShowBuildingDetailsPanel(true);
      }
    };
    const buildingSelectedSubscription = eventBus.subscribe(EventTypes.BUILDING_SELECTED, handleBuildingSelectedFromMarkers);

    const handlePolygonSelectedFromMarkers = (eventData: { polygonId: string, polygonData: any }) => {
      if (activeView === 'land' && eventData && eventData.polygonId) {
        console.log(`IsometricViewer: Received POLYGON_SELECTED event for ${eventData.polygonId} from LandMarkers/CoatOfArmsMarkers.`);
        setSelectedPolygonId(eventData.polygonId);
        setShowLandDetailsPanel(true);
      }
    };
    const polygonSelectedSubscription = eventBus.subscribe(EventTypes.POLYGON_SELECTED, handlePolygonSelectedFromMarkers);
    
    return () => {
      window.removeEventListener('showProblemDetailsPanel', handleShowProblemDetailsPanel as EventListener);
      buildingSelectedSubscription.unsubscribe();
      polygonSelectedSubscription.unsubscribe();
    };
  }, [activeView]); // Add activeView as a dependency

  // Listen for hover state changes and update local state
  useEffect(() => {
    const handleHoverStateChanged = (newState: HoverState) => {
      //console.log('[IsometricViewer] Hover state changed:', newState); // DEBUG
      setCurrentHoverState(newState);
    };
    
    const subscription = eventBus.subscribe(HOVER_STATE_CHANGED, handleHoverStateChanged);
    
    return () => {
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array, setCurrentHoverState is stable

  // Listen for event to show CitizenDetailsPanel from Compagno
  useEffect(() => {
    const handleShowCitizenDetailsFromCompagno = (event: CustomEvent) => {
      if (event.detail && event.detail.citizen) {
        const citizenData = event.detail.citizen;
        // Sanitize citizen data if necessary, similar to how it's done for map clicks
        const safeCitizen = CitizenRenderService.sanitizeCitizen(citizenData);
        setSelectedCitizen(safeCitizen);
        setShowCitizenDetailsPanel(true);
      }
    };

    window.addEventListener('showCitizenDetailsPanelEvent', handleShowCitizenDetailsFromCompagno as EventListener);

    return () => {
      window.removeEventListener('showCitizenDetailsPanelEvent', handleShowCitizenDetailsFromCompagno as EventListener);
    };
  }, []); // Empty dependency array, runs once on mount

  const getSocialClassColor = (socialClass?: string): string => {
    const lowerSocialClass = socialClass?.toLowerCase();
    switch (lowerSocialClass) {
      case 'nobili': return 'rgba(128, 0, 128, 0.7)'; // Purple
      case 'consigliodeidieci': return 'rgba(255, 215, 0, 0.7)'; // Gold
      case 'cittadini': return 'rgba(0, 123, 255, 0.7)'; // Blue
      case 'popolani': return 'rgba(40, 167, 69, 0.7)'; // Green
      case 'facchini': return 'rgba(160, 82, 45, 0.7)'; // Sienna (brown)
      case 'forestieri': return 'rgba(108, 117, 125, 0.7)'; // Grey
      default: return 'rgba(0, 0, 0, 0.5)'; // Black for unknown
    }
  };

  // Effect to handle hover state changes from the service for occupant line
  useEffect(() => {
    const handleHoverForOccupantLine = async (newHoverState: HoverState) => {
      // We don't call setHoverState here as it's handled by the other useEffect for currentHoverState
      if (newHoverState.type === 'building' && newHoverState.data) {
        const building = newHoverState.data;
        if (building.occupant && building.position) {
          let buildingLat, buildingLng;
          if (typeof building.position === 'string') {
            try {
              const pos = JSON.parse(building.position);
              buildingLat = pos.lat;
              buildingLng = pos.lng;
            } catch (e) { 
              console.error("Failed to parse building position string:", building.position, e);
              setOccupantLine(null);
              return;
            }
          } else if (typeof building.position === 'object' && building.position.lat !== undefined && building.position.lng !== undefined) {
            buildingLat = building.position.lat;
            buildingLng = building.position.lng;
          }

          if (buildingLat !== undefined && buildingLng !== undefined) {
            const buildingWorldPos = CoordinateService.latLngToWorld(buildingLat, buildingLng);

            try {
              const response = await fetch(`/api/citizens/${building.occupant}`);
              const data = await response.json();

              if (data.success && data.citizen && data.citizen.position) {
                const occupant = data.citizen;
                let occupantLat, occupantLng;
                if (typeof occupant.position === 'string') {
                    try {
                        const pos = JSON.parse(occupant.position);
                        occupantLat = pos.lat;
                        occupantLng = pos.lng;
                    } catch (e) {
                        console.error("Failed to parse occupant position string:", occupant.position, e);
                        setOccupantLine(null);
                        return;
                    }
                } else if (typeof occupant.position === 'object' && occupant.position.lat !== undefined && occupant.position.lng !== undefined) {
                    occupantLat = occupant.position.lat;
                    occupantLng = occupant.position.lng;
                }

                if (occupantLat !== undefined && occupantLng !== undefined) {
                    const occupantWorldPos = CoordinateService.latLngToWorld(occupantLat, occupantLng);
                    const lineColor = getSocialClassColor(occupant.socialClass);

                    setOccupantLine({
                      startWorld: { x: buildingWorldPos.x, y: 0, z: buildingWorldPos.y }, // Building on ground
                      endWorld: { x: occupantWorldPos.x, y: 0, z: occupantWorldPos.y },   // Occupant on ground
                      color: lineColor,
                    });
                } else {
                    setOccupantLine(null); // Occupant position invalid
                }
              } else {
                setOccupantLine(null); // Occupant fetch failed or no position
              }
            } catch (error) {
              console.error("Failed to fetch occupant for line drawing:", error);
              setOccupantLine(null);
            }
          } else {
            setOccupantLine(null); // Building position invalid
          }
        } else {
          setOccupantLine(null); // No occupant or no building position
        }
      } else {
        setOccupantLine(null); // Clear line if not hovering a building or no data
      }
    };
    const subscription = eventBus.subscribe(HOVER_STATE_CHANGED, handleHoverForOccupantLine);
    return () => {
      subscription.unsubscribe();
    };
  }, []); // This effect is independent of getProjectedCoordinates

  // Helper function to get building color based on type
  function getBuildingColor(type: string): string {
    // Generate a deterministic color based on the building type
    const getColorFromType = (str: string): string => {
      // Create a hash from the string
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      
      // Use the hash to generate HSL values in appropriate ranges for Venetian architecture
      // Hue: Limit to earthy/warm tones (20-50 for browns/oranges/reds, 180-220 for blues)
      let hue = Math.abs(hash) % 360;
      
      // Adjust hue to be in appropriate ranges for Venetian architecture
      if (hue > 50 && hue < 180) {
        hue = 30 + (hue % 20); // Redirect to earthy tones
      } else if (hue > 220 && hue < 350) {
        hue = 200 + (hue % 20); // Redirect to Venetian blues
      }
      
      // Saturation: Muted for period-appropriate look (30-60%)
      const saturation = 30 + (Math.abs(hash >> 8) % 30);
      
      // Lightness: Medium to light for visibility (45-75%)
      const lightness = 45 + (Math.abs(hash >> 16) % 30);
      
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    };
    
    // Function to get color based on building category
    const getBuildingCategoryColor = (category: string): string => {
      // Default to black if no category
      if (!category) return '#000000';
      
      // Convert to lowercase for case-insensitive comparison
      const lowerCategory = category.toLowerCase();
      
      // Return color based on category
      switch(lowerCategory) {
        case 'bridge':
          return '#8B4513'; // Brown for bridges
        case 'business':
          return '#4B0082'; // Indigo for businesses
        case 'dock':
          return '#1E90FF'; // Dodger blue for docks
        case 'home':
          return '#228B22'; // Forest green for homes
        case 'well':
          return '#4682B4'; // Steel blue for wells
        default:
          return '#000000'; // Black for unknown categories
      }
    };
    
    // Special cases for common building types
    switch(type.toLowerCase()) {
      case 'market-stall':
        return '#E6C275'; // Warm gold/amber for contract stalls
      case 'house':
        return '#E8D2B5'; // Venetian terracotta/sand for houses
      case 'workshop':
        return '#A67D5D'; // Rich wood brown for workshops
      case 'warehouse':
        return '#8C7B68'; // Darker earthy brown for warehouses
      case 'tavern':
        return '#B5835A'; // Warm oak brown for taverns
      case 'church':
        return '#E6E6D9'; // Off-white/ivory for churches
      case 'palace':
        return '#D9C7A7'; // Pale stone/marble for palaces
      case 'dock':
        return '#7D6C55'; // Dark wood brown for docks
      case 'bridge':
        return '#C9B18F'; // Stone bridge color
      case 'gondola-station':
        return '#5D7A8C'; // Blue-gray for gondola stations
      case 'gondola_station':
        return '#5D7A8C'; // Blue-gray for gondola stations
      default:
        // For any other building type, generate a deterministic color
        return getColorFromType(type);
    }
  }

  // Get building color based on owner
  function getBuildingOwnerColor(owner: string): string {
    // Generate a deterministic color based on the owner name
    const getColorFromString = (str: string): string => {
      // Create a hash from the string
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      
      // Use the hash to generate HSL values in appropriate ranges for Venetian architecture
      // Hue: Limit to earthy/warm tones (20-50 for browns/oranges/reds, 180-220 for blues)
      let hue = Math.abs(hash) % 360;
      
      // Adjust hue to be in appropriate ranges for Venetian architecture
      if (hue > 50 && hue < 180) {
        hue = 30 + (hue % 20); // Redirect to earthy tones
      } else if (hue > 220 && hue < 350) {
        hue = 200 + (hue % 20); // Redirect to Venetian blues
      }
      
      // Saturation: Muted for period-appropriate look (30-60%)
      const saturation = 30 + (Math.abs(hash >> 8) % 30);
      
      // Lightness: Medium to light for visibility (45-75%)
      const lightness = 45 + (Math.abs(hash >> 16) % 30);
      
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    };
    
    // Special cases for common owners
    if (owner === 'ConsiglioDeiDieci') {
      return '#8B0000'; // Dark red for the Council of Ten
    }
    
    // For any other owner, generate a deterministic color
    return getColorFromString(owner);
  }

  // These functions have been moved to the top of the component
  
  // Function to filter buildings based on ownership
  const filterBuildings = useCallback(() => {
    if (buildingFilterMode === 'city') {
      return buildings; // Return all buildings if filter is set to city
    }
    
    // Get current citizen identifier
    const currentCitizen = getCurrentCitizenIdentifier();
    
    // Filter buildings to only show those owned by the current citizen
    return buildings.filter(building => building.owner === currentCitizen);
  }, [buildings, buildingFilterMode, getCurrentCitizenIdentifier]);

  // Calculate financial data range when aspect or filters change
  useEffect(() => {
    if (activeView === 'buildings' && buildingFinancialAspect !== 'default') {
      const currentFilteredBuildings = filterBuildings();
      let aspectKey: 'leasePrice' | 'rentPrice' | 'wages';

      switch (buildingFinancialAspect) {
        case 'lease':
          aspectKey = 'leasePrice';
          break;
        case 'rent':
          aspectKey = 'rentPrice';
          break;
        case 'wages':
          aspectKey = 'wages';
          break;
        default:
          setFinancialDataRange(null);
          return;
      }

      const values = currentFilteredBuildings
        .map(b => b[aspectKey] as number | undefined)
        .filter(v => typeof v === 'number' && !isNaN(v) && v > 0) // Ensure positive values for log
        .map(v => Math.log1p(v as number)); // Apply log1p transformation

      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        setFinancialDataRange({ min, max });
        console.log(`Financial aspect ${buildingFinancialAspect}: Log-transformed range [${min}, ${max}] from ${values.length} values.`);
      } else {
        setFinancialDataRange({ min: 0, max: 0 }); // Default if no data or all non-positive
        console.log(`Financial aspect ${buildingFinancialAspect}: No positive values found for log-transformation.`);
      }
    } else {
      setFinancialDataRange(null);
    }
  }, [activeView, buildingFinancialAspect, buildings, buildingFilterMode, filterBuildings]);


  // Helper function for financial aspect color scale
  const getFinancialAspectColor = (value: number | undefined, min: number, max: number): string => {
    if (value === undefined || value === null) {
      return '#808080'; // Grey for undefined values
    }
    if (min === max) {
      return '#FFA500'; // Orange if all values are the same (no range)
    }
    const normalized = Math.min(Math.max((value - min) / (max - min), 0), 1);

    if (normalized < 0.5) {
      // Blue to Orange (0 to 0.5 normalized)
      // Blue: rgb(0,0,255) -> Orange: rgb(255,165,0)
      const t = normalized * 2; // scale 0-0.5 to 0-1
      const r = Math.floor(0 + t * (255 - 0));
      const g = Math.floor(0 + t * (165 - 0));
      const b = Math.floor(255 - t * (255 - 0));
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Orange to Burgundy (0.5 to 1 normalized)
      // Orange: rgb(255,165,0) -> Burgundy: rgb(128,0,32)
      const t = (normalized - 0.5) * 2; // scale 0.5-1 to 0-1
      const r = Math.floor(255 + t * (128 - 255));
      const g = Math.floor(165 + t * (0 - 165));
      const b = Math.floor(0 + t * (32 - 0));
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  // Helper function to find which polygon contains this building point
  function findPolygonIdForPoint(point: {lat: number, lng: number}): string {
    const threshold = 0.00001; // Tolerance for float comparison

    for (const polygon of polygons) { // 'polygons' should be from component state or props
      // Check buildingPoints
      if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
        const foundInBuildingPoints = polygon.buildingPoints.some((bp: any) => 
          bp && typeof bp.lat === 'number' && typeof bp.lng === 'number' &&
          Math.abs(bp.lat - point.lat) < threshold && 
          Math.abs(bp.lng - point.lng) < threshold
        );
        if (foundInBuildingPoints) return polygon.id;
      }

      // Check canalPoints (assuming points have 'edge' with lat/lng or point itself has lat/lng)
      if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
        const foundInCanalPoints = polygon.canalPoints.some((cp: any) => {
          const p = cp.edge || cp; // Handle structures where coords might be in cp.edge or cp directly
          return p && typeof p.lat === 'number' && typeof p.lng === 'number' &&
                 Math.abs(p.lat - point.lat) < threshold &&
                 Math.abs(p.lng - point.lng) < threshold;
        });
        if (foundInCanalPoints) return polygon.id;
      }

      // Check bridgePoints (assuming points have 'edge' with lat/lng or point itself has lat/lng)
      if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
        const foundInBridgePoints = polygon.bridgePoints.some((brp: any) => {
          const p = brp.edge || brp; // Handle structures
          return p && typeof p.lat === 'number' && typeof p.lng === 'number' &&
                 Math.abs(p.lat - point.lat) < threshold &&
                 Math.abs(p.lng - point.lng) < threshold;
        });
        if (foundInBridgePoints) return polygon.id;
      }
    }
    
    // Fallback: geometric check (if point is inside the polygon's main coordinates)
    // This is less reliable for edge points like canal/bridge points.
    for (const polygon of polygons) {
      if (polygon.coordinates && polygon.coordinates.length > 2) {
        if (isPointInPolygonCoordinates(point, polygon.coordinates)) {
          return polygon.id;
        }
      }
    }
    
    console.warn(`[findPolygonIdForPoint] Could not find polygon for point:`, point);
    return 'unknown';
  }

  // Helper function to check if a point is inside polygon coordinates
  function isPointInPolygonCoordinates(point: {lat: number, lng: number}, coordinates: {lat: number, lng: number}[]): boolean {
    let inside = false;
    for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
      const xi = coordinates[i].lng, yi = coordinates[i].lat;
      const xj = coordinates[j].lng, yj = coordinates[j].lat;
      
      const intersect = ((yi > point.lat) !== (yj > point.lat))
          && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Helper function to lighten a color
  const lightenColor = (color: string, percent: number): string => {
    // For debugging
    //console.log(`Lightening color ${color} by ${percent}%`);
    
    // If color doesn't start with #, return a default color
    if (!color.startsWith('#')) {
      console.warn(`Invalid color format: ${color}, using default`);
      return '#FF00FF'; // Bright magenta as fallback
    }
    
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    
    const result = '#' + (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
    
    console.log(`Lightened color: ${result}`);
    return result;
  };
  
  // Helper function to determine if a color is dark
  function isColorDark(color: string): boolean {
    // For HSL colors
    if (color.startsWith('hsl')) {
      // Extract the lightness value from the HSL color
      const match = color.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%\s*\)/);
      if (match && match[1]) {
        const lightness = parseInt(match[1], 10);
        return lightness < 50; // If lightness is less than 50%, consider it dark
      }
    }
    
    // For hex colors
    if (color.startsWith('#')) {
      const hex = color.substring(1);
      const rgb = parseInt(hex, 16);
      const r = (rgb >> 16) & 0xff;
      const g = (rgb >> 8) & 0xff;
      const b = (rgb >> 0) & 0xff;
      
      // Calculate perceived brightness using the formula
      // (0.299*R + 0.587*G + 0.114*B)
      const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
      return brightness < 128; // If brightness is less than 128, consider it dark
    }
    
    // For RGB colors
    if (color.startsWith('rgb')) {
      const match = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
      if (match) {
        const r = parseInt(match[1], 10);
        const g = parseInt(match[2], 10);
        const b = parseInt(match[3], 10);
        
        // Calculate perceived brightness
        const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
        return brightness < 128;
      }
    }
    
    // Default to false if we can't determine
    return false;
  }

  // Helper function to format building types for display
  function formatBuildingType(type: string): string {
    if (!type) return 'Building';
    
    // Replace underscores and hyphens with spaces
    let formatted = type.replace(/[_-]/g, ' ');
    
    // Capitalize each word
    formatted = formatted.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return formatted;
  }

  // Helper function to darken a color (This is the duplicate, it will be removed)

  const handleLandRightClick = useCallback((polygonId: string, clickX: number, clickY: number) => {
    console.log(`Right click on land: ${polygonId} at screen (${clickX}, ${clickY})`);
    const targetPolygonData = polygonsToRender.find(p => p.polygon.id === polygonId);
    if (!targetPolygonData || !targetPolygonData.polygon) {
      console.warn(`Could not find polygon data for ID: ${polygonId}`);
      return;
    }

    const polygon = targetPolygonData.polygon;
    const allPoints: { lat: number, lng: number, type: 'land' | 'canal', originalId?: string, screenPos: {x: number, y: number} }[] = [];
    const occupiedThreshold = 0.00001; // For lat/lng comparisons

    // Process building points
    if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
      polygon.buildingPoints.forEach((bp: any) => {
        if (bp && typeof bp.lat === 'number' && typeof bp.lng === 'number') {
          const isOccupied = buildings.some(b => {
            if (!b.position) return false;
            let bPos;
            try {
              bPos = typeof b.position === 'string' ? JSON.parse(b.position) : b.position;
            } catch (e) { return false; }
            return bPos && Math.abs(bPos.lat - bp.lat) < occupiedThreshold && Math.abs(bPos.lng - bp.lng) < occupiedThreshold;
          });
          if (!isOccupied) {
            const screenPos = latLngToScreen(bp.lat, bp.lng);
            allPoints.push({ lat: bp.lat, lng: bp.lng, type: 'land', originalId: bp.id, screenPos });
          }
        }
      });
    }

    // Process canal points
    if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
      polygon.canalPoints.forEach((cp: any) => {
        if (cp && cp.edge && typeof cp.edge.lat === 'number' && typeof cp.edge.lng === 'number') {
          const isOccupied = buildings.some(b => {
            if (!b.position || !(b.type?.toLowerCase().includes('dock') || b.category?.toLowerCase().includes('dock'))) return false; // Check if it's a dock-like building
            let bPos;
            try {
              bPos = typeof b.position === 'string' ? JSON.parse(b.position) : b.position;
            } catch (e) { return false; }
            return bPos && Math.abs(bPos.lat - cp.edge.lat) < occupiedThreshold && Math.abs(bPos.lng - cp.edge.lng) < occupiedThreshold;
          });
          if (!isOccupied) {
            const screenPos = latLngToScreen(cp.edge.lat, cp.edge.lng);
            allPoints.push({ lat: cp.edge.lat, lng: cp.edge.lng, type: 'canal', originalId: cp.id, screenPos });
          }
        }
      });
    }

    if (allPoints.length === 0) {
      console.log(`No unoccupied points found on polygon ${polygonId}`);
      // Optionally, provide feedback to the user (e.g., via a toast notification)
      return;
    }

    // Find the closest point to the click
    let closestPoint: { lat: number, lng: number, type: 'land' | 'canal', originalId?: string, screenPos: {x: number, y: number} } | null = null;
    let minDistanceSq = Infinity;

    allPoints.forEach(point => {
      const distSq = (point.screenPos.x - clickX) ** 2 + (point.screenPos.y - clickY) ** 2;
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        closestPoint = point;
      }
    });

    if (closestPoint) {
      console.log(`Closest unoccupied point:`, closestPoint);
      setSelectedPointForCreation({
        lat: closestPoint.lat,
        lng: closestPoint.lng,
        polygonId: polygonId, // The polygonId of the land parcel itself
        pointType: closestPoint.type, // 'land' or 'canal'
      });
      setShowBuildingCreationPanel(true);
    } else {
      console.log(`Strangely, no closest point found even though allPoints was not empty.`);
    }
  }, [polygonsToRender, buildings, latLngToScreen, setSelectedPointForCreation, setShowBuildingCreationPanel]);

  return (
    <div ref={wrapperRef} className="w-screen h-screen select-none" style={{ cursor: isDragging ? 'grabbing' : 'grab' }}> {/* Add select-none and ref to the main div */}
      <canvas 
        ref={canvasRef} 
        className="w-full h-full"
        style={{ cursor: 'inherit' }}
      />
      
      {/* Land Markers - Editable land images */}
      <LandMarkers
        isVisible={true}
        polygonsToRender={polygonsToRender}
        isNight={isNight}
        scale={scale}
        activeView={activeView}
        canvasWidth={canvasDims.width}
        canvasHeight={canvasDims.height}
        mapTransformOffset={offset}
        onLandRightClick={(polygonId, clickX, clickY) => handleLandRightClick(polygonId, clickX, clickY)} // Pass new handler
      />

      {/* FeaturePointMarkers component removed */}

      {/* Coat of Arms Markers - Affiche les blasons par-dessus le canvas */}
      <CoatOfArmsMarkers
        isVisible={activeView === 'land'}
        polygonsToRender={polygonsToRender}
        landOwners={landOwners}
        coatOfArmsImageUrls={coatOfArmsImageUrls}
      />
      
      {/* Transport Error Message */}
      <TransportErrorMessage />
      
      {/* Citizen Markers - Now visible in all views except land */}
      <CitizenMarkers 
        isVisible={true} 
        scale={scale}
        offset={offset}
        canvasWidth={canvasRef.current?.width || window.innerWidth}
        canvasHeight={canvasRef.current?.height || window.innerHeight}
        activeView={activeView}
      />
      
      {/* Resource Markers */}
      <ResourceMarkers 
        isVisible={activeView === 'resources'} 
        scale={scale}
        offset={offset}
        canvasWidth={canvasRef.current?.width || window.innerWidth}
        canvasHeight={canvasRef.current?.height || window.innerHeight}
      />

      {/* Building Markers - Renders DOM elements for buildings */}
      <BuildingMarkers
        isVisible={true} // BuildingMarkers are now potentially visible in all views
        scale={scale}
        offset={offset}
        canvasWidth={canvasRef.current?.width || window.innerWidth}
        canvasHeight={canvasRef.current?.height || window.innerHeight}
        activeView={activeView}
        buildings={buildings} // Pass the buildings data from IsometricViewer state
        buildingFilterMode={buildingFilterMode}
        getCurrentCitizenIdentifier={getCurrentCitizenIdentifier}
        financialAspect={buildingFinancialAspect}
        financialDataRange={financialDataRange}
        getFinancialAspectColor={getFinancialAspectColor}
        // getDefaultBuildingMarkerColor prop removed
        // citizens={citizens} // Pass citizens if needed for other purposes
      />
    
      {/* Contract Markers */}
      <ContractMarkers 
        isVisible={activeView === 'contracts'} 
        scale={scale}
        offset={offset}
        canvasWidth={canvasRef.current?.width || window.innerWidth}
        canvasHeight={canvasRef.current?.height || window.innerHeight}
      />
      
      {/* Problem Markers - visible in all views */}
      <ProblemMarkers 
        isVisible={true} 
        scale={scale}
        offset={offset}
        canvasWidth={canvasRef.current?.width || window.innerWidth}
        canvasHeight={canvasRef.current?.height || window.innerHeight}
        activeView={activeView}
      />
    
      {/* Add the hover tooltip */}
      <HoverTooltip />
      
      {/* Land Details Panel */}
      {showLandDetailsPanel && selectedPolygonId && (
        <LandDetailsPanel
          selectedPolygonId={selectedPolygonId}
          onClose={() => {
            setShowLandDetailsPanel(false);
            setSelectedPolygonId(null);
          }}
          polygons={polygons}
          landOwners={landOwners}
          visible={showLandDetailsPanel}
        />
      )}
      
      {/* Building Details Panel */}
      {showBuildingDetailsPanel && selectedBuildingId && (
        <BuildingDetailsPanel
          selectedBuildingId={selectedBuildingId}
          onClose={() => {
            setShowBuildingDetailsPanel(false);
            setSelectedBuildingId(null);
          }}
          visible={showBuildingDetailsPanel}
        />
      )}
      
      {/* Citizen Details Panel */}
      {showCitizenDetailsPanel && selectedCitizen ? (
        <CitizenDetailsPanel
          citizen={selectedCitizen}
          onClose={handleCloseCitizenDetailsPanel}
        />
      ) : null}
      
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
      
      {/* Land Group Legend - only visible in transport view */}
      {activeView === 'transport' && Object.keys(landGroups).length > 0 && (
        <div className="absolute top-20 right-20 bg-black/70 text-white px-3 py-2 rounded text-sm max-h-60 overflow-y-auto">
          <p className="font-bold mb-2">Land Groups</p>
          <div className="space-y-1">
            {Object.entries(landGroupColors).map(([groupId, color]) => (
              <div key={groupId} className="flex items-center">
                <div 
                  className="w-4 h-4 mr-2 rounded-sm" 
                  style={{ backgroundColor: color }}
                ></div>
                <span>{groupId}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Public Dock Legend - only visible in transport view */}
      {activeView === 'transport' && (
        <div className="absolute top-20 left-20 bg-black/70 text-white px-3 py-2 rounded text-sm pointer-events-none">
          <p className="font-bold mb-2">Legend</p>
          <div className="flex items-center mb-1">
            <div className="w-4 h-4 mr-2 border-2 border-orange-500"></div>
            <span>Land with Public Dock</span>
          </div>
          <div className="flex items-center mb-1">
            <div className="w-4 h-4 mr-2 bg-blue-500 rounded-full"></div>
            <span>Dock Point</span>
          </div>
          {/* Add water point to legend */}
          <div className="flex items-center">
            <div className="w-3 h-3 mr-2 bg-blue-400 rounded-full opacity-60"></div>
            <span>Water Point</span>
          </div>
        </div>
      )}
      
      {/* Water Point Count - only visible in transport view */}
      {activeView === 'transport' && fullWaterGraphData && fullWaterGraphData.waterPoints && fullWaterGraphData.waterPoints.length > 0 && (
        <div className="absolute bottom-64 left-20 bg-black/70 text-white px-3 py-1 rounded text-xs">
          {fullWaterGraphData.waterPoints.length} water points loaded
        </div>
      )}
    
      
      {/* Building Color Mode Toggle and Filter Toggle */}
      <div className="absolute bottom-4 left-4 bg-black/70 text-white p-3 rounded-lg shadow-lg flex flex-col space-y-3">
        {activeView === 'buildings' && (
          <div className="flex items-center space-x-2">
            <label htmlFor="financial-aspect-select" className="text-sm">Color by:</label>
            <select
              id="financial-aspect-select"
              value={buildingFinancialAspect}
              onChange={(e) => setBuildingFinancialAspect(e.target.value as 'default' | 'lease' | 'rent' | 'wages')}
              className="bg-gray-800 text-white p-1 rounded text-sm border border-amber-500 focus:ring-amber-400 focus:border-amber-400"
            >
              <option value="default">Default</option>
              <option value="lease">Lease Price</option>
              <option value="rent">Rent Price</option>
              <option value="wages">Wages</option>
            </select>
          </div>
        )}
        <div className="flex items-center space-x-2">
          <span className="text-sm">Show:</span>
          <button 
            onClick={() => setBuildingFilterMode(buildingFilterMode === 'city' ? 'me' : 'city')}
            className={`px-3 py-1 rounded text-white text-sm ${
              buildingFilterMode === 'me' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-rose-700 hover:bg-rose-600'
            }`}
          >
            {buildingFilterMode === 'city' ? 'All Buildings' : 'My Buildings'}
          </button>
        </div>
      </div>
      
      {/* Loading indicator */}
      <div 
        className={`absolute inset-0 flex flex-col items-center justify-center z-50 bg-black/95 transition-opacity duration-1000 ease-in-out ${
          loading ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {currentLoadingImage && (
          <img
            src={currentLoadingImage}
            alt="Venetian vista during loading"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl mb-6 border-4 border-amber-600/50"
          />
        )}
        <div className="bg-black/60 p-6 rounded-lg shadow-xl border-2 border-amber-500/70 text-center">
          <p className="text-3xl font-serif text-amber-100 animate-pulse mb-4">Bringing Venice Afloat...</p>
          {currentLoadingTip && (
            <p className="text-sm font-sans text-amber-200 max-w-md">
              {currentLoadingTip}
            </p>
          )}
        </div>
      </div>
      
      {/* Debug button for citizen images */}
      {activeView === 'citizens' && (
        <button
          onClick={async () => {
            console.log('Checking citizen images...');
            try {
              const response = await fetch('/api/check-citizen-images');
              const data = await response.json();
              console.log('Citizen images check result:', data);
              
              // Also check a few specific citizen images
              if (citizensList.length > 0) {
                console.log('Checking specific citizen images...');
                for (let i = 0; i < Math.min(3, citizensList.length); i++) {
                  const citizen = citizensList[i];
                  
                  // Try multiple possible paths for each citizen
                  const urlsToTry = [
                    citizen.ImageUrl,
                    `https://backend.serenissima.ai/public_assets/images/citizens/${citizen.CitizenId}.jpg`,
                    `https://backend.serenissima.ai/public_assets/images/citizens/${citizen.CitizenId}.png`,
                    `https://backend.serenissima.ai/public_assets/images/citizens/default.jpg`
                  ].filter(Boolean); // Remove any undefined/null values
                  
                  console.log(`URLs to try for citizen ${citizen.CitizenId}:`, urlsToTry);
                  
                  for (const url of urlsToTry) {
                    try {
                      const imgResponse = await fetch(url, { method: 'HEAD' });
                      console.log(`Image check for ${citizen.CitizenId}: ${url} - ${imgResponse.ok ? 'EXISTS' : 'NOT FOUND'} (${imgResponse.status})`);
                      if (imgResponse.ok) break; // Stop checking if we found a working URL
                    } catch (error) {
                      console.error(`Error checking image for ${citizen.CitizenId} at ${url}:`, error);
                    }
                  }
                }
              }
              
              alert(`Citizen images directory exists: ${data.directoryExists}\nTotal image files: ${data.imageFiles}\nDefault image exists: ${data.defaultImageExists}`);
            } catch (error) {
              console.error('Error checking citizen images:', error);
              alert(`Error checking citizen images: ${error instanceof Error ? error.message : String(error)}`);
            }
          }}
          className="absolute bottom-20 right-4 bg-red-600 text-white px-3 py-1 rounded text-sm"
        >
          Debug Images
        </button>
      )}
      
      {/* Transport Mode UI - Moved to bottom left */}
      {activeView === 'transport' && (
        <>
          {transportMode && (
            <button
              onClick={() => setTransportMode(false)}
              className="absolute bottom-4 left-20 bg-red-600 text-white px-3 py-1 rounded text-sm"
            >
              Exit Transport Mode
            </button>
          )}
          
          {/* Pathfinding mode toggle - always visible in transport view */}
          <div className="absolute bottom-16 left-20 bg-black/70 text-white p-3 rounded-lg shadow-lg">
            <div className="flex items-center space-x-2">
              <span className="text-sm">Pathfinding Mode:</span>
              <button 
                onClick={togglePathfindingMode}
                className={`px-3 py-1 rounded text-white ${
                  pathfindingMode === 'real' 
                    ? 'bg-green-600 hover:bg-green-500' 
                    : 'bg-rose-700 hover:bg-rose-600'
                }`}
              >
                {pathfindingMode === 'real' ? 'Real Infrastructure' : 'All Points'}
              </button>
            </div>
          </div>
          
          {/* Transport Mode Toggle - always visible in transport view */}
          <button
            onClick={() => {
              console.log('Manually toggling transport mode from:', transportMode);
              setTransportMode(!transportMode);
              if (!transportMode) {
                setTransportStartPoint(null);
                setTransportEndPoint(null);
                setTransportPath([]);
                // If currently in water point mode, switch to normal mode
                if (interactionMode === 'place_water_point') {
                  setInteractionMode('normal');
                }
              }
              console.log('Transport mode toggled to:', !transportMode);
            }}
            className="absolute bottom-28 left-20 bg-rose-700 hover:bg-rose-600 text-white px-3 py-1 rounded text-sm"
          >
            {transportMode ? 'Disable Transport Mode' : 'Enable Transport Mode'}
          </button>
          
          {/* Water Route Cancel Button - only visible when creating a route for ConsiglioDeiDieci */}
          {activeView === 'transport' && interactionMode === 'create_water_route' && waterRouteStartPoint && isUserConsiglioDeiDieci && (
            <button
              onClick={() => {
                console.log('Canceling water route creation');
                setWaterRouteStartPoint(null);
                setWaterRouteEndPoint(null);
                setWaterRouteIntermediatePoints([]);
                setWaterRoutePath([]);
              }}
              className="absolute bottom-76 left-20 bg-red-600 text-white px-3 py-1 rounded text-sm flex items-center"
              style={{ bottom: '76px' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel Route
            </button>
          )}
          
          {/* Water Route Status - only visible in water route mode for ConsiglioDeiDieci */}
          {activeView === 'transport' && interactionMode === 'create_water_route' && isUserConsiglioDeiDieci && (
            <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded text-sm">
              {!waterRouteStartPoint ? (
                <span>Click on a water point to start the route</span>
              ) : !waterRouteEndPoint ? (
                <span>
                  <span className="text-blue-400">Start point selected.</span> Click on water to add waypoints or click on another water point to complete the route.
                </span>
              ) : (
                <span>Route completed! Length: {Math.round(calculateTotalDistance(waterRoutePath))}m</span>
              )}
            </div>
          )}
        </>
      )}
      
      {/* Interaction Mode Dropdown - Visible for ConsiglioDeiDieci */}
      {isUserConsiglioDeiDieci && (activeView === 'buildings' || activeView === 'transport') && (
        <div className="absolute bottom-52 left-20 bg-black/70 text-white p-2 rounded-lg shadow-lg flex items-center space-x-2">
          <label htmlFor="interaction-mode-select" className="text-sm font-serif">Mode:</label>
          <select
            id="interaction-mode-select"
            value={interactionMode}
            onChange={handleInteractionModeChange}
            className="bg-gray-800 text-white p-1 rounded text-sm border border-amber-500 focus:ring-amber-400 focus:border-amber-400"
          >
            <option value="normal">Normal</option>
            {activeView === 'buildings' && (
              <option value="orient_bridge">Orient Bridge</option>
            )}
            {activeView === 'transport' && (
              <>
                <option value="place_water_point">Place Water Point</option>
                <option value="create_water_route">Create Water Route</option>
              </>
            )}
          </select>
        </div>
      )}
      
      {/* Transport Path Info Panel */}
      {activeView === 'transport' && pathStats && (
        <div className="absolute bottom-4 right-4 bg-black/70 text-white p-3 rounded-lg shadow-lg w-64">
          <h4 className="text-md font-serif text-amber-400 mb-2 border-b border-amber-500 pb-1">Path Information</h4>
          <div className="space-y-1 text-sm">
            <p><strong>Distance:</strong> {pathStats.totalDistance < 1000 ? `${Math.round(pathStats.totalDistance)}m` : `${(pathStats.totalDistance / 1000).toFixed(2)}km`}</p>
            <p> (🚶 {pathStats.walkingDistance < 1000 ? `${Math.round(pathStats.walkingDistance)}m` : `${(pathStats.walkingDistance / 1000).toFixed(2)}km`} | 🛶 {pathStats.waterDistance < 1000 ? `${Math.round(pathStats.waterDistance)}m` : `${(pathStats.waterDistance / 1000).toFixed(2)}km`})</p>
            <p><strong>Est. Time:</strong> {pathStats.estimatedTimeMinutes} min</p>
            <p><strong>Est. Cost:</strong> {pathStats.transportCost > 0 ? `${pathStats.transportCost.toFixed(2)} Ducats` : 'N/A (Walking)'}</p>
          </div>
        </div>
      )}

      {/* Transport Debug Panel - Only render when showTransportDebugPanel is true */}
      {showTransportDebugPanel && (
        <TransportDebugPanel 
          visible={showTransportDebugPanel}
          onClose={handleTransportDebugPanelClose}
        />
      )}
      
      {/* Problem Details Panel */}
      {showProblemDetailsPanel && selectedProblemId && (
        <ProblemDetailsPanel
          problemId={selectedProblemId}
          onClose={() => {
            setShowProblemDetailsPanel(false);
            setSelectedProblemId(null);
          }}
        />
      )}

      {/* Building Creation Panel */}
      {showBuildingCreationPanel && selectedPointForCreation && (
        <BuildingCreationPanel
          selectedPoint={selectedPointForCreation}
          onClose={() => {
            setShowBuildingCreationPanel(false);
            setSelectedPointForCreation(null);
          }}
          onBuild={(buildingType, point, cost) => {
            // Handle the build action
            console.log(`Build ${buildingType} at ${point.lat},${point.lng} on polygon ${point.polygonId} (type: ${point.pointType}) for ${cost} ducats`);
            // Here you would typically call an API to create the building
            // For now, just close the panel
            setShowBuildingCreationPanel(false);
            setSelectedPointForCreation(null);
            // Potentially refresh buildings data or add the new building optimistically
            eventBus.emit(EventTypes.BUILDING_PLACED, { type: buildingType, position: {lat: point.lat, lng: point.lng}, polygonId: point.polygonId });
          }}
        />
      )}

      {/* Building Creation Panel */}
      {showBuildingCreationPanel && selectedPointForCreation && (
        <BuildingCreationPanel
          selectedPoint={selectedPointForCreation}
          onClose={() => {
            setShowBuildingCreationPanel(false);
            setSelectedPointForCreation(null);
          }}
          onBuild={(buildingType, point, cost) => {
            // Handle the build action
            console.log(`Build ${buildingType} at ${point.lat},${point.lng} on polygon ${point.polygonId} (type: ${point.pointType}) for ${cost} ducats`);
            // Here you would typically call an API to create the building
            // For now, just close the panel
            setShowBuildingCreationPanel(false);
            setSelectedPointForCreation(null);
            // Potentially refresh buildings data or add the new building optimistically
            eventBus.emit(EventTypes.BUILDING_PLACED, { type: buildingType, position: {lat: point.lat, lng: point.lng}, polygonId: point.polygonId });
          }}
        />
      )}
    </div>
  );
}
