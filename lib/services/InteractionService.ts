/**
 * InteractionService
 * Handles mouse interactions for the isometric view
 */

import { CoordinateService } from './CoordinateService';
import { RenderService } from './RenderService';
import { eventBus, EventTypes } from '../utils/eventBus';
import { throttle, debounce } from '../utils/performanceUtils';
import { hoverStateService } from './HoverStateService';

export interface InteractionState {
  isDragging: boolean;
  dragStart: { x: number, y: number };
  selectedPolygonId: string | null;
  selectedBuildingId: string | null;
  mousePosition: { x: number, y: number };
  hoveredPolygonId?: string | null;
  hoveredBuildingId?: string | null;
  hoveredCanalPoint?: any;
  hoveredBridgePoint?: any;
  hoveredCitizenBuilding?: string | null;
  hoveredCitizenType?: string | null;
  waterPointMode?: boolean;
  isDraggingOrientBridge?: boolean; // New state for orienting bridge
}

type HoverType = 'none' | 'polygon' | 'building' | 'buildingPoint' | 'citizen' | 'canalPoint' | 'bridgePoint' | 'waterPoint';

export class InteractionService {
  private state: InteractionState = {
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    selectedPolygonId: null,
    selectedBuildingId: null,
    mousePosition: { x: 0, y: 0 },
    hoveredPolygonId: null,
    hoveredBuildingId: null,
    hoveredCanalPoint: null,
    hoveredBridgePoint: null,
    hoveredCitizenBuilding: null,
    hoveredCitizenType: null,
    isDraggingOrientBridge: false // Initialize new state
  };
  
  // Refs to track current state without causing re-renders
  private isDraggingRef: boolean = false;
  private hoveredPolygonIdRef: string | null = null;
  private hoveredBuildingIdRef: string | null = null;
  private hoveredCanalPointRef: any = null;
  private hoveredBridgePointRef: any = null;
  private hoveredCitizenBuildingRef: string | null = null;
  private hoveredCitizenTypeRef: string | null = null;
  private waterPointModeRef: boolean = false;
  private waterRouteModeRef: boolean = false;
  private isHoveringRef: boolean = false; // Track if we're currently hovering over something
  
  // Add these private properties to store data references
  private _polygonsToRender: any[] = [];
  private _buildings: any[] = [];
  private _emptyBuildingPoints: any[] = [];
  private _citizensByBuilding: Record<string, any[]> = {};
  private _polygons: any[] = [];

  /**
   * Handle mouse wheel for zooming
   */
  public handleWheel(
    e: WheelEvent,
    scale: number,
    onScaleChange: (newScale: number) => void
  ): void {
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
  }

  /**
   * Handle mouse down for panning
   */
  public handleMouseDown(
    e: MouseEvent,
    setIsDragging: (isDragging: boolean) => void,
    setDragStart: (dragStart: { x: number, y: number }) => void
  ): void {
    setIsDragging(true);
    this.isDraggingRef = true;
    this.state.isDragging = true;
    setDragStart({ x: e.clientX, y: e.clientY });
    this.state.dragStart = { x: e.clientX, y: e.clientY };
    
    // Emit event
    eventBus.emit(EventTypes.INTERACTION_MOUSE_DOWN, {
      x: e.clientX,
      y: e.clientY
    });
  }

  /**
   * Handle mouse move for panning
   */
  public handleMouseMove(
    e: MouseEvent,
    isDragging: boolean,
    dragStart: { x: number, y: number },
    offset: { x: number, y: number },
    setOffset: (offset: { x: number, y: number }) => void,
    setDragStart: (dragStart: { x: number, y: number }) => void
  ): void {
    if (!isDragging) return;
    
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    
    const newOffset = { x: offset.x + dx, y: offset.y + dy };
    setOffset(newOffset);
    setDragStart({ x: e.clientX, y: e.clientY });
    
    // Update state
    this.state.dragStart = { x: e.clientX, y: e.clientY };
    
    // Emit drag event
    eventBus.emit(EventTypes.INTERACTION_DRAG, {
      x: e.clientX,
      y: e.clientY,
      offset: newOffset
    });
  }

  /**
   * Handle mouse up for panning
   */
  public handleMouseUp(
    setIsDragging: (isDragging: boolean) => void
  ): void {
    if (this.isDraggingRef) {
      setIsDragging(false);
      this.isDraggingRef = false;
      this.state.isDragging = false;
      
      // Emit event
      eventBus.emit(EventTypes.INTERACTION_DRAG_END, null);
    }
  }

  /**
   * Update polygons to render
   */
  public updatePolygons(polygons: any[]): void {
    // Store reference without triggering state updates
    this._polygonsToRender = polygons;
  }

  /**
   * Update buildings data
   */
  public updateBuildings(buildings: any[]): void {
    // Store reference without triggering state updates
    this._buildings = buildings;
  }

  /**
   * Update empty building points
   */
  public updateEmptyBuildingPoints(points: any[]): void {
    // Store reference without triggering state updates
    this._emptyBuildingPoints = points;
  }

  /**
   * Update citizens by building
   */
  public updateCitizensByBuilding(citizensByBuilding: Record<string, any[]>): void {
    // Store reference without triggering state updates
    this._citizensByBuilding = citizensByBuilding;
  }

  /**
   * Update polygons data
   */
  public updatePolygonsData(polygons: any[]): void {
    // Store reference without triggering state updates
    this._polygons = polygons;
  }

  /**
   * Get polygons to render
   */
  public getPolygonsToRender(): any[] {
    return this._polygonsToRender;
  }

  /**
   * Get buildings
   */
  public getBuildings(): any[] {
    return this._buildings;
  }

  /**
   * Get empty building points
   */
  public getEmptyBuildingPoints(): any[] {
    return this._emptyBuildingPoints;
  }

  /**
   * Get citizens by building
   */
  public getCitizensByBuilding(): Record<string, any[]> {
    return this._citizensByBuilding;
  }

  /**
   * Get polygons data
   */
  public getPolygonsData(): any[] {
    return this._polygons;
  }

  /**
   * Initialize interaction handlers for a canvas
   */
  public initializeInteractions(
    canvas: HTMLCanvasElement,
    activeView: string,
    scale: number,
    offset: { x: number, y: number },
    transportMode: boolean,
    data: {
      polygonsToRender: any[];
      buildings: any[];
      emptyBuildingPoints: any[];
      polygons: any[];
      citizensByBuilding: Record<string, any[]>;
      transportStartPoint: any;
      transportEndPoint: any;
      waterPoints?: any[];
      waterPointMode?: boolean;
      waterRouteMode?: boolean;
      waterRouteStartPoint?: any;
      waterRouteIntermediatePoints?: any[];
      orientBridgeModeActive?: boolean;
      selectedBridgeForOrientationId?: string | null; // Add this
    },
    setters: {
      setMousePosition: (position: { x: number, y: number }) => void;
      setSelectedPolygonId: (id: string | null) => void;
      setShowLandDetailsPanel: (show: boolean) => void;
      setSelectedBuildingId: (id: string | null) => void;
      setShowBuildingDetailsPanel: (show: boolean) => void;
      setTransportStartPoint: (point: any) => void;
      setTransportEndPoint: (point: any) => void;
      setTransportPath: (path: any[]) => void;
      setSelectedCitizen: (citizen: any) => void;
      setShowCitizenDetailsPanel: (show: boolean) => void;
      calculateTransportRoute: (start: any, end: any) => void;
      findBuildingPosition: (buildingId: string) => {x: number, y: number} | null;
      findPolygonIdForPoint: (point: any) => string;
      screenToLatLng: (screenX: number, screenY: number, scale: number, offset: {x: number, y: number}, canvasWidth: number, canvasHeight: number) => {lat: number, lng: number};
      saveWaterPoint?: (point: {lat: number, lng: number}) => void;
      handleWaterRouteClick?: (point: {lat: number, lng: number}, isWaterPoint: boolean, waterPointId?: string) => void;
      // Callbacks for bridge orientation (setOrientBridgeModeActive removed)
      setSelectedBridgeForOrientationId: (id: string | null) => void;
      setOrientingBridgeAngle: (angle: number | null) => void;
      // Callbacks for opening BuildingCreationPanel
      onEmptyBuildingPointSelected?: (point: { lat: number; lng: number }, polygonId: string) => void;
      onCanalPointSelected?: (point: { lat: number; lng: number }, polygonId: string) => void;
      onBridgePointSelected?: (point: { lat: number; lng: number }, polygonId: string) => void;
    }
  ): () => void {
    
    // Store references to data without triggering state updates
    this._polygonsToRender = data.polygonsToRender;
    this._buildings = data.buildings;
    this._emptyBuildingPoints = data.emptyBuildingPoints;
    this._polygons = data.polygons;
    this._citizensByBuilding = data.citizensByBuilding;
    
    // Store water point mode reference
    this.waterPointModeRef = !!data.waterPointMode;
  
    // Store water route mode reference
    this.waterRouteModeRef = !!data.waterRouteMode;
    
    // Create throttled mouse move handler with increased throttle time
    const handleMouseMove = throttle((e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Update mouse position
      this.state.mousePosition = { x: mouseX, y: mouseY };
      setters.setMousePosition({ x: mouseX, y: mouseY });

      // If in orient bridge mode, a bridge is selected for orientation, and we are dragging it
      if (data.orientBridgeModeActive && data.selectedBridgeForOrientationId && this.state.isDraggingOrientBridge) {
        const selectedBuilding = data.buildings.find(b => b.id === data.selectedBridgeForOrientationId);
        if (selectedBuilding && selectedBuilding.position) {
          let buildingWorldPos;
          if (typeof selectedBuilding.position === 'string') {
            try {
              buildingWorldPos = JSON.parse(selectedBuilding.position);
            } catch (err) { console.error("Error parsing building position string", err); return; }
          } else {
            buildingWorldPos = selectedBuilding.position;
          }

          if (buildingWorldPos.lat && buildingWorldPos.lng) {
            const buildingScreenPos = CoordinateService.worldToScreen(
              (buildingWorldPos.lng - 12.3326) * 20000,
              (buildingWorldPos.lat - 45.4371) * 20000,
              scale, offset, canvas.width, canvas.height
            );
            
            const dx = this.state.mousePosition.x - buildingScreenPos.x;
            const dy = this.state.mousePosition.y - buildingScreenPos.y;
            const angle = Math.atan2(dy, dx);
            setters.setOrientingBridgeAngle(angle);
          }
        }
        return; // Don't process other interactions while orienting bridge
      }
      
      // Only process hover detection if we're not dragging
      if (!this.isDraggingRef) {
        // Create a stable hover state that doesn't change unless something meaningful changes
        let newHoverState = {
          type: 'none' as HoverType,
          id: null as string | null,
          data: null
        };
        
        let hoverDetected = false;
        
        // Check for polygon hover - ONLY in land view
        if (data.polygonsToRender && activeView === 'land') {
          for (const { polygon, coords } of data.polygonsToRender) {
            if (RenderService.prototype.isPointInPolygon(mouseX, mouseY, coords)) {
              newHoverState = {
                type: 'polygon',
                id: polygon.id,
                data: polygon
              };
              canvas.style.cursor = 'pointer';
              hoverDetected = true;
              break;
            }
          }
        }
        
        // Check for building hover if no polygon is hovered
        if (!hoverDetected && data.buildings) {
          for (const building of data.buildings) {
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
              x: CoordinateService.worldToScreen(x, y, scale, offset, canvas.width, canvas.height).x,
              y: CoordinateService.worldToScreen(x, y, scale, offset, canvas.width, canvas.height).y
            };
            
            // Get building size
            const size = this.getBuildingSize(building.type);
            const squareSize = Math.max(size.width, size.depth) * scale * 0.6;
            
            // Check if mouse is over this building with a small buffer
            if (
              mouseX >= isoPos.x - squareSize/2 - 2 && // Add 2px buffer
              mouseX <= isoPos.x + squareSize/2 + 2 && // Add 2px buffer
              mouseY >= isoPos.y - squareSize/2 - 2 && // Add 2px buffer
              mouseY <= isoPos.y + squareSize/2 + 2    // Add 2px buffer
            ) {
              newHoverState = {
                type: 'building',
                id: building.id,
                data: building
              };
              canvas.style.cursor = 'pointer';
              hoverDetected = true;
              break;
            }
          }
        }
      
      // Check for building point hover
      if (!hoverDetected && data.emptyBuildingPoints && activeView === 'buildings') {
        for (const point of data.emptyBuildingPoints) {
          // Convert lat/lng to isometric coordinates
          const x = (point.lng - 12.3326) * 20000;
          const y = (point.lat - 45.4371) * 20000;
          
          const world = { x, y };
          const screen = CoordinateService.worldToScreen(
            world.x, world.y, scale, offset, canvas.width, canvas.height
          );
          const isoPos = {
            x: screen.x,
            y: screen.y
          };
          
          // Add a larger buffer for building points to make hover more stable
          const pointSize = 2.8 * scale;
          const buffer = 4; // 4 pixel buffer for building points
          
          if (
            mouseX >= isoPos.x - pointSize - buffer && 
            mouseX <= isoPos.x + pointSize + buffer && 
            mouseY >= isoPos.y - pointSize - buffer && 
            mouseY <= isoPos.y + pointSize + buffer
          ) {
            const pointId = `point-${point.lat}-${point.lng}`;
            newHoverState = {
              type: 'buildingPoint',
              id: pointId,
              data: point
            };
            canvas.style.cursor = 'pointer';
            hoverDetected = true;
            break;
          }
        }
      }
      
      // Check for citizen hover if no building or polygon is hovered
      if (!hoverDetected && data.citizensByBuilding && activeView === 'citizens') {
        for (const [buildingId, buildingCitizens] of Object.entries(data.citizensByBuilding)) {
          // Find the building position
          const position = setters.findBuildingPosition(buildingId);
          if (!position) continue;
          
          // Check home citizens
          const homeCitizens = buildingCitizens.filter(c => c.markerType === 'home');
          if (homeCitizens.length > 0) {
            // Check if mouse is over the home marker
            const homeX = position.x - 15;
            const homeY = position.y;
            const homeRadius = homeCitizens.length > 1 ? 25 : 20;
            
            if (Math.sqrt(Math.pow(mouseX - homeX, 2) + Math.pow(mouseY - homeY, 2)) <= homeRadius) {
              newHoverState = {
                type: 'citizen',
                id: buildingId,
                data: { 
                  buildingId, 
                  citizenType: 'home',
                  citizen: homeCitizens.length === 1 ? homeCitizens[0] : null
                }
              };
              canvas.style.cursor = 'pointer';
              hoverDetected = true;
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
              newHoverState = {
                type: 'citizen',
                id: buildingId,
                data: { 
                  buildingId, 
                  citizenType: 'work',
                  citizen: workCitizens.length === 1 ? workCitizens[0] : null
                }
              };
              canvas.style.cursor = 'pointer';
              hoverDetected = true;
              break;
            }
          }
        }
      }
      
      // Check for canal point hover
      if (!hoverDetected && data.polygons && activeView === 'buildings') {
        for (const polygon of data.polygons) {
          if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
            for (const point of polygon.canalPoints) {
              if (!point.edge) continue;
              
              // Convert lat/lng to isometric coordinates
              const x = (point.edge.lng - 12.3326) * 20000;
              const y = (point.edge.lat - 45.4371) * 20000;
              
              const isoPos = {
                x: CoordinateService.worldToScreen(x, y, scale, offset, canvas.width, canvas.height).x,
                y: CoordinateService.worldToScreen(x, y, scale, offset, canvas.width, canvas.height).y
              };
              
              // Check if mouse is over this canal point
              const pointSize = 2 * scale;
              if (
                mouseX >= isoPos.x - pointSize * 2 && 
                mouseX <= isoPos.x + pointSize * 2 && 
                mouseY >= isoPos.y - pointSize * 2 && 
                mouseY <= isoPos.y + pointSize * 2
              ) {
                const pointId = point.id || `canal-${point.edge.lat}-${point.edge.lng}`;
                // Only update if the hovered canal point has changed
                if (this.hoveredCanalPointRef !== pointId) {
                  hoverStateService.setHoveredCanalPoint(pointId);
                }
                newHoverState = {
                  type: 'canalPoint',
                  id: pointId,
                  data: point
                };
                canvas.style.cursor = 'pointer';
                hoverDetected = true;
                break;
              }
            }
            if (hoverDetected) break;
          }
        }
      }
      
      // Check for bridge point hover
      if (!hoverDetected && data.polygons && activeView === 'buildings') {
        for (const polygon of data.polygons) {
          if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
            for (const point of polygon.bridgePoints) {
              if (!point.edge) continue;
              
              // Convert lat/lng to isometric coordinates
              const x = (point.edge.lng - 12.3326) * 20000;
              const y = (point.edge.lat - 45.4371) * 20000;
              
              const isoPos = {
                x: CoordinateService.worldToScreen(x, y, scale, offset, canvas.width, canvas.height).x,
                y: CoordinateService.worldToScreen(x, y, scale, offset, canvas.width, canvas.height).y
              };
              
              // Check if mouse is over this bridge point
              const pointSize = 2 * scale;
              if (
                mouseX >= isoPos.x - pointSize * 2 && 
                mouseX <= isoPos.x + pointSize * 2 && 
                mouseY >= isoPos.y - pointSize * 2 && 
                mouseY <= isoPos.y + pointSize * 2
              ) {
                const pointId = point.id || `bridge-${point.edge.lat}-${point.edge.lng}`;
                // Only update if the hovered bridge point has changed
                if (this.hoveredBridgePointRef !== pointId) {
                  hoverStateService.setHoveredBridgePoint(pointId);
                }
                newHoverState = {
                  type: 'bridgePoint',
                  id: pointId,
                  data: point
                };
                canvas.style.cursor = 'pointer';
                hoverDetected = true;
                break;
              }
            }
            if (hoverDetected) break;
          }
        }
      }
      
      // Check for water point hover
      if (!hoverDetected && data.waterPoints && Array.isArray(data.waterPoints) && activeView === 'transport') {
        for (const waterPoint of data.waterPoints) {
          if (!waterPoint.position) continue;
          
          // Convert lat/lng to isometric coordinates
          const x = (waterPoint.position.lng - 12.3326) * 20000;
          const y = (waterPoint.position.lat - 45.4371) * 20000;
          
          const isoPos = {
            x: CoordinateService.worldToScreen(x, y, scale, offset, canvas.width, canvas.height).x,
            y: CoordinateService.worldToScreen(x, y, scale, offset, canvas.width, canvas.height).y
          };
          
          // Check if mouse is over this water point
          const pointSize = 1.25 * scale;
          if (
            mouseX >= isoPos.x - pointSize * 2 && 
            mouseX <= isoPos.x + pointSize * 2 && 
            mouseY >= isoPos.y - pointSize * 2 && 
            mouseY <= isoPos.y + pointSize * 2
          ) {
            hoverStateService.setHoveredWaterPoint(waterPoint.id);
            newHoverState = {
              type: 'waterPoint',
              id: waterPoint.id,
              data: waterPoint
            };
            canvas.style.cursor = 'pointer';
            hoverDetected = true;
            break;
          }
        }
      }
      
        // Only update hover state if it actually changed
        if (
          hoverStateService.getHoverType() !== newHoverState.type || 
          hoverStateService.getHoverId() !== newHoverState.id
        ) {
          if (hoverDetected) {
            hoverStateService.setHoverState(
              newHoverState.type, 
              newHoverState.id, 
              newHoverState.data, 
              { x: mouseX, y: mouseY }
            );
            this.isHoveringRef = true;
          } else if (hoverStateService.isCurrentlyHovering()) {
            hoverStateService.clearHoverState();
            this.isHoveringRef = false;
            
            // Set cursor based on dragging state
            if (this.isDraggingRef) {
              canvas.style.cursor = 'grabbing';
            } else {
              canvas.style.cursor = 'grab';
            }
          }
        }
      }
    }, 250); // Increase to 250ms throttle time to further reduce flickering
    
    // Handle mouse click with debounce to prevent multiple rapid clicks
    const handleClick = debounce((e: MouseEvent) => {
      if (this.isDraggingRef && !this.state.isDraggingOrientBridge) return; // Skip click handling if it was a map drag, but not if it was an orient drag
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      console.log('Click detected at:', { x: mouseX, y: mouseY });
      console.log('Current mode:', { activeView, transportMode, waterPointMode: this.waterPointModeRef });
      
      // Handle water route mode clicks - make sure this is checked before other modes
      if (activeView === 'transport' && this.waterRouteModeRef && setters.handleWaterRouteClick) {
        console.log('Water route mode click detected');
      
        // Check if click is on a water point
        let clickedOnWaterPoint = false;
        let waterPointId = null;
      
        if (data.waterPoints && data.waterPoints.length > 0) {
          for (const waterPoint of data.waterPoints) {
            if (!waterPoint.position) continue;
          
            // Convert lat/lng to isometric coordinates
            const x = (waterPoint.position.lng - 12.3326) * 20000;
            const y = (waterPoint.position.lat - 45.4371) * 20000;
          
            const isoPos = {
              x: CoordinateService.worldToScreen(x, y, scale, offset, canvas.width, canvas.height).x,
              y: CoordinateService.worldToScreen(x, y, scale, offset, canvas.width, canvas.height).y
            };
          
            // Check if mouse is over this water point
            const pointSize = 1.25 * scale;
            if (
              mouseX >= isoPos.x - pointSize * 2 && 
              mouseX <= isoPos.x + pointSize * 2 && 
              mouseY >= isoPos.y - pointSize * 2 && 
              mouseY <= isoPos.y + pointSize * 2
            ) {
              clickedOnWaterPoint = true;
              waterPointId = waterPoint.id;
              break;
            }
          }
        }
      
        // Convert screen coordinates to lat/lng
        const point = setters.screenToLatLng(mouseX, mouseY, scale, offset, canvas.width, canvas.height);
      
        // Handle the water route click
        setters.handleWaterRouteClick(point, clickedOnWaterPoint, waterPointId);
        return;
      }
    
      // Handle water point mode clicks - make sure this is checked before transport mode
      if (activeView === 'transport' && this.waterPointModeRef && setters.saveWaterPoint) {
        console.log('Water point mode click detected');
        // Convert screen coordinates to lat/lng
        const point = setters.screenToLatLng(mouseX, mouseY, scale, offset, canvas.width, canvas.height);
      
        // Save the new water point
        setters.saveWaterPoint(point);
        return;
      }
      
      // Handle transport mode clicks - make sure this is the first condition checked
      if (activeView === 'transport' && transportMode) {
        console.log('Transport mode click detected');
        // Convert screen coordinates to lat/lng
        const point = setters.screenToLatLng(mouseX, mouseY, scale, offset, canvas.width, canvas.height);
        
        if (!data.transportStartPoint) {
          // First click - set start point
          setters.setTransportStartPoint(point);
          console.log('Transport start point set:', point);
        } else if (!data.transportEndPoint) {
          // Second click - set end point and calculate route
          setters.setTransportEndPoint(point);
          console.log('Transport end point set:', point);
          
          // Calculate route
          setters.calculateTransportRoute(data.transportStartPoint, point);
        } else {
          // Third click - reset and start over
          setters.setTransportStartPoint(point);
          setters.setTransportEndPoint(null);
          setters.setTransportPath([]);
          console.log('Transport route reset, new start point:', point);
        }
        
        return; // Skip other click handling when in transport mode
      }
      
      // If in orient bridge mode, left-click should NOT open building details for bridges.
      if (data.orientBridgeModeActive) {
        const clickedBuildingForOrientCheck = this.findClickedBuilding({ x: mouseX, y: mouseY }, data.buildings, scale, offset, canvas.width, canvas.height);
        if (clickedBuildingForOrientCheck && (clickedBuildingForOrientCheck.type?.toLowerCase().includes('bridge') || clickedBuildingForOrientCheck.category?.toLowerCase() === 'bridge')) {
          console.log(`InteractionService: Left-click on bridge ${clickedBuildingForOrientCheck.id} in orient mode. Doing nothing with details panel.`);
          // If a bridge is selected for orientation, a left click might confirm it, but current logic is mouseup.
          // For now, prevent details panel.
          return; 
        }
      }
      
      // Check if click is on any building - this works in all view modes
      const clickedBuilding = this.findClickedBuilding({ x: mouseX, y: mouseY }, data.buildings, scale, offset, canvas.width, canvas.height);
      if (clickedBuilding) {
        // If NOT in orient bridge mode OR if it's not a bridge, then select for details.
        if (!data.orientBridgeModeActive || !(clickedBuilding.type?.toLowerCase().includes('bridge') || clickedBuilding.category?.toLowerCase() === 'bridge')) {
            this.state.selectedBuildingId = clickedBuilding.id; // This is for general building selection, not orientation
            setters.setSelectedBuildingId(clickedBuilding.id);
            setters.setShowBuildingDetailsPanel(true);
            window.dispatchEvent(new CustomEvent('showBuildingDetailsPanel', { detail: { buildingId: clickedBuilding.id } }));
            return;
        }
      }
      
      // Original loop for buildings (now part of the logic above)
      // for (const building of data.buildings) {
      // ... (original loop content was here and is now integrated above)
      // }
      
      // Handle clicks in land view
      if (activeView === 'land') {
        // Check if click is on any polygon
        for (const { polygon, coords } of data.polygonsToRender) {
          if (RenderService.prototype.isPointInPolygon(mouseX, mouseY, coords)) {
            // Set the selected polygon and show details panel
            this.state.selectedPolygonId = polygon.id;
            setters.setSelectedPolygonId(polygon.id);
            setters.setShowLandDetailsPanel(true);
            
            // Dispatch an event for other components to respond to
            window.dispatchEvent(new CustomEvent('showLandDetailsPanel', {
              detail: { polygonId: polygon.id }
            }));
            
            return;
          }
        }
        
        // If click is not on any polygon, deselect
        this.state.selectedPolygonId = null;
        setters.setSelectedPolygonId(null);
      }
      
      // Handle clicks in buildings view
      if (activeView === 'buildings') {
        
        // Check if click is on any empty building point - only in buildings view
        for (const point of data.emptyBuildingPoints) {
          // Convert lat/lng to isometric coordinates
          const x = (point.lng - 12.3326) * 20000;
          const y = (point.lat - 45.4371) * 20000;
          
          const world = { x, y };
          const screen = CoordinateService.worldToScreen(
            world.x, world.y, scale, offset, canvas.width, canvas.height
          );
          const isoPos = {
            x: screen.x,
            y: screen.y
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
              polygonId: setters.findPolygonIdForPoint(point),
              position: point
            };
                
            console.log('Dispatching buildingPointClick event with data:', { position: point });
                
            // Dispatch an event to open the building menu at this position
            // const event = new CustomEvent('buildingPointClick', {
            //   detail: { position: point }
            // });
            // window.dispatchEvent(event);
            // console.log('buildingPointClick event dispatched');

            if (setters.onEmptyBuildingPointSelected) {
              const polygonId = setters.findPolygonIdForPoint(point);
              setters.onEmptyBuildingPointSelected(point, polygonId);
            }
                
            // Deselect any selected building
            this.state.selectedBuildingId = null;
            setters.setSelectedBuildingId(null);
                
            return;
          }
        }
        
        // If click is not on any building, deselect
        this.state.selectedBuildingId = null;
        setters.setSelectedBuildingId(null);
      }
      
      // Check if click is on any dock point
      if (activeView === 'buildings') {
        let canalPointClicked = false;
        
        for (const polygon of data.polygons) {
          if (canalPointClicked) break;
          
          if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
            for (const point of polygon.canalPoints) {
              if (!point.edge) continue;
              
              // Convert lat/lng to isometric coordinates
              const x = (point.edge.lng - 12.3326) * 20000;
              const y = (point.edge.lat - 45.4371) * 20000;
              
              const world = { x, y };
              const screen = CoordinateService.worldToScreen(
                world.x, world.y, scale, offset, canvas.width, canvas.height
              );
              const isoPos = {
                x: screen.x,
                y: screen.y
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
                  polygonId: setters.findPolygonIdForPoint(point.edge),
                  position: point.edge,
                  pointType: 'canal'
                };
                
                // Dispatch an event to open the building menu at this position
                // window.dispatchEvent(new CustomEvent('buildingPointClick', {
                //   detail: { 
                //     position: point.edge,
                //     pointType: 'canal'
                //   }
                // }));

                if (setters.onCanalPointSelected) {
                  const polygonId = setters.findPolygonIdForPoint(point.edge);
                  setters.onCanalPointSelected(point.edge, polygonId);
                }
                
                // Deselect any selected building
                this.state.selectedBuildingId = null;
                setters.setSelectedBuildingId(null);
                
                canalPointClicked = true;
                break;
              }
            }
          }
        }
        
        if (canalPointClicked) return;
        
        // Check if click is on any bridge point
        let bridgePointClicked = false;
        
        for (const polygon of data.polygons) {
          if (bridgePointClicked) break;
          
          if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
            for (const point of polygon.bridgePoints) {
              if (!point.edge) continue;
              
              // Convert lat/lng to isometric coordinates
              const x = (point.edge.lng - 12.3326) * 20000;
              const y = (point.edge.lat - 45.4371) * 20000;
              
              const isoPos = {
                x: CoordinateService.worldToScreen(x, y, scale, offset, canvas.width, canvas.height).x,
                y: CoordinateService.worldToScreen(x, y, scale, offset, canvas.width, canvas.height).y
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
                  polygonId: setters.findPolygonIdForPoint(point.edge),
                  position: point.edge,
                  pointType: 'bridge'
                };
                
                // Dispatch an event to open the building menu at this position
                // window.dispatchEvent(new CustomEvent('buildingPointClick', {
                //   detail: { 
                //     position: point.edge,
                //     pointType: 'bridge'
                //   }
                // }));
                
                if (setters.onBridgePointSelected) {
                  const polygonId = setters.findPolygonIdForPoint(point.edge);
                  setters.onBridgePointSelected(point.edge, polygonId);
                }

                // Deselect any selected building
                this.state.selectedBuildingId = null;
                setters.setSelectedBuildingId(null);
                
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
        for (const [buildingId, buildingCitizens] of Object.entries(data.citizensByBuilding)) {
          // Find the building position
          const position = setters.findBuildingPosition(buildingId);
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
                setters.setSelectedCitizen(homeCitizens[0]);
                setters.setShowCitizenDetailsPanel(true);
              } else {
                // For multiple citizens, show a selection dialog
                console.log(`${homeCitizens.length} residents at building ${buildingId}`);
                // For now, just show the first citizen
                setters.setSelectedCitizen(homeCitizens[0]);
                setters.setShowCitizenDetailsPanel(true);
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
                setters.setSelectedCitizen(workCitizens[0]);
                setters.setShowCitizenDetailsPanel(true);
              } else {
                // For multiple citizens, show a selection dialog
                console.log(`${workCitizens.length} workers at building ${buildingId}`);
                // For now, just show the first citizen
                setters.setSelectedCitizen(workCitizens[0]);
                setters.setShowCitizenDetailsPanel(true);
              }
              return;
            }
          }
        }
        
        // If click is not on any citizen marker, deselect
        setters.setSelectedCitizen(null);
        setters.setShowCitizenDetailsPanel(false);
      }
    }, 300); // Debounce for 300ms
    
    // Handle mouse down for panning
    const handleMouseDown = (e: MouseEvent) => {
      // If in orient bridge mode AND a bridge is ALREADY selected for orientation (via right-click)
      // then this mousedown initiates the drag-to-orient.
      if (data.orientBridgeModeActive && data.selectedBridgeForOrientationId) {
        const selectedBuilding = data.buildings.find(b => b.id === data.selectedBridgeForOrientationId);
        // Check if the mousedown is on the selected bridge
        if (selectedBuilding && this.findClickedBuilding(this.state.mousePosition, [selectedBuilding], scale, offset, canvas.width, canvas.height)) {
            this.state.isDraggingOrientBridge = true;
            this.isDraggingRef = false; // Prevent map drag
            this.state.isDragging = false; // Prevent map drag
            console.log(`InteractionService: Mousedown on selected bridge ${data.selectedBridgeForOrientationId}, starting orientation drag.`);
            return; // Exclusive mode for this mousedown
        }
      }
      
      // If not orienting a bridge, proceed with normal map drag initiation.
      this.state.isDragging = true;
      this.isDraggingRef = true;
      this.state.dragStart = { x: e.clientX, y: e.clientY };
      
      // Emit event
      eventBus.emit(EventTypes.INTERACTION_MOUSE_DOWN, {
        x: e.clientX,
        y: e.clientY
      });
    };
    
    // Handle mouse up for panning
    const handleMouseUp = () => {
      // If orienting a bridge, finalize orientation on mouse up
      // The actual saving will be handled by IsometricViewer's own mouseUp listener
      // by checking its state variables (selectedBridgeForOrientationId, orientingBridgeAngle).
      // InteractionService just needs to reset its internal state for this specific drag.
      if (data.orientBridgeModeActive && this.state.isDraggingOrientBridge) {
          console.log(`InteractionService: MouseUp during bridge orientation for ${this.state.selectedBuildingId}. IsometricViewer should save.`);
          this.state.isDraggingOrientBridge = false; 
          // Let IsometricViewer reset its own state (selectedBridgeForOrientationId, orientingBridgeAngle) after API call.
          // No need to call setters.setSelectedBridgeForOrientationId(null) here as IsometricViewer controls that state.
          
          // Ensure general dragging is also considered ended.
          this.state.isDragging = false;
          this.isDraggingRef = false;
          eventBus.emit(EventTypes.INTERACTION_DRAG_END, null); // Emit drag end for consistency
          return; 
      }

      // Only update state if we're actually dragging for map panning
      if (this.isDraggingRef) { // For map panning
        this.state.isDragging = false;
        this.isDraggingRef = false;
        eventBus.emit(EventTypes.INTERACTION_DRAG_END, null);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (!data.orientBridgeModeActive) return;

      const clickedBuilding = this.findClickedBuilding({ x: mouseX, y: mouseY }, data.buildings, scale, offset, canvas.width, canvas.height);
      if (clickedBuilding && (clickedBuilding.type?.toLowerCase().includes('bridge') || clickedBuilding.category?.toLowerCase() === 'bridge')) {
        setters.setSelectedBridgeForOrientationId(clickedBuilding.id);
        setters.setOrientingBridgeAngle(clickedBuilding.orientation || clickedBuilding.rotation || 0);
        console.log(`InteractionService: Right-click selected bridge ${clickedBuilding.id} for orientation.`);
      } else {
        // If right-click is not on a bridge, clear any bridge selection for orientation
        setters.setSelectedBridgeForOrientationId(null);
        setters.setOrientingBridgeAngle(null);
      }
    };
    
    // Attach event listeners
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('contextmenu', handleContextMenu); // New listener
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp); // Changed to window for global mouseup
    
    // Return a cleanup function
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('contextmenu', handleContextMenu); // Cleanup
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp); // Cleanup
      
      // Clean up the throttled/debounced functions if they have cancel methods
      if (typeof handleMouseMove.cancel === 'function') {
        handleMouseMove.cancel();
      }
      if (typeof handleClick.cancel === 'function') {
        handleClick.cancel();
      }
    };
  }

  /**
   * Get the current interaction state
   */
  public getState(): InteractionState {
    return this.state;
  }

  /**
   * Update the interaction state
   */
  public setState(newState: Partial<InteractionState>): void {
    this.state = { ...this.state, ...newState };
    
    // Update refs
    if ('hoveredPolygonId' in newState) {
      this.hoveredPolygonIdRef = newState.hoveredPolygonId ?? null;
    }
    if ('hoveredBuildingId' in newState) {
      this.hoveredBuildingIdRef = newState.hoveredBuildingId ?? null;
    }
    if ('hoveredCanalPoint' in newState) {
      this.hoveredCanalPointRef = newState.hoveredCanalPoint ?? null;
    }
    if ('hoveredBridgePoint' in newState) {
      this.hoveredBridgePointRef = newState.hoveredBridgePoint ?? null;
    }
    if ('hoveredCitizenBuilding' in newState) {
      this.hoveredCitizenBuildingRef = (newState as any).hoveredCitizenBuilding ?? null;
    }
    if ('hoveredCitizenType' in newState) {
      this.hoveredCitizenTypeRef = (newState as any).hoveredCitizenType ?? null;
    }
    if ('isDragging' in newState) {
      this.isDraggingRef = newState.isDragging ?? false;
    }
  }

  /**
   * Helper function to get building size based on type
   */
  private getBuildingSize(type: string): {width: number, height: number, depth: number} {
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

  /**
   * Helper function to format building types for display
   */
  private formatBuildingType(type: string): string {
    if (!type) return 'Building';
    
    // Replace underscores and hyphens with spaces
    let formatted = type.replace(/[_-]/g, ' ');
    
    // Capitalize each word
    formatted = formatted.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return formatted;
  }

  /**
   * Helper function to find the building clicked by the mouse
   */
  private findClickedBuilding(
    mousePosition: { x: number, y: number },
    buildings: any[],
    scale: number,
    offset: { x: number, y: number },
    canvasWidth: number,
    canvasHeight: number
  ): any | null {
    const { x: mouseX, y: mouseY } = mousePosition;

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

      let worldX, worldY;
      if ('lat' in position && 'lng' in position) {
        worldX = (position.lng - 12.3326) * 20000;
        worldY = (position.lat - 45.4371) * 20000;
      } else if ('x' in position && 'z' in position) {
        worldX = position.x;
        worldY = position.z;
      } else {
        continue;
      }

      const isoPos = CoordinateService.worldToScreen(worldX, worldY, scale, offset, canvasWidth, canvasHeight);
      const size = this.getBuildingSize(building.type);
      const squareSize = Math.max(size.width, size.depth) * scale * 0.6;

      if (
        mouseX >= isoPos.x - squareSize / 2 &&
        mouseX <= isoPos.x + squareSize / 2 &&
        mouseY >= isoPos.y - squareSize / 2 &&
        mouseY <= isoPos.y + squareSize / 2
      ) {
        return building;
      }
    }
    return null;
  }

  /**
   * Helper function to find which polygon contains this building point
   */
  private findPolygonIdForPoint(point: {lat: number, lng: number}, polygons: any[]): string {
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
        if (this.isPointInPolygonCoordinates(point, polygon.coordinates)) {
          return polygon.id;
        }
      }
    }
    
    return 'unknown';
  }

  /**
   * Check if a point is inside polygon coordinates
   */
  private isPointInPolygonCoordinates(point: {lat: number, lng: number}, coordinates: {lat: number, lng: number}[]): boolean {
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
}

// Export a singleton instance
export const interactionService = new InteractionService();
