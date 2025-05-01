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
      
      // Create extruded geometry with simplified settings - REDUCE DEPTH
      const extrudeSettings = {
        steps: 1,
        depth: 0.02, // REDUCED from 0.05 to 0.02
        bevelEnabled: false, // CHANGED from true to false to remove bevels completely
        bevelThickness: 0, // CHANGED from 0.05 to 0
        bevelSize: 0, // CHANGED from 0.05 to 0
        bevelSegments: 0, // CHANGED from 4 to 0
        UVGenerator: {
          generateTopUV: function(geometry, vertices, indexA, indexB, indexC) {
            const a = vertices[indexA];
            const b = vertices[indexB];
            const c = vertices[indexC];
            
            const bounds = new THREE.Box3().setFromPoints([a, b, c]);
            const size = new THREE.Vector3();
            bounds.getSize(size);
            
            return [
              new THREE.Vector2((a.x - bounds.min.x) / size.x, (a.z - bounds.min.z) / size.z),
              new THREE.Vector2((b.x - bounds.min.x) / size.x, (b.z - bounds.min.z) / size.z),
              new THREE.Vector2((c.x - bounds.min.x) / size.x, (c.z - bounds.min.z) / size.z)
            ];
          },
          generateSideWallUV: function(geometry, vertices, indexA, indexB, indexC, indexD) {
            return [
              new THREE.Vector2(0, 0),
              new THREE.Vector2(1, 0),
              new THREE.Vector2(1, 1),
              new THREE.Vector2(0, 1)
            ];
          }
        }
      };
      
      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geometry.rotateX(-Math.PI / 2);
      
      // REMOVED height variation code to make the surface completely flat
      
      // Update normals
      geometry.computeVertexNormals();
      geometry.attributes.normal.needsUpdate = true;
      geometry.computeBoundingSphere();
      
      // Determine the color to use
      const landColor = this.determineLandColor();
      
      // Create a BASIC material with NO lighting effects
      const material = new THREE.MeshBasicMaterial({ 
        color: landColor,
        side: THREE.FrontSide,
        wireframe: false,
        transparent: false,
        opacity: 1.0,
        // Completely removed all polygon offset properties
        depthTest: true,
        depthWrite: true
      });
      
      // Immediately load and apply the sand texture
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
        },
        undefined,
        (error) => {
          console.error('Error loading sand texture:', error);
        }
      );
      
      this.mesh = new THREE.Mesh(geometry, material);
      
      // EXPLICITLY disable shadows
      this.mesh.castShadow = false;
      this.mesh.receiveShadow = false;
      
      // Set a consistent render order
      this.mesh.renderOrder = 1;
      
      // Add to user data to ensure shadows stay disabled
      this.mesh.userData.disableShadows = true;
      
      // Remove bottom faces to improve performance
      this.removeBottomFaces(geometry);
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
    
    this.textureLoader.load(
      coatOfArmsUrl,
      (texture) => {
        const circularTexture = this.createCircularTexture(texture);
        
        const material = new THREE.MeshBasicMaterial({
          map: circularTexture,
          transparent: true,
          side: THREE.FrontSide,
          opacity: 1.0
        });
        
        if (this.mesh) {
          const currentMaterial = this.mesh.material as THREE.MeshBasicMaterial;
          
          const sidesMaterial = new THREE.MeshBasicMaterial({
            color: this.determineLandColor(),
            side: THREE.FrontSide
          });
          
          const materials = [
            material,
            sidesMaterial
          ];
          
          const geometry = this.mesh.geometry;
          const normalAttribute = geometry.getAttribute('normal');
          
          const topFaces = [];
          const sideFaces = [];
          
          for (let i = 0; i < geometry.index.count / 3; i++) {
            const a = geometry.index.getX(i * 3);
            const normalY = normalAttribute.getY(a);
            
            if (Math.abs(normalY - 1.0) < 0.1) {
              topFaces.push(i);
            } else {
              sideFaces.push(i);
            }
          }
          
          geometry.clearGroups();
          
          if (topFaces.length > 0) {
            geometry.addGroup(0, topFaces.length * 3, 0);
          }
          
          if (sideFaces.length > 0) {
            geometry.addGroup(topFaces.length * 3, sideFaces.length * 3, 1);
          }
          
          this.mesh.material = materials;
          this.mesh.renderOrder = 2;
        }
      },
      undefined,
      (error) => {
        console.error('Error loading coat of arms texture:', error);
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
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 8;
      ctx.stroke();
      
      const fallbackTexture = new THREE.Texture(canvas);
      fallbackTexture.needsUpdate = true;
      return fallbackTexture;
    }
    
    const canvas = document.createElement('canvas');
    const size = 512;
    canvas.width = size;
    canvas.height = size;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return texture;
    
    try {
      ctx.clearRect(0, 0, size, size);
      
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
      ctx.closePath();
      
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 8;
      ctx.stroke();
      
      ctx.save();
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2 - 12, 0, Math.PI * 2);
      ctx.clip();
      
      let drawWidth = size - 24;
      let drawHeight = size - 24;
      let offsetX = 12;
      let offsetY = 12;
      
      if (texture.image.width > texture.image.height) {
        drawHeight = (texture.image.height / texture.image.width) * (size - 24);
        offsetY = (size - drawHeight) / 2;
      } else if (texture.image.height > texture.image.width) {
        drawWidth = (texture.image.width / texture.image.height) * (size - 24);
        offsetX = (size - drawWidth) / 2;
      }
      
      if (texture.image) {
        ctx.drawImage(texture.image, offsetX, offsetY, drawWidth, drawHeight);
      }
      
      ctx.restore();
      
      const circularTexture = new THREE.Texture(canvas);
      circularTexture.needsUpdate = true;
      
      return circularTexture;
    } catch (error) {
      console.error('Error creating circular texture:', error);
      
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
      ctx.fillStyle = this.ownerColor || '#8B4513';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 8;
      ctx.stroke();
      
      const fallbackTexture = new THREE.Texture(canvas);
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
    this.polygon.owner = newOwner;
    this.ownerColor = ownerColor;
    
    if (!this.mesh) return;
    
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach(mat => {
        if (mat instanceof THREE.MeshBasicMaterial) {
          this.updateMaterialColor(mat);
        }
      });
    } else if (this.mesh.material instanceof THREE.MeshBasicMaterial) {
      this.updateMaterialColor(this.mesh.material);
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
        if ((this.coatOfArmsSprite.material as THREE.SpriteMaterial).map) {
          (this.coatOfArmsSprite.material as THREE.SpriteMaterial).map.dispose();
        }
        (this.coatOfArmsSprite.material as THREE.SpriteMaterial).dispose();
      }
    }
    
    this.mesh = null;
    this.coatOfArmsSprite = null;
  }
  
  // Update selection state
  public updateSelectionState(isSelected: boolean) {
    if (this.isSelected === isSelected || !this.mesh) return;
    
    this.isSelected = isSelected;
    
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
      
      this.mesh.position.y += 0.03;
      this.mesh.renderOrder = 2;
      
      material.needsUpdate = true;
    } else {
      if (this.originalColor && material.color) {
        material.color.copy(this.originalColor);
        
        this.mesh.position.y -= 0.03;
        this.mesh.renderOrder = 0;
        
        material.needsUpdate = true;
      }
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
      
      this.mesh.position.y += 0.03;
      this.mesh.renderOrder = 1;
      
      material.needsUpdate = true;
    } else {
      if (this.originalColor && material.color) {
        material.color.copy(this.originalColor);
        
        this.mesh.position.y -= 0.03;
        this.mesh.renderOrder = 0;
        
        material.needsUpdate = true;
      }
    }
  }
  
  // Remove bottom faces
  private removeBottomFaces(geometry: THREE.ExtrudeGeometry) {
    const position = geometry.getAttribute('position');
    const count = position.count;
    
    const keepFace = [];
    
    for (let i = 0; i < count / 3; i++) {
      const a = new THREE.Vector3().fromBufferAttribute(position, i * 3);
      const b = new THREE.Vector3().fromBufferAttribute(position, i * 3 + 1);
      const c = new THREE.Vector3().fromBufferAttribute(position, i * 3 + 2);
      
      const ab = new THREE.Vector3().subVectors(b, a);
      const ac = new THREE.Vector3().subVectors(c, a);
      const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();
      
      keepFace[i] = normal.y > 0.1;
    }
    
    const index = [];
    for (let i = 0; i < count / 3; i++) {
      if (keepFace[i]) {
        index.push(i * 3, i * 3 + 1, i * 3 + 2);
      }
    }
    
    const newGeometry = new THREE.BufferGeometry();
    
    for (const name in geometry.attributes) {
      newGeometry.setAttribute(name, geometry.attributes[name]);
    }
    
    newGeometry.setIndex(index);
    
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = newGeometry;
    }
  }
}

export default PolygonMesh;

