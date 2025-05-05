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
  sandColor?: number; // Add this line
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
  private sandColor: number = 0xfff5d0; // Default to even lighter, more yellow sand color
  
  // Properties for hover and click detection
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private camera: THREE.Camera | null = null;
  private hoveredCoatOfArms: string | null = null;
  private selectedCoatOfArms: string | null = null;
  private onLandSelected: ((landId: string) => void) | null = null;
  
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
      // Remove texture to allow the color to show through fully
      // map: this.sandTexture,
      color: this.sandColor, // Use our lighter yellow sand color directly
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
      
      // Always use circular coat of arms for simplicity and performance
      this.createCircularCoatOfArms(polygon, coatOfArmsUrl);
      createdCount++;
    });
    
    console.log(`Created ${createdCount} coat of arms sprites`);
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
      console.log(`Found land intersection for ${polygon.id} at height ${yPosition}`);
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
      depthWrite: false
    });
    
    // Create mesh and position it with the calculated y position
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.position.set(normalizedCoord.x, yPosition, -normalizedCoord.y);
    plane.rotation.x = -Math.PI / 2 + Math.PI; // Rotate to lie flat and invert orientation
    plane.renderOrder = 10; // Ensure it renders on top of land
    
    // Mark this mesh as a coat of arms to avoid raycasting against it
    plane.userData.isCoatOfArms = true;
    
    // Add to scene
    this.scene.add(plane);
    
    // Add metadata
    plane.userData.isCoatOfArms = true;
    plane.userData.polygonId = polygon.id;
    
    // Store reference
    this.coatOfArmsSprites[polygon.id] = plane;
    
    // Load the texture - handle both external and local URLs
    const textureUrl = coatOfArmsUrl.startsWith('http') 
      ? coatOfArmsUrl 
      : `${window.location.origin}${coatOfArmsUrl}`;
      
    this.textureLoader.load(
      textureUrl,
      (texture) => {
        console.log(`Loaded texture for ${polygon.id} from ${textureUrl}`);
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
  

  // Handle mouse movement for hover effects
  public handleMouseMove(event: MouseEvent, container: HTMLElement) {
    if (!this.camera || this.activeView !== 'land') return;
    
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    const rect = container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update the raycaster with increased precision
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.raycaster.params.Line.threshold = 0.1; // Increase line detection threshold
    this.raycaster.params.Points.threshold = 0.1; // Increase point detection threshold
    
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
      let currentObj = intersects[0].object;
      
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
  }

  // Handle mouse clicks for selection
  public handleMouseClick(event: MouseEvent, container: HTMLElement) {
    if (!this.camera || this.activeView !== 'land') return;
    
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    const rect = container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update the raycaster with increased precision
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.raycaster.params.Line.threshold = 0.1; // Increase line detection threshold
    this.raycaster.params.Points.threshold = 0.1; // Increase point detection threshold
    
    // Find intersections with coat of arms sprites
    const coatOfArmsObjects = Object.values(this.coatOfArmsSprites);
    const intersects = this.raycaster.intersectObjects(coatOfArmsObjects, true); // Add true to check descendants
    
    // Handle selection
    if (intersects.length > 0) {
      // Find the land ID from the intersected object or its ancestors
      let landId = null;
      let currentObj = intersects[0].object;
      
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
  private setCoatOfArmsHighlight(object: THREE.Object3D, highlight: boolean) {
    if (object instanceof THREE.Mesh) {
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
        if (object.material) {
          const material = object.material as THREE.Material;
          
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
        if (object.material) {
          const material = object.material as THREE.Material;
          
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
    
    // Reset hover and selection
    this.hoveredCoatOfArms = null;
    this.selectedCoatOfArms = null;
    document.body.style.cursor = 'default';
  }
}
