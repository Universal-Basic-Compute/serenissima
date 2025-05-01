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
    
    // Create a raycaster for mouse interaction
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
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
    }
  }
  
  private onMouseClick(event: MouseEvent) {
    // Log camera position before click processing
    console.log('Camera position BEFORE click:', {
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone()
    });
    
    // Prevent processing if already handling a click
    if (this.isProcessingClick) return;
    
    // Only handle left-click with no modifier keys
    if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
      return;
    }
    
    // CRITICAL: Check if this is a drag end event rather than a true click
    // This helps distinguish between camera panning and actual clicks
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
      
      // Get objects intersecting the ray
      const intersects = this.raycaster.intersectObjects(this.scene.children, false);
      
      // Check if we're clicking on a polygon
      if (intersects.length > 0) {
        const object = intersects[0].object;
        
        // Find the polygon ID from our ref
        const clickedId = Object.keys(this.polygonMeshesRef.current).find(
          id => this.polygonMeshesRef.current[id] === object
        );
        
        if (clickedId) {
          // Log that we're selecting a polygon
          console.log(`Selecting polygon: ${clickedId}`);
          
          // Toggle selection state
          const newSelectedId = clickedId === this.selectedPolygonId ? null : clickedId;
          
          // Log camera position before state update
          console.log('Camera position BEFORE state update:', {
            position: this.camera.position.clone(),
            quaternion: this.camera.quaternion.clone()
          });
          
          // Update selection state directly without setTimeout
          // This avoids unnecessary re-renders
          this.setSelectedPolygonId(newSelectedId);
          this.selectedPolygonId = newSelectedId;
          
          // Log camera position after state update
          console.log('Camera position AFTER state update:', {
            position: this.camera.position.clone(),
            quaternion: this.camera.quaternion.clone()
          });
          
          this.isProcessingClick = false;
          return;
        }
      } 
      
      // Clicking on empty space, deselect current selection
      if (this.selectedPolygonId) {
        // Log camera position before deselection
        console.log('Camera position BEFORE deselection:', {
          position: this.camera.position.clone(),
          quaternion: this.camera.quaternion.clone()
        });
        
        // Update selection state directly without setTimeout
        this.setSelectedPolygonId(null);
        this.selectedPolygonId = null;
        
        // Log camera position after deselection
        console.log('Camera position AFTER deselection:', {
          position: this.camera.position.clone(),
          quaternion: this.camera.quaternion.clone()
        });
        
        this.isProcessingClick = false;
        return;
      }
      
      // If we get here, we didn't click on anything
      this.isProcessingClick = false;
    } catch (error) {
      console.error("Error in polygon interaction:", error);
      this.isProcessingClick = false;
    }
    
    // Log camera position after click processing
    console.log('Camera position AFTER click:', {
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone()
    });
  }
  
  public cleanup() {
    // Remove event listeners
    window.removeEventListener('click', this.handleMouseClick);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mousemove', this.handleMouseMove);
  }
}
