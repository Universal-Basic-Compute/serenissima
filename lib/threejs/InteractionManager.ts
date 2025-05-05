import { MutableRefObject } from 'react';
import * as THREE from 'three';
import { ViewMode } from '../../components/PolygonViewer/types';
import { eventBus, EventTypes } from '../eventBus';
import { InteractionFacade } from './InteractionFacade';

interface InteractionManagerProps {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  polygonMeshesRef: MutableRefObject<Record<string, THREE.Mesh>>;
  activeView: ViewMode;
  throttleInterval?: number; // Optional throttle interval in ms
}

/**
 * Manages user interactions with 3D objects in the scene
 * Uses InteractionFacade to abstract Three.js complexity
 * Uses EventBus for communication with other components
 */
export class InteractionManager {
  private scene: THREE.Scene;
  private polygonMeshesRef: MutableRefObject<Record<string, THREE.Mesh>>;
  private activeView: ViewMode;
  private selectedPolygonId: string | null = null;
  private handleMouseClick: (event: MouseEvent) => void;
  private handleMouseDown: (event: MouseEvent) => void;
  private handleMouseMove: (event: MouseEvent) => void;
  private isProcessingClick: boolean = false;
  private isDragging: boolean = false;
  private mouseDownPosition = { x: 0, y: 0 };
  private hoveredPolygonId: string | null = null;
  private enabled: boolean = true;
  
  // Facade for Three.js interaction
  private interactionFacade: InteractionFacade;
  
  // Throttle settings for mouse move events
  private lastMoveTime = 0;
  private moveThrottleInterval: number; // ms between move processing
  private lastHoverCheckTime = 0;
  private hoverThrottleInterval: number; // ms between hover checks

  constructor({
    camera,
    scene,
    polygonMeshesRef,
    activeView,
    throttleInterval = 16 // Default to 16ms (roughly 60fps)
  }: InteractionManagerProps) {
    this.scene = scene;
    this.polygonMeshesRef = polygonMeshesRef;
    this.activeView = activeView;
    this.moveThrottleInterval = throttleInterval;
    this.hoverThrottleInterval = throttleInterval * 2; // Hover checks at half the frequency of move events
    
    // Create the interaction facade
    this.interactionFacade = new InteractionFacade(camera);
    
    // Subscribe to relevant events
    eventBus.subscribe(EventTypes.POLYGON_SELECTED, (data: { polygonId: string | null }) => {
      this.selectedPolygonId = data.polygonId;
    });
    
    // Bind methods to this instance
    this.handleMouseClick = this.onMouseClick.bind(this);
    this.handleMouseDown = this.onMouseDown.bind(this);
    this.handleMouseMove = this.onMouseMove.bind(this);
    
    // Add event listeners
    window.addEventListener('click', this.handleMouseClick);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mousemove', this.handleMouseMove);
  }
  
  private onMouseDown(event: MouseEvent) {
    // Skip if disabled
    if (!this.enabled) return;
    
    this.mouseDownPosition = { x: event.clientX, y: event.clientY };
    this.isDragging = false;
    
    // Emit mouse down event
    eventBus.emit(EventTypes.INTERACTION_MOUSE_DOWN, {
      x: event.clientX,
      y: event.clientY,
      button: event.button
    });
  }
  
  private onMouseMove(event: MouseEvent) {
    // Skip if disabled
    if (!this.enabled) return;
    
    const now = performance.now();
    
    // Always update the mouse position in the facade for accurate raycasting
    // even if we throttle other operations
    this.interactionFacade.updateMousePosition(event.clientX, event.clientY);
    
    // Throttle mouse move event processing for better performance
    if (now - this.lastMoveTime < this.moveThrottleInterval) {
      return;
    }
    this.lastMoveTime = now;
    
    // Emit mouse move event with coordinates
    eventBus.emit(EventTypes.INTERACTION_MOUSE_MOVE, {
      x: event.clientX,
      y: event.clientY,
      buttons: event.buttons
    });
    
    // If mouse is down and has moved more than a few pixels, consider it a drag
    if (event.buttons > 0) {
      const isDragging = this.interactionFacade.hasMovedSignificantly(
        event.clientX, 
        event.clientY, 
        this.mouseDownPosition.x, 
        this.mouseDownPosition.y, 
        3
      );
      
      if (isDragging) {
        this.isDragging = true;
        eventBus.emit(EventTypes.INTERACTION_DRAG, {
          x: event.clientX,
          y: event.clientY,
          startX: this.mouseDownPosition.x,
          startY: this.mouseDownPosition.y
        });
      }
      return; // Skip hover detection during dragging
    }
    
    // Throttle hover detection separately (less frequent than move events)
    // This is more expensive due to raycasting
    if (now - this.lastHoverCheckTime < this.hoverThrottleInterval) {
      return;
    }
    this.lastHoverCheckTime = now;
    
    // Find intersected polygon using the facade
    const hoveredId = this.interactionFacade.findIntersectedObjectId(this.polygonMeshesRef.current);
    
    if (hoveredId) {
      if (this.hoveredPolygonId !== hoveredId) {
        // Update hover state through event bus
        eventBus.emit(EventTypes.POLYGON_HOVER, { polygonId: hoveredId });
        this.hoveredPolygonId = hoveredId;
        
        // Set cursor to pointer to indicate interactivity
        document.body.style.cursor = 'pointer';
      }
    } else if (this.hoveredPolygonId) {
      // If we're not hovering over any polygon but we were before
      eventBus.emit(EventTypes.POLYGON_HOVER, { polygonId: null });
      this.hoveredPolygonId = null;
      
      // Reset cursor
      document.body.style.cursor = 'default';
    }
  }
  
  private onMouseClick(event: MouseEvent) {
    // Skip if disabled
    if (!this.enabled) return;
    
    // Skip if this click is for road creation
    if ((event as any).isRoadCreationClick) {
      console.log('InteractionManager: Skipping click handling for road creation');
      return;
    }
    
    // Prevent processing if already handling a click
    if (this.isProcessingClick) return;
    
    // Only handle left-click with no modifier keys
    if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
      return;
    }
    
    // CRITICAL: Check if this is a drag end event rather than a true click
    if (this.isDragging) {
      this.isDragging = false;
      eventBus.emit(EventTypes.INTERACTION_DRAG_END, {
        x: event.clientX,
        y: event.clientY
      });
      return;
    }
    
    // Check if moved significantly from mousedown position
    if (this.interactionFacade.hasMovedSignificantly(
      event.clientX, 
      event.clientY, 
      this.mouseDownPosition.x, 
      this.mouseDownPosition.y
    )) {
      return;
    }
    
    this.isProcessingClick = true;
    
    try {
      // Emit raw click event
      eventBus.emit(EventTypes.INTERACTION_CLICK, {
        x: event.clientX,
        y: event.clientY,
        button: event.button
      });
      
      // Update mouse position in the facade
      this.interactionFacade.updateMousePosition(event.clientX, event.clientY);
      
      // Find intersected polygon using the facade
      let clickedId = this.interactionFacade.findIntersectedObjectId(this.polygonMeshesRef.current);
      
      // If no polygon was found, try with increased precision
      if (!clickedId) {
        clickedId = this.interactionFacade.findIntersectedObjectIdWithIncreasedPrecision(
          this.polygonMeshesRef.current
        );
        
        if (clickedId) {
          console.log(`Second pass selection: ${clickedId}`);
        }
      } else {
        console.log(`Selecting polygon: ${clickedId}`);
      }
      
      if (clickedId) {
        // Only toggle selection if clicking the same polygon
        // Otherwise, always select the new polygon
        const newSelectedId = clickedId === this.selectedPolygonId ? null : clickedId;
        
        // Update selection state through event bus only
        eventBus.emit(EventTypes.POLYGON_SELECTED, { polygonId: newSelectedId });
        this.selectedPolygonId = newSelectedId;
      } else if (this.selectedPolygonId) {
        // Clicking on empty space, deselect current selection
        eventBus.emit(EventTypes.POLYGON_SELECTED, { polygonId: null });
        this.selectedPolygonId = null;
      }
      
      this.isProcessingClick = false;
    } catch (error) {
      console.error("Error in polygon interaction:", error);
      this.isProcessingClick = false;
    }
  }
  
  /**
   * Update the active view mode
   * @param activeView The new view mode
   */
  public updateViewMode(activeView: ViewMode) {
    this.activeView = activeView;
  }
  
  /**
   * Update throttling intervals for performance tuning
   * @param moveInterval Milliseconds between processing move events
   * @param hoverInterval Milliseconds between processing hover detection (defaults to 2x moveInterval)
   */
  public updateThrottleIntervals(moveInterval: number, hoverInterval?: number) {
    this.moveThrottleInterval = moveInterval;
    this.hoverThrottleInterval = hoverInterval || moveInterval * 2;
  }
  
  /**
   * Enable or disable interaction
   * @param enabled Whether interaction is enabled
   */
  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }
  
  /**
   * Clean up resources and event listeners
   */
  public cleanup() {
    // Remove event listeners
    window.removeEventListener('click', this.handleMouseClick);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mousemove', this.handleMouseMove);
    
    // Dispose the facade
    this.interactionFacade.dispose();
  }
}
