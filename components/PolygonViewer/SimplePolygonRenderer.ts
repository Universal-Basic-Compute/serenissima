import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { normalizeCoordinates, createPolygonShape } from './utils';
import { getUserService } from '../../lib/services/UserService';
import { NavigationGraphService } from '../../lib/services/NavigationGraphService';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';

/**
 * Define Polygon interface for type safety
 */
interface Polygon {
  id: string;
  coordinates: {lat: number, lng: number}[];
  centroid?: {lat: number, lng: number};
  center?: {lat: number, lng: number}; // Added center property
  bridgePoints?: any[];
  dockPoints?: any[];
  buildingPoints?: any[];
  historicalName?: string;
  englishName?: string;
  owner?: string;
  User?: string;
}

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
  private buildingPointMarkers: THREE.Object3D[] = [];
  private hoveredPointId: string | null = null;
  
  // Properties for distance measurement
  private measurementPoints: THREE.Vector3[] = [];
  private measurementMarkers: THREE.Mesh[] = [];
  private measurementLine: THREE.Line | null = null;
  private measurementLabel: THREE.Sprite | null = null;
  private measurementCircle: THREE.Mesh | null = null;
  
  // Properties for path visualization
  private pathVisualization: THREE.Object3D[] = [];
  
  // Properties for citizens view
  private citizenMarkers: THREE.Object3D[] = [];
  private citizenData: any[] = [];
  private hoveredCitizenId: string | null = null;
  private selectedCitizenId: string | null = null;
  
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
    
    // Preload the navigation graph
    this.preloadNavigationGraph();
    
    // Setup lights for the scene
    this.setupLights();
    
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
      
      // Add event listener for replacing building points with buildings
      window.addEventListener('replaceBuildingPointsWithBuildings', () => {
        console.log('Received replaceBuildingPointsWithBuildings event');
        this.replaceBuildingPointsWithBuildings();
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
        
        // Enable shadows for land
        mesh.receiveShadow = true;
    
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
    
    // Debug: Log the number of polygons with different position properties
    let polygonsWithCenter = 0;
    let polygonsWithCentroid = 0;
    let polygonsWithCoatOfArmsCenter = 0;
    
    // Add more detailed logging for the first few polygons
    const samplePolygons = this.polygons.slice(0, 3);
    console.log('Sample polygon position properties:');
    samplePolygons.forEach((polygon, index) => {
      console.log(`Polygon ${index} (${polygon.id}):`, {
        hasCenter: !!polygon.center,
        center: polygon.center,
        hasCentroid: !!polygon.centroid,
        centroid: polygon.centroid,
        hasCoatOfArmsCenter: !!polygon.coatOfArmsCenter,
        coatOfArmsCenter: polygon.coatOfArmsCenter
      });
    });
    
    this.polygons.forEach(polygon => {
      if (polygon.center) polygonsWithCenter++;
      if (polygon.centroid) polygonsWithCentroid++;
      if (polygon.coatOfArmsCenter) polygonsWithCoatOfArmsCenter++;
    });
    
    console.log(`Position properties in polygons: center=${polygonsWithCenter}, centroid=${polygonsWithCentroid}, coatOfArmsCenter=${polygonsWithCoatOfArmsCenter}`);
    
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
    
    // Process each polygon with an owner
    let createdCount = 0;
    let skippedNoOwner = 0;
    let skippedNoPosition = 0;
    let skippedNoCoatOfArms = 0;
    
    this.polygons.forEach(polygon => {
      // Check for both 'owner' and 'User' properties
      const ownerValue = polygon.owner || polygon.User;
    
      if (!ownerValue) {
        skippedNoOwner++;
        return;
      }
    
      // Check if polygon has any valid position property
      if (!polygon.coatOfArmsCenter && !polygon.center && !polygon.centroid) {
        console.log(`Polygon ${polygon.id} has owner ${ownerValue} but no position property`);
        skippedNoPosition++;
        return;
      }
    
      // Process polygon with owner
    
      // Get the coat of arms URL for the owner
      const coatOfArmsUrl = this.ownerCoatOfArmsMap[ownerValue];
      if (!coatOfArmsUrl) {
        // No coat of arms found for this owner
        console.log(`No coat of arms found for owner ${ownerValue}`);
        skippedNoCoatOfArms++;
        return;
      }
      
      // Always use circular coat of arms for simplicity and performance
      this.createCircularCoatOfArms(polygon, coatOfArmsUrl);
      createdCount++;
    });
    
    console.log(`Coat of arms creation stats: created=${createdCount}, skipped (no owner)=${skippedNoOwner}, skipped (no position)=${skippedNoPosition}, skipped (no coat of arms)=${skippedNoCoatOfArms}`);
    
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
    // Add detailed logging to check all properties
    console.log(`Polygon ${polygon.id} properties:`, {
      hasCoatOfArmsCenter: !!polygon.coatOfArmsCenter,
      coatOfArmsCenter: polygon.coatOfArmsCenter,
      hasCenter: !!polygon.center,
      center: polygon.center,
      hasCentroid: !!polygon.centroid,
      centroid: polygon.centroid
    });
    
    // Check for all possible position properties, with fallbacks
    // First try coatOfArmsCenter (specific for coat of arms)
    // Then try center (general center)
    // Finally fall back to centroid (calculated center)
    const positionCoord = polygon.coatOfArmsCenter || polygon.center || polygon.centroid;
    
    if (!positionCoord) {
      console.warn(`No valid position found for coat of arms on polygon ${polygon.id}`);
      return;
    }
    
    // Log which property is being used
    let positionSource = 'unknown';
    if (polygon.coatOfArmsCenter && positionCoord === polygon.coatOfArmsCenter) {
      positionSource = 'coatOfArmsCenter';
    } else if (polygon.center && positionCoord === polygon.center) {
      positionSource = 'center';
    } else if (polygon.centroid && positionCoord === polygon.centroid) {
      positionSource = 'centroid';
    }
    
    console.log(`Creating coat of arms for polygon ${polygon.id} using ${positionSource} at position:`, positionCoord);
    
    // Convert position to 3D position
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
   * Find the ground level at a position using raycasting with improved mesh detection
   * @param position Position to check
   * @returns Ground position or null if not found
   */
  private findGroundLevel(position: THREE.Vector3): THREE.Vector3 | null {
    // Create a raycaster
    const raycaster = new THREE.Raycaster();
    
    // Set the ray origin high above the position
    const rayOrigin = new THREE.Vector3(position.x, 100, position.z);
    
    // Set the ray direction downward
    const rayDirection = new THREE.Vector3(0, -1, 0);
    rayDirection.normalize();
    
    // Set up the raycaster with increased precision
    raycaster.set(rayOrigin, rayDirection);
    
    // Increase precision for mesh detection
    raycaster.params.Mesh.threshold = 0.1;
    
    // Find all land meshes in the scene
    const landMeshes: THREE.Mesh[] = [];
    this.scene.traverse(object => {
      // Include all meshes except those we want to exclude
      if (object instanceof THREE.Mesh && 
          !object.userData.buildingId && 
          !object.userData.isWater &&
          !object.userData.isCoatOfArms) {
        landMeshes.push(object);
      }
    });
    
    console.log(`Found ${landMeshes.length} potential land meshes for ground level detection`);
    
    // Find intersections with land
    const intersects = raycaster.intersectObjects(landMeshes, true); // true to check descendants
    
    // Log intersection results for debugging
    if (intersects.length > 0) {
      console.log(`Found ${intersects.length} intersections for position (${position.x}, ${position.y}, ${position.z})`);
      console.log(`First intersection at distance ${intersects[0].distance}, point: (${intersects[0].point.x}, ${intersects[0].point.y}, ${intersects[0].point.z})`);
        
      // If we found an intersection, return the point with a small offset
      const groundPoint = intersects[0].point.clone();
      // Add a small offset to prevent z-fighting
      groundPoint.y += 0.01;
      return groundPoint;
    } else {
      console.log(`No ground intersections found for position (${position.x}, ${position.y}, ${position.z})`);
        
      // If no intersection found, try with a larger ray
      const largerRaycaster = new THREE.Raycaster();
      largerRaycaster.set(rayOrigin, rayDirection);
      largerRaycaster.params.Mesh.threshold = 1.0; // Much larger threshold
        
      const largerIntersects = largerRaycaster.intersectObjects(landMeshes, true);
      if (largerIntersects.length > 0) {
        console.log(`Found intersection with larger threshold at distance ${largerIntersects[0].distance}`);
        const groundPoint = largerIntersects[0].point.clone();
        groundPoint.y += 0.01;
        return groundPoint;
      }
      
      // No intersection found even with larger threshold
      console.log(`No ground found, returning default height (0)`);
      return new THREE.Vector3(position.x, 0, position.z);
    }
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
    
    // Clear measurement objects when switching away from transport view
    if (this.activeView === 'transport' && activeView !== 'transport') {
      // Clean up measurement objects
      this.measurementMarkers.forEach(marker => {
        this.scene.remove(marker);
        if (marker.geometry) marker.geometry.dispose();
        if (marker.material instanceof THREE.Material) {
          marker.material.dispose();
        } else if (Array.isArray(marker.material)) {
          marker.material.forEach(m => m.dispose());
        }
      });
      this.measurementMarkers = [];
      
      if (this.measurementLine) {
        this.scene.remove(this.measurementLine);
        if (this.measurementLine.geometry) this.measurementLine.geometry.dispose();
        if (this.measurementLine.material instanceof THREE.Material) {
          this.measurementLine.material.dispose();
        }
        this.measurementLine = null;
      }
      
      if (this.measurementLabel) {
        this.scene.remove(this.measurementLabel);
        if (this.measurementLabel.material instanceof THREE.SpriteMaterial) {
          if (this.measurementLabel.material.map) {
            this.measurementLabel.material.map.dispose();
          }
          this.measurementLabel.material.dispose();
        }
        this.measurementLabel = null;
      }
      
      if (this.measurementCircle) {
        this.scene.remove(this.measurementCircle);
        if (this.measurementCircle.geometry) this.measurementCircle.geometry.dispose();
        if (this.measurementCircle.material instanceof THREE.Material) {
          this.measurementCircle.material.dispose();
        }
        this.measurementCircle = null;
      }
      
      this.measurementPoints = [];
    }
    
    // Clear citizen markers when switching away from citizens view
    if (this.activeView === 'citizens' && activeView !== 'citizens') {
      this.clearCitizenMarkers();
    }
    
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
    
      // IMPORTANT: Always recreate building points in transport view too
      console.log('Creating building points for transport view');
      // Clear existing building markers first
      this.clearBuildingPointMarkers();
      // Create new building markers
      this.createBuildingPoints();
      // Force them to be visible with high render order
      this.buildingPointMarkers.forEach(marker => {
        marker.visible = true;
        marker.renderOrder = 2000; // High render order to ensure visibility
      });
    
      console.log(`Created ${this.bridgePointMarkers.length} bridge markers, ${this.dockPointMarkers.length} dock markers, and ${this.buildingPointMarkers.length} building markers for transport view`);
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
      
      // Dispatch an event to ensure building markers remain visible
      if (typeof window !== 'undefined') {
        console.log('Dispatching ensureBuildingsVisible event');
        window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
      }
      
      console.log(`Created ${this.buildingPointMarkers.length} building point markers for buildings view`);
    } else if (activeView === 'citizens') {
      // Hide coat of arms sprites in citizens view
      Object.values(this.coatOfArmsSprites).forEach(sprite => {
        sprite.visible = false;
      });
      
      // Hide bridge and dock points in citizens view
      this.bridgePointMarkers.forEach(marker => marker.visible = false);
      this.dockPointMarkers.forEach(marker => marker.visible = false);
      
      // Hide building points in citizens view
      this.buildingPointMarkers.forEach(marker => marker.visible = false);
      
      // Load citizen data if not already loaded
      if (this.citizenData.length === 0) {
        this.loadCitizens();
      } else {
        this.createCitizenMarkers();
      }
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
    this.raycaster.params.Line.threshold = 0.2; // Increase line detection threshold
    this.raycaster.params.Points.threshold = 0.2; // Increase point detection threshold
    
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
    } else if (this.activeView === 'citizens') {
      // Citizens view - handle citizen hover
      // Find intersections with citizen markers
      const intersects = this.raycaster.intersectObjects(this.citizenMarkers);
      
      // Reset hover state
      if (this.hoveredCitizenId && this.hoveredCitizenId !== this.selectedCitizenId) {
        const prevHovered = this.citizenMarkers.find(
          marker => marker.userData && marker.userData.citizenId === this.hoveredCitizenId
        );
        
        if (prevHovered) {
          // Reset scale
          prevHovered.scale.set(1, 1, 1);
        }
        
        this.hoveredCitizenId = null;
        document.body.style.cursor = 'default';
      }
      
      // Set new hover state if found
      if (intersects.length > 0) {
        const intersected = intersects[0].object;
        if (intersected.userData && intersected.userData.type === 'citizen') {
          const citizenId = intersected.userData.citizenId;
        
          if (citizenId && citizenId !== this.selectedCitizenId) {
            this.hoveredCitizenId = citizenId;
          
            // Scale up slightly
            if (intersected instanceof THREE.Object3D) {
              intersected.scale.set(1.2, 1.2, 1.2);
            }
          
            document.body.style.cursor = 'pointer';
          
            // Emit hover event
            eventBus.emit('CITIZEN_HOVER', {
              citizenId,
              data: intersected.userData.data
            });
          }
        }
      } else {
        // No citizen hovered, emit null hover event
        eventBus.emit('CITIZEN_HOVER', null);
      }
      
      return;
    } else if (this.activeView === 'transport') {
      try {
        // Transport view - handle bridge and dock point hover
        // Combine all markers for raycasting (excluding lines)
        const allMarkers = [...this.bridgePointMarkers, ...this.dockPointMarkers].filter(
          obj => obj instanceof THREE.Mesh
        );
        
        const intersects = this.raycaster.intersectObjects(allMarkers as THREE.Object3D[]);
        
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
    } else if (this.activeView === 'buildings' || this.activeView === 'transport') {
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
          
          // Highlight the hovered point with enhanced effect
          if (intersected instanceof THREE.Mesh) {
            // Create a more prominent highlight effect
            const highlightMaterial = new THREE.MeshBasicMaterial({
              color: 0xFFFF00, // Bright yellow highlight
              transparent: true,
              opacity: 1.0
              // MeshBasicMaterial doesn't support emissive properties
            });
            
            // Store the original material if not already stored
            if (!intersected.userData.originalMaterial) {
              intersected.userData.originalMaterial = intersected.material;
            }
            
            // Apply the highlight material
            intersected.material = highlightMaterial;
            
            // Scale up the building point slightly for better visibility
            intersected.scale.set(1.5, 1.5, 1.5);
            
            // Increase render order to ensure it's visible
            intersected.renderOrder = 2500;
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
            // Fallback to creating a new material - transparent white
            hoveredPoint.material = new THREE.MeshBasicMaterial({
              color: 0xFFFFFF, // White color for building points
              transparent: true,
              opacity: 0.6
            });
          }
          
          // Reset scale back to normal
          hoveredPoint.scale.set(1.0, 1.0, 1.0);
          
          // Reset render order
          hoveredPoint.renderOrder = 2000;
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
    
    // Handle citizens view clicks
    if (this.activeView === 'citizens') {
      // Find intersections with citizen markers
      const intersects = this.raycaster.intersectObjects(this.citizenMarkers);
      
      if (intersects.length > 0) {
        const intersected = intersects[0].object;
        if (intersected.userData && intersected.userData.type === 'citizen') {
          const citizenId = intersected.userData.citizenId;
          const citizenData = intersected.userData.data;
        
          // Deselect previous selection
          if (this.selectedCitizenId) {
            const prevSelected = this.citizenMarkers.find(
              marker => marker.userData && marker.userData.citizenId === this.selectedCitizenId
            );
          
            if (prevSelected) {
              // Reset scale to original social class scale
              const scaleMultiplier = this.getSocialClassScaleMultiplier(
                prevSelected.userData.data.SocialClass
              );
              prevSelected.scale.set(scaleMultiplier, scaleMultiplier, 1);
            }
          }
          
          // Select new
          this.selectedCitizenId = citizenId;
          
          // Scale up with animation
          const originalScale = intersected.scale.x;
          const targetScale = originalScale * 1.5;
          
          // Create a simple scale-up animation
          const startTime = performance.now();
          const duration = 300; // ms
          
          const animateScale = () => {
            const currentTime = performance.now();
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease-out function for smoother animation
            const easeOutProgress = 1 - Math.pow(1 - progress, 3);
            
            const newScale = originalScale + (targetScale - originalScale) * easeOutProgress;
            intersected.scale.set(newScale, newScale, 1);
            
            if (progress < 1) {
              requestAnimationFrame(animateScale);
            }
          };
          
          // Start animation
          animateScale();
          
          // Add a subtle pulse effect
          intersected.userData.pulseAnimation = true;
          
          // Emit selection event with more detailed data
          eventBus.emit('CITIZEN_SELECTED', {
            citizenId,
            data: citizenData,
            position: intersected.position.clone(),
            screenPosition: {
              x: event.clientX,
              y: event.clientY
            }
          });
          
          // Also emit the show citizen details event
          eventBus.emit('SHOW_CITIZEN_DETAILS', {
            citizen: citizenData,
            position: intersected.position.clone(),
            screenPosition: {
              x: event.clientX,
              y: event.clientY
            }
          });
          
          // Play a selection sound if available
          if (typeof window !== 'undefined' && window.Audio) {
            try {
              const selectSound = new Audio('/sounds/citizen-select.mp3');
              selectSound.volume = 0.3;
              selectSound.play().catch(e => console.log('Could not play sound:', e));
            } catch (e) {
              console.log('Audio not supported:', e);
            }
          }
          
          return;
        }
      } else {
        // If clicking outside any citizen, deselect current selection
        if (this.selectedCitizenId) {
          const prevSelected = this.citizenMarkers.find(
            marker => marker.userData && marker.userData.citizenId === this.selectedCitizenId
          );
          
          if (prevSelected) {
            // Reset scale to original social class scale
            const scaleMultiplier = this.getSocialClassScaleMultiplier(
              prevSelected.userData.data.SocialClass
            );
            prevSelected.scale.set(scaleMultiplier, scaleMultiplier, 1);
            prevSelected.userData.pulseAnimation = false;
          }
          
          this.selectedCitizenId = null;
          
          // Emit deselection event
          eventBus.emit('CITIZEN_SELECTED', null);
        }
      }
    }
    // Handle transport view clicks
    else if (this.activeView === 'transport') {
      console.log(`In transport view, checking for marker intersections`);
      
      // CHANGE: Prioritize building points for distance measurement in transport view
      const buildingMarkers = this.buildingPointMarkers.filter(
        obj => obj instanceof THREE.Mesh
      );
      
      console.log(`Found ${buildingMarkers.length} building markers to check for intersection`);
      
      // Check for intersection with building points first
      const buildingIntersects = this.raycaster.intersectObjects(buildingMarkers);
      
      if (buildingIntersects.length > 0) {
        const intersected = buildingIntersects[0].object;
        const userData = intersected.userData;
        
        console.log("Intersected building point userData:", userData);
        
        if (userData && userData.id) {
          // Add measurement point at the building point position
          this.addMeasurementPoint(intersected.position.clone());
          
          // Show tooltip with building point information
          eventBus.emit(EventTypes.SHOW_TOOLTIP, {
            type: 'building-point',
            polygonId: userData.polygonId,
            position: userData.position,
            screenX: event.clientX,
            screenY: event.clientY
          });
          
          // Hide tooltip after a delay
          setTimeout(() => {
            eventBus.emit(EventTypes.HIDE_TOOLTIP);
          }, 2000);
          
          return;
        }
      }
      
      // If no building point was clicked, check for bridge and dock markers
      const transportMarkers = [...this.bridgePointMarkers, ...this.dockPointMarkers].filter(
        obj => obj instanceof THREE.Mesh
      );
      
      console.log(`Found ${transportMarkers.length} transport markers to check for intersection`);
      
      const transportIntersects = this.raycaster.intersectObjects(transportMarkers);
      
      if (transportIntersects.length > 0) {
        const intersected = transportIntersects[0].object;
        const userData = intersected.userData;
        
        console.log("Intersected transport marker userData:", userData);
        
        if (userData && userData.id) {
          // Add measurement point at the transport marker position
          this.addMeasurementPoint(intersected.position.clone());
          
          // Show tooltip with transport marker information
          eventBus.emit(EventTypes.SHOW_TOOLTIP, {
            type: userData.type,
            polygonId: userData.polygonId,
            position: userData.position,
            screenX: event.clientX,
            screenY: event.clientY
          });
          
          // Hide tooltip after a delay
          setTimeout(() => {
            eventBus.emit(EventTypes.HIDE_TOOLTIP);
          }, 2000);
          
          return;
        }
      }
      
      // If no marker was clicked, check for land intersection for measurement
      const allLandMeshes = this.meshes.filter(mesh => mesh.visible);
      const landIntersects = this.raycaster.intersectObjects(allLandMeshes);
      
      if (landIntersects.length > 0) {
        const intersectionPoint = landIntersects[0].point;
        
        // Add measurement point
        this.addMeasurementPoint(intersectionPoint);
        return;
      }
      
      // Debug: Log raycaster origin and direction
      console.log("Raycaster origin:", this.raycaster.ray.origin);
      console.log("Raycaster direction:", this.raycaster.ray.direction);
    }
    
    // Handle building view clicks
    if (this.activeView === 'buildings') {
      console.log(`In buildings view, checking for marker intersections`);
      
      // Get all building markers for raycasting
      const buildingMarkers = this.buildingPointMarkers.filter(
        obj => obj instanceof THREE.Mesh
      );
      
      console.log(`Found ${buildingMarkers.length} building markers to check for intersection`);
      
      const intersects = this.raycaster.intersectObjects(buildingMarkers);
      
      console.log(`Found ${intersects.length} intersections`);
      
      if (intersects.length > 0) {
        const intersected = intersects[0].object;
        const userData = intersected.userData;
        
        console.log("Intersected object userData:", userData);
        
        if (userData && userData.id) {
          // Extract information from the marker ID
          // Format is typically: building-point-{polygonId}-{index}
          const idParts = userData.id.split('-');
          
          console.log(`ID parts: ${idParts.join(', ')}`);
          
          if (idParts.length >= 4 && idParts[0] === 'building' && idParts[1] === 'point') {
            // Get polygon ID and point index
            const polygonId = idParts.slice(2, idParts.length - 1).join('-');
            const pointIndex = parseInt(idParts[idParts.length - 1]);
        
            // Instead of deleting, just show a tooltip with building point information
            eventBus.emit(EventTypes.SHOW_TOOLTIP, {
              type: 'building-point',
              polygonId: polygonId,
              position: userData.position,
              screenX: event.clientX,
              screenY: event.clientY
            });
        
            // Hide tooltip after a delay
            setTimeout(() => {
              eventBus.emit(EventTypes.HIDE_TOOLTIP);
            }, 2000);
          }
          
          // Return early to prevent further processing
          return;
        } else {
          console.warn("Intersected object has no ID in userData:", userData);
        }
      } else {
        console.log("No intersections found with building markers");
      }
    }
    
    // Only handle land view clicks if not in transport or buildings view
    if (this.activeView !== 'land') return;
    
    // Find intersections with coat of arms sprites
    const coatOfArmsObjects = Object.values(this.coatOfArmsSprites);
    const intersects = this.raycaster.intersectObjects(coatOfArmsObjects as THREE.Object3D[], true); // Add true to check descendants
    
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
        if (object.material) {
          const material = object.material;
          
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
          const material = object.material;
          
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
    
    // Clean up citizen markers
    this.clearCitizenMarkers();
    
    // Clean up measurement objects
    this.measurementMarkers.forEach(marker => {
      this.scene.remove(marker);
      if (marker.geometry) marker.geometry.dispose();
      if (marker.material instanceof THREE.Material) {
        marker.material.dispose();
      } else if (Array.isArray(marker.material)) {
        marker.material.forEach(m => m.dispose());
      }
    });
    this.measurementMarkers = [];
    
    if (this.measurementLine) {
      this.scene.remove(this.measurementLine);
      if (this.measurementLine.geometry) this.measurementLine.geometry.dispose();
      if (this.measurementLine.material instanceof THREE.Material) {
        this.measurementLine.material.dispose();
      }
      this.measurementLine = null;
    }
    
    if (this.measurementLabel) {
      this.scene.remove(this.measurementLabel);
      if (this.measurementLabel.material instanceof THREE.SpriteMaterial) {
        if (this.measurementLabel.material.map) {
          this.measurementLabel.material.map.dispose();
        }
        this.measurementLabel.material.dispose();
      }
      this.measurementLabel = null;
    }
    
    if (this.measurementCircle) {
      this.scene.remove(this.measurementCircle);
      if (this.measurementCircle.geometry) this.measurementCircle.geometry.dispose();
      if (this.measurementCircle.material instanceof THREE.Material) {
        this.measurementCircle.material.dispose();
      }
      this.measurementCircle = null;
    }
    
    this.measurementPoints = [];
    
    // Clean up path visualization
    this.pathVisualization.forEach(object => {
      this.scene.remove(object);
      if (object instanceof THREE.Mesh) {
        if (object.geometry) object.geometry.dispose();
        if (object.material instanceof THREE.Material) {
          object.material.dispose();
        } else if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        }
      } else if (object instanceof THREE.Line) {
        if (object.geometry) object.geometry.dispose();
        if (object.material instanceof THREE.Material) {
          object.material.dispose();
        }
      }
    });
    this.pathVisualization = [];
    
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
      
      // Remove the replaceBuildingPointsWithBuildings event listener
      window.removeEventListener('replaceBuildingPointsWithBuildings', () => {
        console.log('Removed replaceBuildingPointsWithBuildings event listener');
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
            const geometry = new THREE.SphereGeometry(0.3, 12, 12); // Same size as dock points
            
            const marker = new THREE.Mesh(geometry, bridgeMaterial);
            // CHANGE: Position at ground level (y=0.2) instead of y=5.0
            marker.position.set(normalizedCoord.x, 0.2, -normalizedCoord.y);
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
            
            console.log(`Created bridge marker at position: ${normalizedCoord.x}, 0.2, ${-normalizedCoord.y}`);
          } catch (error) {
            if (error instanceof Error) {
              console.error(`Error creating bridge point for polygon ${polygon.id}:`, error);
            }
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
            // CHANGE: Position at ground level (y=0.2) instead of y=5.0
            edgeMarker.position.set(edgeCoord.x, 0.2, -edgeCoord.y);
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
            
            console.log(`Created dock marker at position: ${edgeCoord.x}, 0.2, ${-edgeCoord.y}`);
          } catch (error) {
            if (error instanceof Error) {
              console.error(`Error creating dock point for polygon ${polygon.id}:`, error);
            }
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
              sourceCoord.x, 0.15, -sourceCoord.y,  // Source point, slightly higher than the markers
              targetCoord.x, 0.15, -targetCoord.y   // Target point
            ]);
            lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            
            // Create a thick, semi-transparent orange line material
            const lineMaterial = new THREE.LineBasicMaterial({
              color: 0xFF8800,     // Orange color
              transparent: true,
              opacity: 0.8,        // Less transparent for better visibility
              linewidth: 5         // Even thicker line (note: linewidth may not work in WebGL)
            });
            
            // Create a path from the points, but extend it 20% on each side
            const direction = new THREE.Vector3().subVectors(
              new THREE.Vector3(targetCoord.x, 0, -targetCoord.y),
              new THREE.Vector3(sourceCoord.x, 0, -sourceCoord.y)
            ).normalize();

            const startPoint = new THREE.Vector3(
              sourceCoord.x,
              0.15, // Keep the lower position to be closer to the ground
              -sourceCoord.y
            );
            const endPoint = new THREE.Vector3(
              targetCoord.x,
              0.15, // Keep the lower position to be closer to the ground
              -targetCoord.y
            );

            // Create the path with extended points
            const path = new THREE.LineCurve3(startPoint, endPoint);

            // Create a tube geometry along the path
            const tubeGeometry = new THREE.TubeGeometry(
              path,
              1,    // tubularSegments - just 1 for a straight line
              0.08, // radius - make this larger for thicker lines
              8,    // radialSegments - more segments for smoother tube
              false // closed
            );

            // Create the tube mesh
            const line = new THREE.Mesh(tubeGeometry, new THREE.MeshBasicMaterial({
              color: 0xFF8800,
              transparent: true,
              opacity: 0.8
            }));
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
      
      // Check if marker is a Mesh before accessing geometry and material
      if (marker instanceof THREE.Mesh) {
        if (marker.geometry) marker.geometry.dispose();
        if (marker.material instanceof THREE.Material) {
          marker.material.dispose();
        } else if (Array.isArray(marker.material)) {
          marker.material.forEach(m => m.dispose());
        }
      } else if (marker instanceof THREE.Group) {
        // Handle Group objects by traversing their children
        marker.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            } else if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            }
          }
        });
      }
    });
    this.buildingPointMarkers = [];
  }
  
  // This method is no longer needed as we've moved the functionality to handleMouseClick

  /**
   * Force all building markers to be visible
   */
  public forceShowBuildingMarkers() {
    console.log('Force showing building markers');
    
    // Make sure building points are created
    if (this.buildingPointMarkers.length === 0) {
      this.createBuildingPoints();
    }
    
    // Ensure all building markers are visible
    this.buildingPointMarkers.forEach(marker => {
      marker.visible = true;
    });
    
    console.log(`Made ${this.buildingPointMarkers.length} building markers visible`);
  }
  
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
    
    // Create a material for building points - make them more transparent and smaller
    const buildingPointMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF, // White color for building points
      transparent: true,
      opacity: 0.4  // Reduced from 0.8 to 0.4 for more transparency
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
          
          // Create a smaller sphere for better visibility
          const geometry = new THREE.SphereGeometry(0.15, 12, 12); // Reduced from 0.25 to 0.15 for smaller size
          
          const marker = new THREE.Mesh(geometry, buildingPointMaterial);
          // Position closer to the ground level
          marker.position.set(normalizedCoord.x, 0.05, -normalizedCoord.y);
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
          
          console.log(`Created building point marker at position: ${normalizedCoord.x}, 0.05, ${-normalizedCoord.y}`);
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
    
    // After creating building points, replace them with actual buildings
    // Use setTimeout to ensure the building points are rendered first
    setTimeout(() => {
      this.replaceBuildingPointsWithBuildings();
    }, 1000);
  }
  
  /**
   * Force building points to be visible in transport view
   */
  public forceBuildingPointsVisible() {
    console.log('Forcing building points to be visible');
    
    // If no building points exist, create them
    if (this.buildingPointMarkers.length === 0) {
      this.createBuildingPoints();
    }
    
    // Make all building points visible with high render order
    this.buildingPointMarkers.forEach(marker => {
      marker.visible = true;
      marker.renderOrder = 2000; // High render order to ensure visibility
      
      // Ensure consistent appearance
      if (marker instanceof THREE.Mesh && marker.material instanceof THREE.MeshBasicMaterial) {
        // Make building points more transparent in transport view
        marker.material.opacity = 0.4; // Reduced from 0.8 to 0.4 for more transparency
        marker.material.color.set(0xFFFFFF); // White color for building points
      }
    });
    
    console.log(`Made ${this.buildingPointMarkers.length} building points visible`);
  }
  
  /**
   * Replace building points with actual buildings by fetching them in batches
   */
  public async replaceBuildingPointsWithBuildings(): Promise<void> {
    console.log('Starting to replace building points with actual buildings');
    
    // Only proceed if we have building points
    if (this.buildingPointMarkers.length === 0) {
      console.log('No building points to replace');
      return;
    }
    
    console.log(`Found ${this.buildingPointMarkers.length} building points to potentially replace`);
    
    // Create a map of building point positions for quick lookup
    const buildingPointPositions = new Map<string, {
      marker: THREE.Object3D,
      position: THREE.Vector3,
      latLng: {lat: number, lng: number}
    }>();
    
    this.buildingPointMarkers.forEach(marker => {
      if (marker instanceof THREE.Mesh && marker.userData && marker.userData.position) {
        // Parse the position string which is in format "lat, lng"
        const posStr = marker.userData.position;
        const [latStr, lngStr] = posStr.split(',').map(s => s.trim());
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          const posKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
          buildingPointPositions.set(posKey, {
            marker,
            position: marker.position.clone(),
            latLng: {lat, lng}
          });
        }
      }
    });
    
    console.log(`Created position map with ${buildingPointPositions.size} entries`);
    
    // Fetch buildings in batches of 20
    const batchSize = 20;
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      try {
        console.log(`Fetching buildings batch: offset=${offset}, limit=${batchSize}`);
        
        const response = await fetch(`/api/buildings?offset=${offset}&limit=${batchSize}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch buildings: ${response.status}`);
        }
        
        const data = await response.json();
        const buildings = data.buildings || [];
        
        console.log(`Received ${buildings.length} buildings in batch`);
        
        // If we got fewer buildings than the batch size, we've reached the end
        hasMore = buildings.length === batchSize;
        
        // Process each building
        for (const building of buildings) {
          // Skip buildings without position data
          if (!building.position) continue;
          
          // Parse position if it's a string
          let buildingPosition = building.position;
          if (typeof buildingPosition === 'string') {
            try {
              buildingPosition = JSON.parse(buildingPosition);
            } catch (error) {
              console.error(`Error parsing building position for ${building.id}:`, error);
              continue;
            }
          }
          
          // Skip buildings without lat/lng position
          if (!buildingPosition.lat || !buildingPosition.lng) continue;
          
          // Create a position key for lookup
          const posKey = `${parseFloat(buildingPosition.lat).toFixed(6)},${parseFloat(buildingPosition.lng).toFixed(6)}`;
          
          // Check if we have a building point at this position
          if (buildingPointPositions.has(posKey)) {
            console.log(`Found matching building point for building ${building.id} at position ${posKey}`);
            
            // Get the scene position and marker
            const pointData = buildingPointPositions.get(posKey);
            
            // Create a building mesh at this position
            const mesh = await this.createBuildingMesh(building, pointData.position);
            if (mesh) {
              // The ground level is now set in createBuildingMesh
              console.log(`Building ${building.id} placed at ground level: ${mesh.position.y}`);
            }
      
            // Remove the building point marker
            this.removeBuildingPointMarker(pointData.marker);
            
            // Remove from the map to avoid duplicate processing
            buildingPointPositions.delete(posKey);
          }
        }
        
        // Increment offset for next batch
        offset += batchSize;
        
      } catch (error) {
        console.error('Error fetching buildings batch:', error);
        hasMore = false;
      }
    }
    
    console.log('Finished replacing building points with buildings');
  }

  /**
   * Create a building mesh from building data
   */
  private async createBuildingMesh(building: any, position: THREE.Vector3): Promise<THREE.Object3D | null> {
    try {
      console.log(`Creating building mesh for ${building.id} of type ${building.type}`);
      
      // Create a loader for GLB files
      const loader = new GLTFLoader();
      
      // Determine the path to the GLB file based on building type and variant
      const variant = building.variant || 'model';
      const modelPath = `/assets/buildings/models/${building.type}/${variant}.glb`;
      
      console.log(`Attempting to load model from: ${modelPath}`);
      
      // Create a group to hold the model and any additional elements
      const buildingGroup = new THREE.Group() as THREE.Object3D;
      
      // Position the group
      buildingGroup.position.copy(position);
      
      // Find the ground level at this position using raycasting
      const groundPosition = this.findGroundLevel(position);
      if (groundPosition) {
        // Use the detected ground height
        console.log(`Found ground at height ${groundPosition.y} for building ${building.id}`);
        buildingGroup.position.y = groundPosition.y;
      } else {
        // Fallback to default ground level if detection fails
        console.log(`No ground found for building ${building.id}, using default height (0)`);
        buildingGroup.position.y = 0;
      }
      
      let modelLoaded = false;
      
      try {
        // Load the GLB model
        const gltf = await new Promise<any>((resolve, reject) => {
          loader.load(
            modelPath,
            resolve,
            undefined, // onProgress callback not needed
            reject
          );
        });
        
        // Add the loaded model to the group
        buildingGroup.add(gltf.scene);
      
        // Apply rotation
        buildingGroup.rotation.y = building.rotation || 0;
      
        // Ensure materials are properly configured for lighting
        buildingGroup.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // Enable shadows
            child.castShadow = true;
            child.receiveShadow = true;
          
            // If using MeshStandardMaterial, ensure it has proper settings
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.needsUpdate = true;
            
              // Adjust material properties for better visibility
              child.material.roughness = 0.7;  // Less shiny
              child.material.metalness = 0.3;  // Slightly metallic
            
              // Add some emissive color to ensure minimal visibility even without lights
              child.material.emissive.set(0x202020);  // Very subtle glow
            }
          }
        });
      
        console.log(`Successfully loaded model for ${building.id} from ${modelPath}`);
        modelLoaded = true;
      } catch (modelError) {
        console.warn(`Failed to load model from ${modelPath}:`, modelError);
        
        // Try a fallback path
        const fallbackPath = `/models/buildings/${building.type}.glb`;
        console.log(`Attempting to load from fallback path: ${fallbackPath}`);
        
        try {
          const gltf = await new Promise<any>((resolve, reject) => {
            loader.load(
              fallbackPath,
              resolve,
              undefined,
              reject
            );
          });
          
          // Add the loaded model to the group
          buildingGroup.add(gltf.scene);
          
          // Apply rotation
          buildingGroup.rotation.y = building.rotation || 0;
          
          console.log(`Successfully loaded model from fallback path for ${building.id}`);
          modelLoaded = true;
        } catch (fallbackError) {
          console.warn(`Failed to load model from fallback path:`, fallbackError);
          
          // Don't create a fallback cube, just log the error
          console.log(`No model available for ${building.id}, skipping visual representation`);
          // We'll return the empty group without any visible mesh
        }
      }
      
      // Only add metadata and add to scene if we have a model or we want to keep the placeholder
      if (modelLoaded) {
        // Add metadata
        buildingGroup.userData = {
          buildingId: building.id,
          type: building.type,
          variant: building.variant,
          owner: building.owner || building.created_by,
          position: building.position
        };
        
        // Add to scene
        this.scene.add(buildingGroup);
        
        // Store in building markers for cleanup
        this.buildingPointMarkers.push(buildingGroup);
        
        console.log(`Created building mesh for ${building.id} at position:`, buildingGroup.position);
        
        // Scale down the building to make it 2.5x smaller (20% smaller than before)
        buildingGroup.scale.set(0.4, 0.4, 0.4);
        
        return buildingGroup;
      } else {
        // Return null to indicate no visual representation was created
        return null;
      }
    } catch (error) {
      console.error(`Error creating building mesh for ${building.id}:`, error);
      return null;
    }
  }

  /**
   * Remove a building point marker
   */
  private removeBuildingPointMarker(marker: THREE.Object3D): void {
    // Find the marker in the array
    const markerIndex = this.buildingPointMarkers.indexOf(marker);
    
    if (markerIndex !== -1) {
      // Remove from scene
      this.scene.remove(marker);
      
      // Dispose of resources
      if (marker instanceof THREE.Mesh) {
        if (marker.geometry) marker.geometry.dispose();
        if (marker.material instanceof THREE.Material) {
          marker.material.dispose();
        } else if (Array.isArray(marker.material)) {
          marker.material.forEach(m => m.dispose());
        }
      } else if (marker instanceof THREE.Group) {
        // Handle Group objects by traversing their children
        marker.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            } else if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            }
          }
        });
      }
      
      // Remove from array
      this.buildingPointMarkers.splice(markerIndex, 1);
      
      console.log(`Removed building point marker`);
    }
  }

  /**
   * Setup lights for the scene
   */
  private setupLights(): void {
    console.log('Setting up lights for the scene');
    
    // Add ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    // Add directional light (like sunlight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    
    // Improve shadow quality
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    
    this.scene.add(directionalLight);
    
    // Add a hemisphere light for better ambient lighting from sky/ground
    const hemisphereLight = new THREE.HemisphereLight(0xddeeff, 0x806040, 0.5);
    this.scene.add(hemisphereLight);
    
    console.log('Lights added to scene');
  }
  
  /**
   * Preload the navigation graph from the server
   */
  private preloadNavigationGraph() {
    // Only run in browser
    if (typeof window === 'undefined') return;
    
    // Use the NavigationGraphService to load the graphs
    const navigationGraphService = NavigationGraphService.getInstance();
    navigationGraphService.preloadNavigationGraphs()
      .then(() => {
        console.log('Navigation graphs preloaded successfully');
      })
      .catch(error => {
        console.warn('Error preloading navigation graphs:', error);
      });
  }
  
  // Add this method to save the updated polygon data
  private saveUpdatedPolygonData(polygon: any) {
    console.log(`Saving updated polygon data for ${polygon.id}:`, {
      bridgePointsCount: polygon.bridgePoints?.length || 0,
      dockPointsCount: polygon.dockPoints?.length || 0,
      buildingPointsCount: polygon.buildingPoints?.length || 0
    });
    console.log("Full polygon data being sent:", JSON.stringify({
      id: polygon.id,
      bridgePoints: polygon.bridgePoints,
      dockPoints: polygon.dockPoints,
      buildingPoints: polygon.buildingPoints
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
        dockPoints: polygon.dockPoints,
        buildingPoints: polygon.buildingPoints
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
      console.log('%c Building point deleted successfully! ', 
        'background: #4CAF50; color: white; padding: 4px; border-radius: 4px;');
      console.log('Server response:', data);
      
      // Display a temporary on-screen notification
      const notification = document.createElement('div');
      notification.textContent = 'Building point deleted';
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
      console.log('%c Error deleting building point! ', 
        'background: #F44336; color: white; padding: 4px; border-radius: 4px;');
      
      // Display an error notification
      const notification = document.createElement('div');
      notification.textContent = 'Error deleting building point';
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
  
  /**
   * Add a measurement point at the specified position
   */
  private addMeasurementPoint(point: THREE.Vector3): void {
    // Create a marker at the clicked position
    const geometry = new THREE.CircleGeometry(0.3, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0xFFFF00,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(point.x, point.y + 0.05, point.z);
    marker.rotation.x = -Math.PI / 2; // Make it flat
    marker.renderOrder = 100;
    
    this.scene.add(marker);
    this.measurementMarkers.push(marker);
    this.measurementPoints.push(point.clone());
    
    // If we have two points, create or update the line and distance label
    if (this.measurementPoints.length === 2) {
      this.updateMeasurementLine();
      
      // Calculate path between points
      this.calculatePath();
    }
    
    // If we have more than two points, remove the oldest point and marker
    if (this.measurementPoints.length > 2) {
      const oldestPoint = this.measurementPoints.shift();
      const oldestMarker = this.measurementMarkers.shift();
      if (oldestMarker) {
        this.scene.remove(oldestMarker);
        if (oldestMarker.geometry) oldestMarker.geometry.dispose();
        if (oldestMarker.material instanceof THREE.Material) {
          oldestMarker.material.dispose();
        } else if (Array.isArray(oldestMarker.material)) {
          oldestMarker.material.forEach(m => m.dispose());
        }
      }
      
      // Update the line with the new points
      this.updateMeasurementLine();
      
      // Recalculate path
      this.calculatePath();
    }
  }

  /**
   * Update the measurement line and distance label
   */
  private updateMeasurementLine(): void {
    // Remove existing line and label
    if (this.measurementLine) {
      this.scene.remove(this.measurementLine);
      if (this.measurementLine.geometry) this.measurementLine.geometry.dispose();
      if (this.measurementLine.material instanceof THREE.Material) {
        this.measurementLine.material.dispose();
      }
      this.measurementLine = null;
    }
    
    if (this.measurementLabel) {
      this.scene.remove(this.measurementLabel);
      if (this.measurementLabel.material instanceof THREE.SpriteMaterial) {
        if (this.measurementLabel.material.map) {
          this.measurementLabel.material.map.dispose();
        }
        this.measurementLabel.material.dispose();
      }
      this.measurementLabel = null;
    }
    
    // Create a new line between the two points
    if (this.measurementPoints.length >= 2) {
      const start = this.measurementPoints[0];
      const end = this.measurementPoints[1];
      
      // Create line geometry
      const lineGeometry = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        start.x, start.y + 0.1, start.z,
        end.x, end.y + 0.1, end.z
      ]);
      lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      
      // Create line material
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xFFFF00,
        linewidth: 2
      });
      
      // Create line
      this.measurementLine = new THREE.Line(lineGeometry, lineMaterial);
      this.measurementLine.renderOrder = 99;
      this.scene.add(this.measurementLine);
      
      // Calculate distance in meters
      const distance = this.calculateDistanceInMeters(start, end);
      
      // Convert 3D points back to lat/lng
      const startLatLng = {
        lat: this.bounds.centerLat + (start.x / this.bounds.scale) / this.bounds.latCorrectionFactor,
        lng: this.bounds.centerLng - (start.z / this.bounds.scale)
      };
      
      const endLatLng = {
        lat: this.bounds.centerLat + (end.x / this.bounds.scale) / this.bounds.latCorrectionFactor,
        lng: this.bounds.centerLng - (end.z / this.bounds.scale)
      };
      
      // Find the building points or polygons containing the start and end points
      const startBuildingInfo = this.findBuildingPointInfo(start);
      const endBuildingInfo = this.findBuildingPointInfo(end);
      
      // Prepare path information text
      let pathInfo = "";
      
      if (startBuildingInfo && endBuildingInfo) {
        // Both points are building points
        pathInfo = `From: ${startBuildingInfo.type || 'Building'} in ${startBuildingInfo.polygonName}\nTo: ${endBuildingInfo.type || 'Building'} in ${endBuildingInfo.polygonName}`;
        
        // Check if buildings are in different polygons
        if (startBuildingInfo.polygonId !== endBuildingInfo.polygonId) {
          // Try to find a path between the polygons using bridge-by-bridge navigation
          const path = this.findShortestPath(startBuildingInfo.polygonId, endBuildingInfo.polygonId);
          
          if (path && path.length > 0) {
            // Count bridges in the path
            let bridgeCount = 0;
            let pathPolygons = [];
            
            // Add the names of polygons in the path
            for (let i = 0; i < path.length; i++) {
              const polygon = this.polygons.find(p => p.id === path[i]);
              if (polygon) {
                const polygonName = polygon.historicalName || polygon.englishName || polygon.id;
                pathPolygons.push(polygonName);
                
                // Count bridges between consecutive polygons
                if (i < path.length - 1) {
                  const currentPolygon = polygon;
                  const nextPolygonId = path[i + 1];
                  
                  // Check if there's a bridge between these polygons
                  if (currentPolygon.bridgePoints) {
                    const bridgesTo = currentPolygon.bridgePoints.filter(bp => 
                      bp.connection && bp.connection.targetPolygonId === nextPolygonId
                    );
                    bridgeCount += bridgesTo.length > 0 ? 1 : 0;
                  }
                }
              }
            }
            
            pathInfo += `\nPath: ${pathPolygons.join(' → ')}\nBridges: ${bridgeCount}`;
          }
        }
      } else if (startBuildingInfo) {
        pathInfo = `From: ${startBuildingInfo.type || 'Building'} in ${startBuildingInfo.polygonName}\nTo: (not a building point)`;
      } else if (endBuildingInfo) {
        pathInfo = `From: (not a building point)\nTo: ${endBuildingInfo.type || 'Building'} in ${endBuildingInfo.polygonName}`;
      } else {
        // Fall back to polygon-based path info
        const startPolygon = this.findPolygonContainingPoint(startLatLng);
        const endPolygon = this.findPolygonContainingPoint(endLatLng);
        
        if (startPolygon && endPolygon) {
          // Try to find a path using the bridge-by-bridge navigation
          const path = this.findShortestPath(startPolygon.id, endPolygon.id);
          
          if (path && path.length > 0) {
            // Count bridges in the path
            let bridgeCount = 0;
            let pathPolygons = [];
            
            // Add the names of polygons in the path
            for (let i = 0; i < path.length; i++) {
              const polygon = this.polygons.find(p => p.id === path[i]);
              if (polygon) {
                const polygonName = polygon.historicalName || polygon.englishName || polygon.id;
                pathPolygons.push(polygonName);
                
                // Count bridges between consecutive polygons
                if (i < path.length - 1) {
                  const currentPolygon = polygon;
                  const nextPolygonId = path[i + 1];
                  
                  // Check if there's a bridge between these polygons
                  if (currentPolygon.bridgePoints) {
                    const bridgesTo = currentPolygon.bridgePoints.filter(bp => 
                      bp.connection && bp.connection.targetPolygonId === nextPolygonId
                    );
                    bridgeCount += bridgesTo.length > 0 ? 1 : 0;
                  }
                }
              }
            }
            
            pathInfo = `Path: ${pathPolygons.join(' → ')}\nBridges: ${bridgeCount}`;
          } else {
            pathInfo = `Direct path from ${startPolygon.historicalName || startPolygon.englishName || startPolygon.id} to ${endPolygon.historicalName || endPolygon.englishName || endPolygon.id}`;
          }
        } else if (startPolygon) {
          pathInfo = `From: ${startPolygon.historicalName || startPolygon.englishName || startPolygon.id}\nTo: (not on land)`;
        } else if (endPolygon) {
          pathInfo = `From: (not on land)\nTo: ${endPolygon.historicalName || endPolygon.englishName || endPolygon.id}`;
        } else {
          pathInfo = "Path over water (no land)";
        }
      }
      
      // Create a text label to show the path information
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = 512;
        canvas.height = 256;
        
        // Draw background
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw border
        context.strokeStyle = '#FFFF00';
        context.lineWidth = 2;
        context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
        
        // Draw distance text
        context.font = 'bold 20px Arial';
        context.fillStyle = '#FFFFFF';
        context.textAlign = 'center';
        context.textBaseline = 'top';
        context.fillText(`${distance.toFixed(1)} meters`, canvas.width / 2, 10);
        
        // Draw path information
        context.font = '16px Arial';
        const pathLines = pathInfo.split('\n');
        let y = 40;
        pathLines.forEach(line => {
          context.fillText(line, canvas.width / 2, y);
          y += 24;
        });
        
        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        
        // Create sprite material
        const spriteMaterial = new THREE.SpriteMaterial({
          map: texture,
          transparent: true
        });
        
        // Create sprite
        this.measurementLabel = new THREE.Sprite(spriteMaterial);
        
        // Position sprite at the midpoint of the line, slightly above
        const midpoint = new THREE.Vector3(
          (start.x + end.x) / 2,
          Math.max(start.y, end.y) + 0.5, // Position above the highest point
          (start.z + end.z) / 2
        );
        this.measurementLabel.position.copy(midpoint);
        
        // Scale sprite based on distance from camera
        if (this.camera) {
          const distance = this.camera.position.distanceTo(midpoint);
          const scale = Math.max(1, distance / 10); // Scale up as camera gets further away
          this.measurementLabel.scale.set(scale, scale * 0.5, 1); // Make height 1/2 of width
        } else {
          this.measurementLabel.scale.set(2, 1, 1);
        }
        
        this.measurementLabel.renderOrder = 101;
        this.scene.add(this.measurementLabel);
      }
    }
  }

  /**
   * Calculate the distance between two points in meters
   */
  private calculateDistanceInMeters(point1: THREE.Vector3, point2: THREE.Vector3): number {
    // Convert 3D points back to lat/lng
    const lat1 = this.bounds.centerLat + (point1.x / this.bounds.scale) / this.bounds.latCorrectionFactor;
    const lng1 = this.bounds.centerLng - (point1.z / this.bounds.scale);
    
    const lat2 = this.bounds.centerLat + (point2.x / this.bounds.scale) / this.bounds.latCorrectionFactor;
    const lng2 = this.bounds.centerLng - (point2.z / this.bounds.scale);
    
    // Use the Haversine formula to calculate distance
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  /**
   * Calculate path between measurement points
   */
  private calculatePath(): void {
    // Only calculate path if we have exactly 2 measurement points
    if (this.measurementPoints.length !== 2) return;
    
    // Get the start and end points
    const start = this.measurementPoints[0];
    const end = this.measurementPoints[1];
    
    // Convert 3D points back to lat/lng
    const startLatLng = {
      lat: this.bounds.centerLat + (start.x / this.bounds.scale) / this.bounds.latCorrectionFactor,
      lng: this.bounds.centerLng - (start.z / this.bounds.scale)
    };
    
    const endLatLng = {
      lat: this.bounds.centerLat + (end.x / this.bounds.scale) / this.bounds.latCorrectionFactor,
      lng: this.bounds.centerLng - (end.z / this.bounds.scale)
    };
    
    console.log(`Calculating path from (${startLatLng.lat}, ${startLatLng.lng}) to (${endLatLng.lat}, ${endLatLng.lng})`);
    
    // Call the pathfinder service to find a path
    this.findPathBetweenPoints(startLatLng, endLatLng);
  }
  
  /**
   * Find information about a building point at a given position
   */
  private findBuildingPointInfo(position: THREE.Vector3): {
    type?: string;
    polygonId: string;
    polygonName: string;
  } | null {
    // Find the closest building point marker to this position
    let closestMarker: THREE.Object3D | null = null;
    let minDistance = 0.5; // Maximum distance to consider (0.5 units)
      
    for (const marker of this.buildingPointMarkers) {
      // Check both Mesh objects and other Object3D types (like Group)
      if (marker.userData && marker.userData.id) {
        const distance = position.distanceTo(marker.position);
        if (distance < minDistance) {
          minDistance = distance;
          closestMarker = marker;
        }
      }
    }
    
    if (closestMarker) {
      const userData = closestMarker.userData;
      const polygonId = userData.polygonId;
      const polygon = this.polygons.find(p => p.id === polygonId);
      const polygonName = polygon 
        ? (polygon.historicalName || polygon.englishName || polygon.id)
        : polygonId;
      
      // Extract building type from userData.id if available
      // Format is typically: building-point-{polygonId}-{index}
      let type = 'Building';
      if (userData.id && userData.id.startsWith('building-point-')) {
        // Try to get a more specific type if available
        if (userData.type) {
          type = userData.type.replace(/-/g, ' ');
          // Capitalize first letter of each word
          type = type.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        }
      }
      
      return {
        type,
        polygonId,
        polygonName
      };
    }
    
    return null;
  }
  
  /**
   * Find a path between two points using bridges and docks
   */
  private async findPathBetweenPoints(start: {lat: number, lng: number}, end: {lat: number, lng: number}): Promise<void> {
    console.log('Finding path between points:', start, end);
    
    // Remove any existing path visualization
    this.clearPathVisualization();
    
    try {
      // Find the polygons containing the start and end points
      const startPolygon = this.findPolygonContainingPoint(start);
      const endPolygon = this.findPolygonContainingPoint(end);
      
      // If both points are not on land, draw a direct path
      if (!startPolygon && !endPolygon) {
        console.warn('Both start and end points are not on land, drawing direct path');
        this.drawDirectPath(this.measurementPoints[0], this.measurementPoints[1]);
        return;
      }
      
      // If start and end are in the same polygon, draw a direct path
      if (startPolygon && endPolygon && startPolygon.id === endPolygon.id) {
        console.log('Start and end points are in the same polygon, drawing direct path');
        this.drawDirectPath(this.measurementPoints[0], this.measurementPoints[1]);
        return;
      }
      
      // Check if we need to use water navigation
      const needsWaterNavigation = this.needsWaterNavigation(startPolygon, endPolygon);
      
      if (needsWaterNavigation) {
        console.log('Path requires water navigation');
        // Find path using water navigation
        this.findWaterPath(startPolygon, endPolygon, start, end);
      } else if (startPolygon && endPolygon) {
        console.log(`Finding land path from polygon ${startPolygon.id} to ${endPolygon.id}`);
        
        // Find the shortest path through the land graph
        const path = this.findShortestPath(startPolygon.id, endPolygon.id);
        
        if (!path || path.length === 0) {
          console.warn('No land path found between points, drawing direct path instead');
          this.drawDirectPath(this.measurementPoints[0], this.measurementPoints[1]);
          return;
        }
        
        console.log('Land path found:', path);
        
        // Visualize the land path
        this.visualizePath(path, start, end);
      } else {
        // One point is on land, one is not - draw direct path
        console.warn('One point is on land, one is not, drawing direct path');
        this.drawDirectPath(this.measurementPoints[0], this.measurementPoints[1]);
      }
    } catch (error) {
      console.error('Error finding path:', error);
      // Fallback to direct path in case of error
      this.drawDirectPath(this.measurementPoints[0], this.measurementPoints[1]);
    }
  }
  
  /**
   * Determine if water navigation is needed between two polygons
   */
  private needsWaterNavigation(startPolygon: Polygon | null, endPolygon: Polygon | null): boolean {
    // If either polygon is null, we can't determine if water navigation is needed
    if (!startPolygon || !endPolygon) return false;
    
    // Check if there's a land path between the polygons
    const landPath = this.findShortestPath(startPolygon.id, endPolygon.id);
    
    // If there's no land path, we need water navigation
    if (!landPath || landPath.length === 0) {
      console.log('No land path found, checking for water navigation');
      
      // Check if both polygons have docks
      const navigationGraphService = NavigationGraphService.getInstance();
      const waterGraph = navigationGraphService.getWaterNavigationGraph();
      if (!waterGraph || !waterGraph.polygonToDocks) {
        console.warn('Water navigation graph not available');
        return false;
      }
      
      const startDocks = waterGraph.polygonToDocks[startPolygon.id];
      const endDocks = waterGraph.polygonToDocks[endPolygon.id];
      
      // If both polygons have docks, water navigation is possible
      return !!(startDocks && startDocks.length > 0 && endDocks && endDocks.length > 0);
    }
    
    return false;
  }
  
  /**
   * Find a path using water navigation
   */
  private findWaterPath(startPolygon: Polygon | null, endPolygon: Polygon | null, 
                        startPoint: {lat: number, lng: number}, endPoint: {lat: number, lng: number}): void {
    if (!startPolygon || !endPolygon) {
      console.warn('Cannot find water path without valid polygons');
      this.drawDirectPath(this.measurementPoints[0], this.measurementPoints[1]);
      return;
    }
    
    // Get the water navigation graph from the service
    const navigationGraphService = NavigationGraphService.getInstance();
    const waterGraph = navigationGraphService.getWaterNavigationGraph();
    if (!waterGraph.polygonToDocks || !waterGraph.enhanced) {
      console.warn('Water navigation graph not available');
      this.drawDirectPath(this.measurementPoints[0], this.measurementPoints[1]);
      return;
    }
    
    // Get docks for start and end polygons
    const startDocks = waterGraph.polygonToDocks[startPolygon.id];
    const endDocks = waterGraph.polygonToDocks[endPolygon.id];
    
    if (!startDocks || startDocks.length === 0 || !endDocks || endDocks.length === 0) {
      console.warn('One or both polygons do not have docks');
      this.drawDirectPath(this.measurementPoints[0], this.measurementPoints[1]);
      return;
    }
    
    console.log(`Found ${startDocks.length} docks in start polygon and ${endDocks.length} docks in end polygon`);
    
    // Find the best dock in each polygon (closest to the start/end points)
    const bestStartDock = this.findBestDock(startDocks, startPoint, waterGraph.enhanced);
    const bestEndDock = this.findBestDock(endDocks, endPoint, waterGraph.enhanced);
    
    if (!bestStartDock || !bestEndDock) {
      console.warn('Could not find suitable docks');
      this.drawDirectPath(this.measurementPoints[0], this.measurementPoints[1]);
      return;
    }
    
    console.log(`Using dock ${bestStartDock.id} to ${bestEndDock.id}`);
    
    // Create path points
    const pathPoints: THREE.Vector3[] = [];
    
    // Add start point
    pathPoints.push(this.measurementPoints[0]);
    
    // Add start dock edge point
    const startDockEdgeCoord = normalizeCoordinates(
      [bestStartDock.edge],
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    )[0];
    
    pathPoints.push(new THREE.Vector3(startDockEdgeCoord.x, 0.15, -startDockEdgeCoord.y));
    
    // Add start dock water point
    const startDockWaterCoord = normalizeCoordinates(
      [bestStartDock.position],
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    )[0];
    
    pathPoints.push(new THREE.Vector3(startDockWaterCoord.x, 0.15, -startDockWaterCoord.y));
    
    // Add end dock water point
    const endDockWaterCoord = normalizeCoordinates(
      [bestEndDock.position],
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    )[0];
    
    pathPoints.push(new THREE.Vector3(endDockWaterCoord.x, 0.15, -endDockWaterCoord.y));
    
    // Add end dock edge point
    const endDockEdgeCoord = normalizeCoordinates(
      [bestEndDock.edge],
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    )[0];
    
    pathPoints.push(new THREE.Vector3(endDockEdgeCoord.x, 0.15, -endDockEdgeCoord.y));
    
    // Add end point
    pathPoints.push(this.measurementPoints[1]);
    
    // Create a smooth curve through the points
    const curve = new THREE.CatmullRomCurve3(pathPoints);
    const points = curve.getPoints(50 * pathPoints.length); // More points for smoother curve
    
    // Create line geometry
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    
    // Create line material - use blue for water paths
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x0088FF, // Blue color for water path
      linewidth: 3
    });
    
    // Create line
    const pathLine = new THREE.Line(lineGeometry, lineMaterial);
    pathLine.renderOrder = 101;
    this.scene.add(pathLine);
    
    // Store reference for cleanup
    this.pathVisualization.push(pathLine);
    
    // Add markers at dock points
    for (let i = 1; i < pathPoints.length - 1; i++) {
      const geometry = new THREE.SphereGeometry(0.2, 16, 16);
      const material = new THREE.MeshBasicMaterial({
        color: 0x00AAFF, // Light blue color for dock points
        transparent: true,
        opacity: 0.8
      });
      
      const marker = new THREE.Mesh(geometry, material);
      marker.position.copy(pathPoints[i]);
      marker.renderOrder = 102;
      this.scene.add(marker);
      
      // Store reference for cleanup
      this.pathVisualization.push(marker);
    }
    
    // Add boat icon at the middle of the water path
    this.addBoatIcon(pathPoints[2], pathPoints[3]);
  }
  
  /**
   * Find the best dock in a polygon for a given point
   */
  private findBestDock(dockIds: string[], point: {lat: number, lng: number}, 
                       enhancedGraph: any): {id: string, position: any, edge: any} | null {
    if (!dockIds || dockIds.length === 0) return null;
    
    // If there's only one dock, use it
    if (dockIds.length === 1) {
      const dockId = dockIds[0];
      const dockData = enhancedGraph[dockId];
      return {
        id: dockId,
        position: dockData.position,
        edge: dockData.edge
      };
    }
    
    // Find the dock closest to the point
    let bestDock = null;
    let minDistance = Infinity;
    
    dockIds.forEach(dockId => {
      const dockData = enhancedGraph[dockId];
      if (!dockData) return;
      
      // Calculate distance to the dock edge (not water point)
      const distance = this.calculateDistanceInMeters(
        new THREE.Vector3(
          (point.lat - this.bounds.centerLat) * this.bounds.scale * this.bounds.latCorrectionFactor,
          0,
          -(point.lng - this.bounds.centerLng) * this.bounds.scale
        ),
        new THREE.Vector3(
          (dockData.edge.lat - this.bounds.centerLat) * this.bounds.scale * this.bounds.latCorrectionFactor,
          0,
          -(dockData.edge.lng - this.bounds.centerLng) * this.bounds.scale
        )
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        bestDock = {
          id: dockId,
          position: dockData.position,
          edge: dockData.edge
        };
      }
    });
    
    return bestDock;
  }
  
  /**
   * Add a boat icon to the path
   */
  private addBoatIcon(start: THREE.Vector3, end: THREE.Vector3): void {
    // Calculate the midpoint between start and end
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    // Calculate direction vector
    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    
    // Create a simple boat shape
    const boatGeometry = new THREE.BoxGeometry(0.4, 0.1, 0.2);
    const boatMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const boat = new THREE.Mesh(boatGeometry, boatMaterial);
    
    // Position the boat
    boat.position.copy(midpoint);
    boat.position.y += 0.1; // Raise slightly above water
    
    // Orient the boat along the path
    const angle = Math.atan2(direction.z, direction.x);
    boat.rotation.y = -angle;
    
    // Add to scene
    this.scene.add(boat);
    
    // Store for cleanup
    this.pathVisualization.push(boat);
  }
  
  /**
   * Add a bridge icon to visualize a bridge in the path
   */
  private addBridgeIcon(start: THREE.Vector3, end: THREE.Vector3): void {
    // Calculate the midpoint between start and end
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    // Calculate direction vector
    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    
    // Create a simple bridge shape
    const bridgeGeometry = new THREE.BoxGeometry(0.5, 0.1, 0.2);
    const bridgeMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xFFAA00, // Orange color for bridges
      transparent: true,
      opacity: 0.9
    });
    const bridge = new THREE.Mesh(bridgeGeometry, bridgeMaterial);
    
    // Position the bridge
    bridge.position.copy(midpoint);
    bridge.position.y += 0.2; // Raise slightly above the path
    
    // Orient the bridge along the path
    const angle = Math.atan2(direction.z, direction.x);
    bridge.rotation.y = -angle;
    
    // Add to scene
    this.scene.add(bridge);
    
    // Store for cleanup
    this.pathVisualization.push(bridge);
  }
  
  /**
   * Build a navigation graph on the fly
   */
  private buildNavigationGraph(): Record<string, string[]> {
    console.log('Building navigation graph on the fly');
    const graph: Record<string, string[]> = {};
    
    // Initialize graph with empty adjacency lists for all polygons
    this.polygons.forEach(polygon => {
      graph[polygon.id] = [];
    });
    
    // Add bridge connections to the graph
    this.polygons.forEach(polygon => {
      if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
        polygon.bridgePoints.forEach(bridgePoint => {
          if (bridgePoint.connection && bridgePoint.connection.targetPolygonId) {
            const targetPolygonId = bridgePoint.connection.targetPolygonId;
            
            // Verify that the target polygon exists
            const targetPolygon = this.polygons.find(p => p.id === targetPolygonId);
            if (!targetPolygon) {
              console.warn(`Bridge from ${polygon.id} points to non-existent polygon ${targetPolygonId}`);
              return;
            }
            
            // Add bidirectional connection if not already present
            if (!graph[polygon.id].includes(targetPolygonId)) {
              graph[polygon.id].push(targetPolygonId);
            }
            
            // Ensure the target polygon exists in the graph
            if (!graph[targetPolygonId]) {
              graph[targetPolygonId] = [];
            }
            
            // Add the reverse connection if not already present
            if (!graph[targetPolygonId].includes(polygon.id)) {
              graph[targetPolygonId].push(polygon.id);
            }
          }
        });
      }
    });
    
    // Add proximity-based connections for polygons that are close to each other
    // This helps with navigation when bridge data is incomplete
    this.polygons.forEach(polygon1 => {
      if (!polygon1.centroid) return;
      
      this.polygons.forEach(polygon2 => {
        // Skip self-connections and already connected polygons
        if (polygon1.id === polygon2.id || 
            !polygon2.centroid || 
            graph[polygon1.id].includes(polygon2.id)) {
          return;
        }
        
        // Calculate distance between centroids
        const distance = this.calculateDistanceBetweenPoints(
          polygon1.centroid, 
          polygon2.centroid
        );
        
        // If polygons are close enough, add a connection
        // The threshold is arbitrary and can be adjusted
        const PROXIMITY_THRESHOLD = 0.005; // in degrees, roughly 500m
        if (distance < PROXIMITY_THRESHOLD) {
          // Add bidirectional connection
          graph[polygon1.id].push(polygon2.id);
          graph[polygon2.id].push(polygon1.id);
        }
      });
    });
    
    // Log the graph for debugging
    console.log('Built navigation graph with', Object.keys(graph).length, 'nodes');
    
    // Log the number of connections for each node
    let totalConnections = 0;
    for (const nodeId in graph) {
      const connections = graph[nodeId].length;
      totalConnections += connections;
      if (connections > 0) {
        console.log(`Node ${nodeId} has ${connections} connections`);
      }
    }
    console.log(`Total connections in graph: ${totalConnections}`);
    
    return graph;
  }
  
  /**
   * Calculate distance between two points in degrees
   */
  private calculateDistanceBetweenPoints(
    point1: {lat: number, lng: number}, 
    point2: {lat: number, lng: number}
  ): number {
    const latDiff = point1.lat - point2.lat;
    const lngDiff = point1.lng - point2.lng;
    return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  }
  
  /**
   * Find the polygon containing a point with improved detection
   */
  private findPolygonContainingPoint(point: {lat: number, lng: number}): Polygon | null {
    console.log(`Finding polygon containing point: ${point.lat}, ${point.lng}`);
    
    // First try exact containment
    for (const polygon of this.polygons) {
      if (this.isPointInPolygon(point, polygon.coordinates)) {
        console.log(`Point is inside polygon ${polygon.id}`);
        return polygon;
      }
    }
    
    // If no exact match, try with a larger buffer (increased from 0.0001 to 0.001)
    const BUFFER_DISTANCE = 0.001; // Increased buffer distance in degrees (about 100 meters)
    for (const polygon of this.polygons) {
      if (this.isPointNearPolygon(point, polygon.coordinates, BUFFER_DISTANCE)) {
        console.log(`Point is near polygon ${polygon.id} (within buffer)`);
        return polygon;
      }
    }
    
    // If still no match, find the nearest polygon
    let nearestPolygon: Polygon | null = null;
    let minDistance = Number.MAX_VALUE;
    
    for (const polygon of this.polygons) {
      const distance = this.getDistanceToPolygon(point, polygon.coordinates);
      if (distance < minDistance) {
        minDistance = distance;
        nearestPolygon = polygon;
      }
    }
    
    if (nearestPolygon) {
      // Accept the nearest polygon if it's within a reasonable distance (0.01 degrees, about 1km)
      if (minDistance <= 0.01) {
        console.log(`No polygon contains point, using nearest polygon ${nearestPolygon.id} at distance ${minDistance}`);
        return nearestPolygon;
      } else {
        console.warn(`Nearest polygon ${nearestPolygon.id} is too far (${minDistance} degrees)`);
      }
    }
    
    console.warn(`No polygon found for point: ${point.lat}, ${point.lng}`);
    return null;
  }
  
  /**
   * Check if a point is near a polygon (within buffer distance)
   */
  private isPointNearPolygon(point: {lat: number, lng: number}, polygon: {lat: number, lng: number}[], buffer: number): boolean {
    // First check if point is inside the polygon
    if (this.isPointInPolygon(point, polygon)) {
      return true;
    }
    
    // If not inside, check if it's near any edge
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const edge1 = polygon[i];
      const edge2 = polygon[j];
      
      // Check distance to this edge
      const distance = this.getDistanceToLineSegment(point, edge1, edge2);
      if (distance < buffer) {
        console.log(`Point is near edge between (${edge1.lat}, ${edge1.lng}) and (${edge2.lat}, ${edge2.lng}), distance: ${distance}`);
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Calculate distance from point to polygon
   */
  private getDistanceToPolygon(point: {lat: number, lng: number}, polygon: {lat: number, lng: number}[]): number {
    let minDistance = Number.MAX_VALUE;
    
    // Check distance to each edge
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const distance = this.getDistanceToLineSegment(point, polygon[i], polygon[j]);
      minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance;
  }
  
  /**
   * Calculate distance from point to line segment
   */
  private getDistanceToLineSegment(point: {lat: number, lng: number}, lineStart: {lat: number, lng: number}, lineEnd: {lat: number, lng: number}): number {
    const x = point.lng;
    const y = point.lat;
    const x1 = lineStart.lng;
    const y1 = lineStart.lat;
    const x2 = lineEnd.lng;
    const y2 = lineEnd.lat;
    
    // Calculate the squared length of the line segment
    const lengthSquared = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    
    // If the line segment is actually a point, just return the distance to that point
    if (lengthSquared === 0) {
      return Math.sqrt((x - x1) * (x - x1) + (y - y1) * (y - y1));
    }
    
    // Calculate the projection of the point onto the line
    const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lengthSquared));
    
    // Calculate the closest point on the line segment
    const projectionX = x1 + t * (x2 - x1);
    const projectionY = y1 + t * (y2 - y1);
    
    // Return the distance to the closest point
    return Math.sqrt((x - projectionX) * (x - projectionX) + (y - projectionY) * (y - projectionY));
  }
  
  /**
   * Check if a point is inside a polygon
   */
  private isPointInPolygon(point: {lat: number, lng: number}, polygon: {lat: number, lng: number}[]): boolean {
    // Ray casting algorithm
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng, yi = polygon[i].lat;
      const xj = polygon[j].lng, yj = polygon[j].lat;
      
      const intersect = ((yi > point.lat) !== (yj > point.lat))
          && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    
    return inside;
  }
  
  /**
   * Find the shortest path between two nodes in a graph using a modified A* algorithm
   * that navigates bridge by bridge through the correct polygons
   */
  private findShortestPath(start: string, end: string): string[] {
    console.log(`Finding shortest path from ${start} to ${end}`);
    
    // If start and end are the same, return just that node
    if (start === end) {
      console.log(`Start and end are the same (${start}), returning single-node path`);
      return [start];
    }
    
    // Build a complete graph of all polygon connections for navigation
    const completeGraph = this.buildNavigationGraph();
    
    // Use a proper A* implementation with priority queue
    // Priority queue for A* - stores nodes with their priority (f-score)
    const openSet: {id: string, fScore: number}[] = [];
    
    // Set of visited nodes
    const closedSet = new Set<string>();
    
    // For each node, which node it can most efficiently be reached from
    const cameFrom: Record<string, string | null> = {};
    
    // For each node, the cost of getting from the start node to that node
    const gScore: Record<string, number> = {};
    
    // For each node, the total cost of getting from the start node to the goal by passing through that node
    const fScore: Record<string, number> = {};
    
    // Initialize all nodes with infinity scores
    for (const node in completeGraph) {
      gScore[node] = Infinity;
      fScore[node] = Infinity;
      cameFrom[node] = null;
    }
    
    // The start node has zero distance from itself
    gScore[start] = 0;
    
    // The start node's f-score is just the heuristic distance to the end
    fScore[start] = this.heuristicDistance(start, end);
    
    // Add start node to the open set
    openSet.push({id: start, fScore: fScore[start]});
    
    // While there are nodes to explore
    while (openSet.length > 0) {
      // Sort the open set by f-score (lowest first)
      openSet.sort((a, b) => a.fScore - b.fScore);
      
      // Get the node with the lowest f-score
      const current = openSet.shift()!.id;
      console.log(`Exploring node ${current} with fScore: ${fScore[current]}`);
      
      // If we've reached the end, reconstruct and return the path
      if (current === end) {
        console.log(`Reached destination ${end}, reconstructing path`);
        return this.reconstructPath(cameFrom, current);
      }
      
      // Mark current as visited
      closedSet.add(current);
      
      // Find the current polygon
      const currentPolygon = this.polygons.find(p => p.id === current);
      if (!currentPolygon) {
        console.warn(`Polygon ${current} not found`);
        continue;
      }
      
      // Get all bridge connections from the current polygon
      let neighbors: string[] = [];
      
      // Check if the polygon has bridge points
      if (currentPolygon.bridgePoints && Array.isArray(currentPolygon.bridgePoints)) {
        // Collect all possible bridge connections
        currentPolygon.bridgePoints.forEach(bridgePoint => {
          if (bridgePoint.connection && bridgePoint.connection.targetPolygonId) {
            const targetPolygonId = bridgePoint.connection.targetPolygonId;
            
            // Skip if we've already visited this polygon
            if (closedSet.has(targetPolygonId)) {
              return;
            }
            
            // Find the target polygon
            const targetPolygon = this.polygons.find(p => p.id === targetPolygonId);
            if (!targetPolygon) {
              console.warn(`Target polygon ${targetPolygonId} not found`);
              return;
            }
            
            // Add to neighbors if not already included
            if (!neighbors.includes(targetPolygonId)) {
              neighbors.push(targetPolygonId);
            }
          }
        });
      }
      
      // If no valid bridge connections, use the complete graph for alternatives
      if (neighbors.length === 0) {
        console.log(`No bridge connections from ${current}, using graph connections`);
        neighbors = (completeGraph[current] || []).filter(n => !closedSet.has(n));
      }
      
      console.log(`Node ${current} has ${neighbors.length} neighbors: ${neighbors.join(', ')}`);
      
      // Process each neighbor
      for (const neighbor of neighbors) {
        // Calculate tentative g-score (cost from start to neighbor through current)
        // For simplicity, we're using 1 as the distance between any connected nodes
        const tentativeGScore = gScore[current] + 1;
        console.log(`Tentative gScore for ${neighbor} via ${current}: ${tentativeGScore}`);
        
        // Check if this neighbor is already in the open set
        const neighborInOpenSet = openSet.find(node => node.id === neighbor);
        
        if (!neighborInOpenSet) {
          // Discover a new node, add to open set
          console.log(`Adding new node ${neighbor} to open set`);
          openSet.push({id: neighbor, fScore: Infinity});
        } else if (tentativeGScore >= gScore[neighbor]) {
          // This is not a better path to the neighbor
          console.log(`Path to ${neighbor} via ${current} is not better than existing path`);
          continue;
        }
        
        // This path to neighbor is the best so far, record it
        cameFrom[neighbor] = current;
        gScore[neighbor] = tentativeGScore;
        fScore[neighbor] = gScore[neighbor] + this.heuristicDistance(neighbor, end);
        console.log(`Updated path to ${neighbor}: gScore=${gScore[neighbor]}, fScore=${fScore[neighbor]}, cameFrom=${current}`);
        
        // Update the f-score in the open set
        const index = openSet.findIndex(node => node.id === neighbor);
        if (index !== -1) {
          openSet[index].fScore = fScore[neighbor];
        }
      }
    }
    
    // If we get here, there's no path
    console.log(`No path found from ${start} to ${end}`);
    return [];
  }

  /**
   * Original A* implementation as a fallback
   */
  private findShortestPathAStar(start: string, end: string): string[] {
    console.log(`Finding shortest path using A* from ${start} to ${end}`);
    
    // Build a graph from the polygon bridge connections
    const graph: Record<string, string[]> = {};
    
    // Initialize the graph with empty adjacency lists
    this.polygons.forEach(polygon => {
      graph[polygon.id] = [];
    });
    
    // Add bridge connections to the graph
    console.log(`Building graph from polygon bridge connections`);
    this.polygons.forEach(polygon => {
      if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
        console.log(`Processing ${polygon.bridgePoints.length} bridge points for polygon ${polygon.id}`);
        
        polygon.bridgePoints.forEach((bridgePoint, index) => {
          if (bridgePoint.connection && bridgePoint.connection.targetPolygonId) {
            const targetPolygonId = bridgePoint.connection.targetPolygonId;
            
            // Verify that the target polygon exists
            const targetPolygon = this.polygons.find(p => p.id === targetPolygonId);
            if (!targetPolygon) {
              console.warn(`Bridge from ${polygon.id} points to non-existent polygon ${targetPolygonId}`);
              return;
            }
            
            // Add connection if not already present
            if (!graph[polygon.id].includes(targetPolygonId)) {
              graph[polygon.id].push(targetPolygonId);
              console.log(`Added connection: ${polygon.id} → ${targetPolygonId}`);
            }
          }
        });
      } else {
        console.log(`Polygon ${polygon.id} has no bridge points`);
      }
    });
    
    // Priority queue for A* - stores nodes with their priority (f-score)
    const openSet: {id: string, fScore: number}[] = [];
    
    // Set of visited nodes
    const closedSet = new Set<string>();
    
    // For each node, which node it can most efficiently be reached from
    const cameFrom: Record<string, string | null> = {};
    
    // For each node, the cost of getting from the start node to that node
    const gScore: Record<string, number> = {};
    
    // For each node, the total cost of getting from the start node to the goal by passing through that node
    const fScore: Record<string, number> = {};
    
    // Initialize all nodes with infinity scores
    for (const node in graph) {
      gScore[node] = Infinity;
      fScore[node] = Infinity;
      cameFrom[node] = null;
    }
    
    // The start node has zero distance from itself
    gScore[start] = 0;
    
    // The start node's f-score is just the heuristic distance to the end
    fScore[start] = this.heuristicDistance(start, end);
    
    // Add start node to the open set
    openSet.push({id: start, fScore: fScore[start]});
    console.log(`Starting A* search with initial node ${start}, fScore: ${fScore[start]}`);
    
    // While there are nodes to explore
    while (openSet.length > 0) {
      // Sort the open set by f-score (lowest first)
      openSet.sort((a, b) => a.fScore - b.fScore);
      
      // Get the node with the lowest f-score
      const current = openSet.shift()!.id;
      console.log(`Exploring node ${current} with gScore: ${gScore[current]}, fScore: ${fScore[current]}`);
      
      // If we've reached the end, reconstruct and return the path
      if (current === end) {
        console.log(`Reached destination ${end}, reconstructing path`);
        const path = this.reconstructPath(cameFrom, current);
        console.log(`Path found: ${path.join(' → ')}`);
        return path;
      }
      
      // Mark current as visited
      closedSet.add(current);
      console.log(`Added ${current} to closed set`);
      
      // Check all neighbors of current
      const neighbors = graph[current] || [];
      console.log(`Node ${current} has ${neighbors.length} neighbors: ${neighbors.join(', ')}`);
      
      for (const neighbor of neighbors) {
        // Skip if we've already visited this neighbor
        if (closedSet.has(neighbor)) {
          console.log(`Skipping neighbor ${neighbor} as it's already in closed set`);
          continue;
        }
        
        // Calculate tentative g-score (cost from start to neighbor through current)
        // For simplicity, we're using 1 as the distance between any connected nodes
        const tentativeGScore = gScore[current] + 1;
        console.log(`Tentative gScore for ${neighbor} via ${current}: ${tentativeGScore}`);
        
        // Check if this neighbor is already in the open set
        const neighborInOpenSet = openSet.find(node => node.id === neighbor);
        
        if (!neighborInOpenSet) {
          // Discover a new node, add to open set
          console.log(`Adding new node ${neighbor} to open set`);
          openSet.push({id: neighbor, fScore: Infinity});
        } else if (tentativeGScore >= gScore[neighbor]) {
          // This is not a better path to the neighbor
          console.log(`Path to ${neighbor} via ${current} is not better than existing path`);
          continue;
        }
        
        // This path to neighbor is the best so far, record it
        cameFrom[neighbor] = current;
        gScore[neighbor] = tentativeGScore;
        fScore[neighbor] = gScore[neighbor] + this.heuristicDistance(neighbor, end);
        console.log(`Updated path to ${neighbor}: gScore=${gScore[neighbor]}, fScore=${fScore[neighbor]}, cameFrom=${current}`);
        
        // Update the f-score in the open set
        const index = openSet.findIndex(node => node.id === neighbor);
        if (index !== -1) {
          openSet[index].fScore = fScore[neighbor];
        }
      }
    }
    
    // If we get here, there's no path
    console.log(`No path found from ${start} to ${end}`);
    return [];
  }
  
  /**
   * Calculate heuristic distance between two polygon IDs
   * This is a simple estimate of the distance between two polygons
   */
  private heuristicDistance(polygonId1: string, polygonId2: string): number {
    // Find the polygons
    const polygon1 = this.polygons.find(p => p.id === polygonId1);
    const polygon2 = this.polygons.find(p => p.id === polygonId2);
    
    // If either polygon is not found, return a large value
    if (!polygon1 || !polygon2) {
      console.log(`Heuristic: One or both polygons not found (${polygonId1}, ${polygonId2}), returning 1000`);
      return 1000;
    }
    
    // Use centroids for distance calculation
    const centroid1 = polygon1.centroid;
    const centroid2 = polygon2.centroid;
    
    // If either centroid is missing, return a default value
    if (!centroid1 || !centroid2) {
      console.log(`Heuristic: One or both centroids missing for (${polygonId1}, ${polygonId2}), returning 10`);
      return 10;
    }
    
    // Calculate Euclidean distance between centroids
    const latDiff = centroid1.lat - centroid2.lat;
    const lngDiff = centroid1.lng - centroid2.lng;
    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
    console.log(`Heuristic distance from ${polygonId1} to ${polygonId2}: ${distance.toFixed(6)}`);
    return distance;
  }
  
  /**
   * Reconstruct path from cameFrom map
   */
  private reconstructPath(cameFrom: Record<string, string | null>, current: string): string[] {
    const path = [current];
    console.log(`Reconstructing path, starting from ${current}`);
    
    while (cameFrom[current]) {
      current = cameFrom[current]!;
      console.log(`Adding ${current} to path`);
      path.unshift(current);
    }
    
    return path;
  }
  
  /**
   * Draw a direct path between two points
   */
  private drawDirectPath(start: THREE.Vector3, end: THREE.Vector3): void {
    // Create line geometry
    const lineGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      start.x, start.y + 0.15, start.z,
      end.x, end.y + 0.15, end.z
    ]);
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    
    // Create line material
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x00FF00, // Green color for direct path
      linewidth: 3
    });
    
    // Create line
    const pathLine = new THREE.Line(lineGeometry, lineMaterial);
    pathLine.renderOrder = 101;
    this.scene.add(pathLine);
    
    // Store reference for cleanup
    this.pathVisualization.push(pathLine);
  }
  
  /**
   * Visualize a path through multiple polygons with improved bridge visualization
   */
  private visualizePath(path: string[], start: {lat: number, lng: number}, end: {lat: number, lng: number}): void {
    // If path is empty, return
    if (path.length === 0) return;
    
    console.log(`Visualizing path through ${path.length} polygons: ${path.join(' → ')}`);
    
    // Create an array to store the path points
    const pathPoints: THREE.Vector3[] = [];
    
    // Add the start point
    const startPoint = this.measurementPoints[0];
    pathPoints.push(startPoint);
    
    // Get bridge information for the path using NavigationGraphService
    const navigationGraphService = NavigationGraphService.getInstance();
    const bridges = navigationGraphService.getBridgesForPath(path);
    
    console.log(`Got ${bridges.length} bridges for path visualization`);
    
    // If we have bridges, use them to create waypoints
    if (bridges.length > 0) {
      // For each bridge in the path
      bridges.forEach((bridge, index) => {
        if (bridge.isVirtual) {
          // For virtual bridges, use polygon centroids as waypoints
          this.addCentroidWaypoints(bridge.fromPolygonId, bridge.toPolygonId, pathPoints);
        } else if (bridge.sourcePoint && bridge.targetPoint) {
          // For real bridges with defined points, add them to the path
          // Add source bridge point
          const sourceCoord = normalizeCoordinates(
            [bridge.sourcePoint],
            this.bounds.centerLat,
            this.bounds.centerLng,
            this.bounds.scale,
            this.bounds.latCorrectionFactor
          )[0];
          
          const sourcePosition = new THREE.Vector3(sourceCoord.x, 0.15, -sourceCoord.y);
          pathPoints.push(sourcePosition);
          
          // Add target bridge point
          const targetCoord = normalizeCoordinates(
            [bridge.targetPoint],
            this.bounds.centerLat,
            this.bounds.centerLng,
            this.bounds.scale,
            this.bounds.latCorrectionFactor
          )[0];
          
          const targetPosition = new THREE.Vector3(targetCoord.x, 0.15, -targetCoord.y);
          pathPoints.push(targetPosition);
        } else {
          // Fallback if bridge points are missing
          this.addCentroidWaypoints(bridge.fromPolygonId, bridge.toPolygonId, pathPoints);
        }
      });
    } else {
      // If no bridges found, fall back to using centroids
      for (let i = 0; i < path.length - 1; i++) {
        this.addCentroidWaypoints(path[i], path[i+1], pathPoints);
      }
    }
    
    // Add the end point
    const endPoint = this.measurementPoints[1];
    pathPoints.push(endPoint);
    
    console.log(`Path has ${pathPoints.length} points`);
    
    // Create a smooth curve through the points
    const curve = new THREE.CatmullRomCurve3(pathPoints);
    const points = curve.getPoints(50 * pathPoints.length); // More points for smoother curve
    
    // Create line geometry
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    
    // Create line material
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x00AAFF, // Blue color for path
      linewidth: 3
    });
    
    // Create line
    const pathLine = new THREE.Line(lineGeometry, lineMaterial);
    pathLine.renderOrder = 101;
    this.scene.add(pathLine);
    
    // Store reference for cleanup
    this.pathVisualization.push(pathLine);
    
    // Add markers at bridge points
    for (let i = 1; i < pathPoints.length - 1; i++) {
      const geometry = new THREE.SphereGeometry(0.2, 16, 16);
      const material = new THREE.MeshBasicMaterial({
        color: 0xFFAA00, // Orange color for bridge points
        transparent: true,
        opacity: 0.8
      });
      
      const marker = new THREE.Mesh(geometry, material);
      marker.position.copy(pathPoints[i]);
      marker.renderOrder = 102;
      this.scene.add(marker);
      
      // Store reference for cleanup
      this.pathVisualization.push(marker);
    }
    
    // Add bridge icons at bridge points
    if (bridges.length > 0) {
      bridges.forEach((bridge, index) => {
        if (!bridge.isVirtual && bridge.sourcePoint && bridge.targetPoint) {
          // Create a visual indicator for the bridge
          this.addBridgeIcon(
            pathPoints[(index * 2) + 1], // Source bridge point
            pathPoints[(index * 2) + 2]  // Target bridge point
          );
        }
      });
    }
  }
  
  /**
   * Calculate the distance from a point to a line segment
   */
  private distanceFromPointToLine(point: THREE.Vector3, lineStart: THREE.Vector3, lineEnd: THREE.Vector3): number {
    // Create vectors
    const line = new THREE.Vector3().subVectors(lineEnd, lineStart);
    const lineLength = line.length();
    const lineDirection = line.clone().normalize();
    
    // Vector from line start to point
    const startToPoint = new THREE.Vector3().subVectors(point, lineStart);
    
    // Project startToPoint onto the line
    const projection = startToPoint.dot(lineDirection);
    
    // Clamp projection to line segment
    const clampedProjection = Math.max(0, Math.min(lineLength, projection));
    
    // Calculate the closest point on the line
    const closestPoint = new THREE.Vector3().copy(lineStart).addScaledVector(lineDirection, clampedProjection);
    
    // Return the distance from the point to the closest point on the line
    return point.distanceTo(closestPoint);
  }
  
  /**
   * Clear path visualization
   */
  private clearPathVisualization(): void {
    // Remove any existing path visualization
    if (!this.pathVisualization) {
      this.pathVisualization = [];
    }
    
    this.pathVisualization.forEach(object => {
      this.scene.remove(object);
      if (object instanceof THREE.Mesh) {
        if (object.geometry) object.geometry.dispose();
        if (object.material instanceof THREE.Material) {
          object.material.dispose();
        } else if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        }
      } else if (object instanceof THREE.Line) {
        if (object.geometry) object.geometry.dispose();
        if (object.material instanceof THREE.Material) {
          object.material.dispose();
        }
      }
    });
    
    this.pathVisualization = [];
  }
  
  /**
   * Helper method to add centroid waypoints between polygons
   */
  private addCentroidWaypoints(currentPolygonId: string, nextPolygonId: string, pathPoints: THREE.Vector3[]): void {
    // Find the polygons
    const currentPolygon = this.polygons.find(p => p.id === currentPolygonId);
    const nextPolygon = this.polygons.find(p => p.id === nextPolygonId);
    
    if (currentPolygon && currentPolygon.centroid && nextPolygon && nextPolygon.centroid) {
      console.log(`Using centroids as waypoints between ${currentPolygonId} and ${nextPolygonId}`);
      
      // Add current polygon centroid
      const currentCentroidCoord = normalizeCoordinates(
        [currentPolygon.centroid],
        this.bounds.centerLat,
        this.bounds.centerLng,
        this.bounds.scale,
        this.bounds.latCorrectionFactor
      )[0];
      
      const currentCentroidPosition = new THREE.Vector3(currentCentroidCoord.x, 0.15, -currentCentroidCoord.y);
      pathPoints.push(currentCentroidPosition);
      
      // Add next polygon centroid
      const nextCentroidCoord = normalizeCoordinates(
        [nextPolygon.centroid],
        this.bounds.centerLat,
        this.bounds.centerLng,
        this.bounds.scale,
        this.bounds.latCorrectionFactor
      )[0];
      
      const nextCentroidPosition = new THREE.Vector3(nextCentroidCoord.x, 0.15, -nextCentroidCoord.y);
      pathPoints.push(nextCentroidPosition);
    } else {
      console.warn(`Could not find centroids for polygons ${currentPolygonId} and/or ${nextPolygonId}`);
    }
  }
  
  /**
   * Check if two polygons are adjacent (share a border)
   */
  private arePolygonsAdjacent(polygon1Id: string, polygon2Id: string): boolean {
    const polygon1 = this.polygons.find(p => p.id === polygon1Id);
    const polygon2 = this.polygons.find(p => p.id === polygon2Id);
    
    if (!polygon1 || !polygon2 || !polygon1.coordinates || !polygon2.coordinates) {
      return false;
    }
    
    // Check if any edge of polygon1 is shared with any edge of polygon2
    for (let i = 0; i < polygon1.coordinates.length; i++) {
      const p1 = polygon1.coordinates[i];
      const p2 = polygon1.coordinates[(i + 1) % polygon1.coordinates.length];
      
      for (let j = 0; j < polygon2.coordinates.length; j++) {
        const q1 = polygon2.coordinates[j];
        const q2 = polygon2.coordinates[(j + 1) % polygon2.coordinates.length];
        
        // Check if the edges are the same (in either direction)
        if ((this.arePointsEqual(p1, q1) && this.arePointsEqual(p2, q2)) ||
            (this.arePointsEqual(p1, q2) && this.arePointsEqual(p2, q1))) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Check if two points are approximately equal
   */
  private arePointsEqual(p1: {lat: number, lng: number}, p2: {lat: number, lng: number}): boolean {
    const EPSILON = 1e-8; // Small threshold for floating point comparison
    return Math.abs(p1.lat - p2.lat) < EPSILON && Math.abs(p1.lng - p2.lng) < EPSILON;
  }
  
  /**
   * Find the closest points between two polygons
   */
  private findClosestPointsBetweenPolygons(polygon1Id: string, polygon2Id: string): {point1: THREE.Vector3, point2: THREE.Vector3} | null {
    const polygon1 = this.polygons.find(p => p.id === polygon1Id);
    const polygon2 = this.polygons.find(p => p.id === polygon2Id);
    
    if (!polygon1 || !polygon2 || !polygon1.coordinates || !polygon2.coordinates) {
      return null;
    }
    
    let minDistance = Infinity;
    let closestPoint1: {lat: number, lng: number} | null = null;
    let closestPoint2: {lat: number, lng: number} | null = null;
    
    // Check each pair of points from both polygons
    for (const p1 of polygon1.coordinates) {
      for (const p2 of polygon2.coordinates) {
        const distance = this.calculateDistanceBetweenPoints(p1, p2);
        
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint1 = p1;
          closestPoint2 = p2;
        }
      }
    }
    
    if (closestPoint1 && closestPoint2) {
      // Convert to normalized coordinates
      const normalizedPoint1 = normalizeCoordinates(
        [closestPoint1],
        this.bounds.centerLat,
        this.bounds.centerLng,
        this.bounds.scale,
        this.bounds.latCorrectionFactor
      )[0];
      
      const normalizedPoint2 = normalizeCoordinates(
        [closestPoint2],
        this.bounds.centerLat,
        this.bounds.centerLng,
        this.bounds.scale,
        this.bounds.latCorrectionFactor
      )[0];
      
      // Create 3D points
      const point1 = new THREE.Vector3(normalizedPoint1.x, 0.15, -normalizedPoint1.y);
      const point2 = new THREE.Vector3(normalizedPoint2.x, 0.15, -normalizedPoint2.y);
      
      return { point1, point2 };
    }
    
    return null;
  }

  /**
   * Load citizen data from the API
   */
  public async loadCitizens(): Promise<void> {
    try {
      console.log('Loading citizens data...');
      const response = await fetch('/api/citizens');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch citizens: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      this.citizenData = data;
      
      console.log(`Loaded ${this.citizenData.length} citizens`);
      
      // If we're in citizens view, create the markers
      if (this.activeView === 'citizens') {
        this.createCitizenMarkers();
      }
      
      // Emit event that citizens data is loaded
      eventBus.emit('CITIZENS_LOADED', { 
        count: this.citizenData.length,
        citizens: this.citizenData
      });
    } catch (error) {
      console.error('Error loading citizens data:', error);
      // Show error notification
      if (typeof window !== 'undefined') {
        const errorNotification = document.createElement('div');
        errorNotification.textContent = 'Failed to load citizens data';
        errorNotification.style.position = 'fixed';
        errorNotification.style.bottom = '20px';
        errorNotification.style.right = '20px';
        errorNotification.style.backgroundColor = 'rgba(220, 38, 38, 0.9)';
        errorNotification.style.color = 'white';
        errorNotification.style.padding = '10px 20px';
        errorNotification.style.borderRadius = '4px';
        errorNotification.style.zIndex = '9999';
        
        document.body.appendChild(errorNotification);
        
        setTimeout(() => {
          document.body.removeChild(errorNotification);
        }, 3000);
      }
    }
  }

  /**
   * Create citizen markers on the map
   */
  private createCitizenMarkers(): void {
    // Clear existing markers first
    this.clearCitizenMarkers();
    
    console.log(`Creating markers for ${this.citizenData.length} citizens`);
    
    // Process each citizen
    this.citizenData.forEach(citizen => {
      try {
        // Skip citizens without a home building
        if (!citizen.Home) {
          console.warn(`Citizen ${citizen.CitizenId} has no home building`);
          return;
        }
        
        // Find the building position
        const buildingPosition = this.findBuildingPosition(citizen.Home);
        
        if (!buildingPosition) {
          console.warn(`Could not find position for building ${citizen.Home}`);
          return;
        }
        
        // Create a circular sprite for the citizen
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.warn('Could not get canvas context');
          return;
        }
        
        // Draw citizen icon with improved styling
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
        
        // Create gradient fill based on social class
        const baseColor = this.getSocialClassColor(citizen.SocialClass);
        const gradient = ctx.createRadialGradient(
          size/2, size/2 - 10, 0,
          size/2, size/2, size/2 - 4
        );
        gradient.addColorStop(0, this.lightenColor(baseColor, 30));
        gradient.addColorStop(1, baseColor);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Add border with glow effect
        ctx.shadowColor = this.lightenColor(baseColor, 50);
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Reset shadow for text
        ctx.shadowBlur = 0;
        
        // Add initials with improved styling
        ctx.font = 'bold 48px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Add text shadow for better readability
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        
        ctx.fillText(`${citizen.FirstName.charAt(0)}${citizen.LastName.charAt(0)}`, size/2, size/2);
        
        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        
        // Create sprite material
        const spriteMaterial = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthTest: true,
          depthWrite: false
        });
        
        // Create sprite
        const sprite = new THREE.Sprite(spriteMaterial);
        
        // Position sprite at building position, slightly elevated and with random offset
        const randomOffset = new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          0,
          (Math.random() - 0.5) * 0.5
        );
        sprite.position.set(
          buildingPosition.x + randomOffset.x, 
          buildingPosition.y + 2, 
          buildingPosition.z + randomOffset.z
        );
        
        // Scale sprite based on social class
        const scaleMultiplier = this.getSocialClassScaleMultiplier(citizen.SocialClass);
        sprite.scale.set(scaleMultiplier, scaleMultiplier, 1);
        
        // Add metadata
        sprite.userData = {
          type: 'citizen',
          citizenId: citizen.CitizenId,
          data: citizen
        };
        
        // Add to scene
        this.scene.add(sprite);
        
        // Store reference
        this.citizenMarkers.push(sprite);
        
        console.log(`Created marker for citizen ${citizen.CitizenId} at position ${buildingPosition.x}, ${buildingPosition.y}, ${buildingPosition.z}`);
      } catch (error) {
        console.error(`Error creating marker for citizen ${citizen.CitizenId}:`, error);
      }
    });
    
    console.log(`Created ${this.citizenMarkers.length} citizen markers`);
    
    // Add floating animation to citizen markers
    this.animateCitizenMarkers();
  }
  
  /**
   * Helper method to lighten a color
   */
  private lightenColor(color: string, percent: number): string {
    // Convert hex to RGB
    let r = parseInt(color.substring(1, 3), 16);
    let g = parseInt(color.substring(3, 5), 16);
    let b = parseInt(color.substring(5, 7), 16);
    
    // Lighten
    r = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)));
    g = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)));
    b = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)));
    
    // Convert back to hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  
  /**
   * Get scale multiplier based on social class
   */
  private getSocialClassScaleMultiplier(socialClass: string): number {
    switch (socialClass.toLowerCase()) {
      case 'nobili':
        return 1.2; // Larger for nobility
      case 'cittadini':
        return 1.1; // Slightly larger for citizens
      case 'popolani':
        return 1.0; // Normal size for common people
      case 'facchini':
        return 0.9; // Smaller for laborers
      default:
        return 1.0;
    }
  }
  
  /**
   * Add floating animation to citizen markers
   */
  private animateCitizenMarkers(): void {
    // Store initial positions
    this.citizenMarkers.forEach(marker => {
      marker.userData.initialY = marker.position.y;
      marker.userData.animationOffset = Math.random() * Math.PI * 2; // Random phase offset
    });
    
    // Create animation function
    const animate = () => {
      const time = performance.now() * 0.001; // Convert to seconds
      
      this.citizenMarkers.forEach(marker => {
        if (marker.userData.initialY) {
          // Simple sine wave floating animation
          const offset = Math.sin(time + marker.userData.animationOffset) * 0.2;
          marker.position.y = marker.userData.initialY + offset;
          
          // Also add slight rotation
          marker.rotation.z = Math.sin(time * 0.5 + marker.userData.animationOffset) * 0.1;
        }
      });
      
      // Continue animation if we still have citizen markers
      if (this.citizenMarkers.length > 0) {
        requestAnimationFrame(animate);
      }
    };
    
    // Start animation
    animate();
  }

  /**
   * Find building position by ID
   */
  private findBuildingPosition(buildingId: string): THREE.Vector3 | null {
    // First try to find the building in the building point markers
    for (const marker of this.buildingPointMarkers) {
      if (marker.userData && marker.userData.id === buildingId) {
        return marker.position.clone();
      }
    }
    
    // If not found, try to find in the polygons (assuming buildings are placed on polygons)
    for (const polygon of this.polygons) {
      if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
        for (let i = 0; i < polygon.buildingPoints.length; i++) {
          const buildingPoint = polygon.buildingPoints[i];
          // Check if this building point has the ID we're looking for
          if (buildingPoint.id === buildingId || buildingPoint.buildingId === buildingId) {
            // Convert to normalized coordinates
            const normalizedCoord = normalizeCoordinates(
              [buildingPoint],
              this.bounds.centerLat,
              this.bounds.centerLng,
              this.bounds.scale,
              this.bounds.latCorrectionFactor
            )[0];
            
            return new THREE.Vector3(normalizedCoord.x, 0.2, -normalizedCoord.y);
          }
        }
      }
    }
    
    // If still not found, use a random position on a random polygon as fallback
    if (this.polygons.length > 0) {
      const randomPolygon = this.polygons[Math.floor(Math.random() * this.polygons.length)];
      if (randomPolygon.centroid) {
        const normalizedCoord = normalizeCoordinates(
          [randomPolygon.centroid],
          this.bounds.centerLat,
          this.bounds.centerLng,
          this.bounds.scale,
          this.bounds.latCorrectionFactor
        )[0];
        
        return new THREE.Vector3(normalizedCoord.x, 0.2, -normalizedCoord.y);
      }
    }
    
    // If all else fails, return null
    return null;
  }

  /**
   * Get color based on social class
   */
  private getSocialClassColor(socialClass: string): string {
    switch (socialClass.toLowerCase()) {
      case 'nobili':
        return '#DAA520'; // Darker gold for better contrast
      case 'cittadini':
        return '#1E5799'; // Darker blue for better contrast
      case 'popolani':
        return '#8B4513'; // Saddle Brown
      case 'facchini':
        return '#556B2F'; // Darker green-gray for laborers
      default:
        return '#A0522D'; // Sienna (default)
    }
  }

  /**
   * Clear citizen markers
   */
  private clearCitizenMarkers(): void {
    this.citizenMarkers.forEach(marker => {
      this.scene.remove(marker);
      if (marker instanceof THREE.Sprite && marker.material) {
        if (marker.material instanceof THREE.SpriteMaterial && marker.material.map) {
          marker.material.map.dispose();
        }
        marker.material.dispose();
      }
    });
    
    this.citizenMarkers = [];
    this.hoveredCitizenId = null;
    this.selectedCitizenId = null;
  }
}
