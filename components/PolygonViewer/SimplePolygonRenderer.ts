import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { normalizeCoordinates, createPolygonShape } from './utils';
import { getUserService } from '../../lib/services/UserService';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';

interface SimplePolygonRendererProps {
  scene: THREE.Scene;
  polygons: any[];
  bounds: {
    centerLat: number;
    centerLng: number;
    scale: number;
    latCorrectionFactor: number;
  };
  sandColor?: number; // Add this line
}

export default class SimplePolygonRenderer {
  private scene: THREE.Scene;
  private polygons: any[];
  private bounds: any;
  private meshes: THREE.Mesh[] = [];
  private textureLoader: THREE.TextureLoader;
  private sandTexture: THREE.Texture | null = null;
  private sandNormalMap: THREE.Texture | null = null;
  private sandRoughnessMap: THREE.Texture | null = null;
  private sharedMaterial: THREE.MeshStandardMaterial | null = null;
  private activeView: string = 'land'; // Default to land view
  private coatOfArmsSprites: Record<string, THREE.Object3D> = {};
  private ownerCoatOfArmsMap: Record<string, string> = {};
  private users: Record<string, any> = {};
  private sandColor: number = 0xfff5d0; // Default to even lighter, more yellow sand color
  private textureLoadAttempts: number = 0;
  
  // Properties for hover and click detection
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private camera: THREE.Camera | null = null;
  private hoveredCoatOfArms: string | null = null;
  private selectedCoatOfArms: string | null = null;
  private onLandSelected: ((landId: string) => void) | null = null;
  
  // Properties for bridge, dock, and building points
  private bridgePointMarkers: THREE.Mesh[] = [];
  private dockPointMarkers: THREE.Object3D[] = [];
  private buildingPointMarkers: THREE.Mesh[] = [];
  private hoveredPointId: string | null = null;
  
  constructor({ 
    scene, 
    polygons, 
    bounds, 
    activeView = 'land', 
    users = {},
    camera = null,
    onLandSelected = null,
    sandColor = 0xfff8e0 // Changed to an even lighter, more yellow sand color
  }: SimplePolygonRendererProps & { 
    activeView?: string;
    users?: Record<string, any>;
    camera?: THREE.Camera | null;
    onLandSelected?: ((landId: string) => void) | null;
    sandColor?: number; // Add this to the type
  }) {
    this.scene = scene;
    this.polygons = polygons;
    this.bounds = bounds;
    this.activeView = activeView;
    this.users = users;
    this.camera = camera;
    this.onLandSelected = onLandSelected;
    this.sandColor = sandColor; // Store the sand color
    this.textureLoader = new THREE.TextureLoader();
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // Process users data to extract coat of arms
    if (users) {
      Object.values(users).forEach((user: any) => {
        if (user.user_name && user.coat_of_arms_image) {
          this.ownerCoatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          console.log(`Initialized coat of arms for ${user.user_name}: ${user.coat_of_arms_image}`);
        }
      });
    }
    
    // Add event listener for regenerating building markers
    if (typeof window !== 'undefined') {
      window.addEventListener('regenerateBuildingMarkers', () => {
        console.log('Received regenerateBuildingMarkers event');
        // Clear existing building markers
        this.clearBuildingPointMarkers();
        // Create new building markers
        this.createBuildingPoints();
        // Force them to be visible
        this.buildingPointMarkers.forEach(marker => {
          marker.visible = true;
        });
        console.log(`Regenerated ${this.buildingPointMarkers.length} building markers`);
      });
    }
    
    // Also try to get users from UserService
    try {
      const userService = getUserService();
      const serviceUsers = userService.getUsers();
      if (serviceUsers && Object.keys(serviceUsers).length > 0) {
        Object.values(serviceUsers).forEach((user: any) => {
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
        
        // Check if all textures are loaded before rendering
        this.checkTexturesAndRender();
      },
      undefined,
      (error) => {
        console.error('Error loading sand texture:', error);
        this.textureLoadAttempts++;
        // Check if all textures are loaded before rendering
        this.checkTexturesAndRender();
      }
    );
    
    // Load normal map
    this.textureLoader.load(
      '/textures/sand_normal.jpg',
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        this.sandNormalMap = texture;
        
        // Check if all textures are loaded before rendering
        this.checkTexturesAndRender();
      },
      undefined,
      (error) => {
        console.error('Error loading sand normal map:', error);
        this.textureLoadAttempts++;
        // Continue without normal map if loading fails
        this.checkTexturesAndRender();
      }
    );
    
    // Load roughness map
    this.textureLoader.load(
      '/textures/sand_roughness.jpg',
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        this.sandRoughnessMap = texture;
        
        // Check if all textures are loaded before rendering
        this.checkTexturesAndRender();
      },
      undefined,
      (error) => {
        console.error('Error loading sand roughness map:', error);
        this.textureLoadAttempts++;
        // Continue without roughness map if loading fails
        this.checkTexturesAndRender();
      }
    );
  }
  
  // Add a helper method to check if all textures are loaded and render if they are
  private checkTexturesAndRender() {
    // If we have the base texture or all texture loading attempts have failed, render the polygons
    if (this.sandTexture || (this.textureLoadAttempts >= 3)) {
      this.renderPolygons();
      
      // Fetch and apply land owners, but don't automatically create coat of arms sprites
      // Add a small delay to ensure polygons are fully rendered first
      setTimeout(() => {
        this.fetchAndApplyLandOwners();
        // The fetchAndApplyLandOwners method will call createCoatOfArmsSprites only when it has owner data
      }, 1000);
    }
  }
  
  // Track if coat of arms have been rendered to prevent duplicate rendering
  private hasRenderedCoatOfArms: boolean = false;
  private isRenderingCoatOfArms: boolean = false;
  
  private renderPolygons() {
    // Create a single shared material for all polygons
    this.sharedMaterial = new THREE.MeshStandardMaterial({
      // Restore the texture
      map: this.sandTexture,
      // Add normal and roughness maps
      normalMap: this.sandNormalMap,
      roughnessMap: this.sandRoughnessMap,
      color: this.sandColor, // Use our lighter yellow sand color directly
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.1,
      wireframe: false,
      flatShading: false
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
          geometry = BufferGeometryUtils.mergeVertices(geometry) as THREE.ExtrudeGeometry;
        } else {
          console.warn('BufferGeometryUtils.mergeVertices not available, skipping vertex merging');
        }
      
        // Create mesh with shared material
        const mesh = new THREE.Mesh(geometry, this.sharedMaterial as THREE.Material);
        
        // Set render order to ensure land renders above water
        mesh.renderOrder = 1;
      
        // Position mesh - adjust rotation to make top surface flat
        mesh.rotation.x = -Math.PI / 2;
    
        // Position the land exactly at water level
        mesh.position.y = 0; // Change from -5.005 to 0
    
        // No need for render order or polygon offset when there's clear physical separation
        
        // Enable shadows on the mesh
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
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
    // Prevent concurrent or duplicate rendering
    if (this.isRenderingCoatOfArms) {
      console.log('Already rendering coat of arms, skipping duplicate call');
      return;
    }
    
    console.log('Creating coat of arms sprites for land view');
    this.isRenderingCoatOfArms = true;
    
    // Remove any existing sprites first
    this.clearCoatOfArmsSprites();
    
    // Only create sprites if in land view
    if (this.activeView !== 'land') {
      console.log('Not in land view, skipping coat of arms sprites');
      this.isRenderingCoatOfArms = false;
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
      Object.values(serviceUsers).forEach((user: any) => {
        if (user.user_name && user.coat_of_arms_image) {
          this.ownerCoatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          // Coat of arms found in service
        }
      });
    }
    
    // Also check our users prop for any coat of arms data
    if (this.users) {
      Object.values(this.users).forEach((user: any) => {
        if (user.user_name && user.coat_of_arms_image) {
          this.ownerCoatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          // Coat of arms found in users prop
        }
      });
    }
    
    // Track available coat of arms data
    
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
    
    // Polygon statistics collected
    
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
    
      // Process polygon with owner
    
      // Get the coat of arms URL for the owner
      const coatOfArmsUrl = this.ownerCoatOfArmsMap[ownerValue];
      if (!coatOfArmsUrl) {
        // No coat of arms found for this owner
        return;
      }
      
      // Always use circular coat of arms for simplicity and performance
      this.createCircularCoatOfArms(polygon, coatOfArmsUrl);
      createdCount++;
    });
    
    this.hasRenderedCoatOfArms = true;
    this.isRenderingCoatOfArms = false;
    // Coat of arms sprites created
  }
  
  /**
   * Clear all coat of arms sprites
   */
  private clearCoatOfArmsSprites() {
    Object.values(this.coatOfArmsSprites).forEach(sprite => {
      this.scene.remove(sprite);
      // Check if sprite is a Mesh before accessing material property
      if (sprite instanceof THREE.Mesh && sprite.material) {
        if (sprite.material instanceof THREE.MeshBasicMaterial && sprite.material.map) {
          sprite.material.map.dispose();
        }
        sprite.material.dispose();
      }
    });
    this.coatOfArmsSprites = {};
  }
  
  /**
   * Create a circular coat of arms sprite
   */
  private createCircularCoatOfArms(polygon: any, coatOfArmsUrl: string) {
    if (!polygon.centroid) return;
    
    // Always use centroid for positioning
    const positionCoord = polygon.centroid;
    
    // Convert centroid to 3D position
    const normalizedCoord = normalizeCoordinates(
      [positionCoord],
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    )[0];
    
    // Create a raycaster to find the exact height of the land
    const raycaster = new THREE.Raycaster();
    const direction = new THREE.Vector3(0, -1, 0); // Cast ray downward
    const origin = new THREE.Vector3(normalizedCoord.x, 10, -normalizedCoord.y); // Start from above
    raycaster.set(origin, direction);
    
    // Find all meshes in the scene that could be land
    const landMeshes: THREE.Mesh[] = [];
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh && 
          object.material instanceof THREE.MeshStandardMaterial && 
          !object.userData.isCoatOfArms) { // Avoid coat of arms meshes
        landMeshes.push(object);
      }
    });
    
    // Find the intersection with land
    const intersects = raycaster.intersectObjects(landMeshes);
    
    // Default height if no intersection found
    let yPosition = 0.2;
    
    // If we found an intersection, use that height (plus a small offset)
    if (intersects.length > 0) {
      yPosition = intersects[0].point.y + 0.01; // 0.01 units above the land
      // Land intersection found
    }
    
    // Create a plane geometry for the texture
    const sceneScale = this.bounds.scale;
    const spriteScale = Math.max(0.75, sceneScale / 667); // Increased by 50% from Math.max(0.5, sceneScale / 1000)
    const planeGeometry = new THREE.PlaneGeometry(spriteScale, spriteScale);
    const planeMaterial = new THREE.MeshBasicMaterial({
      map: null, // Will be set when texture loads
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      opacity: 0 // Start with opacity 0 for fade-in effect
    });
    
    // Create mesh and position it with the calculated y position
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.position.set(normalizedCoord.x, yPosition, -normalizedCoord.y);
    plane.rotation.x = -Math.PI / 2 + Math.PI; // Rotate to lie flat and invert orientation
    plane.renderOrder = 10; // Ensure it renders on top of land
    
    // Mark this mesh as a coat of arms to avoid raycasting against it
    plane.userData.isCoatOfArms = true;
    plane.userData.polygonId = polygon.id;
    
    // Load the texture - handle both external and local URLs
    const textureUrl = coatOfArmsUrl.startsWith('http') 
      ? coatOfArmsUrl 
      : `${window.location.origin}${coatOfArmsUrl}`;
      
    this.textureLoader.load(
      textureUrl,
      (texture) => {
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
            const baseScale = Math.max(0.19, sceneScale / 2633); // Increased by 50% from 0.12675 and 3950
            plane.scale.set(baseScale * aspectRatio, baseScale, 1); // Removed the multiplier (2 -> 1)
          }
          
          // NOW add to scene after texture is loaded
          this.scene.add(plane);
          
          // Store reference
          this.coatOfArmsSprites[polygon.id] = plane;
          
          // Add fade-in animation
          this.animateFadeIn(planeMaterial);
        }
      },
      undefined,
      (error) => {
        console.error(`Failed to load coat of arms texture for ${polygon.id}:`, error);
        // Don't add the plane to the scene at all if texture loading fails
        // Just clean up the geometry and material
        planeGeometry.dispose();
        planeMaterial.dispose();
      }
    );
  }
  
  // Add a new method to handle the fade-in animation
  private animateFadeIn(material: THREE.MeshBasicMaterial): void {
    // Start with opacity 0
    material.opacity = 0;
    
    // Create a fade-in animation
    const startTime = performance.now();
    const duration = 800; // 800ms fade-in duration
    
    // Animation function
    const animate = () => {
      const currentTime = performance.now();
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Use an ease-in function for smoother appearance
      material.opacity = progress * progress;
      material.needsUpdate = true;
      
      // Continue animation until complete
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        material.opacity = 1; // Ensure we end at full opacity
        material.needsUpdate = true;
      }
    };
    
    // Start the animation
    requestAnimationFrame(animate);
  }
  
  /**
   * Create a coat of arms that follows the polygon shape
   * This method is kept for reference but is no longer used
   * All coat of arms are now created using createCircularCoatOfArms for simplicity and performance
   */
  private createPolygonShapedCoatOfArms(polygon: any, coatOfArmsUrl: string, ownerName: string) {
    // Simply delegate to the circular method for consistency
    this.createCircularCoatOfArms(polygon, coatOfArmsUrl);
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
      ctx.fillStyle = '#FFF8E0'; // Much lighter, more yellow sand color
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
    
    console.log(`Changing view mode from ${this.activeView} to ${activeView}`);
    
    this.activeView = activeView;
    
    // Update coat of arms sprites based on view mode
    if (activeView === 'land') {
      // Make coat of arms visible
      Object.values(this.coatOfArmsSprites).forEach(sprite => {
        sprite.visible = true;
      });
      
      // Hide bridge and dock points in land view
      console.log(`Hiding ${this.bridgePointMarkers.length} bridge markers and ${this.dockPointMarkers.length} dock markers in land view`);
      this.bridgePointMarkers.forEach(marker => marker.visible = false);
      this.dockPointMarkers.forEach(marker => marker.visible = false);
      
      // Hide building points in land view
      this.buildingPointMarkers.forEach(marker => marker.visible = false);
    } else if (activeView === 'transport') {
      // Hide coat of arms sprites in transport view
      Object.values(this.coatOfArmsSprites).forEach(sprite => {
        sprite.visible = false;
      });
      
      // IMPORTANT: Always recreate bridge and dock points when switching to transport view
      console.log(`Creating bridge and dock points for transport view`);
      
      // Clear existing markers first to avoid duplicates
      this.clearBridgeAndDockMarkers();
      
      // Create new markers - directly call createBridgeAndDockPoints without checking activeView inside
      this.forceCreateBridgeAndDockPoints();
      
      // Ensure all markers are visible
      this.bridgePointMarkers.forEach(marker => {
        marker.visible = true;
        // Set a very high render order to ensure visibility
        marker.renderOrder = 2000;
      });
      this.dockPointMarkers.forEach(marker => {
        marker.visible = true;
        // Set a very high render order to ensure visibility
        if (marker instanceof THREE.Mesh || marker instanceof THREE.Line) {
          marker.renderOrder = 2000;
        }
      });
      
      // Hide building points in transport view
      this.buildingPointMarkers.forEach(marker => marker.visible = false);
      
      console.log(`Created ${this.bridgePointMarkers.length} bridge markers and ${this.dockPointMarkers.length} dock markers`);
    } else if (activeView === 'buildings') {
      console.log('Switching to buildings view - preparing to show building points');
      
      // Hide coat of arms sprites in buildings view
      Object.values(this.coatOfArmsSprites).forEach(sprite => {
        sprite.visible = false;
      });
      
      // Hide bridge and dock points in buildings view
      this.bridgePointMarkers.forEach(marker => marker.visible = false);
      this.dockPointMarkers.forEach(marker => marker.visible = false);
      
      // Create and show building points
      console.log('Calling createBuildingPoints() method');
      this.createBuildingPoints();
      
      console.log(`Setting visibility for ${this.buildingPointMarkers.length} building point markers`);
      this.buildingPointMarkers.forEach(marker => {
        marker.visible = true;
        console.log('Set building point marker to visible');
      });
      
      // Force a scene update if possible
      if (this.scene.userData && this.scene.userData.renderer) {
        console.log('Forcing scene update');
        this.scene.userData.renderer.render(this.scene, this.camera);
      }
      
      console.log(`Created ${this.buildingPointMarkers.length} building point markers for buildings view`);
    } else {
      // Hide coat of arms sprites, bridge/dock points, and building points in other views
      Object.values(this.coatOfArmsSprites).forEach(sprite => {
        sprite.visible = false;
      });
      this.bridgePointMarkers.forEach(marker => marker.visible = false);
      this.dockPointMarkers.forEach(marker => marker.visible = false);
      this.buildingPointMarkers.forEach(marker => marker.visible = false);
      this.hasRenderedCoatOfArms = false;
    }
  }

  /**
   * Update the coat of arms map with new data
   */
  public updateCoatOfArms(ownerCoatOfArmsMap: Record<string, string>) {
    this.ownerCoatOfArmsMap = { ...this.ownerCoatOfArmsMap, ...ownerCoatOfArmsMap };
    
    // Only create coat of arms sprites if we're in land view AND we have owner data
    // AND we have textures loaded (sandTexture is a good indicator)
    if (this.activeView === 'land' && 
        Object.keys(this.ownerCoatOfArmsMap).length > 0 && 
        this.sandTexture) {
      
      // Check if we have any polygons with owners before creating sprites
      const polygonsWithOwners = this.polygons.filter(p => p.owner && this.ownerCoatOfArmsMap[p.owner]);
      
      if (polygonsWithOwners.length > 0) {
        // Reset the rendered flag to force a refresh with new data
        this.hasRenderedCoatOfArms = false;
        
        // Add a small delay to ensure textures are fully loaded
        setTimeout(() => {
          this.createCoatOfArmsSprites();
        }, 500);
      }
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
          
          // Only create coat of arms sprites if we have owners AND we're in land view
          // AND we have textures loaded (sandTexture is a good indicator)
          if (updatedCount > 0 && this.activeView === 'land' && this.sandTexture) {
            // Check if we have any polygons with matching owners before creating sprites
            const polygonsWithMatchingOwners = this.polygons.filter(p => 
              p.owner && this.ownerCoatOfArmsMap[p.owner]
            );
            
            if (polygonsWithMatchingOwners.length > 0) {
              // Now that we have owners, create coat of arms sprites
              // Add a small delay to ensure textures are fully loaded
              setTimeout(() => {
                this.createCoatOfArmsSprites();
              }, 500);
            }
          } else if (updatedCount === 0) {
            // No owners were found, use default owners
            this.assignDefaultOwners();
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
    
    // Create coat of arms sprites with the new owners only if in land view
    // AND we have textures loaded (sandTexture is a good indicator)
    if (this.activeView === 'land' && !this.hasRenderedCoatOfArms && this.sandTexture) {
      // Add a small delay to ensure textures are fully loaded
      setTimeout(() => {
        this.createCoatOfArmsSprites();
      }, 500);
    }
  }
  

  // Handle mouse movement for hover effects
  public handleMouseMove(event: MouseEvent, container: HTMLElement) {
    if (!this.camera) return;
    
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    const rect = container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update the raycaster with increased precision
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.raycaster.params.Line.threshold = 0.1; // Increase line detection threshold
    this.raycaster.params.Points.threshold = 0.1; // Increase point detection threshold
    
    if (this.activeView === 'land') {
      // Land view - handle coat of arms hover
      // Find intersections with coat of arms sprites
      const coatOfArmsObjects = Object.values(this.coatOfArmsSprites);
      const intersects = this.raycaster.intersectObjects(coatOfArmsObjects, true); // Add true to check descendants
      
      // Reset hover state
      if (this.hoveredCoatOfArms && this.hoveredCoatOfArms !== this.selectedCoatOfArms) {
        const prevHovered = this.coatOfArmsSprites[this.hoveredCoatOfArms];
        if (prevHovered) {
          this.setCoatOfArmsHighlight(prevHovered, false);
        }
        this.hoveredCoatOfArms = null;
        document.body.style.cursor = 'default';
      }
      
      // Set new hover state if found
      if (intersects.length > 0) {
        // Find the land ID from the intersected object or its ancestors
        let landId = null;
        let currentObj: THREE.Object3D | null = intersects[0].object;
        
        // Traverse up the parent chain to find the object with polygonId
        while (currentObj && !landId) {
          if (currentObj.userData && currentObj.userData.polygonId) {
            landId = currentObj.userData.polygonId;
          }
          currentObj = currentObj.parent;
        }
        
        // If no polygonId found in the hierarchy, try the direct lookup method
        if (!landId) {
          landId = this.findLandIdFromObject(intersects[0].object);
        }
        
        if (landId && landId !== this.selectedCoatOfArms) {
          this.hoveredCoatOfArms = landId;
          const hovered = this.coatOfArmsSprites[landId];
          this.setCoatOfArmsHighlight(hovered, true);
          document.body.style.cursor = 'pointer';
        }
      }
    } else if (this.activeView === 'transport') {
      try {
        // Transport view - handle bridge and dock point hover
        // Combine all markers for raycasting (excluding lines)
        const allMarkers = [...this.bridgePointMarkers, ...this.dockPointMarkers].filter(
          obj => obj instanceof THREE.Mesh
        );
        
        const intersects = this.raycaster.intersectObjects(allMarkers);
        
        if (intersects.length > 0) {
          const intersected = intersects[0].object;
          const userData = intersected.userData;
          
          if (userData && userData.id && userData.id !== this.hoveredPointId) {
            this.hoveredPointId = userData.id;
            
            // Highlight the hovered point - Use a new material instance to avoid sharing
            if (intersected instanceof THREE.Mesh) {
              const highlightMaterial = new THREE.MeshBasicMaterial({
                color: userData.type.startsWith('bridge') ? 0xFF8800 : 0x00CCFF,
                transparent: true,
                opacity: 1.0
              });
              
              // Store the original material if not already stored
              if (!intersected.userData.originalMaterial) {
                intersected.userData.originalMaterial = intersected.material;
              }
              
              // Apply the highlight material
              intersected.material = highlightMaterial;
            }
            
            // Show tooltip
            eventBus.emit(EventTypes.SHOW_TOOLTIP, {
              type: userData.type,
              polygonId: userData.polygonId,
              position: userData.position,
              screenX: event.clientX,
              screenY: event.clientY
            });
          }
        } else if (this.hoveredPointId) {
          // Reset previously hovered point
          const hoveredPoint = [...this.bridgePointMarkers, ...this.dockPointMarkers].find(
            marker => marker instanceof THREE.Mesh && marker.userData && marker.userData.id === this.hoveredPointId
          );
          
          if (hoveredPoint && hoveredPoint instanceof THREE.Mesh) {
            // Restore original material if available
            if (hoveredPoint.userData.originalMaterial) {
              hoveredPoint.material = hoveredPoint.userData.originalMaterial;
              delete hoveredPoint.userData.originalMaterial;
            } else {
              // Fallback to creating a new material
              const isBridge = hoveredPoint.userData.type.startsWith('bridge');
              const isWater = hoveredPoint.userData.type === 'dock-water';
              
              hoveredPoint.material = new THREE.MeshBasicMaterial({
                color: isBridge ? 0xFF5500 : (isWater ? 0x0088CC : 0x00AAFF),
                transparent: false
              });
            }
          }
          
          this.hoveredPointId = null;
          eventBus.emit(EventTypes.HIDE_TOOLTIP);
        }
      } catch (error) {
        console.error('Error handling mouse move in transport view:', error);
        // Reset hover state on error
        this.hoveredPointId = null;
        eventBus.emit(EventTypes.HIDE_TOOLTIP);
      }
    } else if (this.activeView === 'buildings') {
      // Buildings view - handle building point hover
      const buildingPointMarkers = this.buildingPointMarkers.filter(
        obj => obj instanceof THREE.Mesh
      );
      
      const intersects = this.raycaster.intersectObjects(buildingPointMarkers);
      
      if (intersects.length > 0) {
        const intersected = intersects[0].object;
        const userData = intersected.userData;
        
        if (userData && userData.id && userData.id !== this.hoveredPointId) {
          this.hoveredPointId = userData.id;
          
          // Highlight the hovered point
          if (intersected instanceof THREE.Mesh) {
            const highlightMaterial = new THREE.MeshBasicMaterial({
              color: 0xFFFF00, // Yellow highlight
              transparent: true,
              opacity: 1.0
            });
            
            // Store the original material if not already stored
            if (!intersected.userData.originalMaterial) {
              intersected.userData.originalMaterial = intersected.material;
            }
            
            // Apply the highlight material
            intersected.material = highlightMaterial;
          }
          
          // Show tooltip
          eventBus.emit(EventTypes.SHOW_TOOLTIP, {
            type: userData.type,
            polygonId: userData.polygonId,
            position: userData.position,
            screenX: event.clientX,
            screenY: event.clientY
          });
        }
      } else if (this.hoveredPointId) {
        // Reset previously hovered point
        const hoveredPoint = this.buildingPointMarkers.find(
          marker => marker instanceof THREE.Mesh && marker.userData && marker.userData.id === this.hoveredPointId
        );
        
        if (hoveredPoint && hoveredPoint instanceof THREE.Mesh) {
          // Restore original material if available
          if (hoveredPoint.userData.originalMaterial) {
            hoveredPoint.material = hoveredPoint.userData.originalMaterial;
            delete hoveredPoint.userData.originalMaterial;
          } else {
            // Fallback to creating a new material
            hoveredPoint.material = new THREE.MeshBasicMaterial({
              color: 0xFFFFFF, // White color for building points
              transparent: true,
              opacity: 0.7
            });
          }
        }
        
        this.hoveredPointId = null;
        eventBus.emit(EventTypes.HIDE_TOOLTIP);
      }
    }
  }

  // Handle mouse clicks for selection
  public handleMouseClick(event: MouseEvent, container: HTMLElement) {
    if (!this.camera) {
      console.log("Click detected but no camera available");
      return;
    }
    
    console.log(`Mouse click detected: button=${event.button}, clientX=${event.clientX}, clientY=${event.clientY}`);
    
    // Check if this is a right-click
    if (event.button === 2) {
      console.log("Right-click detected, preventing default behavior");
      event.preventDefault();
      return;
    }
    
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    const rect = container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    console.log(`Normalized mouse coordinates: x=${this.mouse.x.toFixed(4)}, y=${this.mouse.y.toFixed(4)}`);
    
    // Update the raycaster with increased precision
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.raycaster.params.Line.threshold = 0.1; // Increase line detection threshold
    this.raycaster.params.Points.threshold = 0.1; // Increase point detection threshold
    
    // Handle transport view clicks
    if (this.activeView === 'transport') {
      console.log(`In transport view, checking for marker intersections`);
      
      // Combine all markers for raycasting
      const allMarkers = [...this.bridgePointMarkers, ...this.dockPointMarkers].filter(
        obj => obj instanceof THREE.Mesh
      );
      
      console.log(`Found ${allMarkers.length} markers to check for intersection`);
      
      // Log positions of first few markers for debugging
      allMarkers.slice(0, 3).forEach((marker, i) => {
        console.log(`Marker ${i} position:`, marker.position);
      });
      
      const intersects = this.raycaster.intersectObjects(allMarkers);
      
      console.log(`Found ${intersects.length} intersections`);
      
      if (intersects.length > 0) {
        const intersected = intersects[0].object;
        const userData = intersected.userData;
        
        console.log("Intersected object userData:", userData);
        
        if (userData && userData.id) {
          // Extract information from the marker ID
          // Format is typically: bridge-{polygonId}-{index} or dock-edge-{polygonId}-{index}
          const idParts = userData.id.split('-');
          
          console.log(`ID parts: ${idParts.join(', ')}`);
          
          if (idParts.length >= 3) {
            let markerType, polygonId, pointIndex;
            
            // Handle different ID formats
            if (idParts[0] === 'bridge') {
              // Bridge format: 'bridge-polygon-1746057412398-4'
              markerType = 'bridge';
              polygonId = idParts.slice(1, idParts.length - 1).join('-');
              pointIndex = parseInt(idParts[idParts.length - 1]);
            } else if (idParts[0] === 'dock' && idParts[1] === 'edge') {
              // Dock format: 'dock-edge-polygon-1746057412398-40'
              markerType = 'dock';
              polygonId = idParts.slice(2, idParts.length - 1).join('-');
              pointIndex = parseInt(idParts[idParts.length - 1]);
            } else {
              console.warn(`Unknown marker type: ${idParts[0]}-${idParts[1]}`);
              return;
            }
            
            console.log(`Attempting to delete ${markerType} point ${pointIndex} from polygon ${polygonId}`);
            
            // Find the polygon
            const polygon = this.polygons.find(p => p.id === polygonId);
            
            if (polygon) {
              console.log("Found polygon:", polygon.id);
              
              // Create a visual effect at the deletion point
              this.createDeletionEffect(intersected.position.clone());
              
              // Remove the point from the polygon data
              let deleted = false;
              if (markerType === 'bridge' && polygon.bridgePoints && polygon.bridgePoints.length > pointIndex) {
                // Remove the bridge point
                polygon.bridgePoints.splice(pointIndex, 1);
                console.log(`Successfully removed bridge point ${pointIndex} from polygon ${polygonId}`);
                deleted = true;
              } else if (markerType === 'dock' && polygon.dockPoints && polygon.dockPoints.length > pointIndex) {
                // Remove the dock point
                polygon.dockPoints.splice(pointIndex, 1);
                console.log(`Successfully removed dock point ${pointIndex} from polygon ${polygonId}`);
                deleted = true;
              } else {
                console.warn(`Failed to delete point - index ${pointIndex} not found in ${markerType} points array`);
                console.log(`Bridge points length: ${polygon.bridgePoints?.length || 0}`);
                console.log(`Dock points length: ${polygon.dockPoints?.length || 0}`);
              }
              
              if (deleted) {
                // Save the updated polygon data to the server
                this.saveUpdatedPolygonData(polygon);
                
                // Refresh the transport markers
                this.clearBridgeAndDockMarkers();
                this.forceCreateBridgeAndDockPoints();
                
                // Show a tooltip
                eventBus.emit(EventTypes.SHOW_TOOLTIP, {
                  type: 'delete',
                  content: `Deleted ${markerType} point`,
                  screenX: event.clientX,
                  screenY: event.clientY
                });
                
                // Hide tooltip after a delay
                setTimeout(() => {
                  eventBus.emit(EventTypes.HIDE_TOOLTIP);
                }, 2000);
              }
            } else {
              console.warn(`Polygon ${polygonId} not found`);
            }
          }
        } else {
          console.warn("Intersected object has no ID in userData:", userData);
        }
        
        // Return early to prevent further processing
        return;
      } else {
        console.log("No intersections found with transport markers");
        
        // Debug: Log raycaster origin and direction
        console.log("Raycaster origin:", this.raycaster.ray.origin);
        console.log("Raycaster direction:", this.raycaster.ray.direction);
      }
    }
    
    // Only handle land view clicks if not in transport view
    if (this.activeView !== 'land') return;
    
    // Find intersections with coat of arms sprites
    const coatOfArmsObjects = Object.values(this.coatOfArmsSprites);
    const intersects = this.raycaster.intersectObjects(coatOfArmsObjects, true); // Add true to check descendants
    
    // Handle selection
    if (intersects.length > 0) {
      // Find the land ID from the intersected object or its ancestors
      let landId = null;
      let currentObj: THREE.Object3D | null = intersects[0].object;
      
      // Traverse up the parent chain to find the object with polygonId
      while (currentObj && !landId) {
        if (currentObj.userData && currentObj.userData.polygonId) {
          landId = currentObj.userData.polygonId;
        }
        currentObj = currentObj.parent;
      }
      
      // If no polygonId found in the hierarchy, try the direct lookup method
      if (!landId) {
        landId = this.findLandIdFromObject(intersects[0].object);
      }
      
      if (landId) {
        // If already selected, do nothing (keep it selected)
        if (this.selectedCoatOfArms === landId) {
          return;
        }
        
        // Deselect previous selection
        if (this.selectedCoatOfArms) {
          const prevSelected = this.coatOfArmsSprites[this.selectedCoatOfArms];
          if (prevSelected) {
            this.setCoatOfArmsHighlight(prevSelected, false);
          }
        }
        
        // Select new
        this.selectedCoatOfArms = landId;
        const selected = this.coatOfArmsSprites[landId];
        this.setCoatOfArmsHighlight(selected, true);
        
        // Notify callback
        if (this.onLandSelected) {
          this.onLandSelected(landId);
        }
      }
    }
  }

  // Helper method to find land ID from a mesh
  private findLandIdFromObject(object: THREE.Object3D): string | null {
    // First check if the object itself has the polygonId
    if (object.userData && object.userData.polygonId) {
      return object.userData.polygonId;
    }
    
    // Then check if it's a direct match with one of our sprites
    for (const [landId, sprite] of Object.entries(this.coatOfArmsSprites)) {
      if (sprite === object) {
        return landId;
      }
      
      // Also check if the object is a child of the sprite
      if (sprite.children) {
        let isChild = false;
        sprite.traverse((child) => {
          if (child === object) {
            isChild = true;
          }
        });
        if (isChild) {
          return landId;
        }
      }
    }
    
    return null;
  }

  // Helper method to highlight/unhighlight a coat of arms
  private setCoatOfArmsHighlight(object: THREE.Object3D | null, highlight: boolean) {
    if (object && object instanceof THREE.Mesh) {
      // Store original scale if not already stored
      if (!object.userData.originalScale && highlight) {
        object.userData.originalScale = object.scale.clone();
      }
      
      if (highlight) {
        // Scale up slightly - reduce from 1.2 to 1.1 for a more subtle effect
        if (object.userData.originalScale) {
          object.scale.copy(object.userData.originalScale).multiplyScalar(1.1);
        } else {
          object.scale.multiplyScalar(1.1);
        }
        
        // Add glow effect by changing material - make the color change more subtle
        const meshObject = object as THREE.Mesh;
        if (meshObject.material) {
          const material = meshObject.material as THREE.Material;
          
          if (material instanceof THREE.MeshBasicMaterial) {
            // Store original color if not already stored
            if (!material.userData.originalColor) {
              material.userData.originalColor = material.color.clone();
            }
            
            // Use a more subtle highlight color - blend with original color
            if (material.userData.originalColor) {
              // Create a new color that's a blend between original and highlight
              const highlightColor = new THREE.Color(0xffcc00); // Slightly less intense yellow
              const blendFactor = 0.3; // 30% highlight, 70% original
              
              material.color.copy(material.userData.originalColor);
              material.color.lerp(highlightColor, blendFactor);
            } else {
              // Fallback if original color not stored
              material.color.set(0xffcc00); // Slightly less intense yellow
            }
            material.needsUpdate = true;
          }
        }
      } else {
        // Restore original scale if available
        if (object.userData.originalScale) {
          object.scale.copy(object.userData.originalScale);
        } else {
          // Fallback if original scale not stored
          object.scale.divideScalar(1.1);
        }
        
        // Restore original material properties
        const meshObject = object as THREE.Mesh;
        if (meshObject.material) {
          const material = meshObject.material as THREE.Material;
          
          if (material instanceof THREE.MeshBasicMaterial && material.userData.originalColor) {
            material.color.copy(material.userData.originalColor);
            material.needsUpdate = true;
          }
        }
      }
    }
  }

  // Method to deselect the current selection
  public deselectLand() {
    if (this.selectedCoatOfArms) {
      const selected = this.coatOfArmsSprites[this.selectedCoatOfArms];
      if (selected) {
        this.setCoatOfArmsHighlight(selected, false);
      }
      this.selectedCoatOfArms = null;
    }
  }

  // Add this new method to create a visual deletion effect
  private createDeletionEffect(position: THREE.Vector3) {
    console.log(`Creating deletion effect at position: ${position.x}, ${position.y}, ${position.z}`);
    
    // Create a sphere for the deletion effect
    const geometry = new THREE.SphereGeometry(0.5, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0xFF0000,
      transparent: true,
      opacity: 0.7
    });
    
    const effect = new THREE.Mesh(geometry, material);
    effect.position.copy(position);
    effect.renderOrder = 3000; // Ensure it renders on top
    
    this.scene.add(effect);
    
    // Animate the effect
    let scale = 1.0;
    let opacity = 0.7;
    
    const animate = () => {
      scale += 0.1;
      opacity -= 0.05;
      
      effect.scale.set(scale, scale, scale);
      (effect.material as THREE.MeshBasicMaterial).opacity = opacity;
      
      if (opacity > 0) {
        requestAnimationFrame(animate);
      } else {
        // Remove the effect when animation is complete
        this.scene.remove(effect);
        geometry.dispose();
        material.dispose();
      }
    };
    
    // Start animation
    animate();
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
    
    // Clear coat of arms sprites
    this.clearCoatOfArmsSprites();
    
    // Clean up bridge and dock point markers
    this.bridgePointMarkers.forEach(marker => {
      this.scene.remove(marker);
      if (marker.geometry) marker.geometry.dispose();
      if (marker.material instanceof THREE.Material) {
        marker.material.dispose();
      } else if (Array.isArray(marker.material)) {
        marker.material.forEach(m => m.dispose());
      }
    });
    
    this.dockPointMarkers.forEach(marker => {
      this.scene.remove(marker);
      if (marker instanceof THREE.Mesh) {
        if (marker.geometry) marker.geometry.dispose();
        if (marker.material instanceof THREE.Material) {
          marker.material.dispose();
        } else if (Array.isArray(marker.material)) {
          marker.material.forEach(m => m.dispose());
        }
      } else if (marker instanceof THREE.Line) {
        if (marker.geometry) marker.geometry.dispose();
        if (marker.material instanceof THREE.Material) {
          marker.material.dispose();
        }
      }
    });
    
    // Clean up building point markers
    this.clearBuildingPointMarkers();
    
    this.bridgePointMarkers = [];
    this.dockPointMarkers = [];
    this.buildingPointMarkers = [];
    this.hoveredPointId = null;
    
    // Reset rendering flags
    this.hasRenderedCoatOfArms = false;
    this.isRenderingCoatOfArms = false;
    
    // Remove the regenerateBuildingMarkers event listener
    if (typeof window !== 'undefined') {
      window.removeEventListener('regenerateBuildingMarkers', () => {
        console.log('Removed regenerateBuildingMarkers event listener');
      });
    }
    
    // Dispose textures
    if (this.sandTexture) {
      this.sandTexture.dispose();
      this.sandTexture = null;
    }
    
    if (this.sandNormalMap) {
      this.sandNormalMap.dispose();
      this.sandNormalMap = null;
    }
    
    if (this.sandRoughnessMap) {
      this.sandRoughnessMap.dispose();
      this.sandRoughnessMap = null;
    }
    
    // Dispose of shared material
    if (this.sharedMaterial) {
      this.sharedMaterial.dispose();
      this.sharedMaterial = null;
    }
    
    // Reset hover and selection
    this.hoveredCoatOfArms = null;
    this.selectedCoatOfArms = null;
    document.body.style.cursor = 'default';
  }
  
  /**
   * Create bridge and dock point markers for transport view
   */
  private createBridgeAndDockPoints() {
    // REMOVED the check for activeView to ensure points are always created
    console.log('Creating bridge and dock points');
    
    // Clear any existing markers first
    this.clearBridgeAndDockMarkers();
    
    // Add debug logging to see how many polygons have bridge/dock points
    let polygonsWithBridgePoints = 0;
    let polygonsWithDockPoints = 0;
    let totalBridgePoints = 0;
    let totalDockPoints = 0;
    
    // Debug: Log the total number of polygons
    console.log(`Total polygons to check for bridge/dock points: ${this.polygons.length}`);
    
    // Check each polygon for bridge/dock points and count them
    this.polygons.forEach(polygon => {
      if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints) && polygon.bridgePoints.length > 0) {
        polygonsWithBridgePoints++;
        totalBridgePoints += polygon.bridgePoints.length;
        console.log(`Polygon ${polygon.id} has ${polygon.bridgePoints.length} bridge points`);
      }
      
      if (polygon.dockPoints && Array.isArray(polygon.dockPoints) && polygon.dockPoints.length > 0) {
        polygonsWithDockPoints++;
        totalDockPoints += polygon.dockPoints.length;
        console.log(`Polygon ${polygon.id} has ${polygon.dockPoints.length} dock points`);
      }
    });
    
    console.log(`Found ${polygonsWithBridgePoints} polygons with bridge points (${totalBridgePoints} total points)`);
    console.log(`Found ${polygonsWithDockPoints} polygons with dock points (${totalDockPoints} total points)`);
    
    // If no bridge or dock points found, log a warning
    if (totalBridgePoints === 0 && totalDockPoints === 0) {
      console.warn('No bridge or dock points found in any polygons. Transport view will be empty.');
      return;
    }
    
    // Create a new material for bridge points
    const bridgeMaterial = new THREE.MeshBasicMaterial({
      color: 0xFF5500,
      transparent: false
    });
    
    // Create materials for dock points
    const dockEdgeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00AAFF,
      transparent: false
    });
    
    const dockWaterMaterial = new THREE.MeshBasicMaterial({
      color: 0x0088CC,
      transparent: false
    });
    
    // Process each polygon
    this.polygons.forEach(polygon => {
      // Skip if polygon has no bridge or dock points
      if (!polygon.bridgePoints && !polygon.dockPoints) return;
      
      // Process bridge points
      if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints) && polygon.bridgePoints.length > 0) {
        polygon.bridgePoints.forEach((point, index) => {
          try {
            const normalizedCoord = normalizeCoordinates(
              [point.edge],
              this.bounds.centerLat,
              this.bounds.centerLng,
              this.bounds.scale,
              this.bounds.latCorrectionFactor
            )[0];
            
            // Create a marker for the bridge point
            const geometry = new THREE.BoxGeometry(0.35, 0.35, 0.35); // Reduced from 0.5 (30% smaller)
            
            const marker = new THREE.Mesh(geometry, bridgeMaterial);
            marker.position.set(normalizedCoord.x, 1, -normalizedCoord.y);
            marker.renderOrder = 100;
            
            // Add metadata for tooltips
            marker.userData = {
              id: `bridge-${polygon.id}-${index}`,
              type: 'bridge',
              polygonId: polygon.id,
              position: `${point.edge.lat.toFixed(6)}, ${point.edge.lng.toFixed(6)}`
            };
            
            this.scene.add(marker);
            this.bridgePointMarkers.push(marker);
          } catch (error) {
            console.error(`Error creating bridge point for polygon ${polygon.id}:`, error);
          }
        });
      }
      
      // Process dock points
      if (polygon.dockPoints && Array.isArray(polygon.dockPoints) && polygon.dockPoints.length > 0) {
        polygon.dockPoints.forEach((point, index) => {
          try {
            // Create markers for both edge and water points
            const edgeCoord = normalizeCoordinates(
              [point.edge],
              this.bounds.centerLat,
              this.bounds.centerLng,
              this.bounds.scale,
              this.bounds.latCorrectionFactor
            )[0];
            
            const waterCoord = normalizeCoordinates(
              [point.water],
              this.bounds.centerLat,
              this.bounds.centerLng,
              this.bounds.scale,
              this.bounds.latCorrectionFactor
            )[0];
            
            // Create a marker for the dock point (edge)
            const edgeGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
            
            const edgeMarker = new THREE.Mesh(edgeGeometry, dockEdgeMaterial);
            edgeMarker.position.set(edgeCoord.x, 1, -edgeCoord.y);
            edgeMarker.renderOrder = 100;
            
            // Add metadata for tooltips
            edgeMarker.userData = {
              id: `dock-edge-${polygon.id}-${index}`,
              type: 'dock-edge',
              polygonId: polygon.id,
              position: `${point.edge.lat.toFixed(6)}, ${point.edge.lng.toFixed(6)}`
            };
            
            this.scene.add(edgeMarker);
            this.dockPointMarkers.push(edgeMarker);
            
            // Create a line connecting edge to water
            const lineGeometry = new THREE.BufferGeometry();
            const vertices = new Float32Array([
              edgeCoord.x, 1, -edgeCoord.y,
              waterCoord.x, 1, -waterCoord.y
            ]);
            lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            
            const lineMaterial = new THREE.LineBasicMaterial({
              color: 0x00CCFF,
              linewidth: 2
            });
            
            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.renderOrder = 99;
            
            this.scene.add(line);
            this.dockPointMarkers.push(line);
            
            // Create a marker for the water point
            const waterGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
            
            const waterMarker = new THREE.Mesh(waterGeometry, dockWaterMaterial);
            waterMarker.position.set(waterCoord.x, 1, -waterCoord.y);
            waterMarker.renderOrder = 100;
            
            // Add metadata for tooltips
            waterMarker.userData = {
              id: `dock-water-${polygon.id}-${index}`,
              type: 'dock-water',
              polygonId: polygon.id,
              position: `${point.water.lat.toFixed(6)}, ${point.water.lng.toFixed(6)}`
            };
            
            this.scene.add(waterMarker);
            this.dockPointMarkers.push(waterMarker);
          } catch (error) {
            console.error(`Error creating dock point for polygon ${polygon.id}:`, error);
          }
        });
      }
    });
    
    console.log(`Created ${this.bridgePointMarkers.length} bridge markers and ${this.dockPointMarkers.length} dock markers`);
  }
  
  /**
   * Add a new method that forces creation of bridge and dock points without checking activeView
   * This method is public so it can be called from outside the class
   */
  public forceCreateBridgeAndDockPoints() {
    console.log('FORCE Creating bridge and dock points for transport view');
    
    // Clear existing markers first
    this.clearBridgeAndDockMarkers();
    
    // Check each polygon for bridge/dock points and count them
    let polygonsWithBridgePoints = 0;
    let polygonsWithDockPoints = 0;
    let totalBridgePoints = 0;
    let totalDockPoints = 0;
    
    // Debug: Log the total number of polygons
    console.log(`Total polygons to check for bridge/dock points: ${this.polygons.length}`);
    
    // Count available points
    this.polygons.forEach(polygon => {
      if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints) && polygon.bridgePoints.length > 0) {
        polygonsWithBridgePoints++;
        totalBridgePoints += polygon.bridgePoints.length;
      }
      
      if (polygon.dockPoints && Array.isArray(polygon.dockPoints) && polygon.dockPoints.length > 0) {
        polygonsWithDockPoints++;
        totalDockPoints += polygon.dockPoints.length;
      }
    });
    
    console.log(`Found ${polygonsWithBridgePoints} polygons with bridge points (${totalBridgePoints} total points)`);
    console.log(`Found ${polygonsWithDockPoints} polygons with dock points (${totalDockPoints} total points)`);
    
    // If no bridge or dock points found, log a warning
    if (totalBridgePoints === 0 && totalDockPoints === 0) {
      console.warn('No bridge or dock points found in any polygons. Transport view will be empty.');
      return;
    }
    
    // Create materials with increased transparency and softer colors
    const bridgeMaterial = new THREE.MeshBasicMaterial({
      color: 0xFF5500, // Orange-red for bridges
      transparent: true,
      opacity: 0.6 // More transparent (was 0.8)
    });
    
    // Create materials for dock points
    const dockEdgeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00AAFF, // Light blue for dock edges
      transparent: true,
      opacity: 0.6 // More transparent (was 0.8)
    });
    
    const dockWaterMaterial = new THREE.MeshBasicMaterial({
      color: 0x0088CC, // Darker blue for dock water points
      transparent: true,
      opacity: 0.6 // More transparent (was 0.8)
    });
    
    // Process each polygon
    this.polygons.forEach(polygon => {
      // Skip if polygon has no bridge or dock points
      if (!polygon.bridgePoints && !polygon.dockPoints) return;
      
      // Process bridge points
      if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints) && polygon.bridgePoints.length > 0) {
        polygon.bridgePoints.forEach((point, index) => {
          try {
            const normalizedCoord = normalizeCoordinates(
              [point.edge],
              this.bounds.centerLat,
              this.bounds.centerLng,
              this.bounds.scale,
              this.bounds.latCorrectionFactor
            )[0];
            
            // Create a smaller sphere marker for bridge points
            const geometry = new THREE.SphereGeometry(0.21, 12, 12); // Reduced from 0.3 (30% smaller)
            
            const marker = new THREE.Mesh(geometry, bridgeMaterial);
            marker.position.set(normalizedCoord.x, 0.3, -normalizedCoord.y); // Lower position (was 0.5)
            marker.renderOrder = 100;
            
            // Add metadata for tooltips
            marker.userData = {
              id: `bridge-${polygon.id}-${index}`,
              type: 'bridge',
              polygonId: polygon.id,
              position: `${point.edge.lat.toFixed(6)}, ${point.edge.lng.toFixed(6)}`
            };
            
            this.scene.add(marker);
            this.bridgePointMarkers.push(marker);
            
            console.log(`Created bridge marker at position: ${normalizedCoord.x}, 0.3, ${-normalizedCoord.y}`);
          } catch (error) {
            console.error(`Error creating bridge point for polygon ${polygon.id}:`, error);
          }
        });
      }
      
      // Process dock points
      if (polygon.dockPoints && Array.isArray(polygon.dockPoints) && polygon.dockPoints.length > 0) {
        polygon.dockPoints.forEach((point, index) => {
          try {
            // Create markers for both edge and water points
            const edgeCoord = normalizeCoordinates(
              [point.edge],
              this.bounds.centerLat,
              this.bounds.centerLng,
              this.bounds.scale,
              this.bounds.latCorrectionFactor
            )[0];
            
            // Create a smaller sphere marker for dock edge points
            const edgeGeometry = new THREE.SphereGeometry(0.3, 12, 12); // Smaller size (was 0.5) and more segments for smoother spheres
            
            const edgeMarker = new THREE.Mesh(edgeGeometry, dockEdgeMaterial);
            edgeMarker.position.set(edgeCoord.x, 0.3, -edgeCoord.y); // Lower position (was 0.5)
            edgeMarker.renderOrder = 100;
            
            // Add metadata for tooltips
            edgeMarker.userData = {
              id: `dock-edge-${polygon.id}-${index}`,
              type: 'dock-edge',
              polygonId: polygon.id,
              position: `${point.edge.lat.toFixed(6)}, ${point.edge.lng.toFixed(6)}`
            };
            
            this.scene.add(edgeMarker);
            this.dockPointMarkers.push(edgeMarker);
            
            console.log(`Created dock marker at position: ${edgeCoord.x}, 0.3, ${-edgeCoord.y}`);
          } catch (error) {
            console.error(`Error creating dock point for polygon ${polygon.id}:`, error);
          }
        });
      }
    });
    
    console.log(`Created ${this.bridgePointMarkers.length} bridge markers and ${this.dockPointMarkers.length} dock markers`);
    
    // After creating the bridge point markers, add this code to create connection lines
    this.polygons.forEach(polygon => {
      // Skip if polygon has no bridge points
      if (!polygon.bridgePoints || !Array.isArray(polygon.bridgePoints)) return;
      
      // Process each bridge point that has a connection
      polygon.bridgePoints.forEach((point, index) => {
        if (point.connection) {
          try {
            // Get the normalized coordinates for the source point
            const sourceCoord = normalizeCoordinates(
              [point.edge],
              this.bounds.centerLat,
              this.bounds.centerLng,
              this.bounds.scale,
              this.bounds.latCorrectionFactor
            )[0];
            
            // Get the normalized coordinates for the target point
            const targetCoord = normalizeCoordinates(
              [point.connection.targetPoint],
              this.bounds.centerLat,
              this.bounds.centerLng,
              this.bounds.scale,
              this.bounds.latCorrectionFactor
            )[0];
            
            // Create a line geometry connecting the two points
            const lineGeometry = new THREE.BufferGeometry();
            const vertices = new Float32Array([
              sourceCoord.x, 0.35, -sourceCoord.y,  // Source point, slightly higher than the markers
              targetCoord.x, 0.35, -targetCoord.y   // Target point
            ]);
            lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            
            // Create a thick, semi-transparent orange line material
            const lineMaterial = new THREE.LineBasicMaterial({
              color: 0xFF8800,     // Orange color
              transparent: true,
              opacity: 0.6,        // Semi-transparent
              linewidth: 3         // Thicker line (note: linewidth may not work in WebGL)
            });
            
            // Create the line and add to scene
            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.renderOrder = 95; // Below the markers but above the land
            
            // Add metadata for identification
            line.userData = {
              id: `bridge-connection-${polygon.id}-${index}`,
              type: 'bridge-connection',
              sourcePolygonId: polygon.id,
              targetPolygonId: point.connection.targetPolygonId
            };
            
            this.scene.add(line);
            this.bridgePointMarkers.push(line); // Add to the same array for cleanup
            
            console.log(`Created bridge connection line from ${polygon.id} to ${point.connection.targetPolygonId}`);
          } catch (error) {
            console.error(`Error creating bridge connection line for polygon ${polygon.id}:`, error);
          }
        }
      });
    });
    
    // Force a scene update
    if (this.scene.userData && this.scene.userData.renderer) {
      this.scene.userData.renderer.render(this.scene, this.camera);
    }
  }

  // Add a helper method to clear markers
  private clearBridgeAndDockMarkers() {
    // Clear bridge markers
    this.bridgePointMarkers.forEach(marker => {
      this.scene.remove(marker);
      if (marker.geometry) marker.geometry.dispose();
      if (marker.material instanceof THREE.Material) {
        marker.material.dispose();
      } else if (Array.isArray(marker.material)) {
        marker.material.forEach(m => m.dispose());
      }
    });
    this.bridgePointMarkers = [];
    
    // Clear dock markers
    this.dockPointMarkers.forEach(marker => {
      this.scene.remove(marker);
      if (marker instanceof THREE.Mesh) {
        if (marker.geometry) marker.geometry.dispose();
        if (marker.material instanceof THREE.Material) {
          marker.material.dispose();
        } else if (Array.isArray(marker.material)) {
          marker.material.forEach(m => m.dispose());
        }
      } else if (marker instanceof THREE.Line) {
        if (marker.geometry) marker.geometry.dispose();
        if (marker.material instanceof THREE.Material) {
          marker.material.dispose();
        }
      }
    });
    this.dockPointMarkers = [];
  }
  
  /**
   * Clear all building point markers
   */
  private clearBuildingPointMarkers() {
    this.buildingPointMarkers.forEach(marker => {
      this.scene.remove(marker);
      if (marker.geometry) marker.geometry.dispose();
      if (marker.material instanceof THREE.Material) {
        marker.material.dispose();
      } else if (Array.isArray(marker.material)) {
        marker.material.forEach(m => m.dispose());
      }
    });
    this.buildingPointMarkers = [];
  }
  
  // This method is no longer needed as we've moved the functionality to handleMouseClick

  /**
   * Create building point markers for buildings view
   */
  public createBuildingPoints() {
    console.log('Creating building points - START');
    
    // Clear any existing markers first
    this.clearBuildingPointMarkers();
    
    // Add debug logging to see how many polygons have building points
    let polygonsWithBuildingPoints = 0;
    let totalBuildingPoints = 0;
    
    // Debug: Log the total number of polygons
    console.log(`Total polygons to check for building points: ${this.polygons.length}`);
    
    // Check each polygon for building points and count them
    this.polygons.forEach(polygon => {
      if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints) && polygon.buildingPoints.length > 0) {
        polygonsWithBuildingPoints++;
        totalBuildingPoints += polygon.buildingPoints.length;
        console.log(`Polygon ${polygon.id} has ${polygon.buildingPoints.length} building points`);
      }
    });
    
    console.log(`Found ${polygonsWithBuildingPoints} polygons with building points (${totalBuildingPoints} total points)`);
    
    // If no building points found, log a warning
    if (totalBuildingPoints === 0) {
      console.warn('No building points found in any polygons. Buildings view will not show building points.');
      return;
    }
    
    // Create a material for building points
    const buildingPointMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF, // White color for building points
      transparent: true,
      opacity: 0.7
    });
    
    // Process each polygon
    this.polygons.forEach(polygon => {
      // Skip if polygon has no building points
      if (!polygon.buildingPoints || !Array.isArray(polygon.buildingPoints) || polygon.buildingPoints.length === 0) return;
      
      console.log(`Processing ${polygon.buildingPoints.length} building points for polygon ${polygon.id}`);
      
      polygon.buildingPoints.forEach((point, index) => {
        try {
          console.log(`Building point ${index} data:`, point);
          
          const normalizedCoord = normalizeCoordinates(
            [point],
            this.bounds.centerLat,
            this.bounds.centerLng,
            this.bounds.scale,
            this.bounds.latCorrectionFactor
          )[0];
          
          console.log(`Normalized coordinates for point ${index}:`, normalizedCoord);
          
          // Create a small sphere for the building point
          const geometry = new THREE.SphereGeometry(0.25, 12, 12); // Small size, smooth sphere
          
          const marker = new THREE.Mesh(geometry, buildingPointMaterial);
          marker.position.set(normalizedCoord.x, 0.2, -normalizedCoord.y); // Position slightly above land
          marker.renderOrder = 100;
          
          // Add metadata for tooltips
          marker.userData = {
            id: `building-point-${polygon.id}-${index}`,
            type: 'building-point',
            polygonId: polygon.id,
            position: `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`
          };
          
          this.scene.add(marker);
          this.buildingPointMarkers.push(marker);
          
          console.log(`Created building point marker at position: ${normalizedCoord.x}, 0.2, ${-normalizedCoord.y}`);
        } catch (error) {
          console.error(`Error creating building point for polygon ${polygon.id}:`, error);
        }
      });
    });
    
    console.log(`Created ${this.buildingPointMarkers.length} building point markers`);
    
    // Make sure all markers are visible
    this.buildingPointMarkers.forEach(marker => {
      marker.visible = true;
      console.log(`Set marker visibility to true`);
    });
    
    console.log('Creating building points - END');
  }

  // Add this method to save the updated polygon data
  private saveUpdatedPolygonData(polygon: any) {
    console.log(`Saving updated polygon data for ${polygon.id}:`, {
      bridgePointsCount: polygon.bridgePoints?.length || 0,
      dockPointsCount: polygon.dockPoints?.length || 0
    });
    console.log("Full polygon data being sent:", JSON.stringify({
      id: polygon.id,
      bridgePoints: polygon.bridgePoints,
      dockPoints: polygon.dockPoints
    }, null, 2));

    // Create a request to save the updated polygon data
    fetch(`/api/update-polygon`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: polygon.id,
        bridgePoints: polygon.bridgePoints,
        dockPoints: polygon.dockPoints
      }),
    })
    .then(response => {
      console.log("API response status:", response.status);
      if (!response.ok) {
        throw new Error(`Failed to update polygon: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('%c Transport point deleted successfully! ', 
        'background: #4CAF50; color: white; padding: 4px; border-radius: 4px;');
      console.log('Server response:', data);
      
      // Display a temporary on-screen notification
      const notification = document.createElement('div');
      notification.textContent = 'Transport point deleted';
      notification.style.position = 'fixed';
      notification.style.bottom = '20px';
      notification.style.right = '20px';
      notification.style.backgroundColor = 'rgba(76, 175, 80, 0.9)';
      notification.style.color = 'white';
      notification.style.padding = '10px 20px';
      notification.style.borderRadius = '4px';
      notification.style.zIndex = '9999';
      notification.style.fontFamily = 'Arial, sans-serif';
      
      document.body.appendChild(notification);
      
      // Remove the notification after 3 seconds
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 3000);
    })
    .catch(error => {
      console.error('Error updating polygon data:', error);
      console.log('%c Error deleting transport point! ', 
        'background: #F44336; color: white; padding: 4px; border-radius: 4px;');
      
      // Display an error notification
      const notification = document.createElement('div');
      notification.textContent = 'Error deleting transport point';
      notification.style.position = 'fixed';
      notification.style.bottom = '20px';
      notification.style.right = '20px';
      notification.style.backgroundColor = 'rgba(244, 67, 54, 0.9)';
      notification.style.color = 'white';
      notification.style.padding = '10px 20px';
      notification.style.borderRadius = '4px';
      notification.style.zIndex = '9999';
      notification.style.fontFamily = 'Arial, sans-serif';
      
      document.body.appendChild(notification);
      
      // Remove the notification after 3 seconds
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 3000);
    });
  }
}
