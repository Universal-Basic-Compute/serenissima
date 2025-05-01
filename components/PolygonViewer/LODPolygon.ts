import * as THREE from 'three';
import { Polygon, ViewMode } from './types';
import { normalizeCoordinates, createPolygonShape } from './utils';

export default class LODPolygon {
  private scene: THREE.Scene;
  private polygon: Polygon;
  private bounds: any;
  private activeView: ViewMode;
  private performanceMode: boolean;
  private mesh: THREE.Mesh;
  private highDetailMesh: THREE.Mesh | null = null;
  private lowDetailMesh: THREE.Mesh | null = null;
  private textureLoader: THREE.TextureLoader;
  private sandBaseColor: THREE.Texture;
  private sandNormalMap: THREE.Texture;
  private sandRoughnessMap: THREE.Texture;
  private distanceThreshold: number = 150;
  private isSelected: boolean = false;
  private isHovered: boolean = false;
  private originalColor: THREE.Color | null = null;
  private originalMaterial: THREE.MeshStandardMaterial | null = null;
  private ownerColor: string | null = null;
  private coatOfArmsSprite: THREE.Sprite | null = null;
  private ownerCoatOfArmsMap: Record<string, string> | null = null;

  constructor(
    scene: THREE.Scene,
    polygon: Polygon,
    bounds: any,
    activeView: ViewMode,
    performanceMode: boolean,
    textureLoader: THREE.TextureLoader,
    textures: {
      sandBaseColor: THREE.Texture;
      sandNormalMap: THREE.Texture;
      sandRoughnessMap: THREE.Texture;
    },
    ownerColor: string | null = null,
    ownerCoatOfArmsUrl: string | null = null
  ) {
    this.scene = scene;
    this.polygon = polygon;
    this.bounds = bounds;
    this.activeView = activeView;
    this.performanceMode = performanceMode;
    this.textureLoader = textureLoader;
    this.sandBaseColor = textures.sandBaseColor;
    this.sandNormalMap = textures.sandNormalMap;
    this.sandRoughnessMap = textures.sandRoughnessMap;
    this.ownerColor = ownerColor;
    
    // Create high detail mesh directly
    this.createHighDetailMesh();
    
    // Make sure we have a valid mesh before adding to scene
    if (this.highDetailMesh) {
      this.mesh = this.highDetailMesh;
      this.scene.add(this.mesh);
      
      // Apply coat of arms texture if provided and in land view
      if (ownerCoatOfArmsUrl && activeView === 'land') {
        this.updateCoatOfArmsTexture(ownerCoatOfArmsUrl);
      }
    } else {
      // If we couldn't create a high detail mesh, log an error
      console.error('Failed to create high detail mesh for polygon:', polygon.id);
    }
    
    // Create high detail mesh directly
    this.createHighDetailMesh();
    
    // Make sure we have a valid mesh before adding to scene
    if (this.highDetailMesh) {
      this.mesh = this.highDetailMesh;
      this.scene.add(this.mesh);
    } else {
      // If we couldn't create a high detail mesh, log an error
      console.error('Failed to create high detail mesh for polygon:', polygon.id);
    }
  }
  
  private createLowDetailMesh() {
    // Create a simplified version of the polygon with fewer vertices
    const normalizedCoords = normalizeCoordinates(
      this.polygon.coordinates,
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    );
    
    // Simplify coordinates by taking every other point
    const simplifiedCoords = normalizedCoords.filter((_, i) => i % 2 === 0);
    
    // Ensure we have at least 3 points
    if (simplifiedCoords.length < 3) {
      simplifiedCoords.push(...normalizedCoords.slice(simplifiedCoords.length));
    }
    
    const shape = createPolygonShape(simplifiedCoords);
    
    // Create extruded geometry with minimal settings
    const extrudeSettings = {
      steps: 1,
      depth: 0.025, // Fixed depth without random variation
      bevelEnabled: false
    };
    
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(-Math.PI / 2);
    
    // Create a simple material - CHANGED to MeshBasicMaterial
    const material = new THREE.MeshBasicMaterial({ 
      color: '#e6d2a8', // Always use sand/beige color
      side: THREE.FrontSide,
      wireframe: false,
      // Remove stroke/edge visibility
      polygonOffset: true,
      polygonOffsetFactor: 2, // Increased from 1 to 2
      polygonOffsetUnits: 2, // Increased from 1 to 2
      // Explicitly disable transparency
      transparent: false,
      opacity: 1.0,
      // Use normal blending
      blending: THREE.NormalBlending
    });
    
    this.lowDetailMesh = new THREE.Mesh(geometry, material);
    this.lowDetailMesh.castShadow = false;
    this.lowDetailMesh.receiveShadow = false;
    this.lowDetailMesh.userData.originalEmissive = new THREE.Color(0, 0, 0);
    this.lowDetailMesh.userData.originalEmissiveIntensity = 0;
    this.lowDetailMesh.userData.isLowDetail = true;
    
    // Remove bottom faces from low detail mesh too
    this.removeBottomFaces(geometry);
  }
  
  private createHighDetailMesh() {
    const normalizedCoords = normalizeCoordinates(
      this.polygon.coordinates,
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    );
    
    const shape = createPolygonShape(normalizedCoords);
    
    // Create extruded geometry with enhanced settings for better quality
    const extrudeSettings = {
      steps: 1, // Reduce steps to prevent shadow artifacts
      depth: 0.05, // Increased depth for more island-like appearance
      bevelEnabled: true, // Enable bevels for smoother island edges
      bevelThickness: 0.05, // Increased from 0.04 to 0.05
      bevelSize: 0.05, // Increased from 0.04 to 0.05
      bevelSegments: 8, // Increased from 6 to 8 for even smoother bevels
      UVGenerator: { // Add a custom UV generator for better texture mapping
        generateTopUV: function(geometry, vertices, indexA, indexB, indexC) {
          // Create UVs that map the entire texture to the face
          const a = vertices[indexA];
          const b = vertices[indexB];
          const c = vertices[indexC];
          
          // Calculate bounding box of the polygon
          const bounds = new THREE.Box3().setFromPoints([a, b, c]);
          const size = new THREE.Vector3();
          bounds.getSize(size);
          
          // Normalize UVs based on the bounding box
          return [
            new THREE.Vector2((a.x - bounds.min.x) / size.x, (a.z - bounds.min.z) / size.z),
            new THREE.Vector2((b.x - bounds.min.x) / size.x, (b.z - bounds.min.z) / size.z),
            new THREE.Vector2((c.x - bounds.min.x) / size.x, (c.z - bounds.min.z) / size.z)
          ];
        },
        generateSideWallUV: function(geometry, vertices, indexA, indexB, indexC, indexD) {
          // For side walls, use a simpler mapping
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
    
    // Add height variation to the geometry to make islands more natural
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      // Only modify the Y coordinate (height)
      // Skip bottom vertices (where y is close to 0 or negative)
      if (positions[i + 1] > 0.01) {
        // Add random height variation
        const noise = Math.random() * 0.03; // Small random variation
        positions[i + 1] += noise;
      }
    }
    
    // Update normals after modifying positions
    geometry.computeVertexNormals();
    // Enable smooth shading for seamless appearance
    geometry.attributes.normal.needsUpdate = true;
    
    // Apply smooth shading to further reduce the appearance of edges
    geometry.computeBoundingSphere();
    
    // Determine the color to use
    const landColor = this.determineLandColor();
    
    // Create a material that looks like sand - using MeshBasicMaterial for better edge rendering
    const material = new THREE.MeshBasicMaterial({ 
      color: landColor,
      side: THREE.FrontSide,
      wireframe: false,
      // Désactiver complètement la transparence
      transparent: false,
      opacity: 1.0,
      // Remove flatShading as it's not supported in MeshBasicMaterial
      // Augmenter encore plus les valeurs de polygonOffset
      polygonOffset: true,
      polygonOffsetFactor: 5,
      polygonOffsetUnits: 5,
      // Assurer que la profondeur est correctement gérée
      depthTest: true,
      depthWrite: true
    });
    
    // Load sand texture if not in performance mode
    if (!this.performanceMode) {
      // Use the texture loader directly with absolute paths
      this.textureLoader.load(
        '/textures/sand.jpg', // Use absolute path
        (texture) => {
          if (texture && material) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(5, 5); // Adjust based on scale
            material.map = texture;
            material.needsUpdate = true;
            console.log('Sand texture loaded successfully');
          }
        },
        undefined,
        (error) => {
          console.error('Error loading sand texture:', error);
        }
      );
      
      // Load normal map for sand texture
      this.textureLoader.load(
        '/textures/sand_normal.jpg', // Use absolute path
        (texture) => {
          if (texture && material && material.normalScale) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(5, 5); // Match the color texture
            material.normalMap = texture;
            material.normalScale.set(0.5, 0.5); // Adjust for desired bumpiness
            material.needsUpdate = true;
            console.log('Sand normal map loaded successfully');
          } else if (texture && material) {
            // If normalScale doesn't exist, create it
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(5, 5);
            material.normalMap = texture;
            material.normalScale = new THREE.Vector2(0.5, 0.5);
            material.needsUpdate = true;
            console.log('Sand normal map loaded successfully (created normalScale)');
          }
        },
        undefined,
        (error) => {
          console.error('Error loading sand normal map:', error);
        }
      );
    }
    
    this.highDetailMesh = new THREE.Mesh(geometry, material);
    
    // IMPORTANT: Disable shadows completely
    this.highDetailMesh.castShadow = false;
    this.highDetailMesh.receiveShadow = false;
    this.highDetailMesh.renderOrder = 1; // Ensure land renders above water
    this.highDetailMesh.userData.originalEmissive = new THREE.Color(0, 0, 0);
    this.highDetailMesh.userData.originalEmissiveIntensity = 0;
    this.highDetailMesh.userData.isLowDetail = false;
    
    // CRITICAL ADDITION: Remove bottom faces completely
    this.removeBottomFaces(geometry);
  }
  
  // Add helper method to determine land color
  private determineLandColor(): THREE.Color {
    if (this.activeView === 'land') {
      if (this.ownerColor) {
        // Blend the owner color with sand color for a more natural look
        const sandColor = new THREE.Color(0xf0e6c8); // Lighter sand color
        const ownerColor = new THREE.Color(this.ownerColor);
        // Mix 70% owner color with 30% sand color
        return new THREE.Color().lerpColors(sandColor, ownerColor, 0.7);
      } else if (this.polygon.owner) {
        // Instead of generating a color, use a default color
        return new THREE.Color(0xf0e6c8); // Lighter sand color for owned islands
      } else {
        return new THREE.Color(0xf0e6c8); // Lighter sand color
      }
    } else {
      return new THREE.Color(0xf0e6c8); // Lighter sand color
    }
  }
  
  public updateLOD(cameraPosition: THREE.Vector3) {
    // No LOD switching needed anymore
    return;
  }
  
  public getMesh() {
    return this.mesh;
  }
  

  public updateViewMode(activeView: ViewMode) {
    this.activeView = activeView;
    
    // Apply visual changes to both high and low detail meshes
    const meshes = [this.highDetailMesh, this.lowDetailMesh].filter(Boolean);
    
    meshes.forEach(mesh => {
      if (!mesh) return;
      
      const material = mesh.material as THREE.MeshBasicMaterial; // Changed from MeshStandardMaterial
      
      // Skip if material is undefined
      if (!material) return;
      
      // Update material based on view mode
      if (activeView === 'land') {
        // For land view, use owner's color or generate one
        if (!this.isSelected) {
          const landColor = this.determineLandColor();
          if (material.color) {
            material.color.copy(landColor);
          }
        }
        
        // Only set these properties if they exist on the material
        if ('roughness' in material) material.roughness = 0.7;
        if ('metalness' in material) material.metalness = 0.1;
      } else {
        // For other views, use sand color
        if (!this.isSelected && material.color) {
          material.color.set('#e6d2a8');
        }
        
        // Only set these properties if they exist on the material
        if ('roughness' in material) material.roughness = 0.7;
        if ('metalness' in material) material.metalness = 0.1;
      }
      
      // Update material to apply changes
      material.needsUpdate = true;
    });
  }
  
  // Alternative method using projection mapping for coat of arms
  private applyProjectionMapping(texture: THREE.Texture) {
    if (!this.highDetailMesh) return;
    
    // Create a custom shader material that projects the texture from above
    const customMaterial = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        color: { value: new THREE.Color(this.ownerColor || '#7cac6a') }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          // Use the x and z coordinates for UV mapping (top-down projection)
          vUv = vec2(position.x, position.z);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform vec3 color;
        varying vec2 vUv;
        void main() {
          // Scale and center the UVs to fit the texture in the center
          vec2 centeredUV = (vUv - 0.5) * 2.0;
          // Sample the texture
          vec4 texColor = texture2D(map, centeredUV * 0.5 + 0.5);
          // Mix with the base color
          gl_FragColor = texColor * vec4(color, 1.0);
        }
      `,
      side: THREE.DoubleSide
    });
    
    // Replace the material
    const oldMaterial = this.highDetailMesh.material;
    this.highDetailMesh.material = customMaterial;
    
    // Dispose of the old material
    if (oldMaterial) {
      oldMaterial.dispose();
    }
  }
  
  // Add method to apply coat of arms texture to the land
  public updateCoatOfArmsTexture(coatOfArmsUrl: string | null) {
    if (!coatOfArmsUrl || !this.highDetailMesh) {
      console.log('No coat of arms URL or high detail mesh available');
      return;
    }
    
    console.log(`Loading coat of arms texture from URL: ${coatOfArmsUrl}`);
    
    // Load the texture
    this.textureLoader.load(
      coatOfArmsUrl,
      (texture) => {
        console.log('Coat of arms texture loaded successfully');
        
        // Process the texture to make it circular
        const circularTexture = this.createCircularTexture(texture);
        
        // Create a new material that uses the coat of arms texture
        const material = new THREE.MeshBasicMaterial({
          map: circularTexture,
          transparent: true,
          side: THREE.FrontSide,
          opacity: 1.0
        });
        
        // Only apply the texture to the top face of the extruded geometry
        if (this.highDetailMesh) {
          // Get the current material
          const currentMaterial = this.highDetailMesh.material as THREE.MeshBasicMaterial;
          
          // Create a new material for sides with the correct color
          const sidesMaterial = new THREE.MeshBasicMaterial({
            color: this.determineLandColor(),
            side: THREE.FrontSide
          });
          
          // Create a multi-material: coat of arms for top, original color for sides
          const materials = [
            material, // Top face (index 0)
            sidesMaterial // All other faces
          ];
          
          // Apply materials to specific faces
          const geometry = this.highDetailMesh.geometry;
          const normalAttribute = geometry.getAttribute('normal');
          
          // Create groups for top face (y normal = 1) and side faces
          const topFaces = [];
          const sideFaces = [];
          
          // Identify top faces by their normal
          for (let i = 0; i < geometry.index.count / 3; i++) {
            const a = geometry.index.getX(i * 3);
            const normalY = normalAttribute.getY(a);
            
            // If normal points up, it's a top face
            if (Math.abs(normalY - 1.0) < 0.1) {
              topFaces.push(i);
            } else {
              sideFaces.push(i);
            }
          }
          
          // Set material groups
          geometry.clearGroups();
          
          if (topFaces.length > 0) {
            geometry.addGroup(0, topFaces.length * 3, 0); // Top faces use material 0
          }
          
          if (sideFaces.length > 0) {
            geometry.addGroup(topFaces.length * 3, sideFaces.length * 3, 1); // Side faces use material 1
          }
          
          // Apply the multi-material
          this.highDetailMesh.material = materials;
          
          // Set a high render order to ensure the coat of arms is visible
          this.highDetailMesh.renderOrder = 2;
          
          console.log('Applied coat of arms texture to land');
        }
      },
      undefined,
      (error) => {
        console.error('Error loading coat of arms texture:', error);
      }
    );
  }
  
  // Add helper function to create a circular texture
  private createCircularTexture(texture: THREE.Texture): THREE.Texture {
    // Check if texture.image exists
    if (!texture.image) {
      console.warn('Texture image is null, creating fallback texture');
      
      // Create a canvas for a fallback texture
      const canvas = document.createElement('canvas');
      const size = 256;
      canvas.width = size;
      canvas.height = size;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return texture;
      
      // Draw a colored circle as fallback
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
      ctx.fillStyle = this.ownerColor || '#8B4513'; // Use owner color or default
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 8;
      ctx.stroke();
      
      // Create a new texture from the canvas
      const fallbackTexture = new THREE.Texture(canvas);
      fallbackTexture.needsUpdate = true;
      return fallbackTexture;
    }
    
    // Create a canvas to draw the circular mask
    const canvas = document.createElement('canvas');
    const size = 512; // Increased size for better quality
    canvas.width = size;
    canvas.height = size;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return texture; // Fallback if context creation fails
    
    try {
      // Clear the canvas first
      ctx.clearRect(0, 0, size, size);
      
      // Draw a circular clipping path
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
      ctx.closePath();
      
      // Add a white stroke around the circle
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 8;
      ctx.stroke();
      
      // Create a new clipping path for the image
      ctx.save();
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2 - 12, 0, Math.PI * 2);
      ctx.clip();
      
      // Calculate dimensions to maintain aspect ratio
      let drawWidth = size - 24;
      let drawHeight = size - 24;
      let offsetX = 12;
      let offsetY = 12;
      
      if (texture.image.width > texture.image.height) {
        // Landscape image
        drawHeight = (texture.image.height / texture.image.width) * (size - 24);
        offsetY = (size - drawHeight) / 2;
      } else if (texture.image.height > texture.image.width) {
        // Portrait image
        drawWidth = (texture.image.width / texture.image.height) * (size - 24);
        offsetX = (size - drawWidth) / 2;
      }
      
      // Draw the image with proper aspect ratio
      if (texture.image) {
        ctx.drawImage(texture.image, offsetX, offsetY, drawWidth, drawHeight);
      }
      
      ctx.restore();
      
      // Create a new texture from the canvas
      const circularTexture = new THREE.Texture(canvas);
      circularTexture.needsUpdate = true;
      
      return circularTexture;
    } catch (error) {
      console.error('Error creating circular texture:', error);
      
      // If there's an error, create a simple colored circle
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
      ctx.fillStyle = this.ownerColor || '#8B4513'; // Use owner color or default
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 8;
      ctx.stroke();
      
      const fallbackTexture = new THREE.Texture(canvas);
      fallbackTexture.needsUpdate = true;
      return fallbackTexture;
    }
  }

  public updateQuality(performanceMode: boolean) {
    this.performanceMode = performanceMode;
    
    // Apply quality changes to both high and low detail meshes
    const meshes = [this.highDetailMesh, this.lowDetailMesh].filter(Boolean);
    
    meshes.forEach(mesh => {
      if (!mesh) return;
      
      const material = mesh.material as THREE.MeshStandardMaterial;
      
      // Update material based on performance mode
      material.map = performanceMode ? null : this.sandBaseColor;
      material.normalMap = performanceMode ? null : this.sandNormalMap;
      material.roughnessMap = performanceMode ? null : this.sandRoughnessMap;
      material.flatShading = performanceMode;
      
      // Update material to apply changes
      material.needsUpdate = true;
    });
  }
  
  // Add method to update owner
  public updateOwner(newOwner: string, ownerColor: string | null = null) {
    // Update the polygon's owner
    this.polygon.owner = newOwner;
    this.ownerColor = ownerColor;
    
    console.log(`Updating owner for polygon to ${newOwner} with color ${ownerColor}`);
    
    // Update the material color based on the new owner
    if (!this.highDetailMesh) return;
    
    // Handle different material types
    if (Array.isArray(this.highDetailMesh.material)) {
      // If it's an array of materials, update each one
      this.highDetailMesh.material.forEach(mat => {
        if (mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.MeshStandardMaterial) {
          this.updateMaterialColor(mat);
        }
      });
    } else if (this.highDetailMesh.material instanceof THREE.MeshBasicMaterial || 
               this.highDetailMesh.material instanceof THREE.MeshStandardMaterial) {
      this.updateMaterialColor(this.highDetailMesh.material);
    }
  }
  
  // Helper method to update material color
  private updateMaterialColor(material: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial) {
    // Determine the color to use
    const landColor = this.determineLandColor();
    
    // Apply the new color if not selected
    if (!this.isSelected && material.color) {
      material.color.copy(landColor);
      this.originalColor = landColor.clone();
    }
    
    // Update material to apply changes
    material.needsUpdate = true;
  }

  public cleanup() {
    // Remove from scene
    this.scene.remove(this.mesh);
    
    // Clean up coat of arms sprite if it exists
    if (this.coatOfArmsSprite) {
      this.scene.remove(this.coatOfArmsSprite);
      if (this.coatOfArmsSprite.material) {
        // Check if material has a map before trying to dispose it
        if ((this.coatOfArmsSprite.material as THREE.SpriteMaterial).map) {
          (this.coatOfArmsSprite.material as THREE.SpriteMaterial).map.dispose();
        }
        (this.coatOfArmsSprite.material as THREE.SpriteMaterial).dispose();
      }
    }
    
    // Dispose of geometries and materials with proper type checking
    if (this.highDetailMesh) {
      if (this.highDetailMesh.geometry) {
        this.highDetailMesh.geometry.dispose();
      }
      
      // Check if material is an array
      if (Array.isArray(this.highDetailMesh.material)) {
        this.highDetailMesh.material.forEach(m => {
          // Check if m exists and has a dispose method
          if (m && typeof m.dispose === 'function') {
            m.dispose();
          }
        });
      } else if (this.highDetailMesh.material) {
        // Check if material exists and has a dispose method
        if (typeof this.highDetailMesh.material.dispose === 'function') {
          (this.highDetailMesh.material as THREE.Material).dispose();
        }
      }
    }
    
    if (this.lowDetailMesh) {
      if (this.lowDetailMesh.geometry) {
        this.lowDetailMesh.geometry.dispose();
      }
      
      // Check if material is an array
      if (Array.isArray(this.lowDetailMesh.material)) {
        this.lowDetailMesh.material.forEach(m => {
          // Check if m exists and has a dispose method
          if (m && typeof m.dispose === 'function') {
            m.dispose();
          }
        });
      } else if (this.lowDetailMesh.material) {
        // Check if material exists and has a dispose method
        if (typeof this.lowDetailMesh.material.dispose === 'function') {
          (this.lowDetailMesh.material as THREE.Material).dispose();
        }
      }
    }
    
    // Clear references to help garbage collection
    this.highDetailMesh = null;
    this.lowDetailMesh = null;
    this.mesh = null;
  }
  
  public updateSelectionState(isSelected: boolean) {
    // If selection state hasn't changed, do nothing
    if (this.isSelected === isSelected) return;
    
    this.isSelected = isSelected;
    
    // Apply visual changes to both high and low detail meshes
    const meshes = [this.highDetailMesh, this.lowDetailMesh].filter(Boolean);
    
    meshes.forEach(mesh => {
      if (!mesh) return;
      
      const material = mesh.material as THREE.MeshBasicMaterial;
      if (!material) return; // Add check for material
      
      if (isSelected) {
        // Store original color if not already stored and if material.color exists
        if (!this.originalColor && material.color) {
          this.originalColor = material.color.clone();
        }
        
        // Highlight the selected polygon with a bright color
        if (material.color) {
          material.color.set('#ffcc00'); // Bright yellow
        }
        
        // IMPORTANT: Adjust the polygon's position to prevent z-fighting
        // Move the mesh slightly up when selected - but not too high
        mesh.position.y += 0.05; // Reduced from 0.1
        
        // Also increase the renderOrder to ensure it renders on top
        mesh.renderOrder = 2; // Higher than hover
        
        // Make sure the material update is applied
        material.needsUpdate = true;
      } else {
        // Restore original color
        if (this.originalColor && material.color) {
          material.color.copy(this.originalColor);
          
          // IMPORTANT: Restore the original position
          // Move the mesh back to its original position
          mesh.position.y -= 0.05; // Reduced from 0.1
          
          // Reset the renderOrder
          mesh.renderOrder = 0;
          
          // Make sure the material update is applied
          material.needsUpdate = true;
        }
      }
    });
  }
  
  // Add method to handle hover state changes
  public updateHoverState(isHovered: boolean) {
    // Only process if hover state actually changed
    if (this.isHovered === isHovered) return;
    this.isHovered = isHovered;
    
    // Don't apply hover effects if the polygon is selected
    if (this.isSelected) return;
    
    // Apply hover effects only to high detail mesh
    if (!this.highDetailMesh) return;
    
    const material = this.highDetailMesh.material as THREE.MeshBasicMaterial;
    if (!material) return; // Add this check
    
    if (isHovered) {
      // Store original material properties if not already stored
      if (!this.originalMaterial) {
        // Instead of cloning the material (which might not be available),
        // just store the color value
        this.originalMaterial = {
          color: material.color ? material.color.clone() : new THREE.Color()
        };
      }
      
      // Create glow effect
      if (this.activeView === 'land') {
        // Add a slight bloom effect by increasing the brightness
        if (material.color) {
          const color = material.color.clone();
          color.multiplyScalar(1.5);
          material.color.copy(color);
        }
        
        // IMPORTANT: Adjust the polygon's position to prevent z-fighting
        // Move the mesh slightly up when hovered - but not too high
        this.highDetailMesh.position.y += 0.03; // Reduced from 0.05
        
        // Also increase the renderOrder to ensure it renders on top
        this.highDetailMesh.renderOrder = 1;
        
        // Update material
        material.needsUpdate = true;
      }
    } else {
      // Restore original material properties
      if (this.originalMaterial && this.originalMaterial.color && material.color) {
        try {
          material.color.copy(this.originalMaterial.color);
          material.needsUpdate = true;
          
          // IMPORTANT: Restore the original position
          // Move the mesh back to its original position
          this.highDetailMesh.position.y -= 0.03; // Reduced from 0.05
          
          // Reset the renderOrder
          this.highDetailMesh.renderOrder = 0;
        } catch (error) {
          console.error('Error restoring original material properties:', error);
        }
      }
    }
  }
  // Add helper method to determine land color
  private determineLandColor(): THREE.Color {
    if (this.activeView === 'land') {
      if (this.ownerColor) {
        // Blend the owner color with sand color for a more natural look
        const sandColor = new THREE.Color(0xf0e6c8); // Lighter sand color
        const ownerColor = new THREE.Color(this.ownerColor);
        // Mix 70% owner color with 30% sand color
        return new THREE.Color().lerpColors(sandColor, ownerColor, 0.7);
      } else if (this.polygon.owner) {
        // If we have an owner but no color, use a default color
        return new THREE.Color(0x7cac6a); // Default green color for owned lands
      } else {
        return new THREE.Color(0xe6d2a8); // Sand/beige for unowned lands
      }
    } else {
      return new THREE.Color(0xe6d2a8); // Sand/beige for non-land views
    }
  }
  
  // Add this new helper method to remove bottom faces
  private removeBottomFaces(geometry: THREE.ExtrudeGeometry) {
    // Get the position attribute from the geometry
    const position = geometry.getAttribute('position');
    const count = position.count;
    
    // Create an array to store which faces to keep
    const keepFace = [];
    
    // Loop through all faces (triangles)
    for (let i = 0; i < count / 3; i++) {
      // Get the three vertices of this face
      const a = new THREE.Vector3().fromBufferAttribute(position, i * 3);
      const b = new THREE.Vector3().fromBufferAttribute(position, i * 3 + 1);
      const c = new THREE.Vector3().fromBufferAttribute(position, i * 3 + 2);
      
      // Calculate the normal of this face
      const ab = new THREE.Vector3().subVectors(b, a);
      const ac = new THREE.Vector3().subVectors(c, a);
      const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();
      
      // Be more aggressive in removing downward-facing faces
      // Only keep faces that point significantly upward
      keepFace[i] = normal.y > 0.1; // Changed from >= 0 to > 0.1
    }
    
    // Create a new index array that only includes the faces we want to keep
    const index = [];
    for (let i = 0; i < count / 3; i++) {
      if (keepFace[i]) {
        index.push(i * 3, i * 3 + 1, i * 3 + 2);
      }
    }
    
    // Create a new BufferGeometry with only the faces we want to keep
    const newGeometry = new THREE.BufferGeometry();
    
    // Copy all attributes from the original geometry
    for (const name in geometry.attributes) {
      newGeometry.setAttribute(name, geometry.attributes[name]);
    }
    
    newGeometry.setIndex(index);
    
    // Replace the geometry in the mesh
    this.highDetailMesh.geometry.dispose();
    this.highDetailMesh.geometry = newGeometry;
  }
}
