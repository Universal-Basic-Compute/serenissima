'use client';

import { useEffect, useRef, useState } from 'react';
import { dataService } from '@/lib/services/DataService';
import { viewportService } from '@/lib/services/ViewportService';
import { renderService } from '@/lib/services/RenderService';
import { interactionService } from '@/lib/services/InteractionService';
import { incomeService } from '@/lib/services/IncomeService';
import { transportService } from '@/lib/services/TransportService';
import { assetService } from '@/lib/services/AssetService';
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
          setIncomeData(incomeResult.incomeData);
          setMinIncome(incomeResult.minIncome);
          setMaxIncome(incomeResult.maxIncome);
          setIncomeDataLoaded(true);
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
    
    return () => {
      eventBus.unsubscribe(EventTypes.TRANSPORT_MODE_CHANGED, handleTransportModeChange);
      eventBus.unsubscribe(EventTypes.TRANSPORT_PATH_CHANGED, handleTransportPathChange);
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
    
    // Set up interaction service
    const cleanup = interactionService.initializeInteractions(
      canvas,
      activeView,
      scale,
      offset,
      polygonsToRender,
      buildings,
      emptyBuildingPoints,
      citizensByBuilding,
      transportMode,
      polygons
    );
    
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      cleanup();
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeView, scale, offset, polygonsToRender, buildings, emptyBuildingPoints, citizensByBuilding, transportMode, polygons, onOffsetChange]);
  
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

    // Update the polygonsToRender state
    setPolygonsToRender(newPolygonsToRender);
  }, [polygons, landOwners, users, scale, offset, activeView, incomeData, incomeDataLoaded, loading]);
  
  // Draw the canvas
  useEffect(() => {
    if (loading || !canvasRef.current || polygons.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Get interaction state
    const interactionState = interactionService.getState();
    
    // Draw the scene using RenderService
    renderService.drawScene(
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
      citizensByBuilding,
      citizensLoaded,
      coatOfArmsImages,
      renderedCoatOfArmsCache.current
    );
    
    // Request animation frame for smooth rendering
    const animationId = requestAnimationFrame(() => {
      // This empty requestAnimationFrame helps with smoother rendering
      // by ensuring the browser has time to process the previous frame
    });
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [polygonsToRender, buildings, emptyBuildingPoints, activeView, scale, offset, citizensByBuilding, citizensLoaded, transportPath, polygons, incomeData, loading, coatOfArmsImages]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full"
      style={{ cursor: interactionService.getState().isDragging ? 'grabbing' : 'grab' }}
    />
  );
}
