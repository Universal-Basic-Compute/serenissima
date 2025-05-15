/**
 * InteractionService
 * Handles mouse interactions for the isometric view
 */

import { CoordinateService } from './CoordinateService';
import { RenderService } from './RenderService';
import { eventBus, EventTypes } from '../utils/eventBus';
import { throttle } from '../utils/performanceUtils';

export interface InteractionState {
  isDragging: boolean;
  dragStart: { x: number, y: number };
  hoveredPolygonId: string | null;
  selectedPolygonId: string | null;
  hoveredBuildingId: string | null;
  selectedBuildingId: string | null;
  hoveredCanalPoint: { lat: number, lng: number } | null;
  hoveredBridgePoint: { lat: number, lng: number } | null;
  hoveredCitizenBuilding: string | null;
  hoveredCitizenType: 'home' | 'work' | null;
  mousePosition: { x: number, y: number };
}

export class InteractionService {
  private state: InteractionState = {
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    hoveredPolygonId: null,
    selectedPolygonId: null,
    hoveredBuildingId: null,
    selectedBuildingId: null,
    hoveredCanalPoint: null,
    hoveredBridgePoint: null,
    hoveredCitizenBuilding: null,
    hoveredCitizenType: null,
    mousePosition: { x: 0, y: 0 }
  };
  
  // Refs to track current state without causing re-renders
  private hoveredPolygonIdRef: string | null = null;
  private hoveredBuildingIdRef: string | null = null;
  private hoveredCanalPointRef: { lat: number, lng: number } | null = null;
  private hoveredBridgePointRef: { lat: number, lng: number } | null = null;
  private hoveredCitizenBuildingRef: string | null = null;
  private hoveredCitizenTypeRef: 'home' | 'work' | null = null;
  private isDraggingRef: boolean = false;

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
    setDragStart({ x: e.clientX, y: e.clientY });
    
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
    
    setOffset({ x: offset.x + dx, y: offset.y + dy });
    setDragStart({ x: e.clientX, y: e.clientY });
    
    // Emit drag event
    eventBus.emit(EventTypes.INTERACTION_DRAG, {
      x: e.clientX,
      y: e.clientY
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
      
      // Emit event
      eventBus.emit(EventTypes.INTERACTION_DRAG_END, null);
    }
  }

  /**
   * Initialize interaction handlers for a canvas
   */
  public initializeInteractions(
    canvas: HTMLCanvasElement,
    activeView: string,
    scale: number,
    offset: { x: number, y: number },
    polygonsToRender: any[],
    buildings: any[],
    emptyBuildingPoints: any[],
    citizensByBuilding: Record<string, any[]>,
    transportMode: boolean,
    polygons: any[]
  ): () => void {
    // Handle mouse move
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Always update mouse position regardless of other hover states
      this.state.mousePosition = { x: mouseX, y: mouseY };
      
      // Skip hover detection while dragging
      if (this.isDraggingRef) {
        canvas.style.cursor = 'grabbing';
        return;
      }
      
      // Use refs to track the current hover state to avoid dependency issues
      const currentHoveredPolygonId = this.hoveredPolygonIdRef;
      const currentHoveredBuildingId = this.hoveredBuildingIdRef;
      const currentHoveredCanalPoint = this.hoveredCanalPointRef;
      const currentHoveredBridgePoint = this.hoveredBridgePointRef;
      const currentHoveredCitizenBuilding = this.hoveredCitizenBuildingRef;
      const currentHoveredCitizenType = this.hoveredCitizenTypeRef;
      
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
          this.hoveredPolygonIdRef = null;
          this.state.hoveredPolygonId = null;
        }
        if (currentHoveredBuildingId) {
          this.hoveredBuildingIdRef = null;
          this.state.hoveredBuildingId = null;
        }
        canvas.style.cursor = this.isDraggingRef ? 'grabbing' : 'grab';
        return;
      }
      
      // Check if mouse is over any polygon (for land view)
      if (activeView === 'land') {
        for (const { polygon, coords } of polygonsToRender) {
          if (RenderService.prototype.isPointInPolygon(mouseX, mouseY, coords)) {
            newHoveredPolygonId = polygon.id;
            canvas.style.cursor = 'pointer';
            break;
          }
        }
        
        if (!newHoveredPolygonId) {
          canvas.style.cursor = this.isDraggingRef ? 'grabbing' : 'grab';
        }
        
        // Only update state if the hovered polygon has changed
        if (newHoveredPolygonId !== currentHoveredPolygonId) {
          this.hoveredPolygonIdRef = newHoveredPolygonId;
          this.state.hoveredPolygonId = newHoveredPolygonId;
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
            const world = CoordinateService.latLngToWorld(position.lat, position.lng);
            const screen = CoordinateService.worldToScreen(
              world.x, world.y, scale, offset, canvas.width, canvas.height
            );
            x = screen.x;
            y = screen.y;
          } else if ('x' in position && 'z' in position) {
            const screen = CoordinateService.worldToScreen(
              position.x, position.z, scale, offset, canvas.width, canvas.height
            );
            x = screen.x;
            y = screen.y;
          } else {
            continue;
          }
      
          // Get building size
          const size = this.getBuildingSize(building.type);
          // Increase the hit area by 20% to make it easier to hover
          const squareSize = Math.max(size.width, size.depth) * scale * 0.6 * 1.2;
      
          // Check if mouse is over this building using a more generous hit area
          if (
            mouseX >= x - squareSize/2 &&
            mouseX <= x + squareSize/2 &&
            mouseY >= y - squareSize/2 &&
            mouseY <= y + squareSize/2
          ) {
            foundHoveredBuilding = true;
            newHoveredBuildingId = building.id;
            canvas.style.cursor = 'pointer';
            break; // Break after finding the first hovered building
          }
        }
        
        // Only update state if the hovered building has changed
        if (newHoveredBuildingId !== currentHoveredBuildingId) {
          this.hoveredBuildingIdRef = newHoveredBuildingId;
          this.state.hoveredBuildingId = newHoveredBuildingId;
          
          if (newHoveredBuildingId) {
            const building = buildings.find(b => b.id === newHoveredBuildingId);
            if (building) {
              eventBus.emit(EventTypes.BUILDING_HOVER, {
                buildingId: newHoveredBuildingId,
                buildingName: building.name || this.formatBuildingType(building.type),
                position: { x: mouseX, y: mouseY },
                buildingType: building.type,
                variant: building.variant
              });
            }
          }
        }
        
        // Check if mouse is over any empty building point
        if (!foundHoveredBuilding) {
          for (const point of emptyBuildingPoints) {
            // Convert lat/lng to isometric coordinates
            const world = CoordinateService.latLngToWorld(point.lat, point.lng);
            const screen = CoordinateService.worldToScreen(
              world.x, world.y, scale, offset, canvas.width, canvas.height
            );
          
            // Check if mouse is over this building point
            const pointSize = 2.8 * scale;
            if (
              mouseX >= screen.x - pointSize && 
              mouseX <= screen.x + pointSize && 
              mouseY >= screen.y - pointSize && 
              mouseY <= screen.y + pointSize
            ) {
              foundHoveredBuilding = true;
              canvas.style.cursor = 'pointer';
              break;
            }
          }
        }
  
        // If no building is hovered, clear the hover state
        if (!foundHoveredBuilding && currentHoveredBuildingId !== null) {
          this.hoveredBuildingIdRef = null;
          this.state.hoveredBuildingId = null;
          eventBus.emit(EventTypes.BUILDING_HOVER, null);
          canvas.style.cursor = this.isDraggingRef ? 'grabbing' : 'grab';
        }
      
        // Check if mouse is over any dock point
        for (const polygon of polygons) {
          if (foundHoveredCanalPoint) break;
        
          if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
            for (const point of polygon.canalPoints) {
              if (!point.edge) continue;
            
              // Convert lat/lng to isometric coordinates
              const world = CoordinateService.latLngToWorld(point.edge.lat, point.edge.lng);
              const screen = CoordinateService.worldToScreen(
                world.x, world.y, scale, offset, canvas.width, canvas.height
              );
            
              // Check if mouse is over this dock point
              const pointSize = 2 * scale;
              if (
                mouseX >= screen.x - pointSize && 
                mouseX <= screen.x + pointSize && 
                mouseY >= screen.y - pointSize && 
                mouseY <= screen.y + pointSize
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
          this.hoveredCanalPointRef = null;
          this.state.hoveredCanalPoint = null;
        } else if (foundHoveredCanalPoint && 
                  (currentHoveredCanalPoint === null || 
                   currentHoveredCanalPoint.lat !== newHoveredCanalPoint.lat || 
                   currentHoveredCanalPoint.lng !== newHoveredCanalPoint.lng)) {
          this.hoveredCanalPointRef = newHoveredCanalPoint;
          this.state.hoveredCanalPoint = newHoveredCanalPoint;
        }
      
        // Check if mouse is over any bridge point
        for (const polygon of polygons) {
          if (foundHoveredBridgePoint) break;
        
          if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
            for (const point of polygon.bridgePoints) {
              if (!point.edge) continue;
            
              // Convert lat/lng to isometric coordinates
              const world = CoordinateService.latLngToWorld(point.edge.lat, point.edge.lng);
              const screen = CoordinateService.worldToScreen(
                world.x, world.y, scale, offset, canvas.width, canvas.height
              );
            
              // Check if mouse is over this bridge point
              const pointSize = 2 * scale;
              if (
                mouseX >= screen.x - pointSize && 
                mouseX <= screen.x + pointSize && 
                mouseY >= screen.y - pointSize && 
                mouseY <= screen.y + pointSize
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
          this.hoveredBridgePointRef = null;
          this.state.hoveredBridgePoint = null;
        } else if (foundHoveredBridgePoint && 
                  (currentHoveredBridgePoint === null || 
                   currentHoveredBridgePoint.lat !== newHoveredBridgePoint.lat || 
                   currentHoveredBridgePoint.lng !== newHoveredBridgePoint.lng)) {
          this.hoveredBridgePointRef = newHoveredBridgePoint;
          this.state.hoveredBridgePoint = newHoveredBridgePoint;
        }
      } else if (currentHoveredBuildingId !== null) {
        // If not in buildings view, ensure building hover state is cleared
        this.hoveredBuildingIdRef = null;
        this.state.hoveredBuildingId = null;
      }
      
      // Check if mouse is over any citizen marker (for citizens view)
      if (activeView === 'citizens') {
        // Check each building with citizens
        for (const [buildingId, buildingCitizens] of Object.entries(citizensByBuilding)) {
          // Find the building position
          const building = buildings.find(b => b.id === buildingId);
          if (!building || !building.position) continue;
          
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
            const world = CoordinateService.latLngToWorld(position.lat, position.lng);
            const screen = CoordinateService.worldToScreen(
              world.x, world.y, scale, offset, canvas.width, canvas.height
            );
            x = screen.x;
            y = screen.y;
          } else if ('x' in position && 'z' in position) {
            const screen = CoordinateService.worldToScreen(
              position.x, position.z, scale, offset, canvas.width, canvas.height
            );
            x = screen.x;
            y = screen.y;
          } else {
            continue;
          }
          
          // Check home citizens
          const homeCitizens = buildingCitizens.filter(c => c.markerType === 'home');
          if (homeCitizens.length > 0) {
            // Check if mouse is over the home marker
            const homeX = x - 15;
            const homeY = y;
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
            const workX = x + 15;
            const workY = y;
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
          this.hoveredCitizenBuildingRef = null;
          this.hoveredCitizenTypeRef = null;
          this.state.hoveredCitizenBuilding = null;
          this.state.hoveredCitizenType = null;
          canvas.style.cursor = this.isDraggingRef ? 'grabbing' : 'grab';
        } else if (foundHoveredCitizen && 
                  (currentHoveredCitizenBuilding !== newHoveredCitizenBuilding || 
                   currentHoveredCitizenType !== newHoveredCitizenType)) {
          this.hoveredCitizenBuildingRef = newHoveredCitizenBuilding;
          this.hoveredCitizenTypeRef = newHoveredCitizenType;
          this.state.hoveredCitizenBuilding = newHoveredCitizenBuilding;
          this.state.hoveredCitizenType = newHoveredCitizenType;
        }
      }
    };
    
    // Handle mouse click
    const handleClick = (e: MouseEvent) => {
      if (this.isDraggingRef) return; // Skip click handling while dragging
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Handle transport mode clicks - make sure this is the first condition checked
      if (activeView === 'transport' && transportMode) {
        // Convert screen coordinates to lat/lng
        const latLng = CoordinateService.screenToLatLng(
          mouseX, mouseY, scale, offset, canvas.width, canvas.height
        );
        
        // Emit transport click event
        eventBus.emit(EventTypes.TRANSPORT_POINT_SELECTED, latLng);
        return; // Skip other click handling when in transport mode
      }
      
      // Handle clicks in land view
      if (activeView === 'land') {
        // Check if click is on any polygon
        for (const { polygon, coords } of polygonsToRender) {
          if (RenderService.prototype.isPointInPolygon(mouseX, mouseY, coords)) {
            // Set the selected polygon and show details panel
            this.state.selectedPolygonId = polygon.id;
            
            // Dispatch an event for other components to respond to
            eventBus.emit(EventTypes.POLYGON_SELECTED, { polygonId: polygon.id });
            
            return;
          }
        }
        
        // If click is not on any polygon, deselect
        this.state.selectedPolygonId = null;
        eventBus.emit(EventTypes.POLYGON_SELECTED, null);
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
            const world = CoordinateService.latLngToWorld(position.lat, position.lng);
            const screen = CoordinateService.worldToScreen(
              world.x, world.y, scale, offset, canvas.width, canvas.height
            );
            x = screen.x;
            y = screen.y;
          } else if ('x' in position && 'z' in position) {
            const screen = CoordinateService.worldToScreen(
              position.x, position.z, scale, offset, canvas.width, canvas.height
            );
            x = screen.x;
            y = screen.y;
          } else {
            continue;
          }
          
          // Get building size
          const size = this.getBuildingSize(building.type);
          const squareSize = Math.max(size.width, size.depth) * scale * 0.6;
          
          // Check if click is on this building
          if (
            mouseX >= x - squareSize/2 &&
            mouseX <= x + squareSize/2 &&
            mouseY >= y - squareSize/2 &&
            mouseY <= y + squareSize/2
          ) {
            // Set the selected building and show details panel
            this.state.selectedBuildingId = building.id;
        
            // Clear hover state when clicking on a building
            this.hoveredBuildingIdRef = null;
            this.state.hoveredBuildingId = null;
        
            // Dispatch an event for other components to respond to
            eventBus.emit(EventTypes.BUILDING_SELECTED, { buildingId: building.id });
        
            return;
          }
        }
        
        // Check if click is on any empty building point
        for (const point of emptyBuildingPoints) {
          // Convert lat/lng to isometric coordinates
          const world = CoordinateService.latLngToWorld(point.lat, point.lng);
          const screen = CoordinateService.worldToScreen(
            world.x, world.y, scale, offset, canvas.width, canvas.height
          );
          
          // Check if click is on this building point
          const pointSize = 2.8 * scale;
          if (
            mouseX >= screen.x - pointSize && 
            mouseX <= screen.x + pointSize && 
            mouseY >= screen.y - pointSize && 
            mouseY <= screen.y + pointSize
          ) {
            // Store the selected building point in window for the BuildingMenu to use
            (window as any).__selectedBuildingPoint = {
              pointId: `point-${point.lat}-${point.lng}`,
              polygonId: this.findPolygonIdForPoint(point, polygons),
              position: point
            };
                
            // Dispatch an event to open the building menu at this position
            eventBus.emit(EventTypes.BUILDING_POINT_SELECTED, { 
              position: point 
            });
                
            // Deselect any selected building
            this.state.selectedBuildingId = null;
            eventBus.emit(EventTypes.BUILDING_SELECTED, null);
                
            return;
          }
        }
        
        // Check if click is on any dock point
        for (const polygon of polygons) {
          if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
            for (const point of polygon.canalPoints) {
              if (!point.edge) continue;
              
              // Convert lat/lng to isometric coordinates
              const world = CoordinateService.latLngToWorld(point.edge.lat, point.edge.lng);
              const screen = CoordinateService.worldToScreen(
                world.x, world.y, scale, offset, canvas.width, canvas.height
              );
              
              // Check if click is on this dock point
              const pointSize = 2 * scale;
              if (
                mouseX >= screen.x - pointSize && 
                mouseX <= screen.x + pointSize && 
                mouseY >= screen.y - pointSize && 
                mouseY <= screen.y + pointSize
              ) {
                // Store the selected point in window for the BuildingMenu to use
                (window as any).__selectedBuildingPoint = {
                  pointId: `dock-${point.edge.lat}-${point.edge.lng}`,
                  polygonId: this.findPolygonIdForPoint(point.edge, polygons),
                  position: point.edge,
                  pointType: 'canal'
                };
                
                // Dispatch an event to open the building menu at this position
                eventBus.emit(EventTypes.BUILDING_POINT_SELECTED, { 
                  position: point.edge,
                  pointType: 'canal'
                });
                
                // Deselect any selected building
                this.state.selectedBuildingId = null;
                eventBus.emit(EventTypes.BUILDING_SELECTED, null);
                
                return;
              }
            }
          }
        }
        
        // Check if click is on any bridge point
        for (const polygon of polygons) {
          if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
            for (const point of polygon.bridgePoints) {
              if (!point.edge) continue;
              
              // Convert lat/lng to isometric coordinates
              const world = CoordinateService.latLngToWorld(point.edge.lat, point.edge.lng);
              const screen = CoordinateService.worldToScreen(
                world.x, world.y, scale, offset, canvas.width, canvas.height
              );
              
              // Check if click is on this bridge point
              const pointSize = 2 * scale;
              if (
                mouseX >= screen.x - pointSize && 
                mouseX <= screen.x + pointSize && 
                mouseY >= screen.y - pointSize && 
                mouseY <= screen.y + pointSize
              ) {
                // Store the selected point in window for the BuildingMenu to use
                (window as any).__selectedBuildingPoint = {
                  pointId: `bridge-${point.edge.lat}-${point.edge.lng}`,
                  polygonId: this.findPolygonIdForPoint(point.edge, polygons),
                  position: point.edge,
                  pointType: 'bridge'
                };
                
                // Dispatch an event to open the building menu at this position
                eventBus.emit(EventTypes.BUILDING_POINT_SELECTED, { 
                  position: point.edge,
                  pointType: 'bridge'
                });
                
                // Deselect any selected building
                this.state.selectedBuildingId = null;
                eventBus.emit(EventTypes.BUILDING_SELECTED, null);
                
                return;
              }
            }
          }
        }
        
        // If click is not on any building or point, deselect
        this.state.selectedBuildingId = null;
        eventBus.emit(EventTypes.BUILDING_SELECTED, null);
      }
      
      // Handle clicks in citizens view
      if (activeView === 'citizens') {
        // Check each building with citizens
        for (const [buildingId, buildingCitizens] of Object.entries(citizensByBuilding)) {
          // Find the building position
          const building = buildings.find(b => b.id === buildingId);
          if (!building || !building.position) continue;
          
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
            const world = CoordinateService.latLngToWorld(position.lat, position.lng);
            const screen = CoordinateService.worldToScreen(
              world.x, world.y, scale, offset, canvas.width, canvas.height
            );
            x = screen.x;
            y = screen.y;
          } else if ('x' in position && 'z' in position) {
            const screen = CoordinateService.worldToScreen(
              position.x, position.z, scale, offset, canvas.width, canvas.height
            );
            x = screen.x;
            y = screen.y;
          } else {
            continue;
          }
          
          // Check home citizens
          const homeCitizens = buildingCitizens.filter(c => c.markerType === 'home');
          if (homeCitizens.length > 0) {
            // Check if click is on the home marker
            const homeX = x - 15;
            const homeY = y;
            const homeRadius = homeCitizens.length > 1 ? 25 : 20;
            
            if (Math.sqrt(Math.pow(mouseX - homeX, 2) + Math.pow(mouseY - homeY, 2)) <= homeRadius) {
              // If there's only one citizen, show details
              if (homeCitizens.length === 1) {
                eventBus.emit(EventTypes.CITIZEN_SELECTED, homeCitizens[0]);
              } else {
                // For multiple citizens, show a selection dialog
                console.log(`${homeCitizens.length} residents at building ${buildingId}`);
                // For now, just show the first citizen
                eventBus.emit(EventTypes.CITIZEN_SELECTED, homeCitizens[0]);
              }
              return;
            }
          }
          
          // Check work citizens
          const workCitizens = buildingCitizens.filter(c => c.markerType === 'work');
          if (workCitizens.length > 0) {
            // Check if click is on the work marker
            const workX = x + 15;
            const workY = y;
            const workRadius = workCitizens.length > 1 ? 25 : 20;
            
            if (Math.sqrt(Math.pow(mouseX - workX, 2) + Math.pow(mouseY - workY, 2)) <= workRadius) {
              // If there's only one citizen, show details
              if (workCitizens.length === 1) {
                eventBus.emit(EventTypes.CITIZEN_SELECTED, workCitizens[0]);
              } else {
                // For multiple citizens, show a selection dialog
                console.log(`${workCitizens.length} workers at building ${buildingId}`);
                // For now, just show the first citizen
                eventBus.emit(EventTypes.CITIZEN_SELECTED, workCitizens[0]);
              }
              return;
            }
          }
        }
        
        // If click is not on any citizen marker, deselect
        eventBus.emit(EventTypes.CITIZEN_SELECTED, null);
      }
    };
    
    // Handle mouse down for panning
    const handleMouseDown = (e: MouseEvent) => {
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
      // Only update state if we're actually dragging
      if (this.isDraggingRef) {
        this.state.isDragging = false;
        this.isDraggingRef = false;
        
        // Emit event
        eventBus.emit(EventTypes.INTERACTION_DRAG_END, null);
      }
    };
    
    // Attach event listeners
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    
    // Return a cleanup function
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
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
    if (newState.hoveredPolygonId !== undefined) {
      this.hoveredPolygonIdRef = newState.hoveredPolygonId;
    }
    if (newState.hoveredBuildingId !== undefined) {
      this.hoveredBuildingIdRef = newState.hoveredBuildingId;
    }
    if (newState.hoveredCanalPoint !== undefined) {
      this.hoveredCanalPointRef = newState.hoveredCanalPoint;
    }
    if (newState.hoveredBridgePoint !== undefined) {
      this.hoveredBridgePointRef = newState.hoveredBridgePoint;
    }
    if (newState.hoveredCitizenBuilding !== undefined) {
      this.hoveredCitizenBuildingRef = newState.hoveredCitizenBuilding;
    }
    if (newState.hoveredCitizenType !== undefined) {
      this.hoveredCitizenTypeRef = newState.hoveredCitizenType;
    }
    if (newState.isDragging !== undefined) {
      this.isDraggingRef = newState.isDragging;
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
