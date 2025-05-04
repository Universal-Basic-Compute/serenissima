/**
 * TODO: Refactor according to architecture
 * - Move to lib/threejs directory as part of the rendering layer
 * - Implement facade pattern to hide Three.js complexity
 * - Use event bus consistently for all interactions
 * - Add throttling for better performance
 * - Improve error handling
 */
import * as THREE from 'three';
import { MutableRefObject } from 'react';
import { ViewMode } from './types';
import { eventBus, EventTypes } from '../../lib/eventBus';

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

export default class InteractionManager {
  private camera: THREE.PerspectiveCamera;
  private scene: THREE.Scene;
  private polygonMeshesRef: MutableRefObject<Record<string, THREE.Mesh>>;
  private activeView: ViewMode;
  private selectedPolygonId: string | null;
  private setSelectedPolygonId: (id: string | null) => void;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private handleMouseClick: (event: MouseEvent) => void;
  private handleMouseDown: (event: MouseEvent) => void;
  private handleMouseMove: (event: MouseEvent) => void;
  private isProcessingClick: boolean = false;
  private isDragging: boolean = false;
  private mouseDownPosition = { x: 0, y: 0 };
  private hoveredPolygonId: string | null;
  private setHoveredPolygonId: (id: string | null) => void;
  private enabled: boolean = true;

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
    this.camera = camera;
    this.scene = scene;
    this.polygonMeshesRef = polygonMeshesRef;
    this.activeView = activeView;
    this.selectedPolygonId = selectedPolygonId;
    this.setSelectedPolygonId = setSelectedPolygonId;
    this.hoveredPolygonId = hoveredPolygonId; // Initialize the property
    
    // Create a raycaster for mouse interaction
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
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
  
  // Throttle mouse move events
  private lastMoveTime = 0;
  private moveThrottleInterval = 16; // ms (roughly 60fps)
  
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
      const dx = Math.abs(event.clientX - this.mouseDownPosition.x);
      const dy = Math.abs(event.clientY - this.mouseDownPosition.y);
      if (dx > 3 || dy > 3) {
        this.isDragging = true;
      }
      return; // Skip hover detection during dragging
    }
    
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Update the raycaster with the camera and mouse position
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Optimize raycasting by filtering objects first
    const potentialTargets = [];
    for (const id in this.polygonMeshesRef.current) {
      const mesh = this.polygonMeshesRef.current[id];
      if (mesh && mesh.visible) {
        potentialTargets.push(mesh);
      }
    }
    
    // Only raycast against potential polygon targets
    const intersects = this.raycaster.intersectObjects(potentialTargets, false);
    
    // Check if we're hovering over a polygon
    if (intersects.length > 0) {
      // Find the first intersected object that is a polygon mesh
      for (const intersect of intersects) {
        const object = intersect.object;
        
        // Find the polygon ID from our ref
        const hoveredId = Object.keys(this.polygonMeshesRef.current).find(
          id => this.polygonMeshesRef.current[id] === object
        );
        
        if (hoveredId) {
          if (this.hoveredPolygonId !== hoveredId) {
            // Update hover state
            this.setHoveredPolygonId(hoveredId);
            this.hoveredPolygonId = hoveredId;
            
            // Use event bus for hover events
            eventBus.emit(EventTypes.POLYGON_HOVER, { polygonId: hoveredId });
            
            // Set cursor to pointer to indicate interactivity
            document.body.style.cursor = 'pointer';
          }
          return; // Exit after finding the first valid polygon
        }
      }
    }
    
    // If we get here, we're not hovering over any polygon
    if (this.hoveredPolygonId) {
      this.setHoveredPolygonId(null);
      this.hoveredPolygonId = null;
      
      // Use event bus for hover end events
      eventBus.emit(EventTypes.POLYGON_HOVER, { polygonId: null });
      
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
    
    // Calculate distance moved from mousedown position
    const dx = Math.abs(event.clientX - this.mouseDownPosition.x);
    const dy = Math.abs(event.clientY - this.mouseDownPosition.y);
    
    // If moved more than a few pixels, consider it a drag not a click
    if (dx > 5 || dy > 5) {
      return;
    }
    
    this.isProcessingClick = true;
    
    try {
      // Calculate mouse position in normalized device coordinates (-1 to +1)
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      // Update the raycaster with the camera and mouse position
      this.raycaster.setFromCamera(this.mouse, this.camera);
      
      // Optimize raycasting by filtering objects first
      const potentialTargets = [];
      for (const id in this.polygonMeshesRef.current) {
        const mesh = this.polygonMeshesRef.current[id];
        if (mesh && mesh.visible) {
          potentialTargets.push(mesh);
        }
      }
      
      // Only raycast against potential polygon targets
      const intersects = this.raycaster.intersectObjects(potentialTargets, false);
      
      // Check if we're clicking on a polygon
      if (intersects.length > 0) {
        // Find the first intersected object that is a polygon mesh
        for (const intersect of intersects) {
          const object = intersect.object;
          
          // Find the polygon ID from our ref
          const clickedId = Object.keys(this.polygonMeshesRef.current).find(
            id => this.polygonMeshesRef.current[id] === object
          );
          
          if (clickedId) {
            // Log that we're selecting a polygon
            console.log(`Selecting polygon: ${clickedId}`);
            
            // Only toggle selection if clicking the same polygon
            // Otherwise, always select the new polygon
            const newSelectedId = clickedId === this.selectedPolygonId ? null : clickedId;
            
            // Update selection state
            this.setSelectedPolygonId(newSelectedId);
            this.selectedPolygonId = newSelectedId;
            
            // Use event bus instead of direct DOM events
            eventBus.emit(EventTypes.POLYGON_SELECTED, { polygonId: newSelectedId });
            
            this.isProcessingClick = false;
            return; // Exit after finding the first valid polygon
          }
        }
      } 
      
      // If we get here, we didn't hit any polygon
      
      // Try a second pass with a wider ray if we didn't hit anything
      // This helps with small or thin polygons that might be hard to click
      if (intersects.length === 0) {
        // Increase the raycaster's precision for small objects
        const originalLinePrecision = this.raycaster.params.Line?.threshold || 1;
        const originalPointsPrecision = this.raycaster.params.Points?.threshold || 1;
        
        this.raycaster.params.Line = { threshold: originalLinePrecision * 2 };
        this.raycaster.params.Points = { threshold: originalPointsPrecision * 2 };
        
        // Try again with increased precision
        const secondPassIntersects = this.raycaster.intersectObjects(potentialTargets, false);
        
        // Reset precision
        this.raycaster.params.Line = { threshold: originalLinePrecision };
        this.raycaster.params.Points = { threshold: originalPointsPrecision };
        
        if (secondPassIntersects.length > 0) {
          const object = secondPassIntersects[0].object;
          const clickedId = Object.keys(this.polygonMeshesRef.current).find(
            id => this.polygonMeshesRef.current[id] === object
          );
          
          if (clickedId) {
            console.log(`Second pass selection: ${clickedId}`);
            const newSelectedId = clickedId === this.selectedPolygonId ? null : clickedId;
            this.setSelectedPolygonId(newSelectedId);
            this.selectedPolygonId = newSelectedId;
            
            eventBus.emit(EventTypes.POLYGON_SELECTED, { polygonId: newSelectedId });
            
            this.isProcessingClick = false;
            return;
          }
        }
      }
      
      // Clicking on empty space, deselect current selection
      if (this.selectedPolygonId) {
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
  
  public updateViewMode(activeView: ViewMode) {
    this.activeView = activeView;
  }
  
  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }
  
  public cleanup() {
    // Remove event listeners
    window.removeEventListener('click', this.handleMouseClick);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mousemove', this.handleMouseMove);
  }
}
