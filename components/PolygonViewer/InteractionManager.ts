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
    // CRITICAL: Only handle left-click when no modifier keys are pressed
    if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
      return;
    }
    
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
        // ONLY update the selection state, nothing else
        // Don't touch the camera at all
        this.setSelectedPolygonId(clickedId === this.selectedPolygonId ? null : clickedId);
        this.selectedPolygonId = clickedId === this.selectedPolygonId ? null : clickedId;
      }
    } else {
      // Clicking on empty space, deselect current selection
      if (this.selectedPolygonId) {
        this.setSelectedPolygonId(null);
        this.selectedPolygonId = null;
      }
    }
    
    // DO NOT touch the camera at all - no camera-related code here
  }
  
  public cleanup() {
    // Remove event listeners
    window.removeEventListener('click', this.handleMouseClick);
  }
}
