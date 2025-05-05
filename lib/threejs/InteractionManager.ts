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
  hoveredPolygonId: string | null;
  setHoveredPolygonId: (id: string | null) => void;
  selectedPolygonId: string | null;
  setSelectedPolygonId: (id: string | null) => void;
}

/**
 * Manages user interactions with 3D objects in the scene
 * Uses InteractionFacade to abstract Three.js complexity
 */
export class InteractionManager {
  private scene: THREE.Scene;
  private polygonMeshesRef: MutableRefObject<Record<string, THREE.Mesh>>;
  private activeView: ViewMode;
  private selectedPolygonId: string | null;
  private setSelectedPolygonId: (id: string | null) => void;
  private handleMouseClick: (event: MouseEvent) => void;
  private handleMouseDown: (event: MouseEvent) => void;
  private handleMouseMove: (event: MouseEvent) => void;
  private isProcessingClick: boolean = false;
  private isDragging: boolean = false;
  private mouseDownPosition = { x: 0, y: 0 };
  private hoveredPolygonId: string | null;
  private setHoveredPolygonId: (id: string | null) => void;
  private enabled: boolean = true;
  
  // Facade for Three.js interaction
  private interactionFacade: InteractionFacade;
  
  // Throttle mouse move events
  private lastMoveTime = 0;
  private moveThrottleInterval = 16; // ms (roughly 60fps)

  constructor({
    camera,
    scene,
    polygonMeshesRef,
    activeView,
    hoveredPolygonId,
    setHoveredPolygonId,
    selectedPolygonId,
    setSelectedPolygonId
  }: InteractionManagerProps) {
    this.scene = scene;
    this.polygonMeshesRef = polygonMeshesRef;
    this.activeView = activeView;
    this.selectedPolygonId = selectedPolygonId;
    this.setSelectedPolygonId = setSelectedPolygonId;
    this.hoveredPolygonId = hoveredPolygonId;
    
    // Create the interaction facade
    this.interactionFacade = new InteractionFacade(camera);
    
    // Store the original setHoveredPolygonId function
    const originalSetHoveredPolygonId = setHoveredPolygonId;
    
    // Modify the setHoveredPolygonId function to use the event bus
    this.setHoveredPolygonId = (id: string | null) => {
      // Use event bus for hover state changes
      eventBus.emit(EventTypes.POLYGON_HOVER, { polygonId: id });
      
      // Call the original setHoveredPolygonId function
      originalSetHoveredPolygonId(id);
    };
    
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
  }
  
  private onMouseMove(event: MouseEvent) {
    // Skip if disabled
    if (!this.enabled) return;
    
    // Throttle mouse move events for better performance
    const now = performance.now();
    if (now - this.lastMoveTime < this.moveThrottleInterval) {
      return;
    }
    this.lastMoveTime = now;
    
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
      }
      return; // Skip hover detection during dragging
    }
    
    // Update mouse position in the facade
    this.interactionFacade.updateMousePosition(event.clientX, event.clientY);
    
    // Find intersected polygon using the facade
    const hoveredId = this.interactionFacade.findIntersectedObjectId(this.polygonMeshesRef.current);
    
    if (hoveredId) {
      if (this.hoveredPolygonId !== hoveredId) {
        // Update hover state
        this.setHoveredPolygonId(hoveredId);
        this.hoveredPolygonId = hoveredId;
        
        // Set cursor to pointer to indicate interactivity
        document.body.style.cursor = 'pointer';
      }
    } else if (this.hoveredPolygonId) {
      // If we're not hovering over any polygon but we were before
      this.setHoveredPolygonId(null);
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
        
        // Update selection state
        this.setSelectedPolygonId(newSelectedId);
        this.selectedPolygonId = newSelectedId;
        
        // Use event bus for selection events
        eventBus.emit(EventTypes.POLYGON_SELECTED, { polygonId: newSelectedId });
      } else if (this.selectedPolygonId) {
        // Clicking on empty space, deselect current selection
        this.setSelectedPolygonId(null);
        this.selectedPolygonId = null;
        
        // Use event bus for deselection
        eventBus.emit(EventTypes.POLYGON_SELECTED, { polygonId: null });
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
