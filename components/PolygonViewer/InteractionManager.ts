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
  private isProcessingClick: boolean = false;

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
    
    // Add event listeners
    window.addEventListener('click', this.handleMouseClick);
  }
  
  private onMouseClick(event: MouseEvent) {
    // Prevent processing if already handling a click
    if (this.isProcessingClick) return;
    this.isProcessingClick = true;
    
    // Only handle left-click with no modifier keys
    if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
      this.isProcessingClick = false;
      return;
    }
    
    // If any mouse button is pressed (during drag), don't process
    if (event.buttons !== 1) {
      this.isProcessingClick = false;
      return;
    }
    
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
          // Toggle selection state
          const newSelectedId = clickedId === this.selectedPolygonId ? null : clickedId;
          
          // Use setTimeout to defer state update to next tick
          setTimeout(() => {
            this.setSelectedPolygonId(newSelectedId);
            this.selectedPolygonId = newSelectedId;
            this.isProcessingClick = false;
          }, 0);
          return;
        }
      } 
      
      // Clicking on empty space, deselect current selection
      if (this.selectedPolygonId) {
        setTimeout(() => {
          this.setSelectedPolygonId(null);
          this.selectedPolygonId = null;
          this.isProcessingClick = false;
        }, 0);
        return;
      }
    } catch (error) {
      console.error("Error in polygon interaction:", error);
    }
    
    this.isProcessingClick = false;
  }
  
  public cleanup() {
    // Remove event listeners
    window.removeEventListener('click', this.handleMouseClick);
  }
}
