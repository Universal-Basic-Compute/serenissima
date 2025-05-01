import * as THREE from 'three';
import { MutableRefObject } from 'react';
import { gsap } from 'gsap';
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
  private hoveredPolygonId: string | null;
  private setHoveredPolygonId: (id: string | null) => void;
  private selectedPolygonId: string | null;
  private setSelectedPolygonId: (id: string | null) => void;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private handleMouseMove: (event: MouseEvent) => void;
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
    this.hoveredPolygonId = hoveredPolygonId;
    this.setHoveredPolygonId = setHoveredPolygonId;
    this.selectedPolygonId = selectedPolygonId;
    this.setSelectedPolygonId = setSelectedPolygonId;
    
    // Create a raycaster for mouse interaction
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // Bind methods to this instance
    this.handleMouseMove = this.onMouseMove.bind(this);
    this.handleMouseClick = this.onMouseClick.bind(this);
    
    // Add event listeners
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('click', this.handleMouseClick);
  }
  
  private onMouseMove(event: MouseEvent) {
    // CRITICAL: If any mouse button is pressed, don't do ANY interaction
    // This ensures camera controls have complete priority
    if (event.buttons !== 0) {
      return;
    }
    
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Update the raycaster with the camera and mouse position
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Get objects intersecting the ray
    const intersects = this.raycaster.intersectObjects(this.scene.children, false);
    
    // Find the currently hovered polygon
    let currentHoveredId = null;
    
    if (intersects.length > 0) {
      const object = intersects[0].object;
      
      // Find the polygon ID from our ref
      const hoveredId = Object.keys(this.polygonMeshesRef.current).find(
        id => this.polygonMeshesRef.current[id] === object
      );
      
      // Set as hovered regardless of selection state
      if (hoveredId) {
        currentHoveredId = hoveredId;
      }
    }
    
    // CRITICAL CHANGE: Only update the hovered polygon ID if it has changed
    // AND don't update if we're in the middle of a camera operation
    if (currentHoveredId !== this.hoveredPolygonId && !(this.camera.userData.isMoving)) {
      // Store the current camera position to detect if it changes
      const currentCameraPosition = this.camera.position.clone();
      const currentCameraTarget = this.camera.getWorldDirection(new THREE.Vector3());
      
      // Update the hovered polygon ID
      this.setHoveredPolygonId(currentHoveredId);
      this.hoveredPolygonId = currentHoveredId;
      
      // Check if camera position changed during the hover update
      if (!this.camera.position.equals(currentCameraPosition) || 
          !this.camera.getWorldDirection(new THREE.Vector3()).equals(currentCameraTarget)) {
        console.log("Camera position changed during hover - restoring");
        // Restore camera position
        this.camera.position.copy(currentCameraPosition);
        // We can't directly set world direction, but we can ensure the camera is looking at the same point
        const targetPoint = new THREE.Vector3().addVectors(
          currentCameraPosition, 
          currentCameraTarget.multiplyScalar(10) // Look 10 units ahead in the direction
        );
        this.camera.lookAt(targetPoint);
      }
    }
  }
  
  private onMouseClick(event: MouseEvent) {
    // CRITICAL: Only handle left-click when no modifier keys are pressed
    // This ensures camera controls have complete priority
    if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
      return;
    }
    
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
        // If clicking the same polygon, deselect it
        if (clickedId === this.selectedPolygonId) {
          this.setSelectedPolygonId(null);
          this.selectedPolygonId = null;
        } else {
          // Select the new polygon
          this.setSelectedPolygonId(clickedId);
          this.selectedPolygonId = clickedId;
        }
      }
    } else {
      // Clicking on empty space, deselect current selection
      if (this.selectedPolygonId) {
        this.setSelectedPolygonId(null);
        this.selectedPolygonId = null;
      }
    }
  }
  
  public cleanup() {
    // Remove event listeners
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('click', this.handleMouseClick);
  }
}
