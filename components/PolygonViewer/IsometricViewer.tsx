'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { debounce, throttle } from 'lodash';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { fetchCoatOfArmsImage } from '@/app/utils/coatOfArmsUtils';
import { buildingPointsService } from '@/lib/services/BuildingPointsService';
import { interactionService } from '@/lib/services/InteractionService';
import { hoverStateService } from '@/lib/services/HoverStateService';
import LandDetailsPanel from './LandDetailsPanel';
import BuildingDetailsPanel from './BuildingDetailsPanel';
import CitizenDetailsPanel from '../UI/CitizenDetailsPanel';
import CitizenMarkers from './CitizenMarkers';
import ResourceMarkers from './ResourceMarkers';
import MarketMarkers from './MarketMarkers';
import { HoverTooltip } from '../UI/HoverTooltip';
import TransportDebugPanel from '../UI/TransportDebugPanel';
import TransportErrorMessage from '../UI/TransportErrorMessage';

interface IsometricViewerProps {
  activeView: 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';
}

// Define a type for all possible view types to use throughout the component
type ViewType = 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';

export default function IsometricViewer({ activeView }: IsometricViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [polygons, setPolygons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [landOwners, setLandOwners] = useState<Record<string, string>>({});
  const [citizens, setCitizens] = useState<Record<string, any>>({});
  const [scale, setScale] = useState(3); // Start with a 3x zoom for a closer view
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // Add refs to track previous state
  const prevActiveView = useRef<ViewType | null>(null);
  const prevScale = useRef<number>(3);
  // Cache for rendered coat of arms to avoid redrawing
  const renderedCoatOfArmsCache = useRef<Record<string, {
    image: HTMLImageElement | null,
    x: number,
    y: number,
    size: number
  }>>({});
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
  const [coatOfArmsImages, setCoatOfArmsImages] = useState<Record<string, HTMLImageElement>>({});
  const [loadingCoatOfArms, setLoadingCoatOfArms] = useState<boolean>(false);
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
  const [showLandDetailsPanel, setShowLandDetailsPanel] = useState<boolean>(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [showBuildingDetailsPanel, setShowBuildingDetailsPanel] = useState<boolean>(false);
  const [mousePosition, setMousePosition] = useState<{x: number, y: number}>({ x: 0, y: 0 });
  const [buildingPositionsCache, setBuildingPositionsCache] = useState<Record<string, {x: number, y: number}>>({});
  const [initialPositionCalculated, setInitialPositionCalculated] = useState<boolean>(false);
  const [buildingColorMode, setBuildingColorMode] = useState<'type' | 'owner'>('type');
  const [showOnlyMyBuildings, setShowOnlyMyBuildings] = useState<boolean>(false);
  const [polygonsToRender, setPolygonsToRender] = useState<{
    polygon: any;
    coords: {x: number, y: number}[];
    fillColor: string;
    centroidX: number;
    centroidY: number;
    centerX: number;
    centerY: number;
  }[]>([]);
  const [emptyBuildingPoints, setEmptyBuildingPoints] = useState<{lat: number, lng: number}[]>([]);
  const [showTransportDebugPanel, setShowTransportDebugPanel] = useState<boolean>(false);
  
  // Add handler function for closing the transport debug panel
  const handleTransportDebugPanelClose = () => {
    setShowTransportDebugPanel(false);
  };
  
  // Add refs to track current state without causing re-renders
  const isDraggingRef = useRef<boolean>(false);

  
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
  
  // No replacement - removing hover state for dock and bridge points
  
  // Transport route planning state
  const [transportMode, setTransportMode] = useState<boolean>(false);
  const [transportStartPoint, setTransportStartPoint] = useState<{lat: number, lng: number} | null>(null);
  const [transportEndPoint, setTransportEndPoint] = useState<{lat: number, lng: number} | null>(null);
  const [transportPath, setTransportPath] = useState<any[]>([]);
  const [calculatingPath, setCalculatingPath] = useState<boolean>(false);
  const [waterOnlyMode, setWaterOnlyMode] = useState<boolean>(false);
  const [pathfindingMode, setPathfindingMode] = useState<'all' | 'real'>('real'); // Default to 'real' mode
  
  // Water point mode state
  const [waterPointMode, setWaterPointMode] = useState<boolean>(false);
  const [waterPoints, setWaterPoints] = useState<any[]>([]);
  
  // Water route mode state
  const [waterRouteMode, setWaterRouteMode] = useState<boolean>(false);
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

  // Function to fetch existing water points
  const fetchWaterPoints = useCallback(async () => {
    try {
      console.log('Fetching existing water points...');
      const response = await fetch('/api/water-points');
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.waterPoints)) {
          console.log(`Loaded ${data.waterPoints.length} water points`);
          setWaterPoints(data.waterPoints);
        } else {
          console.error('Invalid water points data format:', data);
        }
      } else {
        console.error(`Failed to fetch water points: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error fetching water points:', error);
    }
  }, []);

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
      
      // Add to local state first for immediate visual feedback
      setWaterPoints(prev => [...prev, newWaterPoint]);
      
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
    let totalDistance = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const pt1 = path[i];
      const pt2 = path[i + 1];
      totalDistance += calculateDistance(
        { lat: pt1.lat, lng: pt1.lng },
        { lat: pt2.lat, lng: pt2.lng }
      );
    }
    return totalDistance;
  }, []);
  
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
      
      // Update local state
      setWaterPoints(prevPoints => {
        return prevPoints.map(pt => {
          if (pt.id === waterRouteStartPoint.id) {
            return updatedStartPoint;
          }
          if (pt.id === waterRouteEndPoint.id) {
            return updatedEndPoint;
          }
          return pt;
        });
      });
      
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
      
      // Refresh water points
      fetchWaterPoints();
      
    } catch (error) {
      console.error('Error saving water route:', error);
      alert('Failed to save water route. Please try again.');
    }
  }, [waterRouteStartPoint, waterRouteEndPoint, waterRouteIntermediatePoints, waterRoutePath, calculateTotalDistance, fetchWaterPoints]);
  
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
      
      // Update local state
      setWaterPoints(prevPoints => {
        return prevPoints.map(pt => {
          if (pt.id === routeData.startPoint.id) {
            return updatedStartPoint;
          }
          if (pt.id === routeData.endPoint.id) {
            return updatedEndPoint;
          }
          return pt;
        });
      });
      
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
      
      // Refresh water points
      fetchWaterPoints();
      
    } catch (error) {
      console.error('Error saving water route:', error);
      alert('Failed to save water route. Please try again.');
    }
  }, [calculateTotalDistance, fetchWaterPoints]);
  
  // Function to handle water route clicks
  const handleWaterRouteClick = useCallback((point: {lat: number, lng: number}, isWaterPoint: boolean, waterPointId?: string) => {
    console.log('Water route click:', { point, isWaterPoint, waterPointId });
    
    // If clicked on a water point
    if (isWaterPoint && waterPointId) {
      // Find the water point in our state
      const clickedWaterPoint = waterPoints.find(wp => wp.id === waterPointId);
      if (!clickedWaterPoint) {
        console.error(`Water point with ID ${waterPointId} not found`);
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
  }, [waterPoints, waterRouteStartPoint, waterRouteEndPoint, waterRouteIntermediatePoints, saveWaterRouteWithData]);

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

  // Load polygons
  useEffect(() => {
    console.log('IsometricViewer: Starting to fetch polygons from API...');
    fetch('/api/get-polygons')
      .then(response => {
        console.log(`IsometricViewer: API response status: ${response.status} ${response.statusText}`);
        return response.json();
      })
      .then(data => {
        console.log(`IsometricViewer: API data received, polygons property exists: ${!!data.polygons}`);
        if (data.polygons) {
          console.log(`IsometricViewer: Setting ${data.polygons.length} polygons to state`);
          setPolygons(data.polygons);
          
          // Store in window for other components
          if (typeof window !== 'undefined') {
            console.log(`IsometricViewer: Setting window.__polygonData with ${data.polygons.length} polygons`);
            (window as any).__polygonData = data.polygons;
            
            // IMPORTANT: Import and directly initialize the transport service
            try {
              // Import the transport service just once
              const { transportService } = require('@/lib/services/TransportService');
              console.log('IsometricViewer: Directly initializing transport service with polygon data');
              
              // Use the imported service
              const success = transportService.initializeWithPolygonData(data.polygons);
              console.log(`IsometricViewer: Direct transport service initialization ${success ? 'succeeded' : 'failed'}`);
              
              // If direct initialization failed, try the setPolygonsData method as fallback
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
        setLoading(false);
      })
      .catch(error => {
        console.error('IsometricViewer: Error loading polygons:', error);
        setLoading(false);
      });
  }, []);
  

  // Handle transport mode activation
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
      
      // Set a small timeout to ensure view has changed before activating transport mode
      setTimeout(() => {
        setTransportMode(true);
        setTransportStartPoint(null);
        setTransportEndPoint(null);
        setTransportPath([]);
        console.log('Transport mode state set to:', true);
      }, 100);
    };
    
    const eventListener = () => handleShowTransportRoutes();
    window.addEventListener('showTransportRoutes', eventListener);
    
    // Add listener for transport route calculated events
    const handleTransportRouteCalculated = (event: CustomEvent) => {
      console.log('Transport route calculated event received in IsometricViewer:', event.detail);
      if (event.detail && event.detail.path) {
        visualizeTransportPath(event.detail.path);
      }
    };
    
    window.addEventListener('TRANSPORT_ROUTE_CALCULATED', handleTransportRouteCalculated as EventListener);
    
    return () => {
      window.removeEventListener('showTransportRoutes', eventListener);
      window.removeEventListener('TRANSPORT_ROUTE_CALCULATED', handleTransportRouteCalculated as EventListener);
    };
  }, [activeView, visualizeTransportPath]);

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
      fetchWaterPoints(); // Fetch water points when entering transport view
    }
  }, [transportMode, activeView, fetchLandGroups, fetchWaterPoints]);
  
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
              const updatedImages = {...coatOfArmsImages};
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
                    const urlsToTry = [
                      // 1. Use the URL from the API directly
                      url as string,
                      
                      // 2. Try with serenissima.ai domain
                      `https://serenissima.ai/coat-of-arms/${owner}.png`,
                      
                      // 3. Try with current origin as fallback
                      `${window.location.origin}/coat-of-arms/${owner}.png`,
                      
                      // 4. Default fallback
                      `${window.location.origin}/coat-of-arms/default.png`
                    ];
                    
                    // Try each URL in sequence
                    let imageLoaded = false;
                    for (const currentUrl of urlsToTry) {
                      if (imageLoaded) break;
                      
                      try {
                        const img = new Image();
                        img.crossOrigin = "anonymous"; // Important for CORS
                        
                        // Create a promise for this specific URL
                        await new Promise<void>((resolve, reject) => {
                          const timeoutId = setTimeout(() => {
                            reject(new Error(`Timeout loading image from ${currentUrl}`));
                          }, 5000); // 5 second timeout
                          
                          img.onload = () => {
                            clearTimeout(timeoutId);
                            // Resize the image using canvas before storing
                            const resizedImg = resizeImageToCanvas(img, 100);
                            updatedImages[owner] = resizedImg;
                            hasNewImages = true;
                            imageLoaded = true;
                            resolve();
                          };
                          img.onerror = () => {
                            clearTimeout(timeoutId);
                            reject(new Error(`Failed to load image from ${currentUrl}`));
                          };
                          img.src = currentUrl;
                        });
                      } catch (error) {
                        // Continue to next URL on error
                        console.warn(`Error loading coat of arms from ${currentUrl} for ${owner}:`, error);
                      }
                    }
                    
                    // If all URLs failed, create a default avatar
                    if (!imageLoaded) {
                      console.warn(`All image URLs failed for ${owner}, using generated avatar`);
                      const canvas = document.createElement('canvas');
                      canvas.width = 100;
                      canvas.height = 100;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        // Draw a colored circle with the owner's initial
                        createDefaultCircularAvatar(ctx, owner, 50, 50, 100);
                        const generatedImg = new Image();
                        generatedImg.src = canvas.toDataURL('image/png');
                        updatedImages[owner] = generatedImg;
                        hasNewImages = true;
                      }
                    }
                  } catch (error) {
                    console.error(`Error processing coat of arms for ${owner}:`, error);
                  }
                }
              }
              
              // Only update state if we have new images
              if (hasNewImages) {
                setCoatOfArmsImages(updatedImages);
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
  
  // Function to create a circular clipping of an image
  const createCircularImage = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, size: number) => {
    try {
      // Check if the image has loaded successfully
      if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
        console.warn(`Image not loaded properly, using default avatar instead`);
        // Use the default avatar as fallback
        createDefaultCircularAvatar(ctx, "Unknown", x, y, size);
        return;
      }
      
      // Save the current context state
      ctx.save();
      
      // Create a circular clipping path
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      
      // Add a white border around the circle
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Clip to the circle
      ctx.clip();
      
      // Since we've already resized the image to maintain aspect ratio,
      // we can draw it directly centered in the circle
      const drawX = x - img.width / 2;
      const drawY = y - img.height / 2;
      
      // Draw the pre-resized image
      ctx.drawImage(img, drawX, drawY);
      
      // Restore the context state
      ctx.restore();
    } catch (error) {
      console.error('Error drawing circular image:', error);
      // If drawing fails, use default avatar
      ctx.restore(); // Restore context before trying again
      createDefaultCircularAvatar(ctx, "Error", x, y, size);
    }
  };
  
  // Function to create a default circular avatar for owners without coat of arms
  const createDefaultCircularAvatar = (ctx: CanvasRenderingContext2D, owner: string, x: number, y: number, size: number) => {
    try {
      // Save the current context state
      ctx.save();
      
      // Generate a deterministic color based on the owner name
      const getColorFromString = (str: string): string => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Generate a hue between 0 and 360
        const hue = Math.abs(hash) % 360;
        
        // Use a fixed saturation and lightness for better visibility
        return `hsl(${hue}, 70%, 60%)`;
      };
      
      // Get a color based on the owner name
      const baseColor = getColorFromString(owner);
      
      // Draw a circular background
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = baseColor;
      ctx.fill();
      
      // Add a white border
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Add the owner's initials
      ctx.font = `bold ${size * 0.4}px Arial`;
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Get the first letter of the owner name, handle empty strings
      const initial = owner && owner.length > 0 ? owner.charAt(0).toUpperCase() : '?';
      ctx.fillText(initial, x, y);
      
      // Restore the context state
      ctx.restore();
    } catch (error) {
      console.error('Error creating default avatar:', error);
      
      // Absolute fallback - just draw a gray circle with a question mark
      try {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#888888';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = `bold ${size * 0.4}px Arial`;
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x, y);
        ctx.restore();
      } catch (e) {
        // If even this fails, just silently continue
        console.error('Critical error in fallback avatar rendering:', e);
      }
    }
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
  }, [activeView, loadCitizens]);
  
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
    if (citizensList.length > 0) {
      for (let i = 0; i < Math.min(5, citizensList.length); i++) {
        const citizen = citizensList[i];
        // Skip citizens without valid IDs
        if (!citizen || !citizen.citizenid) {
          console.warn('Skipping citizen without valid ID:', citizen);
          continue;
        }
        
        const citizenId = citizen.citizenid;
        const imageUrl = citizen.imageurl || `/images/citizens/${citizenId}.jpg`;
        
        // Try multiple possible paths for each citizen
        const urlsToTry = [
          imageUrl,
          `/images/citizens/${citizenId}.jpg`,
          `/images/citizens/${citizenId}.png`,
          `/images/citizens/default.jpg`
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
        }
        
        return newScale;
      });
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

  // Handle mouse events for panning
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleMouseDown = (e: MouseEvent) => {
      setIsDragging(true);
      isDraggingRef.current = true; // Update the ref
      setDragStart({ x: e.clientX, y: e.clientY });
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      // Use the ref value instead of the state
      if (!isDraggingRef.current) return;
      
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setDragStart({ x: e.clientX, y: e.clientY });
    };
    
    const handleMouseUp = () => {
      // Only update state if we're actually dragging
      if (isDraggingRef.current) {
        setIsDragging(false);
        isDraggingRef.current = false; // Update the ref
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
  }, [dragStart]); // Remove isDragging from dependencies

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
  const getIncomeColor = (income: number | undefined): string => {
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
  };
  
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
        waterPoints,
        waterPointMode,
        waterRouteMode,
        waterRouteStartPoint,
        waterRouteIntermediatePoints
      },
      {
        setMousePosition,
        setSelectedPolygonId,
        setShowLandDetailsPanel,
        setSelectedBuildingId,
        setShowBuildingDetailsPanel,
        setTransportStartPoint,
        setTransportEndPoint,
        setTransportPath,
        setSelectedCitizen,
        setShowCitizenDetailsPanel,
        calculateTransportRoute,
        findBuildingPosition,
        findPolygonIdForPoint,
        screenToLatLng,
        saveWaterPoint,
        handleWaterRouteClick
      }
    );
    
    // Return the cleanup function
    return cleanup;
  }, [
    activeView, 
    scale, 
    offset, 
    transportMode, 
    waterPointMode,
    waterRouteMode,
    waterRouteStartPoint,
    waterRouteIntermediatePoints,
    polygonsToRender, 
    buildings, 
    emptyBuildingPoints, 
    polygons, 
    citizensByBuilding,
    transportStartPoint,
    transportEndPoint,
    waterPoints,
    handleWaterRouteClick
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
        ctx.fillText('Calcolando il Percorso', centerX, centerY - 50);
        
        // Subtitle
        ctx.font = '16px "Times New Roman", serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('Trovando la via migliore attraverso i canali...', centerX, centerY - 10);
        
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
  
  // Function to create a citizen marker
  const createCitizenMarker = (
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    citizen: any,
    size: number = 20
  ) => {
    // Log the full citizen object for debugging
    console.log('Full citizen object in createCitizenMarker:', citizen);

    // Ensure we have the required properties for display
    // Try to extract data from various possible property names
    const firstName = citizen.FirstName || citizen.firstName || '';
    const lastName = citizen.LastName || citizen.lastName || '';
    const socialClass = citizen.SocialClass || citizen.socialClass || '';
    const citizenId = citizen.CitizenId || citizen.id;
    
    // Log citizen data for debugging with more details
    console.log(`Creating citizen marker for:`, {
      citizenId,
      name: `${firstName} ${lastName}`,
      imageUrl: citizen.ImageUrl || citizen.profileImage,
      socialClass,
      rawCitizen: citizen // Include the raw citizen object for debugging
    });

    // Determine color based on social class
    const getSocialClassColor = (socialClass: string): string => {
      const baseClass = socialClass?.toLowerCase() || '';
      
      // Base colors for different social classes
      if (baseClass.includes('nobili')) {
        // Gold/yellow for nobility
        return 'rgba(218, 165, 32, 0.8)';
      } else if (baseClass.includes('cittadini')) {
        // Blue for citizens
        return 'rgba(70, 130, 180, 0.8)';
      } else if (baseClass.includes('popolani')) {
        // Brown/amber for common people
        return 'rgba(205, 133, 63, 0.8)';
      } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
        // Gray for laborers
        return 'rgba(128, 128, 128, 0.8)';
      }
      
      // Default color if social class is unknown or not matched
      return 'rgba(100, 150, 255, 0.8)';
    };

    // Get color based on social class
    const fillColor = getSocialClassColor(socialClass);

    // Draw a circular background with color based on social class
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    
    // Add a white border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Add the citizen's initials
    ctx.font = `bold ${size * 0.6}px Arial`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Get the first letters of the first and last name
    const firstInitial = firstName.charAt(0).toUpperCase() || '?';
    const lastInitial = lastName.charAt(0).toUpperCase() || '?';
    ctx.fillText(firstInitial + lastInitial, x, y);
  };

  // Define isometric projection functions at the component level
  const calculateIsoX = (x: number, y: number, currentScale: number, currentOffset: {x: number, y: number}, canvasWidth: number) => {
    return x * currentScale + canvasWidth / 2 + currentOffset.x; // Correct east-west orientation
  };
  
  const calculateIsoY = (x: number, y: number, currentScale: number, currentOffset: {x: number, y: number}, canvasHeight: number) => {
    return (-y) * currentScale * 1.4 + canvasHeight / 2 + currentOffset.y; // Multiply by 1.4 to stretch vertically
  };

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
          // Use income-based color in land view ONLY if income data is loaded
          fillColor = getIncomeColor(incomeData[polygon.id]);
        } else if (polygon.id && landOwners[polygon.id]) {
          // Use owner color in land view
          const owner = landOwners[polygon.id];
          const citizen = citizens[owner];
          if (citizen && citizen.color) {
            fillColor = citizen.color;
          }
        }
      } 
      // Add land group coloring for transport view
      else if (activeView === 'transport' && polygon.id && landGroups[polygon.id]) {
        const groupId = landGroups[polygon.id];
        if (landGroupColors[groupId]) {
          fillColor = landGroupColors[groupId];
        }
      }
      // For other views, keep the default yellow color
    
      // Create local shorthand functions that use the current state values
      const localIsoX = (x: number, y: number) => calculateIsoX(x, y, scale, offset, canvasRef.current?.width || 0);
      const localIsoY = (x: number, y: number) => calculateIsoY(x, y, scale, offset, canvasRef.current?.height || 0);
    
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
      let centerX, centerY;
    
      if (polygon.center && polygon.center.lat && polygon.center.lng) {
        // Use the provided center
        const centerLat = polygon.center.lat;
        const centerLng = polygon.center.lng;
      
        // Convert center to isometric coordinates
        const x = (centerLng - 12.3326) * 20000;
        const y = (centerLat - 45.4371) * 20000;
      
        centerX = localIsoX(x, y);
        centerY = localIsoY(x, y);
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
        centerY: centerY,
        hasPublicDock        // Add this flag to identify polygons with public docks
      };
    }).filter(Boolean);
  }, [polygons, landOwners, citizens, activeView, scale, offset, incomeData, incomeDataLoaded, landGroups, landGroupColors]);

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
    
    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw water background
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  
    // Draw water points if in water point mode or transport view
    if ((waterPointMode || activeView === 'transport') && waterPoints.length > 0) {
      // Get the hovered water point ID from the hover state service
      const hoveredWaterPointId = hoverStateService.getHoveredWaterPointId();
      
      waterPoints.forEach(waterPoint => {
        if (!waterPoint.position) return;
        
        // Convert lat/lng to isometric coordinates
        const x = (waterPoint.position.lng - 12.3326) * 20000;
        const y = (waterPoint.position.lat - 45.4371) * 20000;
        
        const isoPos = {
          x: calculateIsoX(x, y, scale, offset, canvas.width),
          y: calculateIsoY(x, y, scale, offset, canvas.height)
        };
        
        // Check if this water point is hovered
        const isHovered = waterPoint.id === hoveredWaterPointId;
        
        // Draw a distinctive circle for water points - make them lighter in transport view
        ctx.beginPath();
        // Use a larger size for hovered water points
        const pointSize = isHovered ? 2 * scale : 1.25 * scale;
        ctx.arc(isoPos.x, isoPos.y, pointSize, 0, Math.PI * 2);
        
        // Use a more transparent color in transport view, unless hovered or in water route mode
        const opacity = isHovered || waterRouteMode ? 0.8 : 
                       (activeView === 'transport' && !waterPointMode) ? 0.4 : 0.8;
        ctx.fillStyle = isHovered ? 'rgba(0, 200, 255, 0.8)' : `rgba(0, 150, 255, ${opacity})`;
        ctx.fill();
      
        // Add a white border, more prominent when hovered
        ctx.strokeStyle = isHovered ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = isHovered ? 1 : 0.5;
        ctx.stroke();
        
        // Add a pulsing effect when hovered
        if (isHovered) {
          const pulseSize = 3 * scale * (0.8 + 0.2 * Math.sin(Date.now() / 300));
          ctx.beginPath();
          ctx.arc(isoPos.x, isoPos.y, pulseSize, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(0, 200, 255, 0.4)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          
          // Add tooltip for hovered water point in water route mode
          if (waterRouteMode) {
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
      
        // Draw connections if any
        if (waterPoint.connections && Array.isArray(waterPoint.connections)) {
          waterPoint.connections.forEach(connection => {
            // Find the target water point
            const targetPoint = waterPoints.find(wp => wp.id === connection.targetId);
            if (targetPoint && targetPoint.position) {
              // Check if this connection has intermediate points
              if (connection.intermediatePoints && connection.intermediatePoints.length > 0) {
                // Draw a path with intermediate points
                ctx.beginPath();
                ctx.moveTo(isoPos.x, isoPos.y);
                
                // Draw through each intermediate point
                for (const intPoint of connection.intermediatePoints) {
                  const intX = (intPoint.lng - 12.3326) * 20000;
                  const intY = (intPoint.lat - 45.4371) * 20000;
                  
                  const intIsoPos = {
                    x: calculateIsoX(intX, intY, scale, offset, canvas.width),
                    y: calculateIsoY(intX, intY, scale, offset, canvas.height)
                  };
                  
                  ctx.lineTo(intIsoPos.x, intIsoPos.y);
                }
                
                // Connect to the target point
                const targetX = (targetPoint.position.lng - 12.3326) * 20000;
                const targetY = (targetPoint.position.lat - 45.4371) * 20000;
                
                const targetIsoPos = {
                  x: calculateIsoX(targetX, targetY, scale, offset, canvas.width),
                  y: calculateIsoY(targetX, targetY, scale, offset, canvas.height)
                };
                
                ctx.lineTo(targetIsoPos.x, targetIsoPos.y);
                
                // Style the path
                const lineOpacity = activeView === 'transport' && !waterPointMode ? 0.3 : 0.6;
                ctx.strokeStyle = `rgba(0, 150, 255, ${lineOpacity})`;
                ctx.lineWidth = 0.5 * scale;
                ctx.stroke();
              } else {
                // Draw a direct line for connections without intermediate points
                const targetX = (targetPoint.position.lng - 12.3326) * 20000;
                const targetY = (targetPoint.position.lat - 45.4371) * 20000;
              
                const targetIsoPos = {
                  x: calculateIsoX(targetX, targetY, scale, offset, canvas.width),
                  y: calculateIsoY(targetX, targetY, scale, offset, canvas.height)
                };
              
                // Draw a line connecting the water points
                ctx.beginPath();
                ctx.moveTo(isoPos.x, isoPos.y);
                ctx.lineTo(targetIsoPos.x, targetIsoPos.y);
                // Use a more transparent color in transport view
                const lineOpacity = activeView === 'transport' && !waterPointMode ? 0.3 : 0.6;
                ctx.strokeStyle = `rgba(0, 150, 255, ${lineOpacity})`;
                ctx.lineWidth = 0.5 * scale;
                ctx.stroke();
              }
            }
          });
        }
      });
    }
    
    // Draw water route if in water route mode
    if (activeView === 'transport' && waterRouteMode && waterRoutePath.length > 0) {
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
      
      // Style the path
      ctx.strokeStyle = 'rgba(0, 150, 255, 0.8)';
      ctx.lineWidth = 2 * scale;
      ctx.stroke();
      
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

    // Now render in two passes: first the polygons, then the text
    // First pass: Draw all polygon shapes
    polygonsToRender.forEach(({ polygon, coords, fillColor, hasPublicDock }) => {
      // Draw polygon path
      ctx.beginPath();
      ctx.moveTo(coords[0].x, coords[0].y);
      for (let i = 1; i < coords.length; i++) {
        ctx.lineTo(coords[i].x, coords[i].y);
      }
      ctx.closePath();
      
      // Determine if this polygon is selected
      const isSelected = selectedPolygonId === polygon.id;
      
      // Apply different styles for selected state
      if (isSelected) {
        // Selected state: much brighter with a thicker border
        ctx.fillStyle = lightenColor(fillColor, 35); // Increased brightness for selection
        ctx.fill();
        ctx.strokeStyle = '#FF3300'; // Bright red-orange for selected
        ctx.lineWidth = 3.5;
      } else if (hasPublicDock) {
        // Public dock state: normal fill with orange border
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = '#FF8C00'; // Orange for lands with public docks
        ctx.lineWidth = 2.5;
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
    const filteredBuildings = filterBuildings();
    if (filteredBuildings.length > 0) {
      // Count how many buildings will be drawn
      const buildingsWithValidPosition = filteredBuildings.filter(building => {
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

      //console.log(`%c DRAWING BUILDINGS: ${buildingsWithValidPosition.length} of ${filteredBuildings.length} buildings have valid positions for drawing`, 'background: #9C27B0; color: white; padding: 4px 8px; font-weight: bold; border-radius: 4px;');
      
      // Get current citizen identifier
      const currentCitizen = getCurrentCitizenIdentifier();
      
      filteredBuildings.forEach(building => {
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
        
        // Determine color based on mode
        let color;
        if (buildingColorMode === 'type') {
          color = getBuildingColor(building.type);
        } else {
          // Use owner color
          color = getBuildingOwnerColor(building.owner || 'unknown');
        }
        
        // Determine if this building is selected
        const isSelected = selectedBuildingId !== null && selectedBuildingId === building.id;
        
        // Determine if this building is owned by the current citizen
        const isOwnedByCurrentCitizen = building.owner === currentCitizen;
        
        // Draw simple square for building with select state
        const squareSize = Math.max(size.width, size.depth) * scale * 0.6;
        
        // If owned by current citizen, draw a halo first
        if (isOwnedByCurrentCitizen) {
          ctx.beginPath();
          ctx.rect(
            isoPos.x - squareSize/2 - 3, 
            isoPos.y - squareSize/2 - 3, 
            squareSize + 6, 
            squareSize + 6
          );
          ctx.fillStyle = '#FF8C00'; // Orange halo instead of gold
          ctx.fill();
        }
        
        // Apply different styles for selected state
        if (isSelected) {
          // Selected state: much brighter with a thicker border
          ctx.fillStyle = lightenColor(color, 35); // Increased brightness for selection
          ctx.strokeStyle = '#FF3300'; // Bright red-orange for selected
          ctx.lineWidth = 3.5;
        } else {
          // Normal state
          ctx.fillStyle = color;
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
        }
        
        // Draw square for building (all buildings are now square)
        ctx.beginPath();
        ctx.rect(
          isoPos.x - squareSize/2, 
          isoPos.y - squareSize/2, 
          squareSize, 
          squareSize
        );
        ctx.fill();
        ctx.stroke();
        
        // Add a small indicator for the building type with fixed font size
        // Determine text color based on building color darkness
        const isDark = isColorDark(color);
        ctx.fillStyle = isDark ? '#FFFFFF' : '#000000'; // White text for dark backgrounds, black for light
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
    
    // Draw dock points and bridge points with consistent styling in all views
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
            
            // Draw a small, semi-transparent circle for dock points
            ctx.beginPath();
            ctx.arc(isoPos.x, isoPos.y, 2 * scale, 0, Math.PI * 2);
      
            // Use a subtle blue color with low opacity
            // Make points more visible in transport view, more subtle in other views
            const baseOpacity = activeView === 'transport' ? 0.6 : 0.15;
      
            ctx.fillStyle = `rgba(0, 120, 215, ${baseOpacity})`;
            ctx.fill();
      
            // Add a border
            ctx.strokeStyle = 'rgba(0, 120, 215, 0.4)';
            ctx.lineWidth = 0.5;
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
            
            // Draw a small, semi-transparent square for bridge points
            const pointSize = 2 * scale;
      
            // Use a subtle orange/brown color with low opacity
            // Make points more visible in transport view, more subtle in other views
            const baseOpacity = activeView === 'transport' ? 0.6 : 0.15;
      
            ctx.fillStyle = `rgba(180, 120, 60, ${baseOpacity})`;
            ctx.beginPath();
            ctx.rect(
              isoPos.x - pointSize/2, 
              isoPos.y - pointSize/2, 
              pointSize, 
              pointSize
            );
            ctx.fill();
      
            // Add a border
            ctx.strokeStyle = 'rgba(180, 120, 60, 0.4)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          });
        }
      });
      
      // Draw transport mode UI when active
      if (activeView === 'transport' && transportMode) {
        /**console.log('Drawing transport mode UI', { 
          transportStartPoint, 
          transportEndPoint, 
          mousePosition,
          activeView,
          transportMode
        });*/
        
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
        
        // Create local shorthand functions that use the current state values
        const localIsoX = (x: number, y: number) => calculateIsoX(x, y, scale, offset, canvas.width);
        const localIsoY = (x: number, y: number) => calculateIsoY(x, y, scale, offset, canvas.height);
        
        // Draw start point if set
        if (transportStartPoint) {
          const startX = (transportStartPoint.lng - 12.3326) * 20000;
          const startY = (transportStartPoint.lat - 45.4371) * 20000;
          
          const startScreenX = localIsoX(startX, startY);
          const startScreenY = localIsoY(startX, startY);
          
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
        if (transportEndPoint) {
          const endX = (transportEndPoint.lng - 12.3326) * 20000;
          const endY = (transportEndPoint.lat - 45.4371) * 20000;
          
          const endScreenX = localIsoX(endX, endY);
          const endScreenY = localIsoY(endX, endY);
          
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

          ctx.moveTo(localIsoX(firstX, firstY), localIsoY(firstX, firstY));

          // Connect all points
          for (let i = 1; i < transportPath.length; i++) {
            const point = transportPath[i];
            const x = (point.lng - 12.3326) * 20000;
            const y = (point.lat - 45.4371) * 20000;

            ctx.lineTo(localIsoX(x, y), localIsoY(x, y));
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
              ctx.moveTo(localIsoX(x1, y1), localIsoY(x1, y1));
              ctx.lineTo(localIsoX(x2, y2), localIsoY(x2, y2));
              
              // Venetian blue for water transport
              ctx.strokeStyle = 'rgba(0, 102, 153, 0.8)';
              ctx.lineWidth = 4 * scale;
              ctx.stroke();
            } else {
              // For walking paths, draw straight lines with texture
              ctx.beginPath();
              ctx.moveTo(localIsoX(x1, y1), localIsoY(x1, y1));
              ctx.lineTo(localIsoX(x2, y2), localIsoY(x2, y2));

              // Terracotta for walking paths
              ctx.strokeStyle = 'rgba(204, 85, 0, 0.8)';
              ctx.lineWidth = 4 * scale;
              ctx.stroke();

              // Add a subtle texture for walking paths
              ctx.beginPath();
              ctx.setLineDash([2 * scale, 2 * scale]);
              ctx.moveTo(localIsoX(x1, y1), localIsoY(x1, y1));
              ctx.lineTo(localIsoX(x2, y2), localIsoY(x2, y2));
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

            const screenX = localIsoX(x, y);
            const screenY = localIsoY(x, y);

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
          if (waterOnlyMode) {
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
          const fillColor = transportStartPoint 
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
          
        // Draw water point preview when in water point mode
        if (activeView === 'transport' && waterPointMode) {
          // Draw a circle at mouse position with water point styling
          ctx.beginPath();
          ctx.arc(mousePosition.x, mousePosition.y, 1.25 * scale, 0, Math.PI * 2);
            
          // Use a semi-transparent blue color
          ctx.fillStyle = 'rgba(0, 150, 255, 0.6)';
          ctx.fill();
            
          // Add a white border
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 0.5;
          ctx.stroke();
            
          // Add a pulsing effect to make it more noticeable
          const pulseSize = 3 * scale * (0.8 + 0.2 * Math.sin(Date.now() / 300));
          ctx.beginPath();
          ctx.arc(mousePosition.x, mousePosition.y, pulseSize, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(0, 150, 255, 0.4)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
            
          // Change cursor style to crosshair for better precision
          canvas.style.cursor = 'crosshair';
            
          // Show coordinates tooltip
          const latLng = screenToLatLng(
            mousePosition.x, 
            mousePosition.y, 
            scale, 
            offset, 
            canvas.width, 
            canvas.height
          );
            
          // Format coordinates to 6 decimal places
          const coordText = `${latLng.lat.toFixed(6)}, ${latLng.lng.toFixed(6)}`;
            
          // Draw tooltip background
          const textWidth = ctx.measureText(coordText).width;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(
            mousePosition.x + 15, 
            mousePosition.y - 10, 
            textWidth + 10, 
            20
          );
            
          // Draw tooltip text
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '12px Arial';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            coordText, 
            mousePosition.x + 20, 
            mousePosition.y
          );
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
        
        // Draw a small circle for empty building points with subtle colors
        const pointSize = activeView === 'buildings' ? 2.2 * scale : 1.8 * scale; // Smaller in non-buildings views
        ctx.beginPath();
        ctx.arc(isoPos.x, isoPos.y, pointSize, 0, Math.PI * 2);
  
        // Use a muted, earthy color that blends with the map
        // Make points more visible in buildings view, more subtle in other views
        const baseOpacity = activeView === 'buildings' ? 0.15 : 0.08;
      
        ctx.fillStyle = `rgba(160, 140, 120, ${baseOpacity})`;
        ctx.fill();
      });
    }
    
    // This section is now handled above with consistent styling across all views
    
    
  }, [loading, polygons, landOwners, citizens, activeView, buildings, scale, offset, incomeData, minIncome, maxIncome, selectedPolygonId, selectedBuildingId, emptyBuildingPoints, mousePosition, citizensLoaded, citizensByBuilding, incomeDataLoaded, polygonsToRender, getIncomeColor]);
  

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
    };
  }, []);
  
  // Listen for hover state changes
  useEffect(() => {
    const handleHoverStateChanged = (data: any) => {
      // Force a redraw of the canvas when hover state changes
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          // Import renderService directly here to ensure it's defined
          const { renderService } = require('@/lib/services/RenderService');
          
          // Get the current canvas dimensions
          const canvas = canvasRef.current;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Draw water background
          ctx.fillStyle = '#87CEEB';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Draw polygons with updated hover state
          renderService.drawPolygons(ctx, polygonsToRender, {
            selectedPolygonId,
            hoveredPolygonId: data.type === 'polygon' ? data.id : null
          });
          
          // Draw buildings with updated hover state
          if (buildings.length > 0) {
            renderService.drawBuildings(ctx, buildings, scale, offset, canvas.width, canvas.height, {
              selectedBuildingId,
              hoveredBuildingId: data.type === 'building' ? data.id : null
            });
          }
        }
      }
    };
    
    // Use a string literal for the event name instead of EventTypes.HOVER_STATE_CHANGED
    const subscription = eventBus.subscribe('HOVER_STATE_CHANGED', handleHoverStateChanged);
    
    return () => {
      // Use the subscription object's unsubscribe method
      subscription.unsubscribe();
    };
  }, [polygonsToRender, buildings, scale, offset, selectedPolygonId, selectedBuildingId]);

  // Helper function to get building size based on type
  function getBuildingSize(type: string): {width: number, height: number, depth: number} {
    switch(type.toLowerCase()) {
      case 'market-stall':
        return {width: 15, height: 15, depth: 15};
      case 'dock':
        return {width: 30, height: 5, depth: 30};
      case 'house':
        return {width: 20, height: 25, depth: 20};
      case 'workshop':
        return {width: 25, height: 20, depth: 25};
      case 'warehouse':
        return {width: 30, height: 20, depth: 30};
      case 'tavern':
        return {width: 25, height: 25, depth: 25};
      case 'church':
        return {width: 30, height: 50, depth: 30};
      case 'palace':
        return {width: 40, height: 40, depth: 40};
      default:
        return {width: 20, height: 20, depth: 20};
    }
  }

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
    
    // Special cases for common building types
    switch(type.toLowerCase()) {
      case 'market-stall':
        return '#E6C275'; // Warm gold/amber for market stalls
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

  // Function to get the current citizen's identifier
  const getCurrentCitizenIdentifier = useCallback(() => {
    try {
      // Try to get username from profile
      const profileStr = localStorage.getItem('citizenProfile');
      if (profileStr) {
        const profile = JSON.parse(profileStr);
        if (profile && profile.username) {
          return profile.username;
        }
      }
      
      // If no username in profile, fall back to wallet address from localStorage
      const walletAddress = localStorage.getItem('walletAddress');
      if (walletAddress) {
        return walletAddress;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting current citizen identifier:', error);
      return null;
    }
  }, []);
  
  // Function to filter buildings based on ownership
  const filterBuildings = useCallback(() => {
    if (!showOnlyMyBuildings) {
      return buildings; // Return all buildings if filter is off
    }
    
    // Get current citizen identifier
    const currentCitizen = getCurrentCitizenIdentifier();
    
    // Filter buildings to only show those owned by the current citizen
    return buildings.filter(building => building.owner === currentCitizen);
  }, [buildings, showOnlyMyBuildings, getCurrentCitizenIdentifier]);

  // Helper function to draw a building (simplified for 2D view)
  // This function is not currently used but kept for future reference
  const drawBuildingSquare = (
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    size: number,
    color: string,
    typeIndicator: string
  ): void => {
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
  };

  // Helper function to find which polygon contains this building point
  function findPolygonIdForPoint(point: {lat: number, lng: number}): string {
    for (const polygon of polygons) {
      if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
        // Check if this point is in the polygon's buildingPoints
        const found = polygon.buildingPoints.some((bp: any) => {
          const threshold = 0.0001; // Small threshold for floating point comparison
          return Math.abs(bp.lat - point.lat) < threshold && 
                 Math.abs(bp.lng - point.lng) < threshold;
        });
        
        if (found) {
          return polygon.id;
        }
      }
    }
    
    // If we can't find the exact polygon, try to find which polygon contains this point
    for (const polygon of polygons) {
      if (polygon.coordinates && polygon.coordinates.length > 2) {
        if (isPointInPolygonCoordinates(point, polygon.coordinates)) {
          return polygon.id;
        }
      }
    }
    
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
    console.log(`Lightening color ${color} by ${percent}%`);
    
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

  // Helper function to darken a color
  function darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    
    return '#' + (
      0x1000000 +
      (R > 0 ? (R < 255 ? R : 255) : 0) * 0x10000 +
      (G > 0 ? (G < 255 ? G : 255) : 0) * 0x100 +
      (B > 0 ? (B < 255 ? B : 255) : 0)
    ).toString(16).slice(1);
  }

  return (
    <div className="w-screen h-screen">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
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
    
      {/* Market Markers */}
      <MarketMarkers 
        isVisible={activeView === 'markets'} 
        scale={scale}
        offset={offset}
        canvasWidth={canvasRef.current?.width || window.innerWidth}
        canvasHeight={canvasRef.current?.height || window.innerHeight}
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
      {showCitizenDetailsPanel && selectedCitizen && (
        <CitizenDetailsPanel
          citizen={selectedCitizen}
          onClose={() => {
            setShowCitizenDetailsPanel(false);
            setSelectedCitizen(null);
          }}
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
      {activeView === 'transport' && waterPoints.length > 0 && (
        <div className="absolute bottom-64 left-20 bg-black/70 text-white px-3 py-1 rounded text-xs">
          {waterPoints.length} water points loaded
        </div>
      )}
      
      
      {/* Building Color Mode Toggle and My Buildings Filter */}
      <div className="absolute bottom-4 left-4 bg-black/70 text-white p-3 rounded-lg shadow-lg">
        <div className="flex flex-col space-y-2">
          <div className="flex items-center space-x-2">
            <span className="text-sm">Building Color:</span>
            <button 
              onClick={() => setBuildingColorMode(buildingColorMode === 'type' ? 'owner' : 'type')}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white"
            >
              {buildingColorMode === 'type' ? 'Type' : 'Owner'}
            </button>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="text-sm">Filter:</span>
            <button 
              onClick={() => setShowOnlyMyBuildings(!showOnlyMyBuildings)}
              className={`px-3 py-1 rounded text-white ${
                showOnlyMyBuildings ? 'bg-orange-600 hover:bg-orange-500' : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              {showOnlyMyBuildings ? 'My Buildings' : 'All Buildings'}
            </button>
          </div>
        </div>
      </div>
      
      {/* Loading indicator */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="bg-white p-4 rounded-lg shadow-lg">
            <p className="text-lg font-serif">Loading Venice...</p>
          </div>
        </div>
      )}
      
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
                    `/images/citizens/${citizen.CitizenId}.jpg`,
                    `/images/citizens/${citizen.CitizenId}.png`,
                    `/images/citizens/default.jpg`
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
                    : 'bg-blue-600 hover:bg-blue-500'
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
                // Disable water point mode when enabling transport mode
                if (waterPointMode) {
                  setWaterPointMode(false);
                }
              }
              console.log('Transport mode toggled to:', !transportMode);
            }}
            className="absolute bottom-28 left-20 bg-blue-600 text-white px-3 py-1 rounded text-sm"
          >
            {transportMode ? 'Disable Transport Mode' : 'Enable Transport Mode'}
          </button>
          
          {/* Water Point Mode Toggle - only visible in transport view */}
          <button
            onClick={() => {
              console.log('Toggling water point mode from:', waterPointMode);
              setWaterPointMode(!waterPointMode);
              if (transportMode) {
                // Disable transport mode when enabling water point mode
                setTransportMode(false);
              }
              if (waterRouteMode) {
                // Disable water route mode when enabling water point mode
                setWaterRouteMode(false);
              }
              // Load existing water points when enabling
              if (!waterPointMode) {
                fetchWaterPoints();
              }
            }}
            className={`absolute bottom-52 left-20 ${
              waterPointMode ? 'bg-blue-600' : 'bg-amber-600'
            } text-white px-3 py-1 rounded text-sm flex items-center`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12a8 8 0 01-8 8m0 0a8 8 0 01-8-8m8 8a8 8 0 018-8m-8 0a8 8 0 00-8 8m8-8v14m0-14v14" />
            </svg>
            {waterPointMode ? 'Disable Water Point Mode' : 'Enable Water Point Mode'}
          </button>
          
          {/* Water Route Mode Toggle - only visible in transport view */}
          {activeView === 'transport' && (
            <button
              onClick={() => {
                console.log('Toggling water route mode from:', waterRouteMode);
                setWaterRouteMode(!waterRouteMode);
                if (!waterRouteMode) {
                  // Reset water route state when enabling
                  setWaterRouteStartPoint(null);
                  setWaterRouteEndPoint(null);
                  setWaterRouteIntermediatePoints([]);
                  setWaterRoutePath([]);
                }
                // Disable other modes when enabling water route mode
                if (transportMode) {
                  setTransportMode(false);
                }
                if (waterPointMode) {
                  setWaterPointMode(false);
                }
                // Load existing water points when enabling
                if (!waterRouteMode) {
                  fetchWaterPoints();
                }
              }}
              className={`absolute bottom-64 left-20 ${
                waterRouteMode ? 'bg-blue-600' : 'bg-amber-600'
              } text-white px-3 py-1 rounded text-sm flex items-center`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              {waterRouteMode ? 'Finish Water Route' : 'Create Water Route'}
            </button>
          )}
          
          {/* Water Route Cancel Button - only visible when creating a route */}
          {activeView === 'transport' && waterRouteMode && waterRouteStartPoint && (
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
          
          {/* Water Route Status - only visible in water route mode */}
          {activeView === 'transport' && waterRouteMode && (
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
          
          {/* Transport Debug Button - Only visible in transport view */}
          {activeView === 'transport' && (
            <button
              onClick={() => setShowTransportDebugPanel(true)}
              className="absolute bottom-40 left-20 bg-amber-600 text-white px-3 py-1 rounded text-sm flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Transport Debug
            </button>
          )}
        </>
      )}
      
      {/* Transport Debug Panel - Only render when showTransportDebugPanel is true */}
      {showTransportDebugPanel && (
        <TransportDebugPanel 
          visible={showTransportDebugPanel}
          onClose={handleTransportDebugPanelClose}
        />
      )}
    </div>
  );
}
