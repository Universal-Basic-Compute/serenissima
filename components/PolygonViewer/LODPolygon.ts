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
      depth: 0.025 + Math.random() * 0.025,
      bevelEnabled: false
    };
    
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(-Math.PI / 2);
    
    // Create a simple material
    const material = new THREE.MeshStandardMaterial({ 
      color: this.activeView === 'land' ? '#7cac6a' : '#e6d2a8',
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.FrontSide,
      flatShading: true
    });
    
    this.lowDetailMesh = new THREE.Mesh(geometry, material);
    this.lowDetailMesh.castShadow = true;
    this.lowDetailMesh.receiveShadow = true;
    this.lowDetailMesh.userData.originalEmissive = new THREE.Color(0, 0, 0);
    this.lowDetailMesh.userData.originalEmissiveIntensity = 0;
    this.lowDetailMesh.userData.isLowDetail = true;
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
      steps: 2, // Increase steps for smoother extrusion
      depth: 0.05 + Math.random() * 0.03, // Slightly taller with some variation
      bevelEnabled: true, // Enable bevels for more realistic edges
      bevelThickness: 0.01,
      bevelSize: 0.01,
      bevelSegments: 2,
      UVGenerator: { // Add a custom UV generator for better texture mapping
        generateTopUV: function(geometry, vertices, indexA, indexB, indexC) {
          // Create UVs that map the entire texture to the face
          return [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(1, 0),
            new THREE.Vector2(0.5, 1)
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
    
    // Determine the color to use
    let landColor;
    if (this.activeView === 'land') {
      if (this.ownerColor) {
        // Use the owner's color if available
        landColor = new THREE.Color(this.ownerColor);
      } else if (this.polygon.owner) {
        // Generate a random color based on the owner's username
        landColor = this.generateColorFromUsername(this.polygon.owner);
      } else {
        // Default green color for unowned land
        landColor = new THREE.Color(0x7cac6a);
      }
    } else {
      // For other views, use sand color
      landColor = new THREE.Color(0xe6d2a8);
    }
    
    // Create a detailed material with enhanced land view appearance
    const material = new THREE.MeshStandardMaterial({ 
      color: landColor,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
      flatShading: false, // Smooth shading for better quality
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    
    // If we're in land view and the polygon has an owner with a coat of arms,
    // prepare to apply the coat of arms texture after mesh creation
    const hasCoatOfArms = this.activeView === 'land' && 
                          this.polygon.owner && 
                          this.ownerCoatOfArmsMap && 
                          this.ownerCoatOfArmsMap[this.polygon.owner];
    
    this.highDetailMesh = new THREE.Mesh(geometry, material);
    this.highDetailMesh.castShadow = true;
    this.highDetailMesh.receiveShadow = true;
    this.highDetailMesh.userData.originalEmissive = new THREE.Color(0, 0, 0);
    this.highDetailMesh.userData.originalEmissiveIntensity = 0;
    this.highDetailMesh.userData.isLowDetail = false;
  }
  
  public updateLOD(cameraPosition: THREE.Vector3) {
    // No LOD switching needed anymore
    return;
  }
  
  public getMesh() {
    return this.mesh;
  }
  
  // Add a method to generate a color from a username
  private generateColorFromUsername(username: string): THREE.Color {
    // Simple hash function to generate a number from a string
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convert the hash to a color
    const r = (hash & 0xFF) / 255;
    const g = ((hash >> 8) & 0xFF) / 255;
    const b = ((hash >> 16) & 0xFF) / 255;
    
    return new THREE.Color(r, g, b);
  }

  public updateViewMode(activeView: ViewMode) {
    this.activeView = activeView;
    
    // Apply visual changes to both high and low detail meshes
    const meshes = [this.highDetailMesh, this.lowDetailMesh].filter(Boolean);
    
    meshes.forEach(mesh => {
      if (!mesh) return;
      
      const material = mesh.material as THREE.MeshStandardMaterial;
      
      // Update material based on view mode
      if (activeView === 'land') {
        // For land view, use owner's color or generate one
        if (!this.isSelected) {
          if (this.ownerColor) {
            material.color.set(this.ownerColor);
          } else if (this.polygon.owner) {
            material.color.copy(this.generateColorFromUsername(this.polygon.owner));
          } else {
            material.color.set(new THREE.Color(0x7cac6a));
          }
        }
        material.roughness = 0.7;
        material.metalness = 0.1;
      } else {
        // For other views, use sand color
        if (!this.isSelected) {
          material.color.set('#e6d2a8');
        }
        material.roughness = 0.7;
        material.metalness = 0.1;
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
    // We're not applying textures to the polygons anymore
    // This method is kept for compatibility but doesn't do anything
    return;
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
    } else if (newOwner) {
      // Generate a random color based on the owner's username
      landColor = this.generateColorFromUsername(newOwner);
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
    this.scene.remove(this.mesh);
    
    // Clean up coat of arms sprite if it exists
    if (this.coatOfArmsSprite) {
      this.scene.remove(this.coatOfArmsSprite);
      (this.coatOfArmsSprite.material as THREE.SpriteMaterial).map?.dispose();
      (this.coatOfArmsSprite.material as THREE.SpriteMaterial).dispose();
    }
    
    if (this.highDetailMesh) {
      this.highDetailMesh.geometry.dispose();
      (this.highDetailMesh.material as THREE.Material).dispose();
    }
  }
  
  public updateSelectionState(isSelected: boolean) {
    // If selection state hasn't changed, do nothing
    if (this.isSelected === isSelected) return;
    
    this.isSelected = isSelected;
    
    // Apply visual changes to both high and low detail meshes
    const meshes = [this.highDetailMesh, this.lowDetailMesh].filter(Boolean);
    
    meshes.forEach(mesh => {
      if (!mesh) return;
      
      const material = mesh.material as THREE.MeshStandardMaterial;
      
      if (isSelected) {
        // Store original color if not already stored
        if (!this.originalColor) {
          this.originalColor = material.color.clone();
        }
        
        // Highlight the selected polygon with a bright color
        material.color.set('#ffcc00'); // Bright yellow
        material.emissive.set('#ff6600'); // Orange glow
        material.emissiveIntensity = 0.3;
        
        // IMPORTANT: Adjust the polygon's position to prevent z-fighting
        // Move the mesh slightly up when selected - increase this value
        mesh.position.y += 0.1; // Increase from 0.02 to 0.1 (higher than hover)
        
        // Also increase the renderOrder to ensure it renders on top
        mesh.renderOrder = 2; // Higher than hover
        
        // Make sure the material update is applied
        material.needsUpdate = true;
      } else {
        // Restore original color
        if (this.originalColor) {
          material.color.copy(this.originalColor);
          material.emissive.set('#000000');
          material.emissiveIntensity = 0;
          
          // IMPORTANT: Restore the original position
          // Move the mesh back to its original position
          mesh.position.y -= 0.1; // Match the increase above
          
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
    
    const material = this.highDetailMesh.material as THREE.MeshStandardMaterial;
    
    if (isHovered) {
      // Store original material properties if not already stored
      if (!this.originalMaterial) {
        this.originalMaterial = material.clone();
      }
      
      // Create glow effect
      if (this.activeView === 'land') {
        // Enhance the color to create a glow effect
        material.emissive.copy(material.color);
        material.emissiveIntensity = 0.7; // Increase from 0.5 to 0.7 for more noticeable glow
        
        // Add a slight bloom effect by increasing the brightness
        const color = material.color.clone();
        color.multiplyScalar(1.5); // Increase from 1.3 to 1.5 for brighter effect
        material.color.copy(color);
        
        // Reduce roughness for a more shiny appearance
        material.roughness = 0.2; // Decrease from 0.3 to 0.2 for more shine
        
        // IMPORTANT: Adjust the polygon's position to prevent z-fighting
        // Move the mesh slightly up when hovered - increase this value to ensure it's always on top
        this.highDetailMesh.position.y += 0.05; // Increase from 0.01 to 0.05
        
        // Also increase the renderOrder to ensure it renders on top
        this.highDetailMesh.renderOrder = 1;
        
        // Update material
        material.needsUpdate = true;
      }
    } else {
      // Restore original material properties
      if (this.originalMaterial) {
        material.emissive.set(0, 0, 0);
        material.emissiveIntensity = 0;
        material.color.copy(this.originalMaterial.color);
        material.roughness = this.originalMaterial.roughness;
        material.needsUpdate = true;
        
        // IMPORTANT: Restore the original position
        // Move the mesh back to its original position
        this.highDetailMesh.position.y -= 0.05; // Match the increase above
        
        // Reset the renderOrder
        this.highDetailMesh.renderOrder = 0;
      }
    }
  }
}
