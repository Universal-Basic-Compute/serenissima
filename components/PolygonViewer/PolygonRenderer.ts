/**
 * Polygon renderer using facade pattern to hide Three.js complexity
 * - Implements clean interface for polygon rendering
 * - Separates rendering logic from data management
 * - Provides robust error handling with graceful degradation
 * - Implements fallback rendering modes for critical failures
 * - Uses layered approach with base land and visualization overlays
 */
import * as THREE from 'three';
import { MutableRefObject } from 'react';
import { Polygon, ViewMode, Coordinate } from './types';
import { normalizeCoordinates, createPolygonShape } from './utils';
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
  users?: Record<string, any>;
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
  private ownerColorMap: Record<string, string> = {}; // Map of owner to color
  private users: Record<string, any> = {}; // Store users data
  
  // Layered rendering approach
  private basePolygons: Map<string, THREE.Mesh> = new Map(); // Base land layer (never changes)
  private overlayPolygons: Map<string, THREE.Mesh> = new Map(); // Visualization overlays
  private ownerIndicators: Map<string, THREE.Mesh> = new Map(); // Owner indicators
  private createdPolygonIds = new Set<string>();
  
  // Static properties for texture loading
  private static sharedTextureLoader: THREE.TextureLoader | null = null;
  private textureLoader: THREE.TextureLoader;
  
  // Facade for Three.js operations
  private facade: PolygonRendererFacade;
  
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
    if (!PolygonRenderer.sharedTextureLoader) {
      PolygonRenderer.sharedTextureLoader = new THREE.TextureLoader();
    }
    this.textureLoader = PolygonRenderer.sharedTextureLoader;
    
    // Initialize error handler
    this.errorHandler = RenderingErrorHandler.getInstance();
    
    // Initialize the facade with error handling
    this.facade = withErrorHandling(
      () => new PolygonRendererFacade(scene, activeView),
      RenderingErrorType.SCENE_MANIPULATION,
      'polygon-renderer-facade',
      () => {
        log.warn('Failed to create PolygonRendererFacade, using minimal fallback');
        return new PolygonRendererFacade(scene, activeView);
      }
    ) || new PolygonRendererFacade(scene, activeView);
    
    // Store users data
    this.users = users || {};
    
    // Add event listener for cache clearing
    if (typeof window !== 'undefined') {
      window.addEventListener('clearPolygonRendererCaches', this.clearCaches.bind(this));
    }
    
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
    
    // Create base land layer first
    setTimeout(() => this.createBaseLandLayer(), 0);
    
    // Then create visualization overlays based on active view
    setTimeout(() => this.updateViewMode(activeView), 100);
    
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
            // Add to base layer if missing
            if (!this.basePolygons.has(polygonId)) {
              this.createBasePolygon(polygon);
            }
            
            // Add to overlay layer based on active view
            this.createOverlayForPolygon(polygon, this.activeView);
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

  /**
   * Create the base land layer - rendered once and never changed
   */
  private createBaseLandLayer(): void {
    log.info(`Creating base land layer for ${this.polygons.length} polygons`);
    
    // Track success and failure counts
    let successCount = 0;
    let failureCount = 0;
    
    // Process each polygon
    this.polygons.forEach(polygon => {
      // Skip if already created
      if (this.basePolygons.has(polygon.id)) {
        return;
      }
      
      const success = this.createBasePolygon(polygon);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    });
    
    log.info(`Created ${successCount} base land polygons (${failureCount} failed)`);
    
    // If we're in fallback mode, create a simple representation of the map
    if (this.errorHandler.isInFallbackMode() && this.basePolygons.size < this.polygons.length * 0.5) {
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
   * Create a base polygon for the base land layer
   * @param polygon The polygon to create
   * @returns Whether creation was successful
   */
  private createBasePolygon(polygon: Polygon): boolean {
    if (!polygon.id) {
      log.warn('Polygon missing ID, cannot create base polygon');
      return false;
    }
    
    return withErrorHandling(
      () => {
        if (!polygon.coordinates || polygon.coordinates.length < 3) {
          log.warn(`Invalid polygon coordinates for ${polygon.id}`);
          return false;
        }
        
        // Normalize coordinates
        const normalizedCoords = normalizeCoordinates(
          polygon.coordinates,
          this.bounds.centerLat,
          this.bounds.centerLng,
          this.bounds.scale,
          this.bounds.latCorrectionFactor
        );
        
        // Create shape from normalized coordinates
        const shape = createPolygonShape(normalizedCoords);
        
        // Create geometry from shape
        const geometry = new THREE.ShapeGeometry(shape);
        
        // Create a simple material for the base land
        const material = new THREE.MeshBasicMaterial({
          color: 0xf5e9c8, // Base sand color
          side: THREE.DoubleSide,
          depthWrite: true
        });
        
        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0; // At water level
        mesh.renderOrder = 1; // Base layer
        
        // Add userData to identify this as a base polygon
        mesh.userData = {
          isPolygon: true,
          isBaseLand: true,
          polygonId: polygon.id,
          alwaysVisible: true
        };
        
        // Add to scene
        this.scene.add(mesh);
        
        // Store reference in the ref object and our maps
        this.polygonMeshesRef.current[polygon.id] = mesh;
        this.basePolygons.set(polygon.id, mesh);
        
        // Mark as created
        this.createdPolygonIds.add(polygon.id);
        
        return true;
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
      this.basePolygons.set(polygon.id, mesh);
      
      // Mark as created
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
    
    // Create base polygon
    this.createBasePolygon(samplePolygon);
    
    // Create overlay
    this.createOverlayForPolygon(samplePolygon, this.activeView);
    
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
    // Check base polygons
    this.basePolygons.forEach(mesh => {
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
    
    // Check overlay polygons
    this.overlayPolygons.forEach(mesh => {
      if (mesh) {
        mesh.visible = true;
        
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
    
    // Check owner indicators
    this.ownerIndicators.forEach(mesh => {
      if (mesh) {
        mesh.visible = true;
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
    // Update selection state for all overlay polygons
    this.overlayPolygons.forEach((mesh, polygonId) => {
      try {
        if (mesh.material instanceof THREE.Material) {
          const isSelected = polygonId === selectedPolygonId;
          
          // Apply selection effect
          if (isSelected) {
            if (mesh.material instanceof THREE.MeshBasicMaterial) {
              // Store original color if not already stored
              if (!mesh.userData.originalColor) {
                mesh.userData.originalColor = mesh.material.color.clone();
              }
              
              // Set to highlight color (bright yellow)
              mesh.material.color.set(0xffff00);
              mesh.material.needsUpdate = true;
            }
          } else {
            // Restore original color if it exists
            if (mesh.userData.originalColor && mesh.material instanceof THREE.MeshBasicMaterial) {
              mesh.material.color.copy(mesh.userData.originalColor);
              mesh.material.needsUpdate = true;
            }
          }
        }
      } catch (error) {
        console.error('Error updating selection state for polygon:', error);
      }
    });
  }
  
  /**
   * Update view mode for all polygons
   * This is the key method that implements the separation of concerns approach
   */
  public updateViewMode(activeView: ViewMode) {
    // Skip update if view hasn't changed
    if (this.activeView === activeView) {
      console.log(`View mode ${activeView} already active, skipping update`);
      return;
    }
    
    const wasLandView = this.activeView === 'land';
    const isNowLandView = activeView === 'land';
    
    this.activeView = activeView;
    
    // Clear all existing overlays
    this.clearOverlays();
    
    // Create new overlays based on the active view
    this.polygons.forEach(polygon => {
      this.createOverlayForPolygon(polygon, activeView);
    });
    
    // Create owner indicators if in land view
    if (isNowLandView) {
      this.createOwnerIndicators();
    }
    
    // Ensure all polygons remain visible after view mode change
    setTimeout(() => this.ensurePolygonsVisible(), 100);
    
    console.log(`View mode updated to ${activeView}`);
  }
  
  /**
   * Create an overlay polygon for visualization based on view mode
   */
  private createOverlayForPolygon(polygon: Polygon, activeView: ViewMode): void {
    if (!polygon.id || !polygon.coordinates || polygon.coordinates.length < 3) {
      return;
    }
    
    try {
      // Remove any existing overlay for this polygon
      if (this.overlayPolygons.has(polygon.id)) {
        const existingOverlay = this.overlayPolygons.get(polygon.id);
        if (existingOverlay) {
          this.scene.remove(existingOverlay);
          if (existingOverlay.geometry) existingOverlay.geometry.dispose();
          if (existingOverlay.material) {
            if (Array.isArray(existingOverlay.material)) {
              existingOverlay.material.forEach(mat => mat.dispose());
            } else {
              existingOverlay.material.dispose();
            }
          }
        }
        this.overlayPolygons.delete(polygon.id);
      }
      
      // Skip creating new overlay if not in land view
      if (activeView !== 'land') {
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
      
      // Create shape from normalized coordinates
      const shape = createPolygonShape(normalizedCoords);
      
      // Create geometry from shape
      const geometry = new THREE.ShapeGeometry(shape);
      
      // Determine color based on income or ownership
      let color: THREE.Color;
      
      if (polygon.simulatedIncome !== undefined) {
        // Use income-based coloring
        color = this.getIncomeBasedColor(polygon.simulatedIncome);
      } else if (polygon.owner) {
        // Use owner-based coloring
        const ownerColor = this.getOwnerColor(polygon.owner);
        color = new THREE.Color(ownerColor || '#7cac6a');
      } else {
        // Default color for unowned land
        color = new THREE.Color(0xf5e9c8);
      }
      
      // Create material for the overlay
      const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      
      // Create mesh
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.01; // Slightly above base land
      mesh.renderOrder = 10; // Higher than base layer
      
      // Add userData to identify this as an overlay
      mesh.userData = {
        isPolygonOverlay: true,
        polygonId: polygon.id,
        originalColor: color.clone()
      };
      
      // Add to scene
      this.scene.add(mesh);
      
      // Store reference
      this.overlayPolygons.set(polygon.id, mesh);
      
    } catch (error) {
      log.error(`Failed to create overlay for polygon ${polygon.id}:`, error);
    }
  }
  
  /**
   * Calculate color based on income value
   * Red (high income) -> Yellow -> Green (low income)
   */
  private getIncomeBasedColor(income: number): THREE.Color {
    // Define our color scale with more vibrant colors
    const highIncomeColor = new THREE.Color(0xff3300); // Bright orange-red
    const midIncomeColor = new THREE.Color(0xffcc00);  // Golden yellow
    const lowIncomeColor = new THREE.Color(0x33cc33);  // Rich green
    
    // Normalize income to a 0-1 scale
    const maxIncome = 1000; // Default max income value
    const normalizedIncome = Math.min(Math.max(income / maxIncome, 0), 1);
    
    // Map the normalized income to our color scale
    const resultColor = new THREE.Color();
    
    if (normalizedIncome >= 0.5) {
      // Map from yellow to red
      const t = (normalizedIncome - 0.5) * 2; // Scale 0.5-1.0 to 0-1
      return resultColor.lerpColors(midIncomeColor, highIncomeColor, t);
    } else {
      // Map from green to yellow
      const t = normalizedIncome * 2; // Scale 0-0.5 to 0-1
      return resultColor.lerpColors(lowIncomeColor, midIncomeColor, t);
    }
  }
  
  /**
   * Create owner indicators (colored circles) for all owned polygons
   */
  private createOwnerIndicators(): void {
    // Clear any existing owner indicators
    this.clearOwnerIndicators();
    
    // Only create indicators in land view
    if (this.activeView !== 'land') {
      return;
    }
    
    // Filter polygons with owners and centroids
    const polygonsWithOwners = this.polygons.filter(p => p.owner && p.centroid);
    
    log.info(`Creating owner indicators for ${polygonsWithOwners.length} owned polygons`);
    
    // Process in batches for better performance
    const BATCH_SIZE = 50;
    
    // Function to process a batch
    const processBatch = (startIndex: number) => {
      const endIndex = Math.min(startIndex + BATCH_SIZE, polygonsWithOwners.length);
      
      for (let i = startIndex; i < endIndex; i++) {
        const polygon = polygonsWithOwners[i];
        
        try {
          // Get position from centroid
          const position = this.convertLatLngToPosition(
            polygon.centroid!.lat,
            polygon.centroid!.lng
          );
          
          // Get owner color
          const ownerColor = this.getOwnerColor(polygon.owner) || '#7cac6a';
          
          // Create simple circle indicator
          const circleGeometry = new THREE.CircleGeometry(0.25, 8);
          const circleMaterial = new THREE.MeshBasicMaterial({
            color: ownerColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8,
            depthWrite: false
          });
          
          const circleMesh = new THREE.Mesh(circleGeometry, circleMaterial);
          circleMesh.position.set(position.x, 0.05, position.y);
          circleMesh.rotation.x = -Math.PI / 2;
          circleMesh.renderOrder = 20; // Above all land layers
          
          // Add to scene and store reference
          this.scene.add(circleMesh);
          this.ownerIndicators.set(polygon.id, circleMesh);
        } catch (error) {
          log.error(`Failed to create owner indicator for polygon ${polygon.id}:`, error);
        }
      }
      
      // Process next batch if there are more
      if (endIndex < polygonsWithOwners.length) {
        setTimeout(() => processBatch(endIndex), 0);
      }
    };
    
    // Start processing the first batch
    if (polygonsWithOwners.length > 0) {
      processBatch(0);
    }
  }
  
  /**
   * Clear all owner indicators
   */
  private clearOwnerIndicators(): void {
    this.ownerIndicators.forEach(mesh => {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => mat.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
    
    this.ownerIndicators.clear();
  }
  
  /**
   * Clear all visualization overlays
   */
  private clearOverlays(): void {
    // Clear polygon overlays
    this.overlayPolygons.forEach(mesh => {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => mat.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
    
    this.overlayPolygons.clear();
    
    // Clear owner indicators
    this.clearOwnerIndicators();
  }
  
  /**
   * Update colors for all polygons based on simulated income
   * This method is now disabled to prevent land modification
   */
  public updatePolygonOwnerColors() {
    console.log('Polygon color updates disabled to prevent land modification');
    // No implementation to prevent land modification
  }

  /**
   * Update quality settings
   */
  public updateQuality(performanceMode: boolean) {
    this.performanceMode = performanceMode;
    
    // No need to update individual polygons since we're using a layered approach
    // Just force a re-creation of overlays if needed
    if (this.activeView === 'land') {
      // Recreate overlays with new quality settings
      this.updateViewMode(this.activeView);
    }
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
      // Recreate owner indicators with updated coat of arms
      this.createOwnerIndicators();
    }
    
    // Set the flag to indicate we've updated coat of arms
    this.hasUpdatedCoatOfArms = true;
  }
  
  /**
   * Update colors for owners
   */
  public updateOwnerColors(colorMap: Record<string, string>) {
    console.log('Updating owner colors with data:', colorMap);
    
    // Update the color map
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
    
    // If we're in land view, update the overlays and owner indicators
    if (this.activeView === 'land') {
      this.updatePolygonOwnerColors();
    }
  }
  
  /**
   * Update coat of arms sprites
   * This is now just an alias for createOwnerIndicators
   */
  public updateCoatOfArmsSprites() {
    if (this.activeView === 'land') {
      this.createOwnerIndicators();
    }
  }

  // Helper method to create a flat texture on the land for a polygon - disabled
  private createFlatTextureForPolygon(polygon: Polygon, texture: THREE.Texture) {
    console.log('createFlatTextureForPolygon is disabled - using colored circles instead');
    // Instead of creating a texture, create a colored circle
    if (polygon.centroid && polygon.id) {
      const ownerColor = polygon.owner ? this.getOwnerColor(polygon.owner) : '#8B4513';
      this.createColoredCircleOnLand(polygon, ownerColor || '#8B4513');
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
   * Optimized for performance in land mode
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
        // Get the owner's color from the ownerColorMap if available
        let circleColor = color;
        if (polygon.owner && this.ownerColorMap[polygon.owner]) {
          // Use the owner's color from the map instead of the passed color
          circleColor = this.ownerColorMap[polygon.owner];
          log.debug(`Using owner color for ${polygon.id}: ${circleColor} (owner: ${polygon.owner})`);
        } else {
          log.debug(`Using default color for ${polygon.id}: ${color} (owner: ${polygon.owner || 'none'})`);
        }
        
        // Convert centroid to 3D position
        const normalizedCoord = normalizeCoordinates(
          [centroid],
          this.bounds.centerLat,
          this.bounds.centerLng,
          this.bounds.scale,
          this.bounds.latCorrectionFactor
        )[0];
        
        // Performance optimization: Use fewer segments for circle geometry
        const circleGeometry = new THREE.CircleGeometry(0.25, 8); // Reduced from 16 to 8 segments
        const circleMaterial = new THREE.MeshBasicMaterial({
          color: circleColor,
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
        
        // Reduce debug logging in production for performance
        if (process.env.NODE_ENV !== 'production') {
          log.debug(`Created colored circle for polygon ${polygon.id} at position:`, normalizedCoord);
        }
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
          
          // Get the owner's color for the fallback too
          let fallbackColor = color;
          if (polygon.owner && this.ownerColorMap[polygon.owner]) {
            fallbackColor = this.ownerColorMap[polygon.owner];
          }
          
          // Create a simple dot as fallback with minimal segments
          const geometry = new THREE.CircleGeometry(0.2, 6); // Reduced from 8 to 6 segments
          const material = new THREE.MeshBasicMaterial({ 
            color: fallbackColor,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
          });
          
          const circleMesh = new THREE.Mesh(geometry, material);
          circleMesh.position.set(normalizedCoord.x, 0.05, normalizedCoord.y);
          circleMesh.rotation.x = -Math.PI / 2; // Flat on the ground
          
          // Add to scene
          this.scene.add(circleMesh);
          
          // Store reference
          this.coatOfArmSprites[polygon.id] = circleMesh;
          
          log.info(`Created fallback circle for polygon ${polygon.id}`);
        } catch (fallbackError) {
          log.error(`Fallback also failed for polygon ${polygon.id}:`, fallbackError);
        }
      }
    );
  }

  /**
   * Update the owner of a polygon
   * This method is now disabled to prevent land modification
   */
  public updatePolygonOwner(polygonId: string, newOwner: string) {
    console.log(`Polygon owner updates disabled to prevent land modification: ${polygonId}`);
    // No implementation to prevent land modification
  }
  
  /**
   * Update hover state for polygons
   */
  public updateHoverState(hoveredPolygonId: string | null) {
    console.log('Updating hover state for polygon:', hoveredPolygonId);
    
    // Update hover state for all overlay polygons
    this.overlayPolygons.forEach((mesh, polygonId) => {
      try {
        if (mesh.material instanceof THREE.Material) {
          const isHovered = polygonId === hoveredPolygonId;
          
          // Skip if this is the selected polygon (selection takes precedence)
          if (mesh.userData.isSelected) {
            return;
          }
          
          // Apply hover effect
          if (isHovered) {
            if (mesh.material instanceof THREE.MeshBasicMaterial) {
              // Store original color if not already stored
              if (!mesh.userData.originalColor) {
                mesh.userData.originalColor = mesh.material.color.clone();
              }
              
              // Set to hover color (lighter version of original)
              const hoverColor = mesh.userData.originalColor.clone();
              hoverColor.r = Math.min(1, hoverColor.r * 1.2);
              hoverColor.g = Math.min(1, hoverColor.g * 1.2);
              hoverColor.b = Math.min(1, hoverColor.b * 1.2);
              
              mesh.material.color.copy(hoverColor);
              mesh.material.needsUpdate = true;
            }
          } else {
            // Restore original color if it exists
            if (mesh.userData.originalColor && mesh.material instanceof THREE.MeshBasicMaterial) {
              mesh.material.color.copy(mesh.userData.originalColor);
              mesh.material.needsUpdate = true;
            }
          }
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
   * Clear caches method to handle the clearPolygonRendererCaches event
   */
  private clearCaches(): void {
    log.info('Clearing PolygonRenderer caches');
    
    // Clear coat of arms cache
    this.ownerCoatOfArmsMap = {};
    log.info('Coat of arms cache cleared');
    
    // Clear owner color map
    this.ownerColorMap = {};
    log.info('Owner color map cleared');
    
    // Clear all overlays and indicators
    this.clearOverlays();
    log.info('Overlays and indicators cleared');
    
    // Force THREE.js to clear its texture cache
    if (THREE.Cache) {
      THREE.Cache.clear();
      log.info('THREE.js texture cache cleared');
    }
    
    // Update the view mode to regenerate everything
    this.updateViewMode(this.activeView);
    log.info('View mode updated to regenerate visuals');
  }

  /**
   * Clean up resources with error handling
   */
  public cleanup() {
    log.info(`Cleaning up PolygonRenderer with ${this.basePolygons.size} base polygons and ${this.overlayPolygons.size} overlays`);
    
    // Remove event listener for cache clearing
    if (typeof window !== 'undefined') {
      window.removeEventListener('clearPolygonRendererCaches', this.clearCaches.bind(this));
    }
    
    // Clean up base polygons
    this.basePolygons.forEach(mesh => {
      withErrorHandling(
        () => {
          this.scene.remove(mesh);
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) {
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach(mat => mat.dispose());
            } else {
              mesh.material.dispose();
            }
          }
        },
        RenderingErrorType.RESOURCE_DISPOSAL,
        'base-polygon-cleanup'
      );
    });
    
    // Clear overlays and indicators
    this.clearOverlays();
    
    // Clear the maps and sets
    this.basePolygons.clear();
    this.createdPolygonIds.clear();
    this.failedPolygons.clear();
    
    // Dispose of the facade with error handling
    withErrorHandling(
      () => this.facade.dispose(),
      RenderingErrorType.RESOURCE_DISPOSAL,
      'facade-disposal'
    );
    
    log.info('PolygonRenderer cleanup complete');
  }
}
