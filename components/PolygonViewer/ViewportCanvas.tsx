'use client';

import { useEffect, useRef, useState } from 'react';
import { CoordinateService } from '@/lib/services/CoordinateService';
import { RenderService } from '@/lib/services/RenderService';
import { InteractionService } from '@/lib/services/InteractionService';
import { DataService } from '@/lib/services/DataService';
import { BuildingService } from '@/lib/services/BuildingService';
import { TransportService } from '@/lib/services/TransportService';
import { CitizenService } from '@/lib/services/CitizenService';
import { IncomeService } from '@/lib/services/IncomeService';
import { ViewportService } from '@/lib/services/ViewportService';
import { UIStateService } from '@/lib/services/UIStateService';
import { AssetService } from '@/lib/services/AssetService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { throttle } from '@/lib/utils/performanceUtils';

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
  const [polygonsToRender, setPolygonsToRender] = useState<{
    polygon: any;
    coords: {x: number, y: number}[];
    fillColor: string;
    centroidX: number;
    centroidY: number;
    centerX: number;
    centerY: number;
  }[]>([]);
  const [incomeData, setIncomeData] = useState<Record<string, number>>({});
  const [minIncome, setMinIncome] = useState<number>(0);
  const [maxIncome, setMaxIncome] = useState<number>(1000);
  const [incomeDataLoaded, setIncomeDataLoaded] = useState<boolean>(false);
  const [citizens, setCitizens] = useState<any[]>([]);
  const [citizensByBuilding, setCitizensByBuilding] = useState<Record<string, any[]>>({});
  const [citizensLoaded, setCitizensLoaded] = useState<boolean>(false);
  const [transportMode, setTransportMode] = useState<boolean>(false);
  const [transportPath, setTransportPath] = useState<any[]>([]);
  const [waterOnlyMode, setWaterOnlyMode] = useState<boolean>(false);
  
  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      try {
        // Load polygons
        const polygonsData = await DataService.prototype.loadPolygons();
        setPolygons(polygonsData);
        
        // Load buildings
        const buildingsData = await DataService.prototype.loadBuildings();
        setBuildings(buildingsData);
        
        // Load land owners
        const landOwnersData = await DataService.prototype.loadLandOwners();
        setLandOwners(landOwnersData);
        
        // Load users
        const usersData = await DataService.prototype.loadUsers();
        setUsers(usersData);
        
        // Calculate empty building points
        const emptyPoints = DataService.prototype.getEmptyBuildingPoints(polygonsData, buildingsData);
        setEmptyBuildingPoints(emptyPoints);
        
        // Load income data if in land view
        if (activeView === 'land') {
          const incomeResult = await DataService.prototype.loadIncomeData();
          setIncomeData(incomeResult.incomeData);
          setMinIncome(incomeResult.minIncome);
          setMaxIncome(incomeResult.maxIncome);
          setIncomeDataLoaded(true);
        }
        
        // Load citizens if in citizens view
        if (activeView === 'citizens') {
          const citizensResult = await DataService.prototype.loadCitizens();
          setCitizens(citizensResult.citizens);
          setCitizensByBuilding(citizensResult.citizensByBuilding);
          setCitizensLoaded(true);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [activeView]);
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        
        // Redraw everything
        window.dispatchEvent(new Event('redraw'));
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // Handle mouse wheel for zooming
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      InteractionService.prototype.handleWheel(e, scale, onScaleChange);
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
  }, [scale, onScaleChange]);
  
  // Handle mouse events for panning
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Initialize interaction service
    const cleanup = InteractionService.prototype.initializeInteractions(
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
    
    // Handle mouse down for panning
    const handleMouseDown = (e: MouseEvent) => {
      InteractionService.prototype.handleMouseDown(
        e, 
        setIsDragging, 
        setDragStart
      );
    };
    
    // Handle mouse move for panning
    const handleMouseMove = (e: MouseEvent) => {
      InteractionService.prototype.handleMouseMove(
        e, 
        isDragging, 
        dragStart, 
        offset, 
        onOffsetChange, 
        setDragStart
      );
    };
    
    // Handle mouse up for panning
    const handleMouseUp = () => {
      InteractionService.prototype.handleMouseUp(setIsDragging);
    };
    
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      cleanup();
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeView, scale, offset, polygonsToRender, buildings, emptyBuildingPoints, citizensByBuilding, transportMode, polygons, onOffsetChange, isDragging, dragStart]);
  
  // Calculate polygons to render
  useEffect(() => {
    if (loading || !canvasRef.current || polygons.length === 0) return;
    
    const canvas = canvasRef.current;
    
    // Create local shorthand functions that use the current state values
    const isoX = (x: number, y: number) => CoordinateService.worldToScreen(
      x, y, scale, offset, canvas.width, canvas.height
    ).x;
    const isoY = (x: number, y: number) => CoordinateService.worldToScreen(
      x, y, scale, offset, canvas.width, canvas.height
    ).y;
    
    // Only recalculate polygonsToRender when necessary components change
    const newPolygonsToRender = polygons.map(polygon => {
      if (!polygon.coordinates || polygon.coordinates.length < 3) return null;
      
      // Get polygon owner color or income-based color
      let fillColor = '#FFF5D0'; // Default sand color
      if (activeView === 'land') {
        if (incomeDataLoaded && polygon.id && incomeData[polygon.id] !== undefined) {
          // Use income-based color in land view ONLY if income data is loaded
          fillColor = this.getIncomeColor(incomeData[polygon.id]);
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
        // Convert to world coordinates
        const world = CoordinateService.latLngToWorld(coord.lat, coord.lng);
        
        // Convert to screen coordinates
        const screen = CoordinateService.worldToScreen(
          world.x, world.y, scale, offset, canvas.width, canvas.height
        );
        
        return {
          x: screen.x,
          y: screen.y
        };
      });
      
      // Use the polygon's center property if available, otherwise calculate centroid
      let centerX, centerY;
      
      if (polygon.center && polygon.center.lat && polygon.center.lng) {
        // Use the provided center
        const world = CoordinateService.latLngToWorld(polygon.center.lat, polygon.center.lng);
        const screen = CoordinateService.worldToScreen(
          world.x, world.y, scale, offset, canvas.width, canvas.height
        );
        
        centerX = screen.x;
        centerY = screen.y;
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
    const interactionState = InteractionService.prototype.getState();
    
    // Draw the scene using RenderService
    RenderService.prototype.drawScene(
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
  }, [polygonsToRender, buildings, emptyBuildingPoints, activeView, scale, offset, citizensByBuilding, citizensLoaded, transportPath, polygons, incomeData, loading, coatOfArmsImages]);
  
  // Use IncomeService for income color calculation
  const getIncomeColor = (income: number | undefined): string => {
    return IncomeService.prototype.getIncomeColor(income);
  };
  
  // Helper function to get building size based on type
  const getBuildingSize = (type: string): {width: number, height: number, depth: number} => {
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
  };
  
  // Helper function to get building color based on type
  const getBuildingColor = (type: string): string => {
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
  };

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full"
      style={{ cursor: InteractionService.prototype.getState()?.isDragging ? 'grabbing' : 'grab' }}
    />
  );
}
