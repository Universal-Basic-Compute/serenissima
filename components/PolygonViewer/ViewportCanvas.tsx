'use client';

import { useEffect, useRef, useState } from 'react';
import { dataService } from '@/lib/services/DataService';
import { viewportService } from '@/lib/services/ViewportService';
import { renderService } from '@/lib/services/RenderService';
import { interactionService } from '@/lib/services/InteractionService';
import { incomeService } from '@/lib/services/IncomeService';
import { transportService } from '@/lib/services/TransportService';
import { assetService } from '@/lib/services/AssetService';
import { uiStateService } from '@/lib/services/UIStateService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';

interface ViewportCanvasProps {
  activeView: 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';
  scale: number;
  offset: { x: number, y: number };
  onScaleChange: (newScale: number) => void;
  onOffsetChange: (newOffset: { x: number, y: number }) => void;
}

export default function ViewportCanvas({
  activeView,
  scale,
  offset,
  onScaleChange,
  onOffsetChange
}: ViewportCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [polygons, setPolygons] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [landOwners, setLandOwners] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<Record<string, any>>({});
  const [emptyBuildingPoints, setEmptyBuildingPoints] = useState<{lat: number, lng: number}[]>([]);
  const [polygonsToRender, setPolygonsToRender] = useState<any[]>([]);
  const [incomeData, setIncomeData] = useState<Record<string, number>>({});
  const [minIncome, setMinIncome] = useState<number>(0);
  const [maxIncome, setMaxIncome] = useState<number>(1000);
  const [incomeDataLoaded, setIncomeDataLoaded] = useState<boolean>(false);
  const [citizens, setCitizens] = useState<any[]>([]);
  const [citizensByBuilding, setCitizensByBuilding] = useState<Record<string, any[]>>({});
  const [citizensLoaded, setCitizensLoaded] = useState<boolean>(false);
  const [transportMode, setTransportMode] = useState<boolean>(false);
  const [transportPath, setTransportPath] = useState<any[]>([]);
  const [coatOfArmsImages, setCoatOfArmsImages] = useState<Record<string, HTMLImageElement>>({});
  const renderedCoatOfArmsCache = useRef<Record<string, {image: HTMLImageElement | null, x: number, y: number, size: number}>>({});
  
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
        
        // Load land owners
        const landOwnersData = await dataService.loadLandOwners();
        console.log('Loaded land owners data:', landOwnersData);
        setLandOwners(landOwnersData);
        
        // Load users
        const usersData = await dataService.loadUsers();
        setUsers(usersData);
        
        // Calculate empty building points
        const emptyPoints = dataService.getEmptyBuildingPoints(polygonsData, buildingsData);
        setEmptyBuildingPoints(emptyPoints);
        
        // Load income data if in land view
        if (activeView === 'land') {
          const incomeResult = await incomeService.loadIncomeData();
          // Check if incomeResult exists and is not null before accessing properties
          if (incomeResult && typeof incomeResult === 'object' && 'incomeData' in incomeResult) {
            setIncomeData(incomeResult.incomeData || {});
            setMinIncome(incomeResult.minIncome || 0);
            setMaxIncome(incomeResult.maxIncome || 1000);
            setIncomeDataLoaded(true);
          }
        }
        
        // Load citizens if in citizens view
        if (activeView === 'citizens') {
          const citizensResult = await dataService.loadCitizens();
          setCitizens(citizensResult.citizens);
          setCitizensByBuilding(citizensResult.citizensByBuilding);
          setCitizensLoaded(true);
        }
        
        // Load coat of arms images
        const ownerCoatOfArmsMap = await assetService.loadCoatOfArmsImages(landOwnersData);
        setCoatOfArmsImages(ownerCoatOfArmsMap);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
    
    // Subscribe to transport events
    const handleTransportModeChange = (data: any) => {
      setTransportMode(data.active);
    };
    
    const handleTransportPathChange = (data: any) => {
      setTransportPath(data.path || []);
    };
    
    eventBus.subscribe(EventTypes.TRANSPORT_MODE_CHANGED, handleTransportModeChange);
    eventBus.subscribe(EventTypes.TRANSPORT_PATH_CHANGED, handleTransportPathChange);
    
    const transportModeSubscription = eventBus.subscribe(EventTypes.TRANSPORT_MODE_CHANGED, handleTransportModeChange);
    const transportPathSubscription = eventBus.subscribe(EventTypes.TRANSPORT_PATH_CHANGED, handleTransportPathChange);
    
    return () => {
      transportModeSubscription.unsubscribe();
      transportPathSubscription.unsubscribe();
    };
  }, [activeView]);
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        
        // Clear the coat of arms cache when resizing
        renderedCoatOfArmsCache.current = {};
        
        // Redraw everything
        window.dispatchEvent(new Event('redraw'));
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial sizing
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // Handle mouse wheel for zooming
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const newScale = viewportService.handleZoom(e.deltaY * -0.01);
      onScaleChange(newScale);
    };
    
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel);
    }
    
    return () => {
      if (canvas) {
        canvas.removeEventListener('wheel', handleWheel);
      }
    };
  }, [onScaleChange]);
  
  // Handle mouse events for panning
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Initialize interaction handlers
    const handleMouseDown = (e: MouseEvent) => {
      viewportService.startPan(e.clientX, e.clientY);
      interactionService.setState({ isDragging: true });
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!interactionService.getState().isDragging) return;
      
      const newOffset = viewportService.updatePan(e.clientX, e.clientY);
      onOffsetChange(newOffset);
    };
    
    const handleMouseUp = () => {
      if (interactionService.getState().isDragging) {
        viewportService.endPan();
        interactionService.setState({ isDragging: false });
      }
    };
    
    // Update the interaction service with current data
    interactionService.updatePolygons(polygonsToRender);
    interactionService.updateBuildings(buildings);
    interactionService.updateEmptyBuildingPoints(emptyBuildingPoints);
    interactionService.updateCitizensByBuilding(citizensByBuilding);
    interactionService.updatePolygonsData(polygons);
    
    // Set up interaction service with all required dependencies
    const cleanup = interactionService.initializeInteractions(
      canvas,
      activeView,
      scale,
      offset,
      transportMode,
      polygonsToRender,
      buildings
    );
    
    // Subscribe to events from InteractionService
    const subscriptions = [
      eventBus.subscribe(EventTypes.POLYGON_SELECTED, (data) => {
        // Handle polygon selection
        if (data && data.polygonId) {
          console.log(`Polygon selected: ${data.polygonId}`);
        }
      }),
      eventBus.subscribe(EventTypes.BUILDING_SELECTED, (data) => {
        // Handle building selection
        if (data && data.buildingId) {
          console.log(`Building selected: ${data.buildingId}`);
        }
      }),
      eventBus.subscribe(EventTypes.CITIZEN_SELECTED, (citizen) => {
        // Handle citizen selection
        if (citizen) {
          console.log(`Citizen selected: ${citizen.FirstName} ${citizen.LastName}`);
        }
      }),
      eventBus.subscribe(EventTypes.BUILDING_POINT_SELECTED, (data) => {
        // Handle building point selection
        if (data && data.position) {
          console.log(`Building point selected at: ${data.position.lat}, ${data.position.lng}`);
        }
      }),
      eventBus.subscribe(EventTypes.TRANSPORT_POINT_SELECTED, (point) => {
        // Handle transport point selection
        if (point) {
          console.log(`Transport point selected at: ${point.lat}, ${point.lng}`);
          transportService.handlePointSelected(point);
        }
      })
    ];
    
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      // Clean up all event subscriptions
      subscriptions.forEach(sub => {
        if (sub && typeof sub.unsubscribe === 'function') {
          sub.unsubscribe();
        }
      });
      
      // Clean up interaction handlers
      cleanup();
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeView, scale, offset, transportMode, onOffsetChange]);
  
  // Add these effects to update the interaction service when data changes
  useEffect(() => {
    interactionService.updatePolygons(polygonsToRender);
  }, [polygonsToRender]);

  useEffect(() => {
    interactionService.updateBuildings(buildings);
  }, [buildings]);

  useEffect(() => {
    interactionService.updateEmptyBuildingPoints(emptyBuildingPoints);
  }, [emptyBuildingPoints]);

  useEffect(() => {
    interactionService.updateCitizensByBuilding(citizensByBuilding);
  }, [citizensByBuilding]);

  useEffect(() => {
    interactionService.updatePolygonsData(polygons);
  }, [polygons]);
  
  // Remove debugging for hover state changes
  
  // Calculate polygons to render
  useEffect(() => {
    if (loading || !canvasRef.current || polygons.length === 0) return;
    
    const canvas = canvasRef.current;
    
    // Only recalculate polygonsToRender when necessary components change
    const newPolygonsToRender = renderService.calculatePolygonsToRender(
      polygons,
      landOwners,
      users,
      scale,
      offset,
      canvas.width,
      canvas.height,
      activeView,
      incomeData,
      incomeDataLoaded
    );

    // Use deep comparison to avoid unnecessary state updates
    if (JSON.stringify(newPolygonsToRender) !== JSON.stringify(polygonsToRender)) {
      setPolygonsToRender(newPolygonsToRender);
    }
  }, [polygons, landOwners, users, scale, offset, activeView, incomeData, incomeDataLoaded, loading]);
  
  // Draw the canvas
  useEffect(() => {
    if (loading || !canvasRef.current || polygons.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size only if it has changed
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    
    // Get interaction state
    const interactionState = interactionService.getState();
    
    // Performance measurement
    const startTime = performance.now();
    
    // Draw the scene using RenderService
    renderService.drawScene({
      ctx,
      canvas,
      activeView,
      scale,
      offset,
      polygonsToRender,
      buildings,
      emptyBuildingPoints,
      interactionState,
      transportPath,
      polygons,
      incomeData,
      minIncome,
      maxIncome,
      citizensByBuilding,
      citizensLoaded,
      coatOfArmsImages,
      renderedCoatOfArmsCache: renderedCoatOfArmsCache.current
    });
    
    // Log performance metrics for debugging (only if rendering takes more than 16ms)
    const renderTime = performance.now() - startTime;
    if (renderTime > 16) {
      console.debug(`Scene rendering took ${renderTime.toFixed(2)}ms (${(1000/renderTime).toFixed(1)} fps)`);
    }
  }, [polygonsToRender, buildings, emptyBuildingPoints, activeView, scale, offset, citizensByBuilding, citizensLoaded, transportPath, polygons, incomeData, loading, coatOfArmsImages]);
  
  // Separate animation logic to prevent continuous re-renders
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationId: number;
    let isAnimating = interactionService.getState().isDragging;
    
    const animate = () => {
      // Only redraw if something has changed
      if (interactionService.getState().isDragging) {
        renderService.drawScene({
          ctx,
          canvas,
          activeView,
          scale,
          offset,
          polygonsToRender,
          buildings,
          emptyBuildingPoints,
          interactionState: interactionService.getState(),
          transportPath,
          polygons,
          incomeData,
          minIncome,
          maxIncome,
          citizensByBuilding,
          citizensLoaded,
          coatOfArmsImages,
          renderedCoatOfArmsCache: renderedCoatOfArmsCache.current
        });
      }
      
      animationId = requestAnimationFrame(animate);
    };
    
    animationId = requestAnimationFrame(animate);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [activeView]); // Only depend on activeView to avoid frequent re-creation

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full"
      style={{ cursor: interactionService.getState().isDragging ? 'grabbing' : 'grab' }}
    />
  );
}
