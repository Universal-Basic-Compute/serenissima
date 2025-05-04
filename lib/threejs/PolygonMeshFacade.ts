import * as THREE from 'three';
import { Polygon, ViewMode } from '../../components/PolygonViewer/types';
import { normalizeCoordinates, createPolygonShape } from '../../components/PolygonViewer/utils';

/**
 * Facade for managing a single polygon mesh
 * Hides Three.js implementation details
 */
export class PolygonMeshFacade {
  private scene: THREE.Scene;
  private polygon: Polygon;
  private bounds: any;
  private activeView: ViewMode;
  private performanceMode: boolean;
  private mesh: THREE.Mesh | null = null;
  private textureLoader: THREE.TextureLoader;
  private isSelected: boolean = false;
  private isHovered: boolean = false;
  private originalColor: THREE.Color | null = null;
  private ownerColor: string | null = null;
  private ownerCoatOfArmsUrl: string | null = null;
  private isDisposed: boolean = false;

  constructor(
    scene: THREE.Scene,
    polygon: Polygon,
    bounds: any,
    activeView: ViewMode,
    performanceMode: boolean,
    textureLoader: THREE.TextureLoader,
    ownerColor: string | null = null,
    ownerCoatOfArmsUrl: string | null = null
  ) {
    this.scene = scene;
    this.polygon = polygon;
    this.bounds = bounds;
    this.activeView = activeView;
    this.performanceMode = performanceMode;
    this.textureLoader = textureLoader;
    this.ownerColor = ownerColor;
    this.ownerCoatOfArmsUrl = ownerCoatOfArmsUrl;
    
    // Create the mesh
    this.createMesh();
  }
  
  /**
   * Create the polygon mesh
   */
  private createMesh(): void {
    try {
      // Skip if coordinates are invalid
      if (!this.polygon.coordinates || this.polygon.coordinates.length < 3) {
        console.warn(`Invalid polygon coordinates for ${this.polygon.id}`);
        return;
      }
      
      // Normalize coordinates
      const normalizedCoords = normalizeCoordinates(
        this.polygon.coordinates,
        this.bounds.centerLat,
        this.bounds.centerLng,
        this.bounds.scale,
        this.bounds.latCorrectionFactor
      );
      
      // Create a shape from the coordinates
      const shape = createPolygonShape(normalizedCoords);
      
      // Create geometry from shape
      const geometry = new THREE.ShapeGeometry(shape);
      
      // Create material based on view mode
      const material = this.createMaterial();
      
      // Create mesh
      this.mesh = new THREE.Mesh(geometry, material);
      
      // Configure mesh properties
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.2; // Slightly above water
      this.mesh.renderOrder = 1;
      
      // Apply polygon offset to prevent z-fighting
      if (material instanceof THREE.Material) {
        material.polygonOffset = true;
        material.polygonOffsetFactor = 1;
        material.polygonOffsetUnits = 1;
      }
      
      // Add userData to identify this as a polygon
      this.mesh.userData = {
        isPolygon: true,
        polygonId: this.polygon.id
      };
      
      // Add to scene
      this.scene.add(this.mesh);
      
      // Store original color for hover/selection effects
      if (material instanceof THREE.MeshBasicMaterial) {
        this.originalColor = material.color.clone();
      }
      
    } catch (error) {
      console.error(`Error creating mesh for polygon ${this.polygon.id}:`, error);
    }
  }
  
  /**
   * Create material based on view mode
   */
  private createMaterial(): THREE.Material {
    if (this.activeView === 'land') {
      // Land view - use color based on owner
      const landColor = this.determineLandColor();
      
      return new THREE.MeshBasicMaterial({
        color: landColor,
        side: THREE.DoubleSide
      });
    } else {
      // Other views - use standard material with textures
      return new THREE.MeshStandardMaterial({
        color: 0xf5e9c8, // Sand color
        side: THREE.DoubleSide,
        transparent: false,
        roughness: 0.8,
        metalness: 0.1
      });
    }
  }
  
  /**
   * Determine the color for land based on owner
   */
  private determineLandColor(): THREE.Color {
    if (this.ownerColor) {
      // Blend the owner color with sand color for a more natural look
      const sandColor = new THREE.Color(0xf5e9c8); // Brighter sand color
      const ownerColor = new THREE.Color(this.ownerColor);
      return new THREE.Color().lerpColors(sandColor, ownerColor, 0.8);
    } else if (this.polygon.owner) {
      // If we have an owner but no color, use a default color
      if (this.polygon.owner === 'ConsiglioDeiDieci') {
        return new THREE.Color(0x8B0000); // Dark red for ConsiglioDeiDieci
      }
      return new THREE.Color(0x7cac6a); // Default green color
    }
    
    // Default sand color if no owner
    return new THREE.Color(0xf5e9c8);
  }
  
  /**
   * Get the mesh
   */
  public getMesh(): THREE.Mesh | null {
    return this.mesh;
  }
  
  /**
   * Update the view mode
   */
  public updateViewMode(activeView: ViewMode): void {
    // Skip update if view hasn't changed
    if (this.activeView === activeView) return;
    
    this.activeView = activeView;
    
    if (!this.mesh) return;
    
    const material = this.mesh.material as THREE.MeshBasicMaterial;
    
    if (!material) return;
    
    // Update material color based on view mode
    this.updateMaterialColor(material);
  }
  
  /**
   * Update the material color
   */
  private updateMaterialColor(material: THREE.MeshBasicMaterial): void {
    const landColor = this.determineLandColor();
    
    if (!this.isSelected && material.color) {
      material.color.copy(landColor);
      this.originalColor = landColor.clone();
    }
    
    material.needsUpdate = true;
  }
  
  /**
   * Update the owner
   */
  public updateOwner(newOwner: string, ownerColor: string | null = null): void {
    this.polygon.owner = newOwner;
    this.ownerColor = ownerColor;
    
    if (!this.mesh) {
      console.warn(`Cannot update owner for polygon ${this.polygon.id}: mesh is null`);
      return;
    }
    
    // Update material color
    if (this.mesh.material instanceof THREE.MeshBasicMaterial) {
      this.updateMaterialColor(this.mesh.material);
    } else if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach(mat => {
        if (mat instanceof THREE.MeshBasicMaterial) {
          this.updateMaterialColor(mat);
        }
      });
    }
  }
  
  /**
   * Update coat of arms texture
   */
  public updateCoatOfArmsTexture(coatOfArmsUrl: string | null): void {
    this.ownerCoatOfArmsUrl = coatOfArmsUrl;
    // Actual texture application is handled by the parent renderer
  }
  
  /**
   * Update selection state
   */
  public updateSelectionState(isSelected: boolean): void {
    if (this.isSelected === isSelected || !this.mesh) return;
    
    this.isSelected = isSelected;
    
    try {
      // Handle both array and single material cases
      const materials = Array.isArray(this.mesh.material) 
        ? this.mesh.material as THREE.MeshBasicMaterial[]
        : [this.mesh.material as THREE.MeshBasicMaterial];
      
      materials.forEach(material => {
        if (material && material.color) {
          if (isSelected) {
            // Store original color if not already stored
            if (!this.originalColor) {
              this.originalColor = material.color.clone();
            }
            
            // Set to highlight color (bright yellow)
            material.color.set(0xffff00);
          } else {
            // Restore original color
            if (this.originalColor) {
              material.color.copy(this.originalColor);
            }
          }
          material.needsUpdate = true;
        }
      });
    } catch (error) {
      console.error(`Error updating selection state for polygon ${this.polygon.id}:`, error);
    }
  }
  
  /**
   * Update hover state
   */
  public updateHoverState(isHovered: boolean): void {
    // Skip if state hasn't changed, mesh is missing, or polygon is already selected
    if (this.isHovered === isHovered || !this.mesh || this.isSelected) return;
    
    this.isHovered = isHovered;
    
    try {
      // Handle both array and single material cases
      const materials = Array.isArray(this.mesh.material) 
        ? this.mesh.material as THREE.MeshBasicMaterial[]
        : [this.mesh.material as THREE.MeshBasicMaterial];
      
      materials.forEach(material => {
        if (material && material.color) {
          if (isHovered) {
            // Store original color if not already stored
            if (!this.originalColor) {
              this.originalColor = material.color.clone();
            }
            
            // Set to hover color (lighter version of original)
            const hoverColor = this.originalColor.clone();
            hoverColor.r = Math.min(1, hoverColor.r * 1.2);
            hoverColor.g = Math.min(1, hoverColor.g * 1.2);
            hoverColor.b = Math.min(1, hoverColor.b * 1.2);
            material.color.copy(hoverColor);
          } else {
            // Restore original color
            if (this.originalColor) {
              material.color.copy(this.originalColor);
            }
          }
          material.needsUpdate = true;
        }
      });
    } catch (error) {
      console.error(`Error updating hover state for polygon ${this.polygon.id}:`, error);
    }
  }
  
  /**
   * Update quality settings
   */
  public updateQuality(performanceMode: boolean): void {
    this.performanceMode = performanceMode;
    
    if (!this.mesh) return;
    
    // In performance mode, we might simplify materials or geometry
    // This is a placeholder for future optimizations
  }
  
  /**
   * Clean up resources
   */
  public cleanup(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    
    if (this.mesh) {
      this.scene.remove(this.mesh);
      
      if (this.mesh.geometry) {
        this.mesh.geometry.dispose();
      }
      
      if (Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach(material => {
          if (material.map) material.map.dispose();
          material.dispose();
        });
      } else if (this.mesh.material) {
        if (this.mesh.material.map) this.mesh.material.map.dispose();
        this.mesh.material.dispose();
      }
      
      this.mesh = null;
    }
    
    this.originalColor = null;
  }
}
