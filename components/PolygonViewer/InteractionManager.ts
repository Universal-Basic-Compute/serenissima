import * as THREE from 'three';
import { MutableRefObject } from 'react';
import { ViewMode } from './types';

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
    
    // Modify the setHoveredPolygonId function to dispatch a custom event
    this.setHoveredPolygonId = (id: string | null) => {
      // Dispatch a custom event for hover state changes
      window.dispatchEvent(new CustomEvent('polygonHover', {
        detail: { polygonId: id }
      }));
      
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
    this.mouseDownPosition = { x: event.clientX, y: event.clientY };
    this.isDragging = false;
  }
  
  private onMouseMove(event: MouseEvent) {
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
    
    // IMPORTANT CHANGE: Use recursive=true to check all children of objects
    // This ensures we detect all meshes, including those in LOD groups
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    // Check if we're hovering over a polygon
    if (intersects.length > 0) {
      // Find the first intersected object that is a polygon mesh or its child
      for (const intersect of intersects) {
        // Get the object or its parent if it's a child mesh
        const object = intersect.object;
        let targetObject = object;
        
        // Traverse up the parent chain to find the root mesh
        while (targetObject.parent && !(targetObject instanceof THREE.Mesh)) {
          targetObject = targetObject.parent;
        }
        
        // Find the polygon ID from our ref
        const hoveredId = Object.keys(this.polygonMeshesRef.current).find(
          id => this.polygonMeshesRef.current[id] === targetObject || 
               this.polygonMeshesRef.current[id] === object
        );
        
        if (hoveredId) {
          if (this.hoveredPolygonId !== hoveredId) {
            // Update hover state
            this.setHoveredPolygonId(hoveredId);
            this.hoveredPolygonId = hoveredId;
          }
          return; // Exit after finding the first valid polygon
        }
      }
    }
    
    // If we get here, we're not hovering over any polygon
    if (this.hoveredPolygonId) {
      this.setHoveredPolygonId(null);
      this.hoveredPolygonId = null;
    }
  }
  
  private onMouseClick(event: MouseEvent) {
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
    
    this.isProcessingClick = true;
    
    try {
      // Calculate mouse position in normalized device coordinates (-1 to +1)
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      // Update the raycaster with the camera and mouse position
      this.raycaster.setFromCamera(this.mouse, this.camera);
      
      // IMPORTANT CHANGE: Use recursive=true to check all children of objects
      const intersects = this.raycaster.intersectObjects(this.scene.children, true);
      
      // Check if we're clicking on a polygon
      if (intersects.length > 0) {
        // Find the first intersected object that is a polygon mesh or its child
        for (const intersect of intersects) {
          // Get the object or its parent if it's a child mesh
          const object = intersect.object;
          let targetObject = object;
          
          // Traverse up the parent chain to find the root mesh
          while (targetObject.parent && !(targetObject instanceof THREE.Mesh)) {
            targetObject = targetObject.parent;
          }
          
          // Find the polygon ID from our ref
          const clickedId = Object.keys(this.polygonMeshesRef.current).find(
            id => this.polygonMeshesRef.current[id] === targetObject || 
                 this.polygonMeshesRef.current[id] === object
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
            
            this.isProcessingClick = false;
            return; // Exit after finding the first valid polygon
          }
        }
      } 
      
      // Clicking on empty space, deselect current selection
      if (this.selectedPolygonId) {
        this.setSelectedPolygonId(null);
        this.selectedPolygonId = null;
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
  
  public cleanup() {
    // Remove event listeners
    window.removeEventListener('click', this.handleMouseClick);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mousemove', this.handleMouseMove);
  }
}
