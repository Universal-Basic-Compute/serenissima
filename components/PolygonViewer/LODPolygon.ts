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
      side: THREE.FrontSide
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
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 3,
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
    
    // Determine the color to use
    const landColor = this.determineLandColor();
    
    // Create a material that looks like sand
    const material = new THREE.MeshStandardMaterial({ 
      color: landColor,
      roughness: 0.9, // High roughness for sand-like appearance
      metalness: 0.1, // Low metalness
      side: THREE.FrontSide,
      // Add these important properties to prevent z-fighting:
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      // Ensure depth settings are correct
      depthTest: true,
      depthWrite: true
    });
    
    // Load sand texture if not in performance mode
    if (!this.performanceMode) {
      // Use shared texture loader
      this.textureLoader.load(
        'https://threejs.org/examples/textures/terrain/grasslight-big.jpg', // Use existing texture
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(5, 5); // Adjust based on scale
          material.map = texture;
          material.needsUpdate = true;
        }
      );
      
      // Load normal map for sand texture
      this.textureLoader.load(
        'https://threejs.org/examples/textures/terrain/grasslight-big-nm.jpg', // Use existing texture
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(5, 5); // Match the color texture
          material.normalMap = texture;
          material.normalScale.set(0.5, 0.5); // Adjust for desired bumpiness
          material.needsUpdate = true;
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
    if (!coatOfArmsUrl || !this.highDetailMesh) return;
    
    // Load the texture
    this.textureLoader.load(
      coatOfArmsUrl,
      (texture) => {
        // Create a new material that uses the coat of arms texture
        const material = new THREE.MeshBasicMaterial({
          map: texture,
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
        }
      },
      undefined,
      (error) => {
        console.error('Error loading coat of arms texture:', error);
      }
    );
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
    
    // Only update if we're in land view
    if (this.activeView !== 'land') return;
    
    // Update the material color based on the new owner
    if (!this.highDetailMesh) return;
    
    const material = this.highDetailMesh.material as THREE.MeshStandardMaterial;
    
    // Determine the color to use
    let landColor;
    if (ownerColor) {
      // Use the owner's color if available
      landColor = new THREE.Color(ownerColor);
      console.log(`Using provided color for ${newOwner}: ${ownerColor}`);
    } else if (newOwner) {
      // Generate a random color based on the owner's username
      landColor = this.generateColorFromUsername(newOwner);
      console.log(`Generated color for ${newOwner}: ${landColor.getHexString()}`);
    } else {
      // Default green color for unowned land
      landColor = new THREE.Color(0x7cac6a);
    }
    
    // Apply the new color if not selected
    if (!this.isSelected) {
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
        material.color.copy(this.originalMaterial.color);
        material.needsUpdate = true;
        
        // IMPORTANT: Restore the original position
        // Move the mesh back to its original position
        this.highDetailMesh.position.y -= 0.03; // Reduced from 0.05
        
        // Reset the renderOrder
        this.highDetailMesh.renderOrder = 0;
      }
    }
  }
  // Add helper method to determine land color
  private determineLandColor(): THREE.Color {
    if (this.activeView === 'land') {
      if (this.ownerColor) {
        return new THREE.Color(this.ownerColor);
      } else if (this.polygon.owner) {
        return this.generateColorFromUsername(this.polygon.owner);
      } else {
        return new THREE.Color(0xe6d2a8); // Changed from green to sand/beige
      }
    } else {
      return new THREE.Color(0xe6d2a8);
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
      
      // If the normal points downward (y component is negative), don't keep this face
      // Be more aggressive in removing downward-facing faces
      keepFace[i] = normal.y >= 0; // Only keep faces that point upward or horizontally
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
