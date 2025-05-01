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
    console.log(`Creating polygon mesh for ${polygon.id}`);
    this.scene = scene;
    this.polygon = polygon;
    this.bounds = bounds;
    this.activeView = activeView;
    this.performanceMode = performanceMode;
    this.textureLoader = textureLoader;
    this.ownerColor = ownerColor;
    
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
      const normalizedCoords = normalizeCoordinates(
        this.polygon.coordinates,
        this.bounds.centerLat,
        this.bounds.centerLng,
        this.bounds.scale,
        this.bounds.latCorrectionFactor
      );
      
      // Ensure we have valid coordinates
      if (!normalizedCoords || normalizedCoords.length < 3) {
        console.error('Invalid coordinates for polygon:', this.polygon.id);
        return;
      }
      
      const shape = createPolygonShape(normalizedCoords);
      
      // Create a COMPLETELY FLAT geometry with NO extrusion
      // Use ShapeGeometry for a completely flat shape
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(-Math.PI / 2);
      
      // IMPORTANT: Force all vertices to have the same Y value (0)
      const positions = geometry.attributes.position.array;
      for (let i = 1; i < positions.length; i += 3) {
        positions[i] = 0; // Set Y coordinate to 0 for all vertices
      }
      geometry.attributes.position.needsUpdate = true;
      
      // Update normals to all point straight up
      geometry.computeVertexNormals();
      const normals = geometry.attributes.normal.array;
      for (let i = 0; i < normals.length; i += 3) {
        normals[i] = 0;     // X component = 0
        normals[i + 1] = 1; // Y component = 1 (pointing up)
        normals[i + 2] = 0; // Z component = 0
      }
      geometry.attributes.normal.needsUpdate = true;
      geometry.computeBoundingSphere();
      
      // Determine the color to use
      const landColor = this.determineLandColor();
      
      // Create a completely flat material with NO lighting effects
      const material = new THREE.MeshBasicMaterial({ 
        color: landColor,
        side: THREE.FrontSide,
        wireframe: false,
        transparent: false,
        opacity: 1.0,
        depthTest: true,
        depthWrite: true,
        // Further enhanced polygon offset to completely eliminate z-fighting
        polygonOffset: true,
        polygonOffsetFactor: 3.0, // Increased from 2.0 to 3.0
        polygonOffsetUnits: 3.0   // Increased from 2.0 to 3.0
        // Note: flatShading is not available on MeshBasicMaterial
      });
      
      // Immediately load and apply the sand texture
      this.textureLoader.load(
        '/textures/sand.jpg',
        (texture) => {
          console.log('Sand texture loaded successfully');
          if (texture && material) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(5, 5);
            // Remove texture offset which can cause edge artifacts
            texture.offset.set(0, 0);
            // Ensure texture has proper settings to avoid edge artifacts
            texture.anisotropy = 4;
            texture.generateMipmaps = true;
            texture.needsUpdate = true;
            material.map = texture;
            material.needsUpdate = true;
          }
        },
        (xhr) => {
          console.log(`Sand texture loading: ${(xhr.loaded / xhr.total) * 100}% loaded`);
        },
        (error) => {
          console.error('Error loading sand texture:', error);
          // Try alternative path
          this.textureLoader.load(
            'textures/sand.jpg', // Try without leading slash
            (texture) => {
              console.log('Sand texture loaded from alternative path');
              if (texture && material) {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(5, 5);
                texture.anisotropy = 4;
                texture.generateMipmaps = true;
                texture.needsUpdate = true;
                material.map = texture;
                material.needsUpdate = true;
              }
            },
            undefined,
            (secondError) => {
              console.error('Error loading sand texture from alternative path:', secondError);
            }
          );
        }
      );
      
      this.mesh = new THREE.Mesh(geometry, material);
      
      // No wireframe outline - removed to eliminate visible borders
      
      // EXPLICITLY disable shadows
      this.mesh.castShadow = false;
      this.mesh.receiveShadow = false;
      
      // Set a consistent render order for all land polygons
      this.mesh.renderOrder = 10;
      
      // Add to user data to ensure shadows stay disabled
      this.mesh.userData.disableShadows = true;
      this.mesh.userData.noShadow = true;
      this.mesh.userData.ignoreLight = true;
      
      // Position ALL polygons at exactly the same height to prevent z-fighting with water and between polygons
      this.mesh.position.y = 0.001; // Consistent height for all polygons to prevent visible seams
      
      // Completely flat with no edges or borders
      // Apply a minimal inset to avoid z-fighting
      geometry.scale(0.9995, 1, 0.9995); // Reduced scaling to help canal gaps between polygons
    } catch (error) {
      console.error('Error creating mesh:', error);
    }
  }
  
  // Helper method to determine land color
  private determineLandColor(): THREE.Color {
    if (this.activeView === 'land') {
      if (this.ownerColor) {
        // Blend the owner color with sand color for a more natural look
        const sandColor = new THREE.Color(0xf0e6c8);
        const ownerColor = new THREE.Color(this.ownerColor);
        return new THREE.Color().lerpColors(sandColor, ownerColor, 0.7);
      } else if (this.polygon.owner) {
        // If we have an owner but no color, use a default color
        if (this.polygon.owner === 'ConsiglioDeiDieci') {
          // Special case for ConsiglioDeiDieci
          return new THREE.Color(0x8B0000); // Dark red
        }
        return new THREE.Color(0x7cac6a);
      } else {
        return new THREE.Color(0xe6d2a8);
      }
    } else {
      return new THREE.Color(0xe6d2a8);
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
    if (!coatOfArmsUrl || !this.mesh) {
      return;
    }
    
    console.log(`Loading coat of arms texture: ${coatOfArmsUrl}`);
    
    this.textureLoader.load(
      coatOfArmsUrl,
      (texture) => {
        console.log(`Coat of arms texture loaded successfully for ${this.polygon.id}`);
        const circularTexture = this.createCircularTexture(texture);
        
        // Instead of creating new geometry, just update the material of the existing mesh
        if (this.mesh) {
          // Create a material with the coat of arms texture
          const material = new THREE.MeshBasicMaterial({
            map: circularTexture,
            transparent: true,
            side: THREE.FrontSide,
            opacity: 1.0,
            depthTest: true,
            depthWrite: true,
            polygonOffset: true,
            polygonOffsetFactor: 3.0,
            polygonOffsetUnits: 3.0,
            color: this.determineLandColor() // Apply the land color to tint the texture
          });
          
          // Simply replace the material instead of creating new geometry
          this.mesh.material = material;
          
          // Increase render order to ensure it renders above other elements
          this.mesh.renderOrder = 20;
          
          // Ensure the geometry remains completely flat
          if (this.mesh.geometry) {
            const positions = this.mesh.geometry.attributes.position.array;
            for (let i = 1; i < positions.length; i += 3) {
              positions[i] = 0; // Force Y coordinate to 0
            }
            this.mesh.geometry.attributes.position.needsUpdate = true;
          }
          
          console.log(`Applied coat of arms texture to polygon ${this.polygon.id}`);
        }
      },
      undefined,
      (error) => {
        console.error(`Error loading coat of arms texture for ${this.polygon.id}:`, error);
      }
    );
  }
  
  // Create circular texture
  private createCircularTexture(texture: THREE.Texture): THREE.Texture {
    if (!texture.image) {
      const canvas = document.createElement('canvas');
      const size = 256;
      canvas.width = size;
      canvas.height = size;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return texture;
      
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
      ctx.fillStyle = this.ownerColor || '#8B4513';
      ctx.fill();
      // Remove the stroke which can cause edge artifacts
      // ctx.strokeStyle = '#FFFFFF';
      // ctx.lineWidth = 8;
      // ctx.stroke();
      
      const fallbackTexture = new THREE.Texture(canvas);
      fallbackTexture.needsUpdate = true;
      // Add these properties to improve texture quality
      fallbackTexture.premultiplyAlpha = true;
      fallbackTexture.generateMipmaps = true;
      return fallbackTexture;
    }
    
    const canvas = document.createElement('canvas');
    // Increase size for better quality
    const size = 1024;
    canvas.width = size;
    canvas.height = size;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return texture;
    
    try {
      // Clear with transparent background
      ctx.clearRect(0, 0, size, size);
      
      // Create a perfect circle with no stroke
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
      ctx.closePath();
      
      // Remove the white stroke which can cause edge artifacts
      // ctx.strokeStyle = '#FFFFFF';
      // ctx.lineWidth = 8;
      // ctx.stroke();
      
      ctx.save();
      ctx.beginPath();
      // Make the clipping circle slightly smaller to avoid edge artifacts
      ctx.arc(size/2, size/2, size/2 - 1, 0, Math.PI * 2);
      ctx.clip();
      
      let drawWidth = size - 2;
      let drawHeight = size - 2;
      let offsetX = 1;
      let offsetY = 1;
      
      if (texture.image.width > texture.image.height) {
        drawHeight = (texture.image.height / texture.image.width) * (size - 2);
        offsetY = (size - drawHeight) / 2;
      } else if (texture.image.height > texture.image.width) {
        drawWidth = (texture.image.width / texture.image.height) * (size - 2);
        offsetX = (size - drawWidth) / 2;
      }
      
      if (texture.image) {
        ctx.drawImage(texture.image, offsetX, offsetY, drawWidth, drawHeight);
      }
      
      ctx.restore();
      
      const circularTexture = new THREE.Texture(canvas);
      // Add these properties to improve texture quality
      circularTexture.premultiplyAlpha = true;
      circularTexture.generateMipmaps = true;
      circularTexture.needsUpdate = true;
      
      return circularTexture;
    } catch (error) {
      console.error('Error creating circular texture:', error);
      
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
      ctx.fillStyle = this.ownerColor || '#8B4513';
      ctx.fill();
      // Remove stroke
      
      const fallbackTexture = new THREE.Texture(canvas);
      fallbackTexture.premultiplyAlpha = true;
      fallbackTexture.generateMipmaps = true;
      fallbackTexture.needsUpdate = true;
      return fallbackTexture;
    }
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
    
    if (!this.mesh) return;
    
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
    }
    
    console.log(`Owner updated for polygon ${this.polygon.id}`);
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
  
  // Update selection state
  public updateSelectionState(isSelected: boolean) {
    if (this.isSelected === isSelected || !this.mesh) return; // Early return if state hasn't changed
    
    this.isSelected = isSelected;
    
    try {
      const material = Array.isArray(this.mesh.material) 
        ? this.mesh.material[0] as THREE.MeshBasicMaterial
        : this.mesh.material as THREE.MeshBasicMaterial;
      
      if (!material) return;
      
      if (isSelected) {
        if (!this.originalColor && material.color) {
          this.originalColor = material.color.clone();
        }
        
        if (material.color) {
          material.color.set('#ffcc00');
        }
        
        // Use a consistent height but higher render order for selected polygons
        this.mesh.renderOrder = 30; // Higher render order for selected polygons
        
        material.needsUpdate = true;
      } else {
        if (this.originalColor && material.color) {
          material.color.copy(this.originalColor);
          
          // Reset render order to base value
          this.mesh.renderOrder = 10; // Reset to the same value as initial render order
          
          material.needsUpdate = true;
        }
      }
    } catch (error) {
      console.error('Error updating selection state:', error);
    }
  }
  
  // Update hover state
  public updateHoverState(isHovered: boolean) {
    if (this.isHovered === isHovered || !this.mesh || this.isSelected) return;
    
    this.isHovered = isHovered;
    
    const material = Array.isArray(this.mesh.material)
      ? this.mesh.material[0] as THREE.MeshBasicMaterial
      : this.mesh.material as THREE.MeshBasicMaterial;
    
    if (!material) return;
    
    if (isHovered) {
      if (!this.originalColor && material.color) {
        this.originalColor = material.color.clone();
      }
      
      if (this.activeView === 'land' && material.color) {
        const color = material.color.clone();
        color.multiplyScalar(1.5);
        material.color.copy(color);
      }
      
      // Use consistent height but higher render order for hovered polygons
      this.mesh.renderOrder = 25; // Higher than base but lower than selected
      
      material.needsUpdate = true;
    } else {
      if (this.originalColor && material.color) {
        material.color.copy(this.originalColor);
        
        // Reset render order to base value
        this.mesh.renderOrder = 10; // Reset to the same value as initial render order
        
        material.needsUpdate = true;
      }
    }
  }
  
  // This method is no longer needed since we're using ShapeGeometry
  // which is already completely flat with no bottom faces
}

export default PolygonMesh;

