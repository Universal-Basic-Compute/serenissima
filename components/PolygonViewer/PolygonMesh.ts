import * as THREE from 'three';
import { Polygon, ViewMode } from './types';
import { normalizeCoordinates, createPolygonShape } from './utils';

class PolygonMesh {
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
  private originalMaterial: any = null;
  private ownerColor: string | null = null;
  private coatOfArmsSprite: THREE.Sprite | null = null;
  private polygonMeshesRef: MutableRefObject<Record<string, THREE.Mesh>>;

  constructor(
    scene: THREE.Scene,
    polygon: Polygon,
    bounds: any,
    activeView: ViewMode,
    performanceMode: boolean,
    textureLoader: THREE.TextureLoader,
    ownerColor: string | null = null,
    ownerCoatOfArmsUrl: string | null = null,
    polygonMeshesRef: MutableRefObject<Record<string, THREE.Mesh>>
  ) {
    console.log(`Creating polygon mesh for ${polygon.id}`);
    this.scene = scene;
    this.polygon = polygon;
    this.bounds = bounds;
    this.activeView = activeView;
    this.performanceMode = performanceMode;
    this.textureLoader = textureLoader;
    this.ownerColor = ownerColor;
    this.polygonMeshesRef = polygonMeshesRef;
    
    // Create the polygon mesh
    this.createMesh();
  
    // Make sure we have a valid mesh before adding to scene
    if (this.mesh) {
      this.scene.add(this.mesh);
    
      // Apply coat of arms texture if provided and in land view
      if (ownerCoatOfArmsUrl && activeView === 'land') {
        this.updateCoatOfArmsTexture(ownerCoatOfArmsUrl);
      }
    } else {
      console.error('Failed to create mesh for polygon:', polygon.id);
    }
  }
  
  private createMesh() {
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

      // Create a shape from the normalized coordinates
      const shape = createPolygonShape(normalizedCoords);

      // Create extruded geometry with minimal height
      const extrudeSettings = {
        steps: 1,
        depth: 0.001, // Make it extremely thin
        bevelEnabled: false
      };
      
      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

      // Create sand texture material
      const sandTexture = this.textureLoader.load('/textures/sand.jpg', (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(5, 5);
      });

      // Create materials with brighter colors for better visibility
      const topMaterial = new THREE.MeshBasicMaterial({
        map: sandTexture,
        color: this.determineLandColor(),
        transparent: false, // Disable transparency for better visibility
        depthWrite: true // Enable depth writing
      });
      
      const sideMaterial = new THREE.MeshBasicMaterial({
        color: this.determineLandColor(),
        transparent: false, // Disable transparency for better visibility
        opacity: 1.0 // Full opacity
      });

      // Create mesh with different materials for top and sides
      const materials = [topMaterial, sideMaterial];
      this.mesh = new THREE.Mesh(geometry, materials);
      
      // Position the mesh exactly at water level
      this.mesh.position.y = 0;
      
      // Rotate the mesh to make it face upward
      this.mesh.rotation.x = -Math.PI / 2;
      
      // Set render order to ensure land appears above water
      this.mesh.renderOrder = 20; // Increased from 10 to 20
      
      // Store reference to the mesh
      if (this.polygon.id) {
        this.polygonMeshesRef.current[this.polygon.id] = this.mesh;
      }
      
      // Apply coat of arms texture if in land view and owner has one
      if (this.activeView === 'land' && this.polygon.owner && this.ownerCoatOfArmsUrl) {
        this.updateCoatOfArmsTexture(this.ownerCoatOfArmsUrl);
      }
    } catch (error) {
      console.error(`Error creating mesh for polygon ${this.polygon.id}:`, error);
    }
  }
  
  // Helper method to determine land color
  private determineLandColor(): THREE.Color {
    if (this.activeView === 'land') {
      if (this.ownerColor) {
        // Blend the owner color with sand color for a more natural look
        const sandColor = new THREE.Color(0xf5e9c8); // Brighter sand color
        const ownerColor = new THREE.Color(this.ownerColor);
        return new THREE.Color().lerpColors(sandColor, ownerColor, 0.8); // Increased from 0.7 to 0.8
      } else if (this.polygon.owner) {
        // If we have an owner but no color, use a default color
        if (this.polygon.owner === 'ConsiglioDeiDieci') {
          // Special case for ConsiglioDeiDieci
          return new THREE.Color(0xB30000); // Brighter red
        }
        return new THREE.Color(0x8cd17a); // Brighter green
      } else {
        return new THREE.Color(0xf5e9c8); // Brighter sand color
      }
    } else {
      return new THREE.Color(0xf5e9c8); // Brighter sand color
    }
  }
  
  // Update view mode
  public updateViewMode(activeView: ViewMode) {
    // Skip update if view hasn't changed
    if (this.activeView === activeView) return;
    
    this.activeView = activeView;
    
    if (!this.mesh) return;
    
    const material = this.mesh.material as THREE.MeshBasicMaterial;
    
    if (!material) return;
    
    // Update material based on view mode
    if (activeView === 'land') {
      if (!this.isSelected) {
        const landColor = this.determineLandColor();
        if (material.color) {
          material.color.copy(landColor);
        }
      }
    } else {
      if (!this.isSelected && material.color) {
        material.color.set('#e6d2a8');
      }
    }
    
    material.needsUpdate = true;
  }
  
  // Apply coat of arms texture
  public updateCoatOfArmsTexture(coatOfArmsUrl: string | null) {
    // Coat of arms texture application has been removed
    console.log('Coat of arms texture application is disabled');
    return;
  }
  
  // Create circular texture - kept as a stub since it might be referenced elsewhere
  private createCircularTexture(texture: THREE.Texture): THREE.Texture {
    // This method is no longer used for applying textures to land
    console.log('createCircularTexture is disabled');
    return texture;
  }
  
  // Update quality settings
  public updateQuality(performanceMode: boolean) {
    this.performanceMode = performanceMode;
    
    if (!this.mesh) return;
    
    const material = this.mesh.material as THREE.MeshBasicMaterial;
    
    if (!material) return;
    
    // Always ensure the texture is applied
    if (!material.map) {
      this.textureLoader.load(
        '/textures/sand.jpg',
        (texture) => {
          if (texture && material) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(5, 5);
            material.map = texture;
            material.needsUpdate = true;
          }
        }
      );
    }
    
    material.needsUpdate = true;
  }
  
  // Update owner
  public updateOwner(newOwner: string, ownerColor: string | null = null) {
    console.log(`Updating owner for polygon ${this.polygon.id} to ${newOwner} with color ${ownerColor}`);
    
    this.polygon.owner = newOwner;
    this.ownerColor = ownerColor;
    
    if (!this.mesh) {
      console.warn(`Cannot update owner for polygon ${this.polygon.id}: mesh is null`);
      return;
    }
    
    try {
      // Determine the new land color
      const landColor = this.determineLandColor();
      console.log(`New land color for ${this.polygon.id}: ${landColor.getHexString()}`);
      
      // Update the material
      if (Array.isArray(this.mesh.material)) {
        // If we have an array of materials, update the second one (for the sides)
        if (this.mesh.material.length > 1 && this.mesh.material[1] instanceof THREE.MeshBasicMaterial) {
          this.mesh.material[1].color.copy(landColor);
          this.mesh.material[1].needsUpdate = true;
        }
      } else if (this.mesh.material instanceof THREE.MeshBasicMaterial) {
        // If we have a single material, update it directly
        this.mesh.material.color.copy(landColor);
        this.mesh.material.needsUpdate = true;
        
        // Store the original color for hover/selection states
        this.originalColor = landColor.clone();
      }
      
      // Force a render to apply the changes
      if (this.scene.userData.forceRender) {
        this.scene.userData.forceRender();
      } else {
        console.warn(`Cannot force render for polygon ${this.polygon.id}: forceRender function not found`);
      }
      
      console.log(`Owner successfully updated for polygon ${this.polygon.id}`);
    } catch (error) {
      console.error(`Error updating owner for polygon ${this.polygon.id}:`, error);
    }
  }
  
  // Get mesh
  public getMesh() {
    return this.mesh;
  }
  
  // Update material color
  private updateMaterialColor(material: THREE.MeshBasicMaterial) {
    const landColor = this.determineLandColor();
    
    if (!this.isSelected && material.color) {
      material.color.copy(landColor);
      this.originalColor = landColor.clone();
    }
    
    material.needsUpdate = true;
  }
  
  // Clean up resources
  public cleanup() {
    if (this.mesh) {
      console.log(`Cleaning up polygon mesh`);
      this.scene.remove(this.mesh);
      
      if (this.mesh.geometry) {
        this.mesh.geometry.dispose();
      }
      
      if (Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach(m => {
          if (m && typeof m.dispose === 'function') {
            m.dispose();
          }
        });
      } else if (this.mesh.material && typeof this.mesh.material.dispose === 'function') {
        this.mesh.material.dispose();
      }
    }
    
    if (this.coatOfArmsSprite) {
      this.scene.remove(this.coatOfArmsSprite);
      if (this.coatOfArmsSprite.material) {
        const material = this.coatOfArmsSprite.material as THREE.SpriteMaterial;
        if (material.map) {
          material.map.dispose();
        }
        material.dispose();
      }
    }
    
    this.mesh = null;
    this.coatOfArmsSprite = null;
  }
  
  // Update selection state with improved performance
  public updateSelectionState(isSelected: boolean) {
    if (this.isSelected === isSelected || !this.mesh) return; // Early return if state hasn't changed
    
    this.isSelected = isSelected;
    
    try {
      // Handle both array and single material cases
      const materials = Array.isArray(this.mesh.material) 
        ? this.mesh.material as THREE.MeshBasicMaterial[]
        : [this.mesh.material as THREE.MeshBasicMaterial];
      
      // Process each material
      materials.forEach(material => {
        if (!material || !material.color) return;
        
        if (isSelected) {
          // Store original color if not already stored
          if (!this.originalColor) {
            this.originalColor = material.color.clone();
          }
          
          // Set selection color - bright gold
          material.color.set('#ffcc00');
          
          // Add a slight emissive glow for better visibility
          if (material instanceof THREE.MeshStandardMaterial) {
            material.emissive = new THREE.Color('#553300');
          }
          
          // Increase opacity for better visibility
          if (material.transparent) {
            this.originalMaterial = {
              opacity: material.opacity,
              transparent: material.transparent
            };
            material.opacity = 0.9;
          }
        } else {
          // Restore original color
          if (this.originalColor) {
            material.color.copy(this.originalColor);
          }
          
          // Remove emissive glow
          if (material instanceof THREE.MeshStandardMaterial) {
            material.emissive.set('#000000');
          }
          
          // Restore original opacity
          if (this.originalMaterial && material.transparent) {
            material.opacity = this.originalMaterial.opacity;
          }
        }
        
        // Mark material for update
        material.needsUpdate = true;
      });
      
      // Update render order for better visibility
      if (isSelected) {
        this.mesh.renderOrder = 30; // Higher render order for selected polygons
      } else {
        this.mesh.renderOrder = 10; // Reset to base value
      }
      
      // Force an update of the mesh
      this.mesh.visible = true;
    } catch (error) {
      console.error('Error updating selection state:', error);
    }
  }
  
  // Update hover state with improved performance
  public updateHoverState(isHovered: boolean) {
    // Skip if state hasn't changed, mesh is missing, or polygon is already selected
    if (this.isHovered === isHovered || !this.mesh || this.isSelected) return;
    
    this.isHovered = isHovered;
    
    try {
      // Handle both array and single material cases
      const materials = Array.isArray(this.mesh.material) 
        ? this.mesh.material as THREE.MeshBasicMaterial[]
        : [this.mesh.material as THREE.MeshBasicMaterial];
      
      // Process each material
      materials.forEach(material => {
        if (!material || !material.color) return;
        
        if (isHovered) {
          // Store original color if not already stored
          if (!this.originalColor) {
            this.originalColor = material.color.clone();
          }
          
          // Brighten the color for hover effect
          if (this.activeView === 'land') {
            const color = material.color.clone();
            // Use HSL to increase lightness without changing hue
            const hsl = { h: 0, s: 0, l: 0 };
            color.getHSL(hsl);
            hsl.l = Math.min(1, hsl.l * 1.3); // Increase lightness by 30%
            color.setHSL(hsl.h, hsl.s, hsl.l);
            material.color.copy(color);
          } else {
            // For other views, just brighten slightly
            const color = material.color.clone();
            color.multiplyScalar(1.2);
            material.color.copy(color);
          }
          
          // Increase opacity slightly for better visibility
          if (material.transparent && material.opacity < 0.9) {
            this.originalMaterial = {
              opacity: material.opacity,
              transparent: material.transparent
            };
            material.opacity = Math.min(1, material.opacity * 1.2);
          }
        } else {
          // Restore original color
          if (this.originalColor) {
            material.color.copy(this.originalColor);
          }
          
          // Restore original opacity
          if (this.originalMaterial && material.transparent) {
            material.opacity = this.originalMaterial.opacity;
          }
        }
        
        // Mark material for update
        material.needsUpdate = true;
      });
      
      // Update render order for better visibility
      if (isHovered) {
        this.mesh.renderOrder = 25; // Higher than base but lower than selected
      } else {
        this.mesh.renderOrder = 10; // Reset to base value
      }
      
      // Force visibility
      this.mesh.visible = true;
    } catch (error) {
      console.error('Error updating hover state:', error);
    }
  }
  
  // This method is no longer needed since we're using ShapeGeometry
  // which is already completely flat with no bottom faces
}

export default PolygonMesh;

