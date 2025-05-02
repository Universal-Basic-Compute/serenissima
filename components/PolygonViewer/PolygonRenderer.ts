import * as THREE from 'three';
import { MutableRefObject } from 'react';
import { Polygon, ViewMode } from './types';
import { normalizeCoordinates, createPolygonShape } from './utils';
import PolygonMesh from './PolygonMesh';

interface PolygonRendererProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  polygons: Polygon[];
  bounds: {
    centerLat: number;
    centerLng: number;
    scale: number;
    latCorrectionFactor: number;
  };
  activeView: ViewMode;
  performanceMode: boolean;
  polygonMeshesRef: MutableRefObject<Record<string, THREE.Mesh>>;
  users?: Record<string, any>; // Add this
}

export default class PolygonRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private polygons: Polygon[];
  private bounds: any;
  private activeView: ViewMode;
  private performanceMode: boolean;
  private polygonMeshesRef: MutableRefObject<Record<string, THREE.Mesh>>;
  private textureLoader: THREE.TextureLoader;
  private sandBaseColor: THREE.Texture;
  private sandNormalMap: THREE.Texture;
  private sandRoughnessMap: THREE.Texture;
  private polygonMesh: PolygonMesh[] = [];
  private ownerCoatOfArmsMap: Record<string, string> = {}; // Map of owner to coat of arms URL
  public hasUpdatedCoatOfArms: boolean = false; // Flag to track if coat of arms have been updated
  
  // Add a method to create a sprite for the coat of arms
  // Add method to create a sprite for the coat of arms
  private coatOfArmSprites: Record<string, THREE.Object3D | THREE.Mesh> = {};
  private ownerColorMap: Record<string, string> = {}; // Map of owner to color
  private users: Record<string, any> = {}; // Store users data
  private PolygonMeshs: PolygonMesh[] = []; // Store PolygonMesh instances
  private coatOfArmsSprite: THREE.Sprite | null = null;
  private ownerColor: string | null = null;
  private polygon: any = {}; // Store current polygon data

  // Create a static texture loader to be shared across instances
  private static sharedTextureLoader: THREE.TextureLoader | null = null;
  private static sharedTextures: {
    sandBaseColor?: THREE.Texture;
    sandNormalMap?: THREE.Texture;
    sandRoughnessMap?: THREE.Texture;
  } = {};
  
  // Add static method for optimized texture loading
  private static loadOptimizedTexture(url: string, callback?: (texture: THREE.Texture) => void): THREE.Texture {
    // Check if device supports WebP
    const supportsWebP = document.createElement('canvas')
      .toDataURL('image/webp')
      .indexOf('data:image/webp') === 0;
    
    // Use WebP if supported
    const optimizedUrl = supportsWebP ? 
      url.replace(/\.(jpg|png)$/, '.webp') : 
      url;
    
    // Create a low-res placeholder texture first
    const placeholderTexture = new THREE.Texture();
    
    // Load the full texture in the background
    if (PolygonRenderer.sharedTextureLoader) {
      PolygonRenderer.sharedTextureLoader.load(
        optimizedUrl,
        (fullTexture) => {
          // Copy properties from placeholder to full texture
          fullTexture.wrapS = placeholderTexture.wrapS;
          fullTexture.wrapT = placeholderTexture.wrapT;
          fullTexture.repeat = placeholderTexture.repeat;
          
          // Replace the placeholder with the full texture
          placeholderTexture.image = fullTexture.image;
          placeholderTexture.needsUpdate = true;
          
          if (callback) callback(placeholderTexture);
        },
        undefined,
        (error) => {
          console.error(`Error loading optimized texture ${optimizedUrl}:`, error);
        }
      );
    }
    
    return placeholderTexture;
  }
  
  // Add sun reflection property
  private sunReflection: THREE.Mesh | null = null;

  constructor({
    scene,
    camera,
    polygons,
    bounds,
    activeView,
    performanceMode,
    polygonMeshesRef,
    users
  }: PolygonRendererProps) {
    this.scene = scene;
    this.camera = camera;
    this.polygons = polygons;
    this.bounds = bounds;
    this.activeView = activeView;
    this.performanceMode = performanceMode;
    this.polygonMeshesRef = polygonMeshesRef;
    
    // Store users data
    this.users = users || {};
    
    // Process users data to create coat of arms map and color map
    if (users) {
      // Debug log for ConsiglioDeiDieci specifically
      if (users['ConsiglioDeiDieci']) {
        console.log('ConsiglioDeiDieci user data in PolygonRenderer:', users['ConsiglioDeiDieci']);
        console.log('ConsiglioDeiDieci color in PolygonRenderer:', users['ConsiglioDeiDieci'].color);
      } else {
        // If ConsiglioDeiDieci is missing, add it with default values
        console.warn('ConsiglioDeiDieci not found in users data! Adding default entry in PolygonRenderer.');
        this.users['ConsiglioDeiDieci'] = {
          user_name: 'ConsiglioDeiDieci',
          color: '#8B0000', // Dark red
          coat_of_arms_image: null
        };
      }
      
      Object.values(users).forEach(user => {
        if (user.user_name) {
          // Store coat of arms image if available
          if (user.coat_of_arms_image) {
            this.ownerCoatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          }
          
          // Store color if available - ensure we check for null/undefined
          if (user.color) {
            this.ownerColorMap[user.user_name] = user.color;
            console.log(`Stored color for ${user.user_name}: ${user.color}`);
          } else if (user.user_name === 'ConsiglioDeiDieci') {
            // Provide a default color for ConsiglioDeiDieci if missing
            this.ownerColorMap[user.user_name] = '#8B0000'; // Dark red
            console.log(`Assigned default color for ConsiglioDeiDieci: #8B0000`);
          }
        }
      });
      
      // Always ensure ConsiglioDeiDieci has a color
      if (!this.ownerColorMap['ConsiglioDeiDieci']) {
        this.ownerColorMap['ConsiglioDeiDieci'] = '#8B0000'; // Dark red
        console.log('Added missing ConsiglioDeiDieci color in PolygonRenderer');
      }
      
      console.log(`Processed ${Object.keys(this.ownerCoatOfArmsMap).length} coat of arms and ${Object.keys(this.ownerColorMap).length} colors from users data`);
    }
    
    // Create shore effects for islands
    setTimeout(() => this.createShoreEffects(), 1000);
    
    // Initialize texture loader explicitly
    this.textureLoader = new THREE.TextureLoader();
    
    // Process users data to create coat of arms map and color map
    if (users) {
      Object.values(users).forEach(user => {
        if (user.user_name) {
          // Store coat of arms image if available
          if (user.coat_of_arms_image) {
            this.ownerCoatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          }
          
          // Store color if available
          if (user.color) {
            this.ownerColorMap[user.user_name] = user.color;
          }
        }
      });
      console.log(`Processed ${Object.keys(this.ownerCoatOfArmsMap).length} coat of arms and ${Object.keys(this.ownerColorMap).length} colors from users data`);
    }
    
    // Use shared texture loader or create one if it doesn't exist
    if (!PolygonRenderer.sharedTextureLoader) {
      PolygonRenderer.sharedTextureLoader = new THREE.TextureLoader();
      PolygonRenderer.sharedTextureLoader.setCrossOrigin('anonymous');
    }
    this.textureLoader = PolygonRenderer.sharedTextureLoader;
    
    // Load shared textures if they don't exist yet
    if (!PolygonRenderer.sharedTextures.sandBaseColor) {
      console.log('Loading shared textures...');
      
      // Load sand texture directly
      PolygonRenderer.sharedTextures.sandBaseColor = this.textureLoader.load(
        '/textures/sand.jpg',
        (texture) => {
          // Configure texture settings once loaded
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1.25, 1.25);
          texture.needsUpdate = true;
          console.log('Sand base color texture loaded successfully');
        },
        undefined,
        (error) => {
          console.error('Error loading sand base color texture:', error);
        }
      );
      
      // Load normal map directly
      PolygonRenderer.sharedTextures.sandNormalMap = this.textureLoader.load(
        '/textures/sand_normal.jpg',
        (texture) => {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1.25, 1.25);
          texture.needsUpdate = true;
          console.log('Sand normal map texture loaded successfully');
        },
        undefined,
        (error) => {
          console.error('Error loading sand normal map texture:', error);
        }
      );
      
      // Load roughness map directly
      PolygonRenderer.sharedTextures.sandRoughnessMap = this.textureLoader.load(
        '/textures/sand_roughness.jpg',
        (texture) => {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1.25, 1.25);
          texture.needsUpdate = true;
          console.log('Sand roughness map texture loaded successfully');
        },
        undefined,
        (error) => {
          console.error('Error loading sand roughness map texture:', error);
        }
      );
    }
    
    // Use the shared textures
    this.sandBaseColor = PolygonRenderer.sharedTextures.sandBaseColor!;
    this.sandNormalMap = PolygonRenderer.sharedTextures.sandNormalMap!;
    this.sandRoughnessMap = PolygonRenderer.sharedTextures.sandRoughnessMap!;
    
    // Render polygons with a slight delay to allow the UI to render first
    setTimeout(() => this.renderPolygons(), 0);
    
  }
  
  // Add a set to track created polygon IDs
  private createdPolygonIds = new Set<string>();

  private renderPolygons() {
    console.log(`Rendering ${this.polygons.length} polygons`);
    
    // Create a texture loader if not already created
    if (!this.textureLoader) {
      this.textureLoader = new THREE.TextureLoader();
    }
    
    // Collect land positions for water interaction
    const landPositions: THREE.Vector3[] = [];
    
    // Process each polygon
    this.polygons.forEach(polygon => {
      // Skip if already created
      if (this.createdPolygonIds.has(polygon.id)) {
        return;
      }
      
      try {
        // Get owner color if available
        let ownerColor = null;
        if (polygon.owner) {
          if (this.ownerColorMap[polygon.owner]) {
            ownerColor = this.ownerColorMap[polygon.owner];
          } else if (this.users[polygon.owner] && this.users[polygon.owner].color) {
            ownerColor = this.users[polygon.owner].color;
            // Store for future use
            this.ownerColorMap[polygon.owner] = ownerColor;
          } else if (polygon.owner === 'ConsiglioDeiDieci') {
            // Special case for ConsiglioDeiDieci
            ownerColor = '#8B0000'; // Dark red
            this.ownerColorMap[polygon.owner] = ownerColor;
          }
        }
        
        // Get coat of arms URL if available
        let ownerCoatOfArmsUrl = null;
        if (polygon.owner && this.ownerCoatOfArmsMap[polygon.owner]) {
          ownerCoatOfArmsUrl = this.ownerCoatOfArmsMap[polygon.owner];
        }
        
        // Create polygon mesh
        const polygonMesh = new PolygonMesh(
          this.scene,
          polygon,
          this.bounds,
          this.activeView,
          this.performanceMode,
          this.textureLoader,
          ownerColor,
          ownerCoatOfArmsUrl,
          this.polygonMeshesRef
        );
        
        // Store reference to the mesh
        this.PolygonMeshs.push(polygonMesh);
        
        // Mark as created
        this.createdPolygonIds.add(polygon.id);
        
        // Add land position for water interaction
        if (polygon.centroid) {
          // Convert centroid to 3D position
          const normalizedCoord = normalizeCoordinates(
            [polygon.centroid],
            this.bounds.centerLat,
            this.bounds.centerLng,
            this.bounds.scale,
            this.bounds.latCorrectionFactor
          )[0];
          
          landPositions.push(new THREE.Vector3(normalizedCoord.x, 0, normalizedCoord.y));
        }
        
      } catch (error) {
        console.error(`Error rendering polygon ${polygon.id}:`, error);
      }
    });
    
    console.log(`Created ${this.PolygonMeshs.length} polygon meshes`);
    
    // Store land positions in scene for water interaction
    this.scene.userData.landPositions = landPositions;
    console.log(`Collected ${landPositions.length} land positions for water interaction`);
  }
  
  private createSamplePolygon() {
    console.log('Sample polygon creation disabled');
    // No geometry generation
  }
  
  public update(selectedPolygonId: string | null = null) {
    // No need to update LOD anymore
    // Just update selection state
    this.updateSelectionState(selectedPolygonId);
  }
  
  // Add this new method to update selection state
  public updateSelectionState(selectedPolygonId: string | null) {
    // Update selection state for all LOD polygons
    this.PolygonMeshs.forEach(polygonMesh => {
      try {
        const polygonId = this.polygons.find(
          p => p && polygonMesh.getMesh() === this.polygonMeshesRef.current[p.id]
        )?.id;
        
        if (polygonId) {
          // Apply selection state based on ID match
          polygonMesh.updateSelectionState(polygonId === selectedPolygonId);
        }
      } catch (error) {
        console.error('Error updating selection state for polygon:', error);
      }
    });
  }
  
  public updateViewMode(activeView: ViewMode) {
    // Skip update if view hasn't changed
    if (this.activeView === activeView) {
      console.log(`View mode ${activeView} already active, skipping update`);
      return;
    }
    
    this.activeView = activeView;
    
    // Update all LOD polygons with the new view mode
    this.PolygonMeshs.forEach(polygonMesh => {
      polygonMesh.updateViewMode(activeView);
    });
    
    // Always update coat of arms sprites when changing view mode
    // This ensures they're created when switching to land view
    // and removed when switching away
    this.updateCoatOfArmsSprites();
    
    // Force update of owner colors when switching to land view
    if (activeView === 'land') {
      this.updatePolygonOwnerColors();
    }
    
    console.log(`View mode updated to ${activeView}, coat of arms sprites updated`);
  }
  
  // Add method to update all polygon owner colors
  public updatePolygonOwnerColors() {
    console.log('Updating all polygon owner colors with', Object.keys(this.ownerColorMap).length, 'colors');
    
    // Check if we have owner colors
    if (Object.keys(this.ownerColorMap).length === 0) {
      console.warn('No owner colors available');
      return;
    }
    
    // Process all polygons
    this.polygons.forEach(polygon => {
      if (polygon.owner) {
        console.log(`Processing polygon ${polygon.id} owned by ${polygon.owner}`);
        
        // Find the corresponding PolygonMesh
        const polygonMesh = this.PolygonMeshs.find(pm => {
          const mesh = pm.getMesh();
          return mesh && this.polygonMeshesRef.current[polygon.id] === mesh;
        });
        
        if (polygonMesh) {
          // Get the owner's color
          let ownerColor = null;
          if (this.ownerColorMap[polygon.owner]) {
            ownerColor = this.ownerColorMap[polygon.owner];
            console.log(`Using stored color for ${polygon.owner}: ${ownerColor}`);
          } else if (this.users[polygon.owner] && this.users[polygon.owner].color) {
            ownerColor = this.users[polygon.owner].color;
            // Store for future use
            this.ownerColorMap[polygon.owner] = ownerColor;
            console.log(`Found color for ${polygon.owner} in users data: ${ownerColor}`);
          } else if (polygon.owner === 'ConsiglioDeiDieci') {
            // Special case for ConsiglioDeiDieci
            ownerColor = '#8B0000'; // Dark red
            this.ownerColorMap[polygon.owner] = ownerColor;
            console.log(`Using hardcoded color for ConsiglioDeiDieci: ${ownerColor}`);
          } else {
            // Use default color if no owner color is specified
            ownerColor = '#7cac6a'; // Default green color
          }
          
          if (ownerColor) {
            console.log(`Applying color ${ownerColor} to polygon ${polygon.id} owned by ${polygon.owner}`);
            polygonMesh.updateOwner(polygon.owner, ownerColor);
            
            // Force material update
            const mesh = polygonMesh.getMesh();
            if (mesh) {
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach(mat => {
                  if (mat instanceof THREE.MeshBasicMaterial) {
                    mat.needsUpdate = true;
                  }
                });
              } else if (mesh.material instanceof THREE.MeshBasicMaterial) {
                mesh.material.needsUpdate = true;
              }
              
              // Ensure the mesh is completely flat
              if (mesh.geometry) {
                const positions = mesh.geometry.attributes.position.array;
                for (let i = 1; i < positions.length; i += 3) {
                  positions[i] = 0; // Force Y coordinate to 0
                }
                mesh.geometry.attributes.position.needsUpdate = true;
              }
            }
          }
        } else {
          console.warn(`Could not find PolygonMesh for polygon ${polygon.id}`);
        }
      }
    });
    
    // Force a render to apply changes
    if (this.scene.userData.forceRender) {
      this.scene.userData.forceRender();
    }
  }

  public updateQuality(performanceMode: boolean) {
    this.performanceMode = performanceMode;
    
    // Update all LOD polygons with the new quality setting
    this.PolygonMeshs.forEach(polygonMesh => {
      polygonMesh.updateQuality(performanceMode);
    });
  }
  
  public updateOwnerCoatOfArms(ownerCoatOfArmsMap: Record<string, string>) {
    console.log('updateOwnerCoatOfArms called with data:', ownerCoatOfArmsMap);
    
    // Update the coat of arms map
    this.ownerCoatOfArmsMap = { ...this.ownerCoatOfArmsMap, ...ownerCoatOfArmsMap };
    
    // Update the users data with coat of arms information
    Object.entries(ownerCoatOfArmsMap).forEach(([owner, url]) => {
      if (this.users[owner]) {
        this.users[owner].coat_of_arms_image = url;
      } else {
        // Create user entry if it doesn't exist
        this.users[owner] = { 
          user_name: owner,
          coat_of_arms_image: url
        };
      }
    });
    
    console.log('Combined coat of arms map now has', Object.keys(this.ownerCoatOfArmsMap).length, 'entries');
    
    // If we're in land view, apply the new coat of arms textures directly to the land shapes
    if (this.activeView === 'land') {
      this.updateCoatOfArmsSprites();
    }
    
    // Set the flag to indicate we've updated coat of arms
    this.hasUpdatedCoatOfArms = true;
  }
  
  // Add method to update owner colors
  public updateOwnerColors(colorMap: Record<string, string>) {
    console.log('updateOwnerColors called with data:', colorMap);
    
    // Update the owner color map
    this.ownerColorMap = { ...this.ownerColorMap, ...colorMap };
    
    // Update the users data with color information
    Object.entries(colorMap).forEach(([owner, color]) => {
      if (this.users[owner]) {
        this.users[owner].color = color;
      } else {
        // Create user entry if it doesn't exist
        this.users[owner] = { 
          user_name: owner,
          color: color
        };
      }
    });
    
    console.log('Owner color map now has', Object.keys(this.ownerColorMap).length, 'entries');
    
    // If we're in land view, update the colors
    if (this.activeView === 'land') {
      this.updatePolygonOwnerColors();
    }
  }
  
  // This method is replaced by createColoredCircleOnLand

  // Create and update coat of arms as flat textures on the land
  public updateCoatOfArmsSprites() {
    console.log('Updating coat of arms sprites, active view:', this.activeView);
    
    // Remove existing coat of arms objects
    Object.values(this.coatOfArmSprites).forEach(obj => {
      this.scene.remove(obj);
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat: THREE.Material) => {
              if ((mat as any).map) (mat as any).map.dispose();
              mat.dispose();
            });
          } else {
            if ((obj.material as any).map) (obj.material as any).map.dispose();
            obj.material.dispose();
          }
        }
      }
    });
    this.coatOfArmSprites = {};

    // Only create coat of arms if we're in land view
    if (this.activeView !== 'land') {
      console.log('Not in land view, skipping coat of arms textures');
      return;
    }

    console.log('Creating coat of arms for land view, polygons count:', this.polygons.length);
    console.log('Available coat of arms:', Object.keys(this.ownerCoatOfArmsMap));
    
    // Process each polygon with an owner
    this.polygons.forEach(polygon => {
      if (!polygon.owner) return;
      
      console.log(`Processing polygon ${polygon.id} with owner ${polygon.owner}`);
      
      // Get the coat of arms URL
      const coatOfArmsUrl = this.ownerCoatOfArmsMap[polygon.owner];
      
      // Get the owner's color from the users data
      let ownerColor = '#8B4513'; // Default brown color
      if (this.ownerColorMap[polygon.owner]) {
        ownerColor = this.ownerColorMap[polygon.owner];
        console.log(`Using cached color for ${polygon.owner}: ${ownerColor}`);
      } else if (this.users[polygon.owner] && this.users[polygon.owner].color) {
        ownerColor = this.users[polygon.owner].color;
        // Cache the color for future use
        this.ownerColorMap[polygon.owner] = ownerColor;
        console.log(`Using color from users data for ${polygon.owner}: ${ownerColor}`);
      } else if (polygon.owner === 'ConsiglioDeiDieci') {
        // Special case for ConsiglioDeiDieci
        ownerColor = '#8B0000'; // Dark red
        this.ownerColorMap[polygon.owner] = ownerColor;
        console.log(`Using hardcoded color for ConsiglioDeiDieci: ${ownerColor}`);
      }
      
      // Find the corresponding PolygonMesh
      const polygonMesh = this.PolygonMeshs.find(pm => {
        const mesh = pm.getMesh();
        return mesh && this.polygonMeshesRef.current[polygon.id] === mesh;
      });
      
      if (!polygonMesh) {
        console.warn(`Could not find PolygonMesh for ${polygon.id}`);
        return;
      }
      
      // Always update the owner color first
      polygonMesh.updateOwner(polygon.owner, ownerColor);
      
      if (coatOfArmsUrl) {
        console.log(`Applying coat of arms texture for ${polygon.id} with URL: ${coatOfArmsUrl}`);
        // Apply the coat of arms texture directly to the land shape
        polygonMesh.updateCoatOfArmsTexture(coatOfArmsUrl);
      } else if (polygon.centroid) {
        console.log(`Creating colored circle for ${polygon.id} with color: ${ownerColor}`);
        // Create a colored circle texture on the land as fallback
        this.createColoredCircleOnLand(polygon, ownerColor);
      }
    });
    
    // Force a render to apply the changes
    if (this.scene.userData.forceRender) {
      this.scene.userData.forceRender();
    }
  }

  // Add this helper method to create a flat texture on the land for a polygon
  private createFlatTextureForPolygon(polygon: Polygon, texture: THREE.Texture) {
    console.log(`Flat texture creation disabled for polygon ${polygon.id}`);
    // No textures are created to avoid geometry generation
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
      ctx.fillStyle = '#8B4513'; // Default brown color
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
      ctx.fillStyle = '#8B4513'; // Default brown color
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 8;
      ctx.stroke();
      
      const fallbackTexture = new THREE.Texture(canvas);
      fallbackTexture.needsUpdate = true;
      return fallbackTexture;
    }
  }
  
  // Add a new method to create a colored circle on the land
  private createColoredCircleOnLand(polygon: Polygon, color: string) {
    console.log(`Colored circle creation disabled for polygon ${polygon.id}`);
    // No colored circles are created to avoid geometry generation
  }

  // Add method to update polygon owner
  public updatePolygonOwner(polygonId: string, newOwner: string) {
    console.log(`PolygonRenderer.updatePolygonOwner called for ${polygonId} with new owner ${newOwner}`);
    
    // Find the polygon in our list
    const polygon = this.polygons.find(p => p.id === polygonId);
    if (!polygon) {
      console.warn(`Polygon ${polygonId} not found in polygons list`);
      return;
    }
    
    // Update the polygon's owner
    polygon.owner = newOwner;
    console.log(`Updated polygon ${polygonId} owner to ${newOwner} in data model`);
    
    // Find the corresponding PolygonMesh
    const polygonMesh = this.PolygonMeshs.find(pm => 
      pm.getMesh() === this.polygonMeshesRef.current[polygonId]
    );
    
    if (!polygonMesh) {
      console.warn(`PolygonMesh for ${polygonId} not found`);
      return;
    }
    
    // Get the owner's color from the users data with better error handling
    let ownerColor = null;
    try {
      if (newOwner) {
        if (this.ownerColorMap[newOwner]) {
          ownerColor = this.ownerColorMap[newOwner];
          console.log(`Using stored color for ${newOwner}: ${ownerColor}`);
        } else if (this.users[newOwner] && this.users[newOwner].color) {
          ownerColor = this.users[newOwner].color;
          // Also store in the color map for future use
          this.ownerColorMap[newOwner] = ownerColor;
          console.log(`Found color for ${newOwner} in users data: ${ownerColor}`);
        } else if (newOwner === 'ConsiglioDeiDieci') {
          // Special case for ConsiglioDeiDieci
          ownerColor = '#8B0000'; // Dark red
          this.ownerColorMap[newOwner] = ownerColor;
          console.log(`Using hardcoded color for ConsiglioDeiDieci: ${ownerColor}`);
        } else {
          // Use default color if no owner color is specified
          ownerColor = '#7cac6a'; // Default green color
          console.log(`Using default color for ${newOwner}: ${ownerColor}`);
        }
      }
    } catch (error) {
      console.error(`Error getting color for owner ${newOwner}:`, error);
      // Use default color if there was an error
      ownerColor = '#7cac6a'; // Default green color
    }
    
    // Get the owner's coat of arms URL if available
    let ownerCoatOfArmsUrl = null;
    try {
      if (newOwner && this.ownerCoatOfArmsMap && this.ownerCoatOfArmsMap[newOwner]) {
        ownerCoatOfArmsUrl = this.ownerCoatOfArmsMap[newOwner];
        console.log(`Found coat of arms for ${newOwner}: ${ownerCoatOfArmsUrl}`);
      }
    } catch (error) {
      console.error(`Error getting coat of arms for owner ${newOwner}:`, error);
    }
    
    // Update the PolygonMesh with the new owner's color and coat of arms
    try {
      console.log(`Updating PolygonMesh for ${polygonId} with owner ${newOwner} and color ${ownerColor}`);
      polygonMesh.updateOwner(newOwner, ownerColor);
      
      if (ownerCoatOfArmsUrl) {
        console.log(`Updating coat of arms texture for ${polygonId} with URL ${ownerCoatOfArmsUrl}`);
        polygonMesh.updateCoatOfArmsTexture(ownerCoatOfArmsUrl);
      }
    } catch (error) {
      console.error(`Error updating PolygonMesh for ${polygonId}:`, error);
    }
    
    // Update coat of arms sprites
    try {
      console.log('Updating coat of arms sprites');
      this.updateCoatOfArmsSprites();
    } catch (error) {
      console.error('Error updating coat of arms sprites:', error);
    }
    
    // Force a render to apply changes
    if (this.scene.userData.forceRender) {
      console.log('Forcing render to apply changes');
      this.scene.userData.forceRender();
    }
  }
  
  // Add method to update hover state
  public updateHoverState(hoveredPolygonId: string | null) {
    console.log('Updating hover state for polygon:', hoveredPolygonId);
    
    // Update hover state for all LOD polygons
    this.PolygonMeshs.forEach(polygonMesh => {
      if (!polygonMesh) return;
      
      try {
        const polygonId = this.polygons.find(
          p => p && polygonMesh.getMesh() === this.polygonMeshesRef.current[p.id]
        )?.id;
        
        if (polygonId) {
          // Apply hover state based on ID match
          polygonMesh.updateHoverState(polygonId === hoveredPolygonId);
        }
      } catch (error) {
        console.error('Error updating hover state for polygon:', error);
      }
    });
  }

  // Add method to create shore effects for islands
  private createShoreEffects() {
    console.log('Shore effects creation disabled');
    // No shore effects are created to avoid geometry generation
  }
  
  public cleanup() {
    console.log(`Cleaning up PolygonRenderer with ${this.PolygonMeshs.length} meshes`);
    
    // Clean up all LOD polygons
    this.PolygonMeshs.forEach(polygonMesh => {
      polygonMesh.cleanup();
    });
    
    // Clear the arrays and maps
    this.PolygonMeshs = [];
    this.createdPolygonIds.clear();
    
    // Clean up coat of arms objects (planes or sprites)
    Object.values(this.coatOfArmSprites).forEach(obj => {
      this.scene.remove(obj);
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(mat => {
              if (mat.map) mat.map.dispose();
              mat.dispose();
            });
          } else {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
        }
      }
    });
    this.coatOfArmSprites = {};
    
    // Dispose of textures
    this.sandBaseColor.dispose();
    this.sandNormalMap.dispose();
    this.sandRoughnessMap.dispose();
  }
}
