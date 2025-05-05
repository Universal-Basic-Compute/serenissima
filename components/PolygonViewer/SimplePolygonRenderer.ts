import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { normalizeCoordinates, createPolygonShape } from './utils';
import { userService } from '../../lib/services/UserService';

interface SimplePolygonRendererProps {
  scene: THREE.Scene;
  polygons: any[];
  bounds: {
    centerLat: number;
    centerLng: number;
    scale: number;
    latCorrectionFactor: number;
  };
}

export default class SimplePolygonRenderer {
  private scene: THREE.Scene;
  private polygons: any[];
  private bounds: any;
  private meshes: THREE.Mesh[] = [];
  private textureLoader: THREE.TextureLoader;
  private sandTexture: THREE.Texture | null = null;
  private sharedMaterial: THREE.MeshStandardMaterial | null = null;
  private activeView: string = 'land'; // Default to land view
  private coatOfArmsSprites: Record<string, THREE.Sprite> = {};
  private ownerCoatOfArmsMap: Record<string, string> = {};
  private users: Record<string, any> = {};
  
  constructor({ scene, polygons, bounds, activeView = 'land', users = {} }: SimplePolygonRendererProps & { 
    activeView?: string;
    users?: Record<string, any>;
  }) {
    this.scene = scene;
    this.polygons = polygons;
    this.bounds = bounds;
    this.activeView = activeView;
    this.users = users;
    this.textureLoader = new THREE.TextureLoader();
    
    // Process users data to extract coat of arms
    if (users) {
      Object.values(users).forEach(user => {
        if (user.user_name && user.coat_of_arms_image) {
          this.ownerCoatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          console.log(`Initialized coat of arms for ${user.user_name}: ${user.coat_of_arms_image}`);
        }
      });
    }
    
    // Also try to get users from UserService
    try {
      const serviceUsers = userService.getUsers();
      if (serviceUsers && Object.keys(serviceUsers).length > 0) {
        Object.values(serviceUsers).forEach(user => {
          if (user.user_name && user.coat_of_arms_image) {
            this.ownerCoatOfArmsMap[user.user_name] = user.coat_of_arms_image;
            console.log(`Initialized coat of arms from service for ${user.user_name}: ${user.coat_of_arms_image}`);
          }
        });
      }
    } catch (error) {
      console.warn('Error getting users from UserService:', error);
    }
    
    // Load sand texture
    this.textureLoader.load(
      '/textures/sand.jpg',
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        this.sandTexture = texture;
        
        // Render polygons once texture is loaded
        this.renderPolygons();
        
        // Create coat of arms sprites if in land view
        if (this.activeView === 'land') {
          this.createCoatOfArmsSprites();
        }
      },
      undefined,
      (error) => {
        console.error('Error loading texture:', error);
        // Render polygons without texture if loading fails
        this.renderPolygons();
        
        // Create coat of arms sprites if in land view
        if (this.activeView === 'land') {
          this.createCoatOfArmsSprites();
        }
      }
    );
  }
  
  private renderPolygons() {
    // Create a single shared material for all polygons
    this.sharedMaterial = new THREE.MeshStandardMaterial({
      map: this.sandTexture,
      color: this.sandTexture ? 0xffffff : 0xf5e9c8, // Use texture color or sand color
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.1,
      wireframe: false,
      flatShading: false,
      // Remove polygon offset properties
      polygonOffset: false,
      // Disable shadows
      castShadow: false,
      receiveShadow: false
    });
    
    // Process each polygon
    this.polygons.forEach(polygon => {
      try {
        if (!polygon.coordinates || polygon.coordinates.length < 3) {
          console.warn(`Invalid polygon coordinates for ${polygon.id}`);
          return;
        }
        
        // Normalize coordinates
        const normalizedCoords = normalizeCoordinates(
          polygon.coordinates,
          this.bounds.centerLat,
          this.bounds.centerLng,
          this.bounds.scale,
          this.bounds.latCorrectionFactor
        );
        
        // Create shape
        const shape = createPolygonShape(normalizedCoords);
        
        // Scale the shape slightly to create overlap between adjacent polygons
        const scaleFactor = 1.001; // 0.1% larger
        for (let i = 0; i < shape.curves.length; i++) {
          const curve = shape.curves[i];
          if (curve instanceof THREE.LineCurve) {
            curve.v1.multiplyScalar(scaleFactor);
            curve.v2.multiplyScalar(scaleFactor);
          }
        }

        // Create geometry with minimal extrusion for elevation
        const extrudeSettings = {
          depth: 0.001,  // Make it even flatter
          bevelEnabled: false,
          curveSegments: 6
        };
      
        // Use ExtrudeGeometry instead of ShapeGeometry for elevation
        let geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        
        // Apply more aggressive smoothing to the geometry
        geometry.computeVertexNormals();
        
        // Merge vertices to eliminate tiny gaps using BufferGeometryUtils
        if (BufferGeometryUtils && BufferGeometryUtils.mergeVertices) {
          geometry = BufferGeometryUtils.mergeVertices(geometry);
        } else {
          console.warn('BufferGeometryUtils.mergeVertices not available, skipping vertex merging');
        }
      
        // Create mesh with shared material
        const mesh = new THREE.Mesh(geometry, this.sharedMaterial);
        
        // Set render order to ensure land renders above water
        mesh.renderOrder = 1;
      
        // Position mesh - adjust rotation to make top surface flat
        mesh.rotation.x = -Math.PI / 2;
    
        // Position the land exactly at water level
        mesh.position.y = 0; // Change from -5.005 to 0
    
        // No need for render order or polygon offset when there's clear physical separation
        
        // Add to scene
        this.scene.add(mesh);
        
        // Store reference
        this.meshes.push(mesh);
        
      } catch (error) {
        console.error(`Error rendering polygon ${polygon.id}:`, error);
      }
    });
    
    console.log(`Rendered ${this.meshes.length} polygons`);
  }
  
  /**
   * Create coat of arms sprites for all polygons with owners
   */
  private createCoatOfArmsSprites() {
    console.log('Creating coat of arms sprites for land view');
    
    // Remove any existing sprites
    Object.values(this.coatOfArmsSprites).forEach(sprite => {
      this.scene.remove(sprite);
    });
    this.coatOfArmsSprites = {};
    
    // Only create sprites if in land view
    if (this.activeView !== 'land') {
      return;
    }
    
    // Get all users from UserService to ensure we have the latest data
    const users = userService.getUsers();
    
    // Update our local ownerCoatOfArmsMap with the latest data
    if (users && Object.keys(users).length > 0) {
      Object.values(users).forEach(user => {
        if (user.user_name && user.coat_of_arms_image) {
          this.ownerCoatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          console.log(`Found coat of arms for ${user.user_name}: ${user.coat_of_arms_image}`);
        }
      });
    }
    
    // Also check our users prop for any coat of arms data
    if (this.users) {
      Object.values(this.users).forEach(user => {
        if (user.user_name && user.coat_of_arms_image) {
          this.ownerCoatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          console.log(`Found coat of arms in users prop for ${user.user_name}: ${user.coat_of_arms_image}`);
        }
      });
    }
    
    // Log the available coat of arms data
    console.log('Available coat of arms:', Object.keys(this.ownerCoatOfArmsMap));
    
    // Process each polygon with an owner and centroid
    let createdCount = 0;
    this.polygons.forEach(polygon => {
      if (!polygon.owner || !polygon.centroid) {
        return;
      }
      
      console.log(`Processing polygon ${polygon.id} with owner ${polygon.owner}`);
      
      // Get the coat of arms URL for the owner
      const coatOfArmsUrl = this.ownerCoatOfArmsMap[polygon.owner];
      if (!coatOfArmsUrl) {
        console.log(`No coat of arms found for owner ${polygon.owner}`);
        return;
      }
      
      // Convert centroid to 3D position
      const normalizedCoord = normalizeCoordinates(
        [polygon.centroid],
        this.bounds.centerLat,
        this.bounds.centerLng,
        this.bounds.scale,
        this.bounds.latCorrectionFactor
      )[0];
      
      // Create a sprite material
      const spriteMaterial = new THREE.SpriteMaterial({
        map: null, // Will be set when texture loads
        transparent: true,
        depthTest: true,
        depthWrite: false,
        sizeAttenuation: true
      });
      
      // Create the sprite
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(normalizedCoord.x, 0.5, normalizedCoord.y); // Position above land
      sprite.scale.set(2, 2, 1); // Initial scale
      
      // Add to scene
      this.scene.add(sprite);
      
      // Store reference
      this.coatOfArmsSprites[polygon.id] = sprite;
      createdCount++;
      
      // Load the texture
      this.textureLoader.load(
        coatOfArmsUrl,
        (texture) => {
          console.log(`Loaded texture for ${polygon.id} from ${coatOfArmsUrl}`);
          // Create a circular texture
          const circularTexture = this.createCircularTexture(texture);
          
          // Apply the texture to the sprite material
          spriteMaterial.map = circularTexture;
          
          // Adjust sprite scale based on texture aspect ratio
          if (texture.image && texture.image.width && texture.image.height) {
            const aspectRatio = texture.image.width / texture.image.height;
            sprite.scale.set(2 * aspectRatio, 2, 1);
          }
        },
        undefined,
        (error) => {
          console.error(`Failed to load coat of arms texture for ${polygon.id}:`, error);
          // Remove the sprite if texture loading fails
          this.scene.remove(sprite);
          delete this.coatOfArmsSprites[polygon.id];
        }
      );
    });
    
    console.log(`Created ${createdCount} coat of arms sprites`);
  }

  /**
   * Create a circular texture from an existing texture
   */
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

  /**
   * Update the active view and refresh coat of arms sprites
   */
  public updateViewMode(activeView: string) {
    if (this.activeView === activeView) return;
    
    this.activeView = activeView;
    
    // Update coat of arms sprites based on view mode
    if (activeView === 'land') {
      this.createCoatOfArmsSprites();
    } else {
      // Remove coat of arms sprites if not in land view
      Object.values(this.coatOfArmsSprites).forEach(sprite => {
        this.scene.remove(sprite);
      });
      this.coatOfArmsSprites = {};
    }
  }

  /**
   * Update the coat of arms map with new data
   */
  public updateCoatOfArms(ownerCoatOfArmsMap: Record<string, string>) {
    this.ownerCoatOfArmsMap = { ...this.ownerCoatOfArmsMap, ...ownerCoatOfArmsMap };
    
    // Refresh coat of arms sprites if in land view
    if (this.activeView === 'land') {
      this.createCoatOfArmsSprites();
    }
  }

  public cleanup() {
    // Remove meshes from scene and dispose resources
    this.meshes.forEach(mesh => {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      // Don't dispose individual materials since we're using a shared material
    });
    
    // Clear array
    this.meshes = [];
    
    // Remove coat of arms sprites
    Object.values(this.coatOfArmsSprites).forEach(sprite => {
      this.scene.remove(sprite);
      if (sprite.material) {
        if (sprite.material instanceof THREE.SpriteMaterial && sprite.material.map) {
          sprite.material.map.dispose();
        }
        sprite.material.dispose();
      }
    });
    this.coatOfArmsSprites = {};
    
    // Dispose texture
    if (this.sandTexture) {
      this.sandTexture.dispose();
      this.sandTexture = null;
    }
    
    // Dispose of shared material
    if (this.sharedMaterial) {
      this.sharedMaterial.dispose();
      this.sharedMaterial = null;
    }
  }
}
