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
      e.preventDefault();
      const delta = e.deltaY * -0.01;
      // Change the minimum zoom to 1.0 to allow one more level of unzoom
      // Keep the maximum zoom at 10.8
      const newScale = Math.max(1.0, Math.min(10.8, scale + delta));
      
      // Only trigger a redraw if the scale changed significantly
      if (Math.abs(newScale - scale) > 0.05) {
        onScaleChange(newScale);
        
        // Force a redraw with the new scale
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('scaleChanged', { 
            detail: { scale: newScale } 
          }));
        });
      }
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
    
    // Listen for drag events
    const handleDrag = (e: CustomEvent) => {
      const state = InteractionService.prototype.getState();
      if (state.isDragging) {
        const dx = e.detail.x - state.dragStart.x;
        const dy = e.detail.y - state.dragStart.y;
        
        onOffsetChange({ x: offset.x + dx, y: offset.y + dy });
        
        // Update drag start
        InteractionService.prototype.setState({
          dragStart: { x: e.detail.x, y: e.detail.y }
        });
      }
    };
    
    window.addEventListener(EventTypes.INTERACTION_DRAG as any, handleDrag);
    
    return () => {
      cleanup();
      window.removeEventListener(EventTypes.INTERACTION_DRAG as any, handleDrag);
    };
  }, [activeView, scale, offset, polygonsToRender, buildings, emptyBuildingPoints, citizensByBuilding, transportMode, polygons, onOffsetChange]);
  
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
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw water background
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Get interaction state
    const interactionState = InteractionService.prototype.getState();
    
    // Draw polygons
    polygonsToRender.forEach(({ polygon, coords, fillColor }) => {
      // Determine if this polygon is hovered or selected
      const isHovered = interactionState.hoveredPolygonId === polygon.id;
      const isSelected = interactionState.selectedPolygonId === polygon.id;
      
      // Draw the polygon
      RenderService.prototype.drawPolygon(ctx, coords, fillColor, isHovered, isSelected);
    });
    
    // Draw buildings
    buildings.forEach(building => {
      if (!building.position) return;
        
      // Get building position using BuildingService
      const worldPos = BuildingService.prototype.getBuildingPosition(building);
      if (!worldPos) return;
        
      // Convert world to screen coordinates
      const screen = CoordinateService.worldToScreen(
        worldPos.x, worldPos.y, scale, offset, canvas.width, canvas.height
      );
        
      // Get building size and color using BuildingService
      const size = BuildingService.prototype.getBuildingSize(building.type);
      const color = BuildingService.prototype.getBuildingColor(building.type);
        
      // Determine if this building is hovered or selected
      const isHovered = interactionState.hoveredBuildingId === building.id;
      const isSelected = interactionState.selectedBuildingId === building.id;
        
      // Determine the shape based on point_id or Point field
      const pointId = building.point_id || building.Point;
      let buildingShape: 'square' | 'circle' | 'triangle' = 'square'; // Default shape
        
      if (pointId) {
        if (typeof pointId === 'string') {
          if (pointId.startsWith('canal-') || pointId.includes('canal_')) {
            buildingShape = 'circle';
          } else if (pointId.startsWith('bridge-') || pointId.includes('bridge_')) {
            buildingShape = 'triangle';
          }
        }
      }
        
      // Draw the building
      const squareSize = Math.max(size.width, size.depth) * scale * 0.6;
      const typeIndicator = building.type.charAt(0).toUpperCase();
        
      RenderService.prototype.drawBuilding(
        ctx, screen.x, screen.y, squareSize, color, typeIndicator, isHovered, isSelected, buildingShape
      );
    });
    
    // Draw empty building points
    if (emptyBuildingPoints.length > 0) {
      emptyBuildingPoints.forEach(point => {
        // Convert lat/lng to world coordinates
        const world = CoordinateService.latLngToWorld(point.lat, point.lng);
        
        // Convert to screen coordinates
        const screen = CoordinateService.worldToScreen(
          world.x, world.y, scale, offset, canvas.width, canvas.height
        );
        
        // Check if mouse is over this building point
        const pointSize = activeView === 'buildings' ? 2.2 * scale : 1.8 * scale; // Smaller in non-buildings views
        const isHovered = 
          interactionState.mousePosition.x >= screen.x - pointSize && 
          interactionState.mousePosition.x <= screen.x + pointSize && 
          interactionState.mousePosition.y >= screen.y - pointSize && 
          interactionState.mousePosition.y <= screen.y + pointSize;
        
        // Draw a small circle for empty building points with even more subtle colors
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, pointSize, 0, Math.PI * 2);
    
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
    
    // Draw dock points and bridge points
    if (polygons.length > 0) {
      // Draw dock points with subtle styling
      polygons.forEach(polygon => {
        if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
          polygon.canalPoints.forEach((point: any) => {
            if (!point.edge) return;
            
            // Convert lat/lng to world coordinates
            const world = CoordinateService.latLngToWorld(point.edge.lat, point.edge.lng);
            
            // Convert to screen coordinates
            const screen = CoordinateService.worldToScreen(
              world.x, world.y, scale, offset, canvas.width, canvas.height
            );
            
            // Check if this point is hovered
            const isHovered = interactionState.hoveredCanalPoint && 
              Math.abs(interactionState.hoveredCanalPoint.lat - point.edge.lat) < 0.0001 && 
              Math.abs(interactionState.hoveredCanalPoint.lng - point.edge.lng) < 0.0001;
            
            // Draw a small, semi-transparent circle for dock points
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, 2 * scale, 0, Math.PI * 2);
            
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
            
            // Convert lat/lng to world coordinates
            const world = CoordinateService.latLngToWorld(point.edge.lat, point.edge.lng);
            
            // Convert to screen coordinates
            const screen = CoordinateService.worldToScreen(
              world.x, world.y, scale, offset, canvas.width, canvas.height
            );
            
            // Check if this point is hovered
            const isHovered = interactionState.hoveredBridgePoint && 
              Math.abs(interactionState.hoveredBridgePoint.lat - point.edge.lat) < 0.0001 && 
              Math.abs(interactionState.hoveredBridgePoint.lng - point.edge.lng) < 0.0001;
            
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
              screen.x - pointSize/2, 
              screen.y - pointSize/2, 
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
        const building = buildings.find(b => b.id === buildingId);
        if (!building || !building.position) return;
        
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
        
        // Convert lat/lng to world coordinates
        let worldX, worldY;
        if ('lat' in position && 'lng' in position) {
          const world = CoordinateService.latLngToWorld(position.lat, position.lng);
          worldX = world.x;
          worldY = world.y;
        } else if ('x' in position && 'z' in position) {
          worldX = position.x;
          worldY = position.z;
        } else {
          return;
        }
        
        // Convert world to screen coordinates
        const screen = CoordinateService.worldToScreen(
          worldX, worldY, scale, offset, canvas.width, canvas.height
        );
        
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
              fillColor = interactionState.hoveredCitizenBuilding === buildingId && interactionState.hoveredCitizenType === 'home'
                ? 'rgba(255, 215, 0, 0.9)' // Gold for nobility (hovered)
                : 'rgba(218, 165, 32, 0.8)'; // Gold for nobility
            } else if (baseClass.includes('cittadini')) {
              fillColor = interactionState.hoveredCitizenBuilding === buildingId && interactionState.hoveredCitizenType === 'home'
                ? 'rgba(70, 130, 180, 0.9)' // Blue for citizens (hovered)
                : 'rgba(70, 130, 180, 0.8)'; // Blue for citizens
            } else if (baseClass.includes('popolani')) {
              fillColor = interactionState.hoveredCitizenBuilding === buildingId && interactionState.hoveredCitizenType === 'home'
                ? 'rgba(205, 133, 63, 0.9)' // Brown for common people (hovered)
                : 'rgba(205, 133, 63, 0.8)'; // Brown for common people
            } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
              fillColor = interactionState.hoveredCitizenBuilding === buildingId && interactionState.hoveredCitizenType === 'home'
                ? 'rgba(128, 128, 128, 0.9)' // Gray for laborers (hovered)
                : 'rgba(128, 128, 128, 0.8)'; // Gray for laborers
            }
            
            // Draw a slightly larger marker with count
            ctx.beginPath();
            ctx.arc(screen.x - 15, screen.y, 25, 0, Math.PI * 2);
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = interactionState.hoveredCitizenBuilding === buildingId && interactionState.hoveredCitizenType === 'home'
              ? '#FFFF00'
              : '#FFFFFF';
            ctx.lineWidth = interactionState.hoveredCitizenBuilding === buildingId && interactionState.hoveredCitizenType === 'home' ? 3 : 2;
            ctx.stroke();
            
            // Add count
            ctx.font = 'bold 20px Arial';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(homeCitizens.length.toString(), screen.x - 15, screen.y);
            
            // Add home icon
            ctx.beginPath();
            ctx.arc(screen.x - 15 + 15, screen.y - 15, 10, 0, Math.PI * 2);
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
            const iconX = screen.x - 15 + 15;
            const iconY = screen.y - 15;
            
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
            RenderService.prototype.createCitizenMarker(
              ctx, 
              screen.x - 15, 
              screen.y, 
              homeCitizens[0], 
              'home', 
              20, 
              interactionState.hoveredCitizenBuilding === buildingId && interactionState.hoveredCitizenType === 'home'
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
              fillColor = interactionState.hoveredCitizenBuilding === buildingId && interactionState.hoveredCitizenType === 'work'
                ? 'rgba(255, 215, 0, 0.9)' // Gold for nobility (hovered)
                : 'rgba(218, 165, 32, 0.8)'; // Gold for nobility
            } else if (baseClass.includes('cittadini')) {
              fillColor = interactionState.hoveredCitizenBuilding === buildingId && interactionState.hoveredCitizenType === 'work'
                ? 'rgba(70, 130, 180, 0.9)' // Blue for citizens (hovered)
                : 'rgba(70, 130, 180, 0.8)'; // Blue for citizens
            } else if (baseClass.includes('popolani')) {
              fillColor = interactionState.hoveredCitizenBuilding === buildingId && interactionState.hoveredCitizenType === 'work'
                ? 'rgba(205, 133, 63, 0.9)' // Brown for common people (hovered)
                : 'rgba(205, 133, 63, 0.8)'; // Brown for common people
            } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
              fillColor = interactionState.hoveredCitizenBuilding === buildingId && interactionState.hoveredCitizenType === 'work'
                ? 'rgba(128, 128, 128, 0.9)' // Gray for laborers (hovered)
                : 'rgba(128, 128, 128, 0.8)'; // Gray for laborers
            }
            
            // Draw a slightly larger marker with count
            ctx.beginPath();
            ctx.arc(screen.x + 15, screen.y, 25, 0, Math.PI * 2);
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = interactionState.hoveredCitizenBuilding === buildingId && interactionState.hoveredCitizenType === 'work'
              ? '#FFFF00'
              : '#FFFFFF';
            ctx.lineWidth = interactionState.hoveredCitizenBuilding === buildingId && interactionState.hoveredCitizenType === 'work' ? 3 : 2;
            ctx.stroke();
            
            // Add count
            ctx.font = 'bold 20px Arial';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(workCitizens.length.toString(), screen.x + 15, screen.y);
            
            // Add work icon
            ctx.beginPath();
            ctx.arc(screen.x + 15 + 15, screen.y - 15, 10, 0, Math.PI * 2);
            ctx.fillStyle = '#e27a4b';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 10px Arial';
            ctx.fillText('W', screen.x + 15 + 15, screen.y - 15);
          } else {
            // Draw a single citizen marker
            RenderService.prototype.createCitizenMarker(
              ctx, 
              screen.x + 15, 
              screen.y, 
              workCitizens[0], 
              'work', 
              20, 
              interactionState.hoveredCitizenBuilding === buildingId && interactionState.hoveredCitizenType === 'work'
            );
          }
        }
      });
      
      // Add a legend for citizen markers
      const legendX = 20;
      const legendY = canvas.height - 100;
      
      // Home marker legend
      RenderService.prototype.createCitizenMarker(ctx, legendX + 15, legendY, { FirstName: 'H', LastName: 'M' }, 'home', 15);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '14px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Home', legendX + 40, legendY);
      
      // Work marker legend
      RenderService.prototype.createCitizenMarker(ctx, legendX + 15, legendY + 40, { FirstName: 'W', LastName: 'K' }, 'work', 15);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '14px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Work', legendX + 40, legendY + 40);
    }
    
    // Draw transport path if available
    if (transportPath.length > 0 && activeView === 'transport') {
      // First draw a subtle shadow/glow effect
      ctx.beginPath();

      // Start at the first point
      const firstPoint = transportPath[0];
      const firstWorld = CoordinateService.latLngToWorld(firstPoint.lat, firstPoint.lng);
      const firstScreen = CoordinateService.worldToScreen(
        firstWorld.x, firstWorld.y, scale, offset, canvas.width, canvas.height
      );

      ctx.moveTo(firstScreen.x, firstScreen.y);

      // Connect all points
      for (let i = 1; i < transportPath.length; i++) {
        const point = transportPath[i];
        const world = CoordinateService.latLngToWorld(point.lat, point.lng);
        const screen = CoordinateService.worldToScreen(
          world.x, world.y, scale, offset, canvas.width, canvas.height
        );

        ctx.lineTo(screen.x, screen.y);
      }

      // Style the path shadow
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 6 * scale;
      ctx.stroke();

      // Now draw segments with different colors based on transport mode
      for (let i = 0; i < transportPath.length - 1; i++) {
        const point1 = transportPath[i];
        const point2 = transportPath[i + 1];

        const world1 = CoordinateService.latLngToWorld(point1.lat, point1.lng);
        const world2 = CoordinateService.latLngToWorld(point2.lat, point2.lng);
        
        const screen1 = CoordinateService.worldToScreen(
          world1.x, world1.y, scale, offset, canvas.width, canvas.height
        );
        const screen2 = CoordinateService.worldToScreen(
          world2.x, world2.y, scale, offset, canvas.width, canvas.height
        );

        // For gondola paths, draw simple lines with distinctive color
        if (point1.transportMode === 'gondola') {
          // Draw a simple path for gondolas
          ctx.beginPath();
          ctx.moveTo(screen1.x, screen1.y);
          ctx.lineTo(screen2.x, screen2.y);
          
          // Venetian blue for water transport
          ctx.strokeStyle = 'rgba(0, 102, 153, 0.8)';
          ctx.lineWidth = 4 * scale;
          ctx.stroke();
        } else {
          // For walking paths, draw straight lines with texture
          ctx.beginPath();
          ctx.moveTo(screen1.x, screen1.y);
          ctx.lineTo(screen2.x, screen2.y);

          // Terracotta for walking paths
          ctx.strokeStyle = 'rgba(204, 85, 0, 0.8)';
          ctx.lineWidth = 4 * scale;
          ctx.stroke();

          // Add a subtle texture for walking paths
          ctx.beginPath();
          ctx.setLineDash([2 * scale, 2 * scale]);
          ctx.moveTo(screen1.x, screen1.y);
          ctx.lineTo(screen2.x, screen2.y);
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
        const world = CoordinateService.latLngToWorld(point.lat, point.lng);
        const screen = CoordinateService.worldToScreen(
          world.x, world.y, scale, offset, canvas.width, canvas.height
        );

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
        ctx.arc(screen.x, screen.y, nodeSize, 0, Math.PI * 2);
        ctx.fillStyle = nodeColor;
        ctx.fill();

        // Add a subtle white border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
  }, [polygonsToRender, buildings, emptyBuildingPoints, activeView, scale, offset, citizensByBuilding, citizensLoaded, transportPath, polygons, incomeData, loading]);
  
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
