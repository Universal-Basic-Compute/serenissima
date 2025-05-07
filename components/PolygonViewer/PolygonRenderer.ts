/**
 * Polygon renderer using facade pattern to hide Three.js complexity
 * - Implements clean interface for polygon rendering
 * - Separates rendering logic from data management
 * - Provides robust error handling with graceful degradation
 * - Implements fallback rendering modes for critical failures
 */
import * as THREE from 'three';
import { MutableRefObject } from 'react';
import { Polygon, ViewMode, Coordinate } from './types';
import { normalizeCoordinates } from './utils';
import { PolygonRendererFacade } from '../../lib/threejs/PolygonRendererFacade';
import { PolygonMeshFacade } from '../../lib/threejs/PolygonMeshFacade';
import { log } from '../../lib/logUtils';
import { 
  RenderingErrorHandler, 
  RenderingErrorType, 
  withErrorHandling 
} from '../../lib/errorHandling';

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
  private ownerCoatOfArmsMap: Record<string, string> = {}; // Map of owner to coat of arms URL
  public hasUpdatedCoatOfArms: boolean = false; // Flag to track if coat of arms have been updated
  private coatOfArmSprites: Record<string, THREE.Object3D | THREE.Mesh> = {};
  private ownerColorMap: Record<string, string> = {}; // Map of owner to color
  private users: Record<string, any> = {}; // Store users data
  private polygonMeshes: PolygonMeshFacade[] = []; // Store PolygonMesh instances
  private createdPolygonIds = new Set<string>();
  
  // Static properties for texture loading
  private static sharedTextureLoader: THREE.TextureLoader | null = null;
  private textureLoader: THREE.TextureLoader;
  private sandNormalMap: THREE.Texture | null = null;
  private sandRoughnessMap: THREE.Texture | null = null;
  
  // Facade for Three.js operations
  private facade: PolygonRendererFacade;
  
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
        (fullTexture: THREE.Texture) => {
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
        (error: unknown) => {
          console.error(`Error loading optimized texture ${optimizedUrl}:`, error);
        }
      );
    }
    
    return placeholderTexture;
  }
  
  // Add sun reflection property
  private sunReflection: THREE.Mesh | null = null;

  // Error handler instance
  private errorHandler: RenderingErrorHandler;
  
  // Track rendering failures for recovery attempts
  private failedPolygons: Set<string> = new Set();
  private recoveryAttemptScheduled: boolean = false;
  private readonly RECOVERY_INTERVAL = 5000; // 5 seconds between recovery attempts
  
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
    
    // Initialize texture loader
    this.textureLoader = new THREE.TextureLoader();
    
    // Initialize error handler
    this.errorHandler = RenderingErrorHandler.getInstance();
    
    // Initialize the facade with error handling
    this.facade = withErrorHandling(
      () => new PolygonRendererFacade(scene),
      RenderingErrorType.SCENE_MANIPULATION,
      'polygon-renderer-facade',
      () => {
        log.warn('Failed to create PolygonRendererFacade, using minimal fallback');
        return new PolygonRendererFacade(scene);
      }
    ) || new PolygonRendererFacade(scene);
    
    // Store users data
    this.users = users || {};
    
    // Process users data to create coat of arms map and color map
    if (users) {
      try {
        // Debug log for ConsiglioDeiDieci specifically
        if (users['ConsiglioDeiDieci']) {
          log.debug('ConsiglioDeiDieci user data in PolygonRenderer:', users['ConsiglioDeiDieci']);
          log.debug('ConsiglioDeiDieci color in PolygonRenderer:', users['ConsiglioDeiDieci'].color);
        } else {
          // If ConsiglioDeiDieci is missing, add it with default values
          log.warn('ConsiglioDeiDieci not found in users data! Adding default entry in PolygonRenderer.');
          this.users['ConsiglioDeiDieci'] = {
            user_name: 'ConsiglioDeiDieci',
            color: '#8B0000', // Dark red
            coat_of_arms_image: null
          };
        }
        
        // Process user data once
        this.processUserData(users);
        
        // Always ensure ConsiglioDeiDieci has a color
        if (!this.ownerColorMap['ConsiglioDeiDieci']) {
          this.ownerColorMap['ConsiglioDeiDieci'] = '#8B0000'; // Dark red
          log.debug('Added missing ConsiglioDeiDieci color in PolygonRenderer');
        }
      } catch (error) {
        log.error('Error processing user data:', error);
        // Ensure ConsiglioDeiDieci exists even if user processing fails
        this.ownerColorMap['ConsiglioDeiDieci'] = '#8B0000'; // Dark red
      }
    }
    
    // Render polygons with a slight delay to allow the UI to render first
    setTimeout(() => this.renderPolygons(), 0);
    
    // Schedule periodic recovery attempts for failed polygons
    this.scheduleRecoveryAttempts();
  }
  
  /**
   * Schedule periodic recovery attempts for failed polygons
   */
  private scheduleRecoveryAttempts(): void {
    if (this.recoveryAttemptScheduled) return;
    
    this.recoveryAttemptScheduled = true;
    
    const attemptRecovery = () => {
      if (this.failedPolygons.size > 0) {
        log.info(`Attempting recovery for ${this.failedPolygons.size} failed polygons`);
        
        // Copy the set to avoid modification during iteration
        const failedPolygonIds = Array.from(this.failedPolygons);
        
        // Clear the set before attempting recovery
        this.failedPolygons.clear();
        
        // Attempt to render each failed polygon
        failedPolygonIds.forEach(polygonId => {
          const polygon = this.polygons.find(p => p.id === polygonId);
          if (polygon) {
            this.renderSinglePolygon(polygon, true);
          }
        });
      }
      
      // Schedule next recovery attempt if we're still active
      if (this.scene) {
        setTimeout(attemptRecovery, this.RECOVERY_INTERVAL);
      } else {
        this.recoveryAttemptScheduled = false;
      }
    };
    
    // Start the recovery loop
    setTimeout(attemptRecovery, this.RECOVERY_INTERVAL);
  }
  
  /**
   * Process user data to extract colors and coat of arms
   */
  private processUserData(users: Record<string, any>): void {
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
      console.log('Added missing ConsiglioDeiDieci color in processUserData');
    }
    
    console.log(`Processed ${Object.keys(this.ownerCoatOfArmsMap).length} coat of arms and ${Object.keys(this.ownerColorMap).length} colors from users data`);
  }

  private renderPolygons() {
    log.info(`Rendering ${this.polygons.length} polygons`);
    
    // Get a standard material from the facade with error handling
    const sandMaterial = withErrorHandling(
      () => this.facade.createLandMaterial(),
      RenderingErrorType.MATERIAL_CREATION,
      'sand-material',
      () => {
        // Create a fallback material with texture
        const fallbackMaterial = this.errorHandler.createFallbackMaterial('#fff5d0');
        
        // Try to load a texture for the fallback material
        try {
          const textureLoader = new THREE.TextureLoader();
          textureLoader.load('/textures/sand.jpg', (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(5, 5);
            fallbackMaterial.map = texture;
            fallbackMaterial.needsUpdate = true;
          });
        } catch (e) {
          console.error('Failed to load texture for fallback material:', e);
        }
        
        return fallbackMaterial;
      }
    );
    
    // Track success and failure counts
    let successCount = 0;
    let failureCount = 0;
    
    // Process each polygon
    this.polygons.forEach(polygon => {
      // Skip if already created
      if (this.createdPolygonIds.has(polygon.id)) {
        return;
      }
      
      const success = this.renderSinglePolygon(polygon);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    });
    
    log.info(`Created ${this.polygonMeshes.length} polygon meshes (${successCount} successful, ${failureCount} failed)`);
    
    // If we're in fallback mode, create a simple representation of the map
    if (this.errorHandler.isInFallbackMode() && this.polygonMeshes.length < this.polygons.length * 0.5) {
      log.warn('In fallback mode with less than 50% of polygons rendered, creating simplified map representation');
      this.createSimplifiedMapRepresentation();
    }
    
    // Start a periodic check to ensure polygons remain visible
    const visibilityInterval = setInterval(() => {
      if (!this.scene) {
        // Clean up interval if scene is gone
        clearInterval(visibilityInterval);
        return;
      }
      this.ensurePolygonsVisible();
    }, 1000);
  }
  
  /**
   * Render a single polygon with error handling
   * @param polygon The polygon to render
   * @param isRecoveryAttempt Whether this is a recovery attempt for a previously failed polygon
   * @returns Whether rendering was successful
   */
  private renderSinglePolygon(polygon: Polygon, isRecoveryAttempt: boolean = false): boolean {
    if (!polygon.id) {
      log.warn('Polygon missing ID, cannot render');
      return false;
    }
    
    return withErrorHandling(
      () => {
        if (!polygon.coordinates || polygon.coordinates.length < 3) {
          log.warn(`Invalid polygon coordinates for ${polygon.id}`);
          return false;
        }
        
        // Get owner color if available
        let ownerColor = null;
        if (polygon.owner) {
          ownerColor = this.getOwnerColor(polygon.owner);
        }
        
        // Get owner coat of arms if available
        let ownerCoatOfArmsUrl = null;
        if (polygon.owner && polygon.owner in this.ownerCoatOfArmsMap) {
          ownerCoatOfArmsUrl = this.ownerCoatOfArmsMap[polygon.owner];
        }
        
        // Create a PolygonMeshFacade instance
        const polygonMesh = new PolygonMeshFacade(
          this.scene,
          polygon,
          this.bounds,
          this.activeView,
          this.performanceMode,
          this.textureLoader,
          ownerColor,
          ownerCoatOfArmsUrl
        );
        
        const mesh = polygonMesh.getMesh();
        
        if (mesh) {
          // Store reference in the ref object
          this.polygonMeshesRef.current[polygon.id] = mesh;
          
          // Mark as created
          this.createdPolygonIds.add(polygon.id);
          
          // Store reference to the facade
          this.polygonMeshes.push(polygonMesh);
          
          // If this was a recovery attempt, log success
          if (isRecoveryAttempt) {
            log.info(`Successfully recovered polygon ${polygon.id}`);
          }
          
          return true;
        }
        
        return false;
      },
      RenderingErrorType.MESH_CREATION,
      polygon.id,
      () => {
        // Fallback: create a simplified representation for this polygon
        if (polygon.centroid) {
          this.createSimplifiedPolygonRepresentation(polygon);
          return true;
        }
        
        // If we couldn't create even a simplified representation, mark for recovery
        this.failedPolygons.add(polygon.id);
        return false;
      }
    ) || false;
  }
  
  /**
   * Create a simplified representation of a polygon when normal rendering fails
   */
  private createSimplifiedPolygonRepresentation(polygon: Polygon): void {
    try {
      if (!polygon.centroid) return;
      
      // Convert centroid to 3D position
      const normalizedCoord = normalizeCoordinates(
        [polygon.centroid],
        this.bounds.centerLat,
        this.bounds.centerLng,
        this.bounds.scale,
        this.bounds.latCorrectionFactor
      )[0];
      
      // Create a simple marker at the centroid
      const geometry = new THREE.CircleGeometry(0.3, 8); // Simplified geometry
      const material = new THREE.MeshBasicMaterial({
        color: polygon.owner && typeof polygon.owner === 'string' ? this.getOwnerColor(polygon.owner as string) || '#FFF5D0' : '#FFF5D0', // Lighter, more yellow
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
        wireframe: true
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(normalizedCoord.x, 0.05, normalizedCoord.y);
      mesh.rotation.x = -Math.PI / 2; // Flat on the ground
      
      // Add to scene
      this.scene.add(mesh);
      
      // Store reference
      this.polygonMeshesRef.current[polygon.id] = mesh;
      
      // Create a simplified PolygonMeshFacade wrapper for this mesh
      const simplifiedFacade = {
        getMesh: () => mesh,
        updateViewMode: () => {},
        updateOwner: () => {},
        updateCoatOfArmsTexture: () => {},
        updateSelectionState: (isSelected: boolean) => {
          if (isSelected && material.color) {
            material.color.set('#FFFF00'); // Yellow for selection
          } else if (material.color) {
            material.color.set(polygon.owner ? this.getOwnerColor(polygon.owner) || '#FF00FF' : '#FF00FF');
          }
        },
        updateHoverState: (isHovered: boolean) => {
          if (isHovered && material.color) {
            material.color.set('#00FFFF'); // Cyan for hover
          } else if (material.color) {
            material.color.set(polygon.owner ? this.getOwnerColor(polygon.owner) || '#FF00FF' : '#FF00FF');
          }
        },
        updateQuality: () => {},
        cleanup: () => {
          this.scene.remove(mesh);
          geometry.dispose();
          material.dispose();
        },
        configure: () => {},
        reset: () => {},
        isActive: () => true,
        setActive: () => {}
      };
      
      // Add to our collection
      this.polygonMeshes.push(simplifiedFacade as PolygonMeshFacade);
      this.createdPolygonIds.add(polygon.id);
      
      log.info(`Created simplified representation for polygon ${polygon.id}`);
    } catch (error) {
      log.error(`Failed to create simplified representation for polygon ${polygon.id}:`, error);
      this.failedPolygons.add(polygon.id);
    }
  }
  
  /**
   * Create a simplified representation of the entire map when critical rendering fails
   */
  private createSimplifiedMapRepresentation(): void {
    log.info('Creating simplified map representation');
    
    try {
      // Create a simple plane to represent the map
      const geometry = new THREE.PlaneGeometry(20, 20);
      const material = new THREE.MeshBasicMaterial({
        color: 0x3366cc, // Blue for water
        side: THREE.DoubleSide
      });
      
      const mapPlane = new THREE.Mesh(geometry, material);
      mapPlane.rotation.x = -Math.PI / 2; // Flat on the ground
      mapPlane.position.y = -0.1; // Slightly below other elements
      
      // Add to scene
      this.scene.add(mapPlane);
      
      // Create simplified markers for each polygon with a centroid
      this.polygons.forEach(polygon => {
        if (polygon.centroid && !this.createdPolygonIds.has(polygon.id)) {
          this.createSimplifiedPolygonRepresentation(polygon);
        }
      });
      
      log.info('Simplified map representation created');
    } catch (error) {
      log.error('Failed to create simplified map representation:', error);
    }
  }
  
  /**
   * Get the color for an owner with error handling
   */
  private getOwnerColor(owner: string | undefined): string | null {
    if (!owner) return null;
    return withErrorHandling(
      () => {
        if (this.ownerColorMap[owner]) {
          return this.ownerColorMap[owner];
        } else if (owner && owner in this.users && this.users[owner] && this.users[owner].color) {
          const color = this.users[owner].color;
          // Cache for future use
          this.ownerColorMap[owner] = color;
          return color;
        } else if (owner === 'ConsiglioDeiDieci') {
          // Special case for ConsiglioDeiDieci
          return '#8B0000'; // Dark red
        }
        
        // Default color
        return '#7cac6a'; // Default green color
      },
      RenderingErrorType.UNKNOWN,
      `owner-color-${owner}`,
      () => {
        // Fallback colors based on owner name hash
        if (owner === 'ConsiglioDeiDieci') return '#8B0000';
        
        // Generate a deterministic color from the owner string
        let hash = 0;
        if (owner) {
          for (let i = 0; i < owner.length; i++) {
            hash = owner.charCodeAt(i) + ((hash << 5) - hash);
          }
        }
        
        // Convert to hex color
        let color = '#';
        for (let i = 0; i < 3; i++) {
          const value = (hash >> (i * 8)) & 0xFF;
          color += ('00' + value.toString(16)).substr(-2);
        }
        
        return color;
      }
    ) || '#7cac6a'; // Default green color as final fallback
  }
  
  private createSamplePolygon() {
    console.log('Creating sample polygon for testing');
    
    // Create a simple sample polygon for testing visibility
    const sampleCoordinates = [
      { lat: 45.4371, lng: 12.3345 },
      { lat: 45.4381, lng: 12.3355 },
      { lat: 45.4391, lng: 12.3345 },
      { lat: 45.4381, lng: 12.3335 }
    ];
    
    const samplePolygon = {
      id: 'sample-test-polygon',
      coordinates: sampleCoordinates,
      centroid: { lat: 45.4381, lng: 12.3345 }
    };
    
    // Create a material with sand texture
    const sandMaterial = new THREE.MeshStandardMaterial({
      map: this.facade.getSandTexture(),
      normalMap: this.facade.getSandNormalMap(),
      roughnessMap: this.facade.getSandRoughnessMap(),
      color: 0xf5e9c8, // Sand color
      side: THREE.DoubleSide,
      transparent: false,
      roughness: 0.8,
      metalness: 0.1
    });
    
    // Create a polygon mesh for the sample
    const polygonMesh = new PolygonMeshFacade(
      this.scene,
      samplePolygon,
      this.bounds,
      this.activeView,
      this.performanceMode,
      this.textureLoader,
      '#FF0000', // Bright red for visibility
      null
    );
    
    // Store reference to the mesh
    this.polygonMeshes.push(polygonMesh);
    
    console.log('Sample test polygon created for visibility testing');
  }
  
  public update(selectedPolygonId: string | null = null) {
    // Ensure all polygons are visible
    this.ensurePolygonsVisible();
    
    // Update selection state
    this.updateSelectionState(selectedPolygonId);
  }
  
  /**
   * Ensure all polygons are visible
   */
  public ensurePolygonsVisible() {
    // Check all polygon meshes
    this.polygonMeshes.forEach(polygonMesh => {
      const mesh = polygonMesh.getMesh();
      if (mesh) {
        // Force visibility
        mesh.visible = true;
        
        // Force material update
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => {
              if (mat) mat.needsUpdate = true;
            });
          } else {
            mesh.material.needsUpdate = true;
          }
        }
      }
    });
    
    // Also check the direct references in polygonMeshesRef
    Object.values(this.polygonMeshesRef.current).forEach(mesh => {
      if (mesh) {
        mesh.visible = true;
      }
    });
    
    // Force a render to apply changes
    this.facade.forceRender();
  }
  
  /**
   * Update selection state for polygons
   */
  public updateSelectionState(selectedPolygonId: string | null) {
    // Update selection state for all polygons
    this.polygonMeshes.forEach(polygonMesh => {
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
  
  /**
   * Update view mode for all polygons
   */
  public updateViewMode(activeView: ViewMode) {
    // Skip update if view hasn't changed
    if (this.activeView === activeView) {
      console.log(`View mode ${activeView} already active, skipping update`);
      return;
    }
    
    this.activeView = activeView;
    
    // Update all polygons with the new view mode
    this.polygonMeshes.forEach(polygonMesh => {
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
    
    // Ensure all polygons remain visible after view mode change
    setTimeout(() => this.ensurePolygonsVisible(), 100);
    
    console.log(`View mode updated to ${activeView}, coat of arms sprites updated`);
  }
  
  /**
   * Update colors for all polygons based on simulated income
   */
  public updatePolygonOwnerColors() {
    console.log('Updating polygon colors based on simulated income');
    
    // Process all polygons
    this.polygons.forEach(polygon => {
      if (polygon.id) {
        // Find the corresponding PolygonMesh
        const polygonMesh = this.polygonMeshes.find(pm => {
          const mesh = pm.getMesh();
          return mesh && this.polygonMeshesRef.current[polygon.id] === mesh;
        });
        
        if (polygonMesh) {
          // Update the polygon with its own data (which includes simulatedIncome)
          polygonMesh.updateOwner(polygon.owner || '', null);
          
          // If we're in land view, force a view mode update to ensure income-based coloring
          if (this.activeView === 'land') {
            polygonMesh.updateViewMode(this.activeView);
          }
        }
      }
    });
    
    // Force a render to apply changes
    this.facade.forceRender();
  }

  /**
   * Update quality settings for all polygons
   */
  public updateQuality(performanceMode: boolean) {
    this.performanceMode = performanceMode;
    
    // Update all polygons with the new quality setting
    this.polygonMeshes.forEach(polygonMesh => {
      polygonMesh.updateQuality(performanceMode);
    });
  }
  
  /**
   * Update coat of arms for owners
   */
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
    
    // If we're in land view, update the owner indicators
    if (this.activeView === 'land') {
      // In land view, we'll just update the colored circles
      this.updateCoatOfArmsSprites();
    }
    
    // Set the flag to indicate we've updated coat of arms
    this.hasUpdatedCoatOfArms = true;
  }
  
  /**
   * Update colors for owners - now does nothing as we only use income-based coloring
   */
  public updateOwnerColors(colorMap: Record<string, string>) {
    // This method no longer needs to do anything
    console.log('Owner colors are no longer used, income-based coloring only');
  }
  
  // This method is replaced by createColoredCircleOnLand

  /**
   * Update coat of arms sprites for all polygons with error handling
   */
  public updateCoatOfArmsSprites() {
    log.info('Updating coat of arms sprites, active view:', this.activeView);
    
    // Remove existing coat of arms objects with error handling
    withErrorHandling(
      () => {
        Object.values(this.coatOfArmSprites).forEach(obj => {
          try {
            this.facade.removeFromScene(obj);
            if (obj instanceof THREE.Mesh) {
              if (obj.geometry) obj.geometry.dispose();
              if (obj.material) {
                if (Array.isArray(obj.material)) {
                  obj.material.forEach((mat: THREE.Material) => {
                    try {
                      // Check if material has a map property (like MeshBasicMaterial or MeshStandardMaterial)
                      if ('map' in mat && (mat as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial).map) {
                        (mat as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial).map?.dispose();
                      }
                      mat.dispose();
                    } catch (matError) {
                      log.error('Error disposing material:', matError);
                    }
                  });
                } else {
                  try {
                    // Check if material has a map property
                    if ('map' in obj.material && (obj.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial).map) {
                      (obj.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial).map?.dispose();
                    }
                    obj.material.dispose();
                  } catch (matError) {
                    log.error('Error disposing material:', matError);
                  }
                }
              }
            }
          } catch (objError) {
            log.error('Error removing coat of arms object:', objError);
          }
        });
        this.coatOfArmSprites = {};
      },
      RenderingErrorType.RESOURCE_DISPOSAL,
      'coat-of-arms-sprites'
    );

    // Only create coat of arms if we're in land view
    if (this.activeView !== 'land') {
      log.info('Not in land view, skipping coat of arms textures');
      return;
    }

    // In land view, we'll use colored circles instead of textures
    log.info('Creating colored indicators for land view, polygons count:', this.polygons.length);
    
    // Track success and failure counts
    let successCount = 0;
    let failureCount = 0;
    
    // Process each polygon with an owner
    this.polygons.forEach(polygon => {
      if (!polygon.owner || !polygon.id || !polygon.centroid) return;
      
      const success = withErrorHandling(
        () => {
          log.debug(`Processing polygon ${polygon.id} with owner ${polygon.owner}`);
          
          // Get the owner's color
          const ownerColor = this.getOwnerColor(polygon.owner);
          
          // Create a colored circle on the land - no texture loading
          if (polygon.centroid) {
            this.createColoredCircleOnLand(polygon, ownerColor || '#8B4513');
            return true;
          }
          
          return false;
        },
        RenderingErrorType.MESH_CREATION,
        polygon.id,
        () => {
          // Fallback: just create a colored circle if creation fails
          if (polygon.centroid) {
            const ownerColor = this.getOwnerColor(polygon.owner);
            this.createColoredCircleOnLand(polygon, ownerColor || '#8B4513');
            return true;
          }
          return false;
        }
      );
      
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    });
    
    log.info(`Updated owner indicators: ${successCount} successful, ${failureCount} failed`);
    
    // Force a render to apply the changes with error handling
    withErrorHandling(
      () => this.facade.forceRender(),
      RenderingErrorType.SCENE_MANIPULATION,
      'force-render'
    );
  }

  // Helper method to create a flat texture on the land for a polygon - disabled
  private createFlatTextureForPolygon(polygon: Polygon, texture: THREE.Texture) {
    console.log('createFlatTextureForPolygon is disabled - using colored circles instead');
    // Instead of creating a texture, create a colored circle
    if (polygon.centroid && polygon.id) {
      const ownerColor = polygon.owner ? this.getOwnerColor(polygon.owner) : '#8B4513';
      this.createColoredCircleOnLand(polygon, ownerColor);
    }
  }
  
  // Helper function to create a circular texture - disabled
  private createCircularTexture(texture: THREE.Texture): THREE.Texture {
    console.log('createCircularTexture is disabled - using colored circles instead');
    
    // We're not using textures at all in land view, so this is a no-op
    return texture;
  }
  
  /**
   * Create a colored circle on the land for a polygon with error handling
   */
  private createColoredCircleOnLand(polygon: Polygon, color: string) {
    if (!polygon.centroid || !polygon.id) {
      log.warn(`Cannot create colored circle for polygon ${polygon.id || 'unknown'} - no centroid`);
      return;
    }
    
    // Ensure centroid is not undefined before using it
    const centroid: Coordinate = polygon.centroid as Coordinate;
    
    withErrorHandling(
      () => {
        // Convert centroid to 3D position
        const normalizedCoord = normalizeCoordinates(
          [centroid],
          this.bounds.centerLat,
          this.bounds.centerLng,
          this.bounds.scale,
          this.bounds.latCorrectionFactor
        )[0];
        
        // Create a simple circle geometry
        const circleGeometry = new THREE.CircleGeometry(0.25, 16);
        const circleMaterial = new THREE.MeshBasicMaterial({
          color: color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
          depthWrite: false
        });
        
        // Create mesh and position it
        const circleMesh = new THREE.Mesh(circleGeometry, circleMaterial);
        circleMesh.position.set(normalizedCoord.x, 0.05, normalizedCoord.y);
        circleMesh.rotation.x = -Math.PI / 2; // Rotate to lie flat
        circleMesh.renderOrder = 100; // Ensure it renders on top
        
        // Add to scene
        this.scene.add(circleMesh);
        
        // Store reference
        this.coatOfArmSprites[polygon.id] = circleMesh;
        
        log.debug(`Created colored circle for polygon ${polygon.id} at position:`, normalizedCoord);
      },
      RenderingErrorType.MESH_CREATION,
      polygon.id,
      () => {
        // Fallback: create an even simpler representation
        try {
          // Convert centroid to 3D position
          const centerPoint = polygon.coatOfArmsCenter || polygon.centroid;
          const normalizedCoord = normalizeCoordinates(
            [centerPoint as Coordinate],
            this.bounds.centerLat,
            this.bounds.centerLng,
            this.bounds.scale,
            this.bounds.latCorrectionFactor
          )[0];
          
          // Create a simple box as fallback
          const geometry = new THREE.BoxGeometry(0.3, 0.1, 0.3);
          const material = new THREE.MeshBasicMaterial({ 
            color: color,
            wireframe: true
          });
          
          const boxMesh = new THREE.Mesh(geometry, material);
          boxMesh.position.set(normalizedCoord.x, 0.05, normalizedCoord.y);
          
          // Add to scene
          this.scene.add(boxMesh);
          
          // Store reference
          this.coatOfArmSprites[polygon.id] = boxMesh;
          
          log.info(`Created fallback box for polygon ${polygon.id}`);
        } catch (fallbackError) {
          log.error(`Fallback also failed for polygon ${polygon.id}:`, fallbackError);
        }
      }
    );
  }

  /**
   * Update the owner of a polygon
   */
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
    const polygonMesh = this.polygonMeshes.find(pm => 
      pm.getMesh() === this.polygonMeshesRef.current[polygonId]
    );
    
    if (!polygonMesh) {
      console.warn(`PolygonMesh for ${polygonId} not found`);
      return;
    }
    
    // Get the owner's color
    const ownerColor = this.getOwnerColor(newOwner);
    
    // Get the owner's coat of arms URL if available
    let ownerCoatOfArmsUrl: string | null = null;
    if (newOwner && this.ownerCoatOfArmsMap && newOwner in this.ownerCoatOfArmsMap) {
      ownerCoatOfArmsUrl = this.ownerCoatOfArmsMap[newOwner] || null;
      console.log(`Found coat of arms for ${newOwner}: ${ownerCoatOfArmsUrl}`);
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
    this.updateCoatOfArmsSprites();
    
    // Force a render to apply changes
    this.facade.forceRender();
  }
  
  /**
   * Update hover state for polygons
   */
  public updateHoverState(hoveredPolygonId: string | null) {
    console.log('Updating hover state for polygon:', hoveredPolygonId);
    
    // Update hover state for all polygons
    this.polygonMeshes.forEach(polygonMesh => {
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
  
  /**
   * Load a coat of arms texture from a URL - disabled in land view
   * @param url The URL of the texture to load
   * @returns A THREE.Texture object
   */
  private loadCoatOfArmsTexture(url: string): THREE.Texture {
    console.log('loadCoatOfArmsTexture is disabled in land view');
    // Return an empty texture without loading anything
    return new THREE.Texture();
  }
  
  /**
   * Convert latitude and longitude to a 3D position
   * @param lat Latitude
   * @param lng Longitude
   * @returns A THREE.Vector3 position
   */
  private convertLatLngToPosition(lat: number, lng: number): THREE.Vector3 {
    const normalizedCoord = normalizeCoordinates(
      [{ lat, lng }],
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    )[0];
    
    return new THREE.Vector3(normalizedCoord.x, 0, normalizedCoord.y);
  }
  
  /**
   * Clean up resources with error handling
   */
  public cleanup() {
    log.info(`Cleaning up PolygonRenderer with ${this.polygonMeshes.length} meshes`);
    
    // Clean up all polygon meshes with error handling
    this.polygonMeshes.forEach(polygonMesh => {
      withErrorHandling(
        () => polygonMesh.cleanup(),
        RenderingErrorType.RESOURCE_DISPOSAL,
        'polygon-mesh-cleanup'
      );
    });
    
    // Clear the arrays and maps
    this.polygonMeshes = [];
    this.createdPolygonIds.clear();
    this.failedPolygons.clear();
    
    // Clean up coat of arms objects with error handling
    withErrorHandling(
      () => {
        Object.values(this.coatOfArmSprites).forEach(obj => {
          try {
            this.facade.removeFromScene(obj);
            if (obj instanceof THREE.Mesh) {
              if (obj.geometry) obj.geometry.dispose();
              if (obj.material) {
                if (Array.isArray(obj.material)) {
                  obj.material.forEach((mat: THREE.Material) => {
                    try {
                      if ('map' in mat && (mat as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial).map) {
                        (mat as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial).map?.dispose();
                      }
                      mat.dispose();
                    } catch (matError) {
                      log.error('Error disposing material:', matError);
                    }
                  });
                } else {
                  try {
                    if ('map' in obj.material && (obj.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial).map) {
                      (obj.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial).map?.dispose();
                    }
                    obj.material.dispose();
                  } catch (matError) {
                    log.error('Error disposing material:', matError);
                  }
                }
              }
            }
          } catch (objError) {
            log.error('Error cleaning up coat of arms object:', objError);
          }
        });
        this.coatOfArmSprites = {};
      },
      RenderingErrorType.RESOURCE_DISPOSAL,
      'coat-of-arms-cleanup'
    );
    
    // Dispose of the facade with error handling
    withErrorHandling(
      () => this.facade.dispose(),
      RenderingErrorType.RESOURCE_DISPOSAL,
      'facade-disposal'
    );
    
    log.info('PolygonRenderer cleanup complete');
  }
}
