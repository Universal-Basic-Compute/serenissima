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
    
    // If the hovered polygon has changed
    if (currentHoveredId !== this.hoveredPolygonId) {
      // Remove hover effect from previously hovered polygon
      if (this.hoveredPolygonId) {
        const previousHovered = this.polygonMeshesRef.current[this.hoveredPolygonId];
        if (previousHovered && previousHovered.material) {
          // Cancel any ongoing hover animations
          gsap.killTweensOf(previousHovered.material.emissive);
          gsap.killTweensOf(previousHovered.material);
          
          // If this is the selected polygon, restore selection effect
          if (this.hoveredPolygonId === this.selectedPolygonId) {
            // Restore selection effect
            gsap.to(previousHovered.material.emissive, {
              r: 0,
              g: 1.0,
              b: 0,
              duration: 0.3
            });
            
            gsap.to(previousHovered.material, {
              emissiveIntensity: 0.8,
              duration: 0.3
            });
          } else {
            // Otherwise reset to original values
            gsap.to(previousHovered.material.emissive, {
              r: previousHovered.userData.originalEmissive?.r || 0,
              g: previousHovered.userData.originalEmissive?.g || 0,
              b: previousHovered.userData.originalEmissive?.b || 0,
              duration: 0.3
            });
            
            gsap.to(previousHovered.material, {
              emissiveIntensity: previousHovered.userData.originalEmissiveIntensity || 0,
              duration: 0.3
            });
            
            // Reset position when hover is removed
            gsap.to(previousHovered.position, {
              y: 0,
              duration: 0.3
            });
          }
        }
      }
      
      // Apply hover effect to newly hovered polygon
      if (currentHoveredId) {
        const newHovered = this.polygonMeshesRef.current[currentHoveredId];
        if (newHovered && newHovered.material) {
          // Store original material properties if not already stored
          if (!newHovered.userData.originalEmissive) {
            newHovered.userData.originalEmissive = newHovered.material.emissive.clone();
            newHovered.userData.originalEmissiveIntensity = newHovered.material.emissiveIntensity;
          }
          
          // Cancel any ongoing animations
          gsap.killTweensOf(newHovered.material.emissive);
          gsap.killTweensOf(newHovered.material);
          
          // If this is the selected polygon, use a different hover effect
          if (currentHoveredId === this.selectedPolygonId) {
            // Brighten the selection effect slightly
            gsap.to(newHovered.material.emissive, {
              r: 0.2,
              g: 1.0,
              b: 0.2,
              duration: 0.3
            });
            
            gsap.to(newHovered.material, {
              emissiveIntensity: 1.0,
              duration: 0.3
            });
          } else {
            // Apply standard hover effect
            gsap.to(newHovered.material.emissive, {
              r: 0.53,
              g: 1.0,
              b: 0.53,
              duration: 0.3
            });
            
            gsap.to(newHovered.material, {
              emissiveIntensity: 0.5,
              duration: 0.3
            });
            
            // Make the polygon "pop up" when hovered
            gsap.to(newHovered.position, {
              y: 0.2, // Move it slightly upward
              duration: 0.3
            });
          }
        }
      }
      
      // Update the hovered polygon ID
      this.setHoveredPolygonId(currentHoveredId);
      this.hoveredPolygonId = currentHoveredId;
    }
  }
  
  private onMouseClick(event: MouseEvent) {
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
          
          // Remove selection effect with animation
          if (object.material) {
            // Kill any existing tweens
            gsap.killTweensOf(object.material.emissive);
            gsap.killTweensOf(object.material);
            
            // Animate back to original material properties
            gsap.to(object.material.emissive, {
              r: object.userData.originalEmissive?.r || 0,
              g: object.userData.originalEmissive?.g || 0,
              b: object.userData.originalEmissive?.b || 0,
              duration: 0.5
            });
            
            gsap.to(object.material, {
              emissiveIntensity: object.userData.originalEmissiveIntensity || 0,
              duration: 0.5
            });
            
            // Reset position with animation
            gsap.to(object.position, {
              y: 0,
              duration: 0.5
            });
            
            // Fade out the outline mesh if it exists
            if (object.userData.outlineMesh) {
              gsap.to(object.userData.outlineMesh.material, {
                opacity: 0,
                duration: 0.3,
                onComplete: () => {
                  // Remove the outline mesh from the scene
                  this.scene.remove(object.userData.outlineMesh);
                  // Clean up
                  object.userData.outlineMesh.geometry.dispose();
                  object.userData.outlineMesh.material.dispose();
                  object.userData.outlineMesh = null;
                }
              });
            }
          }
        } else {
          // Deselect previous selection if any
          if (this.selectedPolygonId) {
            const previousSelected = this.polygonMeshesRef.current[this.selectedPolygonId];
            if (previousSelected && previousSelected.material) {
              // Animate back to original material properties
              gsap.to(previousSelected.material.emissive, {
                r: previousSelected.userData.originalEmissive?.r || 0,
                g: previousSelected.userData.originalEmissive?.g || 0,
                b: previousSelected.userData.originalEmissive?.b || 0,
                duration: 0.5
              });
              
              gsap.to(previousSelected.material, {
                emissiveIntensity: previousSelected.userData.originalEmissiveIntensity || 0,
                duration: 0.5
              });
            
              // Reset position with animation
              gsap.to(previousSelected.position, {
                y: 0,
                duration: 0.5
              });
              
              // Fade out the outline mesh if it exists
              if (previousSelected.userData.outlineMesh) {
                gsap.to(previousSelected.userData.outlineMesh.material, {
                  opacity: 0,
                  duration: 0.3,
                  onComplete: () => {
                    // Remove the outline mesh from the scene
                    this.scene.remove(previousSelected.userData.outlineMesh);
                    // Clean up
                    previousSelected.userData.outlineMesh.geometry.dispose();
                    previousSelected.userData.outlineMesh.material.dispose();
                    previousSelected.userData.outlineMesh = null;
                  }
                });
              }
            }
          }
          
          // Select the new polygon
          this.setSelectedPolygonId(clickedId);
          this.selectedPolygonId = clickedId;
          
          // Apply selection effect with animation
          if (object.material) {
            // Store original material properties if not already stored
            if (!object.userData.originalEmissive) {
              object.userData.originalEmissive = object.material.emissive.clone();
              object.userData.originalEmissiveIntensity = object.material.emissiveIntensity;
            }
              
            // Animate selection effect - stronger than hover
            gsap.to(object.material.emissive, {
              r: 0,    // 0x00/255
              g: 1.0,  // 0xff/255
              b: 0,    // 0x00/255
              duration: 0.5
            });
              
            gsap.to(object.material, {
              emissiveIntensity: 0.8,
              duration: 0.5
            });
              
            // Instead of using OutlinePass, let's create a simple outline effect
            // by duplicating the mesh and scaling it slightly larger
            if (!object.userData.outlineMesh) {
              // Clone the geometry
              const outlineGeometry = object.geometry.clone();
                
              // Create outline material
              const outlineMaterial = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                side: THREE.BackSide,
                transparent: true,
                opacity: 0,
                depthTest: true
              });
                
              // Create outline mesh
              const outlineMesh = new THREE.Mesh(outlineGeometry, outlineMaterial);
              outlineMesh.scale.multiplyScalar(1.01); // Make it slightly larger
              outlineMesh.position.copy(object.position);
              outlineMesh.rotation.copy(object.rotation);
              this.scene.add(outlineMesh);
                
              // Store reference to outline mesh
              object.userData.outlineMesh = outlineMesh;
            } else {
              // If outline mesh already exists, make sure it's visible
              object.userData.outlineMesh.visible = true;
              this.scene.add(object.userData.outlineMesh);
            }
              
            // Animate the outline opacity
            gsap.to(object.userData.outlineMesh.material, {
              opacity: 0.5, // Increased from 0.3 to 0.5
              duration: 0.5
            });
            
            // Make the outline slightly larger for better visibility
            gsap.to(object.userData.outlineMesh.scale, {
              x: 1.015,
              y: 1.015,
              z: 1.015,
              duration: 0.5
            });
            
            // Make the selected polygon pop up more prominently
            gsap.to(object.position, {
              y: 0.3, // Higher than hover effect
              duration: 0.5
            });
          }
        }
      }
    } else {
      // Clicking on empty space, deselect current selection
      if (this.selectedPolygonId) {
        const previousSelected = this.polygonMeshesRef.current[this.selectedPolygonId];
        if (previousSelected && previousSelected.material) {
          // Animate back to original material properties
          gsap.to(previousSelected.material.emissive, {
            r: previousSelected.userData.originalEmissive?.r || 0,
            g: previousSelected.userData.originalEmissive?.g || 0,
            b: previousSelected.userData.originalEmissive?.b || 0,
            duration: 0.5
          });
            
          gsap.to(previousSelected.material, {
            emissiveIntensity: previousSelected.userData.originalEmissiveIntensity || 0,
            duration: 0.5
          });
            
          // Fade out the outline mesh if it exists
          if (previousSelected.userData.outlineMesh) {
            gsap.to(previousSelected.userData.outlineMesh.material, {
              opacity: 0,
              duration: 0.3,
              onComplete: () => {
                // Remove the outline mesh from the scene
                this.scene.remove(previousSelected.userData.outlineMesh);
                // Clean up
                previousSelected.userData.outlineMesh.geometry.dispose();
                previousSelected.userData.outlineMesh.material.dispose();
                previousSelected.userData.outlineMesh = null;
              }
            });
          }
        }
          
        this.setSelectedPolygonId(null);
        this.selectedPolygonId = null;
      }
    }
  }
  
  public cleanup() {
    // Remove event listeners
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('click', this.handleMouseClick);
    
    // Clean up any outline meshes and animations
    Object.values(this.polygonMeshesRef.current).forEach(mesh => {
      // Kill any ongoing animations
      gsap.killTweensOf(mesh.position);
      gsap.killTweensOf(mesh.material);
      gsap.killTweensOf(mesh.material.emissive);
      
      if (mesh.userData.outlineMesh) {
        gsap.killTweensOf(mesh.userData.outlineMesh.scale);
        gsap.killTweensOf(mesh.userData.outlineMesh.material);
        this.scene.remove(mesh.userData.outlineMesh);
        mesh.userData.outlineMesh.geometry.dispose();
        mesh.userData.outlineMesh.material.dispose();
        mesh.userData.outlineMesh = null;
      }
    });
  }
}
