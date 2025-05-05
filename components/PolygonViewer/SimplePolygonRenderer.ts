import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { normalizeCoordinates, createPolygonShape } from './utils';
import { getUserService } from '../../lib/services/UserService';

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
  private coatOfArmsSprites: Record<string, THREE.Object3D> = {};
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
      const userService = getUserService();
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
        
        // Fetch and apply land owners, then create coat of arms sprites
        this.fetchAndApplyLandOwners();
      },
      undefined,
      (error) => {
        console.error('Error loading texture:', error);
        // Render polygons without texture if loading fails
        this.renderPolygons();
        
        // Fetch and apply land owners, then create coat of arms sprites
        this.fetchAndApplyLandOwners();
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
      flatShading: false
      // Removed invalid properties that cause WebGL warnings
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
  public createCoatOfArmsSprites() {
    // Add debug visualization to help with positioning
    const addDebugSphere = (position: THREE.Vector3, color: number = 0xff0000) => {
      const debugGeometry = new THREE.SphereGeometry(0.05, 8, 8);
      const debugMaterial = new THREE.MeshBasicMaterial({ color: color });
      const debugSphere = new THREE.Mesh(debugGeometry, debugMaterial);
      debugSphere.position.copy(position);
      this.scene.add(debugSphere);
      return debugSphere;
    };
    console.log('Creating coat of arms sprites for land view');
    
    // Remove any existing sprites
    Object.values(this.coatOfArmsSprites).forEach(sprite => {
      this.scene.remove(sprite);
    });
    this.coatOfArmsSprites = {};
    
    // Only create sprites if in land view
    if (this.activeView !== 'land') {
      console.log('Not in land view, skipping coat of arms sprites');
      return;
    }
    
    // Get all users from UserService to ensure we have the latest data
    let serviceUsers = {};
    try {
      const userService = getUserService();
      serviceUsers = userService.getUsers();
      console.log('Got users from UserService:', Object.keys(serviceUsers).length);
    } catch (error) {
      console.warn('Error getting users from UserService:', error);
    }
    
    // Update our local ownerCoatOfArmsMap with the latest data
    if (serviceUsers && Object.keys(serviceUsers).length > 0) {
      Object.values(serviceUsers).forEach(user => {
        if (user.user_name && user.coat_of_arms_image) {
          this.ownerCoatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          console.log(`Found coat of arms from service for ${user.user_name}: ${user.coat_of_arms_image}`);
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
    
    // Count polygons with owners and centroids
    let polygonsWithOwners = 0;
    let polygonsWithCentroids = 0;
    let polygonsWithBoth = 0;
    let polygonsWithMatchingOwners = 0;
    
    this.polygons.forEach(polygon => {
      // Check for both 'owner' and 'User' properties
      const ownerValue = polygon.owner || polygon.User;
    
      if (ownerValue) {
        polygonsWithOwners++;
        if (polygon.centroid) {
          polygonsWithBoth++;
          if (this.ownerCoatOfArmsMap[ownerValue]) {
            polygonsWithMatchingOwners++;
          }
        }
      }
      if (polygon.centroid) {
        polygonsWithCentroids++;
      }
    });
    
    console.log(`Polygons stats: ${this.polygons.length} total, ${polygonsWithOwners} with owners, ${polygonsWithCentroids} with centroids, ${polygonsWithBoth} with both, ${polygonsWithMatchingOwners} with matching owners`);
    
    // Process each polygon with an owner and centroid
    let createdCount = 0;
    this.polygons.forEach(polygon => {
      // Check for both 'owner' and 'User' properties
      const ownerValue = polygon.owner || polygon.User;
    
      if (!ownerValue) {
        return;
      }
    
      if (!polygon.centroid) {
        console.log(`Polygon ${polygon.id} has owner ${ownerValue} but no centroid`);
        return;
      }
    
      console.log(`Processing polygon ${polygon.id} with owner ${ownerValue}`);
    
      // Get the coat of arms URL for the owner
      const coatOfArmsUrl = this.ownerCoatOfArmsMap[ownerValue];
      if (!coatOfArmsUrl) {
        console.log(`No coat of arms found for owner ${ownerValue}`);
        return;
      }
      
      // Check if polygon has coordinates for shaped coat of arms
      if (polygon.coordinates && polygon.coordinates.length >= 3) {
        this.createPolygonShapedCoatOfArms(polygon, coatOfArmsUrl, ownerValue);
        createdCount++;
      } else {
        // Fallback to circular coat of arms if no coordinates
        this.createCircularCoatOfArms(polygon, coatOfArmsUrl);
        createdCount++;
      }
    });
    
    console.log(`Created ${createdCount} coat of arms sprites`);
  }
  
  /**
   * Create a circular coat of arms sprite (original implementation)
   */
  private createCircularCoatOfArms(polygon: any, coatOfArmsUrl: string) {
    if (!polygon.centroid) return;
    
    // Convert centroid to 3D position
    const normalizedCoord = normalizeCoordinates(
      [polygon.centroid],
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    )[0];
    
    // Create a plane geometry for the texture
    const sceneScale = this.bounds.scale;
    const spriteScale = Math.max(1, sceneScale / 500); // Reduced scale (2 -> 1) and increased divisor (250 -> 500)
    const planeGeometry = new THREE.PlaneGeometry(spriteScale, spriteScale);
    const planeMaterial = new THREE.MeshBasicMaterial({
      map: null, // Will be set when texture loads
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false
    });
    
    // Create mesh and position it
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.position.set(normalizedCoord.x, 0.2, -normalizedCoord.y);
    plane.rotation.x = -Math.PI / 2 + Math.PI; // Rotate to lie flat and invert orientation
    plane.renderOrder = 10; // Ensure it renders on top of land
    
    // Add to scene
    this.scene.add(plane);
    
    // Store reference
    this.coatOfArmsSprites[polygon.id] = plane;
    
    // Load the texture
    this.textureLoader.load(
      coatOfArmsUrl,
      (texture) => {
        console.log(`Loaded texture for ${polygon.id} from ${coatOfArmsUrl}`);
        // Create a circular texture with inverted orientation
        const circularTexture = this.createCircularTexture(texture, true); // Added invert parameter
        
        // Apply the texture to the plane material
        if (planeMaterial) {
          planeMaterial.map = circularTexture;
          planeMaterial.needsUpdate = true;
          
          // Adjust plane scale based on texture aspect ratio and scene scale
          if (texture.image && texture.image.width && texture.image.height) {
            const aspectRatio = texture.image.width / texture.image.height;
            const sceneScale = this.bounds.scale;
            const baseScale = Math.max(0.21125, sceneScale / 2370); // Increased by another 30%
            plane.scale.set(baseScale * aspectRatio, baseScale, 1); // Removed the multiplier (2 -> 1)
          }
        }
      },
      undefined,
      (error) => {
        console.error(`Failed to load coat of arms texture for ${polygon.id}:`, error);
        // Remove the plane if texture loading fails
        this.scene.remove(plane);
        delete this.coatOfArmsSprites[polygon.id];
      }
    );
  }
  
  /**
   * Create a coat of arms that follows the polygon shape
   */
  private createPolygonShapedCoatOfArms(polygon: any, coatOfArmsUrl: string, ownerName: string) {
    if (!polygon.coordinates || !polygon.centroid) return;
    
    // Convert coordinates to normalized space
    const normalizedCoords = normalizeCoordinates(
      polygon.coordinates,
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    );
    
    // Create a canvas to draw the masked image
    const canvas = document.createElement('canvas');
    const size = 512;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Calculate bounds of the polygon
    const bounds = this.calculatePolygonBounds(normalizedCoords);
    
    // Load the coat of arms texture - handle both external and local URLs
    const textureUrl = coatOfArmsUrl.startsWith('http') 
      ? coatOfArmsUrl 
      : `${window.location.origin}${coatOfArmsUrl}`;
      
    this.textureLoader.load(
      textureUrl,
      (texture) => {
        // Draw the polygon shape on the canvas
        ctx.beginPath();
        
        // Scale and center the polygon shape to fit the canvas
        const scale = Math.min(size / bounds.width, size / bounds.height) * 0.8;
        const offsetX = size/2 - (bounds.minX + bounds.width/2) * scale;
        const offsetY = size/2 - (bounds.minY + bounds.height/2) * scale;
        
        // Draw the polygon path
        ctx.moveTo(
          normalizedCoords[0].x * scale + offsetX,
          normalizedCoords[0].y * scale + offsetY
        );
        for (let i = 1; i < normalizedCoords.length; i++) {
          ctx.lineTo(
            normalizedCoords[i].x * scale + offsetX,
            normalizedCoords[i].y * scale + offsetY
          );
        }
        ctx.closePath();
        
        // Create clipping region
        ctx.save();
        ctx.clip();
        
        // Draw the coat of arms image inside the clipped region
        // INVERT THE IMAGE by translating and scaling the canvas
        if (texture.image) {
          const aspectRatio = texture.image.width / texture.image.height;
          let drawWidth = size;
          let drawHeight = size / aspectRatio;
          if (drawHeight > size) {
            drawHeight = size;
            drawWidth = size * aspectRatio;
          }
          const imgX = (size - drawWidth) / 2;
          const imgY = (size - drawHeight) / 2;
          
          // Save context state before transformations
          ctx.save();
          
          // Translate to center of canvas
          ctx.translate(size/2, size/2);
          // Scale y by -1 to flip vertically
          ctx.scale(1, -1);
          // Translate back
          ctx.translate(-size/2, -size/2);
          
          // Draw the image
          ctx.drawImage(texture.image, imgX, imgY, drawWidth, drawHeight);
          
          // Restore context state
          ctx.restore();
        }
        
        // Add a border around the polygon
        ctx.restore();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();
        
        // REMOVED: Owner name text display
        
        // Create a texture from the canvas
        const maskedTexture = new THREE.CanvasTexture(canvas);
        
        // Create a material with the masked texture
        const material = new THREE.MeshBasicMaterial({
          map: maskedTexture,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        
        // Create a plane geometry for the texture
        const planeGeometry = new THREE.PlaneGeometry(1, 1);
        const mesh = new THREE.Mesh(planeGeometry, material);
        
        // Position at the centroid
        const centroidPos = normalizeCoordinates(
          [polygon.centroid],
          this.bounds.centerLat,
          this.bounds.centerLng,
          this.bounds.scale,
          this.bounds.latCorrectionFactor
        )[0];
    
        mesh.position.set(centroidPos.x, 0.05, -centroidPos.y);
        mesh.rotation.x = -Math.PI / 2 + Math.PI; // Invert orientation by adding PI (180 degrees)
        mesh.renderOrder = 10;
    
        // Scale based on polygon size - MAKE BIGGER
        const maxDim = Math.max(bounds.width, bounds.height);
        const sceneScale = this.bounds.scale;
        const baseScale = Math.max(0.21125, sceneScale / 2370); // Increased by another 30%
        mesh.scale.set(maxDim * baseScale * 1, maxDim * baseScale * 1, 1); // Reduced both dimensions (2 -> 1)
        
        // Add to scene
        this.scene.add(mesh);
        this.coatOfArmsSprites[polygon.id] = mesh;
      },
      undefined,
      (error) => {
        console.error(`Failed to load coat of arms texture for ${polygon.id}:`, error);
        // Fallback to circular coat of arms if texture loading fails
        this.createCircularCoatOfArms(polygon, coatOfArmsUrl);
      }
    );
  }
  
  /**
   * Helper to calculate polygon bounds
   */
  private calculatePolygonBounds(coords: {x: number, y: number}[]) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    coords.forEach(coord => {
      minX = Math.min(minX, coord.x);
      maxX = Math.max(maxX, coord.x);
      minY = Math.min(minY, coord.y);
      maxY = Math.max(maxY, coord.y);
    });
    
    return {
      minX, minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Create a circular texture from an existing texture
   */
  private createCircularTexture(texture: THREE.Texture, invert: boolean = false): THREE.Texture {
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
      
      // Draw the image with proper aspect ratio and inversion if needed
      if (texture.image) {
        if (invert) {
          // Save context state before transformations
          ctx.save();
          
          // Translate to center of canvas
          ctx.translate(size/2, size/2);
          // Scale y by -1 to flip vertically
          ctx.scale(1, -1);
          // Translate back
          ctx.translate(-size/2, -size/2);
          
          // Draw the image
          ctx.drawImage(texture.image, offsetX, offsetY, drawWidth, drawHeight);
          
          // Restore context state
          ctx.restore();
        } else {
          // Draw normally without inversion
          ctx.drawImage(texture.image, offsetX, offsetY, drawWidth, drawHeight);
        }
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

  /**
   * Fetch land owners data and apply to polygons
   */
  private async fetchAndApplyLandOwners() {
    console.log('Fetching land owners data...');
    try {
      const response = await fetch('/api/get-land-owners');
      if (response.ok) {
        const data = await response.json();
        if (data.lands && Array.isArray(data.lands)) {
          console.log(`Received ${data.lands.length} land owner records`);
          
          // Create a map of land ID to owner
          const landOwnersMap: Record<string, string> = {};
          data.lands.forEach((land: any) => {
            if (land.id && land.owner) {
              landOwnersMap[land.id] = land.owner;
            }
          });
          
          console.log(`Created land owners map with ${Object.keys(landOwnersMap).length} entries`);
          
          // Apply owners to polygons
          let updatedCount = 0;
          this.polygons.forEach(polygon => {
            if (polygon.id && landOwnersMap[polygon.id]) {
              polygon.owner = landOwnersMap[polygon.id];
              updatedCount++;
            }
          });
          
          console.log(`Updated ${updatedCount} polygons with owner information`);
          
          // If no owners were found or applied, use default owners
          if (updatedCount === 0) {
            this.assignDefaultOwners();
          } else {
            // Now that we have owners, create coat of arms sprites
            this.createCoatOfArmsSprites();
          }
        } else {
          // No lands data, use default owners
          this.assignDefaultOwners();
        }
      } else {
        console.error('Failed to fetch land owners:', response.status, response.statusText);
        // Use default owners as fallback
        this.assignDefaultOwners();
      }
    } catch (error) {
      console.error('Error fetching land owners:', error);
      // Use default owners as fallback
      this.assignDefaultOwners();
    }
  }
  
  /**
   * Assign default owners to polygons for demonstration
   */
  private assignDefaultOwners() {
    console.log('No land owners found, assigning default owners for demonstration');
    
    // Get available owners from the coat of arms map
    const availableOwners = Object.keys(this.ownerCoatOfArmsMap);
    if (availableOwners.length === 0) {
      console.warn('No available owners with coat of arms');
      return;
    }
    
    // Assign owners to a subset of polygons for demonstration
    const polygonsToAssign = Math.min(10, this.polygons.length);
    for (let i = 0; i < polygonsToAssign; i++) {
      const polygon = this.polygons[i];
      if (polygon && polygon.id) {
        // Assign an owner from the available owners
        const ownerIndex = i % availableOwners.length;
        polygon.owner = availableOwners[ownerIndex];
        console.log(`Assigned default owner ${polygon.owner} to polygon ${polygon.id}`);
      }
    }
    
    console.log(`Assigned default owners to ${polygonsToAssign} polygons`);
    
    // Create coat of arms sprites with the new owners
    this.createCoatOfArmsSprites();
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
