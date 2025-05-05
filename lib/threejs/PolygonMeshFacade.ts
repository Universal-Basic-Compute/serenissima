import * as THREE from 'three';
import { Polygon, ViewMode } from '../../components/PolygonViewer/types';
import { normalizeCoordinates, createPolygonShape } from '../../components/PolygonViewer/utils';
import { Poolable } from './ObjectPool';

/**
 * Facade for managing a single polygon mesh
 * Hides Three.js implementation details
 * Implements Poolable interface for object pooling
 */
export class PolygonMeshFacade implements Poolable {
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
  private isActive: boolean = false;
  private originalGeometry: THREE.BufferGeometry | null = null;
  private simplifiedGeometries: Map<number, THREE.BufferGeometry> = new Map();

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
   * Configure the polygon mesh with new data
   * Used when reusing objects from the pool
   */
  public configure(
    polygon: Polygon,
    bounds: any,
    activeView: ViewMode,
    performanceMode: boolean,
    ownerColor: string | null = null,
    ownerCoatOfArmsUrl: string | null = null
  ): void {
    this.polygon = polygon;
    this.bounds = bounds;
    this.activeView = activeView;
    this.performanceMode = performanceMode;
    this.ownerColor = ownerColor;
    this.ownerCoatOfArmsUrl = ownerCoatOfArmsUrl;
    
    // Create the mesh if it doesn't exist
    if (!this.mesh) {
      this.createMesh();
    } else {
      // Update existing mesh with new data
      this.updateMeshWithNewData();
    }
  }
  
  /**
   * Reset the object for reuse from the pool
   */
  public reset(): void {
    this.isSelected = false;
    this.isHovered = false;
    
    if (this.mesh) {
      this.scene.remove(this.mesh);
      
      // Don't dispose geometry here, we'll reuse it
      // Just clear the mesh reference
      this.mesh = null;
    }
  }
  
  /**
   * Check if the object is active in the pool
   */
  public isActive(): boolean {
    return this.isActive;
  }
  
  /**
   * Set the active state of the object
   */
  public setActive(active: boolean): void {
    this.isActive = active;
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
      this.mesh.position.y = 0; // Exactly at water level
      this.mesh.renderOrder = 1;
      
      // Remove polygon offset
      if (material instanceof THREE.Material) {
        material.polygonOffset = false;
      }
      
      // Add userData to identify this as a polygon
      this.mesh.userData = {
        isPolygon: true,
        polygonId: this.polygon.id
      };
      
      // Add to scene
      this.scene.add(this.mesh);
      
      // Store original geometry for LOD
      this.originalGeometry = geometry.clone();
      
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
      
      // Dispose of all geometries
      if (this.originalGeometry) {
        this.originalGeometry.dispose();
        this.originalGeometry = null;
      }
      
      this.simplifiedGeometries.forEach(geometry => {
        geometry.dispose();
      });
      this.simplifiedGeometries.clear();
      
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

  /**
   * Update existing mesh with new polygon data
   */
  private updateMeshWithNewData(): void {
    if (!this.mesh) return;
    
    try {
      // Update material based on the new data
      const material = this.createMaterial();
      
      if (Array.isArray(this.mesh.material)) {
        // Replace all materials
        this.mesh.material.forEach(mat => mat.dispose());
        this.mesh.material = material;
      } else {
        // Replace single material
        if (this.mesh.material) this.mesh.material.dispose();
        this.mesh.material = material;
      }
      
      // Update geometry if needed
      if (this.polygon.coordinates && this.polygon.coordinates.length >= 3) {
        // Only recreate geometry if coordinates have changed
        // This is a performance optimization
        this.updateGeometry();
      }
      
      // Store original color for hover/selection effects
      if (material instanceof THREE.MeshBasicMaterial) {
        this.originalColor = material.color.clone();
      }
    } catch (error) {
      console.error('Error updating mesh with new data:', error);
    }
  }
  
  /**
   * Update geometry with new coordinates
   */
  private updateGeometry(): void {
    if (!this.mesh || !this.polygon.coordinates) return;
    
    try {
      // Normalize coordinates
      const normalizedCoords = normalizeCoordinates(
        this.polygon.coordinates,
        this.bounds.centerLat,
        this.bounds.centerLng,
        this.bounds.scale,
        this.bounds.latCorrectionFactor
      );
      
      // Create shape from normalized coordinates
      const shape = createPolygonShape(normalizedCoords);
      
      // Create geometry from shape
      const geometry = new THREE.ShapeGeometry(shape);
      
      // Store original geometry for LOD
      this.originalGeometry = geometry.clone();
      
      // Apply the new geometry
      if (this.mesh.geometry) {
        this.mesh.geometry.dispose();
      }
      this.mesh.geometry = geometry;
      
      // Clear simplified geometries cache
      this.simplifiedGeometries.forEach(g => g.dispose());
      this.simplifiedGeometries.clear();
    } catch (error) {
      console.error('Error updating geometry:', error);
    }
  }
  /**
   * Apply a simplified geometry based on detail level
   */
  public applyLOD(detailLevel: number): void {
    if (!this.mesh || !this.originalGeometry) return;
    
    // If detail level is 1.0, use original geometry
    if (detailLevel >= 0.99) {
      this.mesh.geometry = this.originalGeometry;
      return;
    }
    
    // Round detail level to nearest 0.1 to limit number of cached geometries
    const roundedDetailLevel = Math.round(detailLevel * 10) / 10;
    
    // Check if we already have a simplified geometry for this detail level
    if (this.simplifiedGeometries.has(roundedDetailLevel)) {
      this.mesh.geometry = this.simplifiedGeometries.get(roundedDetailLevel)!;
      return;
    }
    
    // Create a simplified geometry
    const simplifiedGeometry = this.createSimplifiedGeometry(roundedDetailLevel);
    
    // Cache it for future use
    this.simplifiedGeometries.set(roundedDetailLevel, simplifiedGeometry);
    
    // Apply it to the mesh
    this.mesh.geometry = simplifiedGeometry;
  }
  
  /**
   * Create a simplified version of the geometry
   */
  private createSimplifiedGeometry(detailLevel: number): THREE.BufferGeometry {
    // This is a simplified implementation - in a real app, you would use
    // a proper geometry simplification algorithm
    
    if (!this.originalGeometry) {
      throw new Error('Original geometry is null');
    }
    
    // Create a clone of the original geometry
    const simplifiedGeometry = this.originalGeometry.clone();
    
    // If the geometry has an index buffer, we can simplify by removing vertices
    if (simplifiedGeometry.index) {
      const originalIndices = Array.from(simplifiedGeometry.index.array);
      const totalTriangles = originalIndices.length / 3;
      
      // Calculate how many triangles to keep
      const trianglesToKeep = Math.max(1, Math.floor(totalTriangles * detailLevel));
      
      // Create a new index buffer with fewer triangles
      const newIndices = new Uint16Array(trianglesToKeep * 3);
      
      // Keep every nth triangle
      const step = Math.max(1, Math.floor(totalTriangles / trianglesToKeep));
      
      for (let i = 0, j = 0; i < trianglesToKeep && j < totalTriangles; i++, j += step) {
        newIndices[i * 3] = originalIndices[j * 3];
        newIndices[i * 3 + 1] = originalIndices[j * 3 + 1];
        newIndices[i * 3 + 2] = originalIndices[j * 3 + 2];
      }
      
      // Update the index buffer
      simplifiedGeometry.setIndex(new THREE.BufferAttribute(newIndices, 1));
    }
    
    return simplifiedGeometry;
  }
}
