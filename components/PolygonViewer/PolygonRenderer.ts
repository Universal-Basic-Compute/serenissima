/**
 * Polygon renderer using facade pattern to hide Three.js complexity
 * - Implements clean interface for polygon rendering
 * - Separates rendering logic from data management
 * - Provides better error handling with graceful degradation
 */
import * as THREE from 'three';
import { MutableRefObject } from 'react';
import { Polygon, ViewMode } from './types';
import { normalizeCoordinates } from './utils';
import { PolygonRendererFacade } from '../../lib/threejs/PolygonRendererFacade';
import { PolygonMeshFacade } from '../../lib/threejs/PolygonMeshFacade';

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
    
    // Initialize the facade
    this.facade = new PolygonRendererFacade(scene);
    
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
      
      // Process user data once
      this.processUserData(users);
      
      // Always ensure ConsiglioDeiDieci has a color
      if (!this.ownerColorMap['ConsiglioDeiDieci']) {
        this.ownerColorMap['ConsiglioDeiDieci'] = '#8B0000'; // Dark red
        console.log('Added missing ConsiglioDeiDieci color in PolygonRenderer');
      }
    }
    
    // Render polygons with a slight delay to allow the UI to render first
    setTimeout(() => this.renderPolygons(), 0);
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
    
    console.log(`Processed ${Object.keys(this.ownerCoatOfArmsMap).length} coat of arms and ${Object.keys(this.ownerColorMap).length} colors from users data`);
  }

  private renderPolygons() {
    console.log(`Rendering ${this.polygons.length} polygons`);
    
    // Get a standard material from the facade
    const sandMaterial = this.facade.createLandMaterial();
    
    // Process each polygon
    this.polygons.forEach(polygon => {
      // Skip if already created
      if (this.createdPolygonIds.has(polygon.id)) {
        return;
      }
      
      try {
        if (!polygon.coordinates || polygon.coordinates.length < 3) {
          console.warn(`Invalid polygon coordinates for ${polygon.id}`);
          return;
        }
        
        // Get owner color if available
        let ownerColor = null;
        if (polygon.owner) {
          ownerColor = this.getOwnerColor(polygon.owner);
        }
        
        // Get owner coat of arms if available
        let ownerCoatOfArmsUrl = null;
        if (polygon.owner && this.ownerCoatOfArmsMap[polygon.owner]) {
          ownerCoatOfArmsUrl = this.ownerCoatOfArmsMap[polygon.owner];
        }
        
        // Create a PolygonMeshFacade instance
        const textureLoader = new THREE.TextureLoader();
        const polygonMesh = new PolygonMeshFacade(
          this.scene,
          polygon,
          this.bounds,
          this.activeView,
          this.performanceMode,
          textureLoader,
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
        }
      } catch (error) {
        console.error(`Error rendering polygon ${polygon.id}:`, error);
      }
    });
    
    console.log(`Created ${this.polygonMeshes.length} polygon meshes`);
    
    // Start a periodic check to ensure polygons remain visible
    setInterval(() => this.ensurePolygonsVisible(), 1000);
  }
  
  /**
   * Get the color for an owner
   */
  private getOwnerColor(owner: string): string | null {
    if (this.ownerColorMap[owner]) {
      return this.ownerColorMap[owner];
    } else if (this.users[owner] && this.users[owner].color) {
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
      map: this.sandBaseColor,
      normalMap: this.sandNormalMap,
      roughnessMap: this.sandRoughnessMap,
      color: 0xf5e9c8, // Sand color
      side: THREE.DoubleSide,
      transparent: false,
      roughness: 0.8,
      metalness: 0.1
    });
    
    // Create a polygon mesh for the sample
    const polygonMesh = new PolygonMesh(
      this.scene,
      samplePolygon,
      this.bounds,
      this.activeView,
      this.performanceMode,
      this.textureLoader,
      '#FF0000', // Bright red for visibility
      null,
      this.polygonMeshesRef
    );
    
    // Store reference to the mesh
    this.PolygonMeshs.push(polygonMesh);
    
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
   * Update colors for all polygon owners
   */
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
        const polygonMesh = this.polygonMeshes.find(pm => {
          const mesh = pm.getMesh();
          return mesh && this.polygonMeshesRef.current[polygon.id] === mesh;
        });
        
        if (polygonMesh) {
          // Get the owner's color
          const ownerColor = this.getOwnerColor(polygon.owner);
          
          if (ownerColor) {
            console.log(`Applying color ${ownerColor} to polygon ${polygon.id} owned by ${polygon.owner}`);
            polygonMesh.updateOwner(polygon.owner, ownerColor);
          }
        } else {
          console.warn(`Could not find PolygonMesh for polygon ${polygon.id}`);
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
    
    // If we're in land view, apply the new coat of arms textures directly to the land shapes
    if (this.activeView === 'land') {
      this.updateCoatOfArmsSprites();
    }
    
    // Set the flag to indicate we've updated coat of arms
    this.hasUpdatedCoatOfArms = true;
  }
  
  /**
   * Update colors for owners
   */
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

  /**
   * Update coat of arms sprites for all polygons
   */
  public updateCoatOfArmsSprites() {
    console.log('Updating coat of arms sprites, active view:', this.activeView);
    
    // Remove existing coat of arms objects
    Object.values(this.coatOfArmSprites).forEach(obj => {
      this.facade.removeFromScene(obj);
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
      
      // Get the owner's color
      const ownerColor = this.getOwnerColor(polygon.owner);
      
      // Find the corresponding PolygonMesh
      const polygonMesh = this.polygonMeshes.find(pm => {
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
        this.createColoredCircleOnLand(polygon, ownerColor || '#8B4513');
      }
    });
    
    // Force a render to apply the changes
    this.facade.forceRender();
  }

  // Add this helper method to create a flat texture on the land for a polygon
  private createFlatTextureForPolygon(polygon: Polygon, texture: THREE.Texture) {
    if (!polygon.centroid) {
      console.warn(`Cannot create flat texture for polygon ${polygon.id} - no centroid`);
      return;
    }
    
    try {
      // Convert centroid to 3D position
      const normalizedCoord = normalizeCoordinates(
        [polygon.centroid],
        this.bounds.centerLat,
        this.bounds.centerLng,
        this.bounds.scale,
        this.bounds.latCorrectionFactor
      )[0];
      
      // Create a plane geometry for the texture
      const planeGeometry = new THREE.PlaneGeometry(1, 1);
      const planeMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      
      // Create mesh and position it
      const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
      planeMesh.position.set(normalizedCoord.x, 0.1, normalizedCoord.y); // Slightly above ground
      planeMesh.rotation.x = -Math.PI / 2; // Rotate to lie flat
      planeMesh.renderOrder = 10; // Ensure it renders on top
      
      // Add to scene
      this.scene.add(planeMesh);
      
      // Store reference
      this.coatOfArmSprites[polygon.id] = planeMesh;
      
      console.log(`Created flat texture for polygon ${polygon.id} at position:`, normalizedCoord);
    } catch (error) {
      console.error(`Error creating flat texture for polygon ${polygon.id}:`, error);
    }
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
  
  /**
   * Create a colored circle on the land for a polygon
   */
  private createColoredCircleOnLand(polygon: Polygon, color: string) {
    if (!polygon.centroid) {
      console.warn(`Cannot create colored circle for polygon ${polygon.id} - no centroid`);
      return;
    }
    
    try {
      // Convert centroid to 3D position
      const normalizedCoord = normalizeCoordinates(
        [polygon.centroid],
        this.bounds.centerLat,
        this.bounds.centerLng,
        this.bounds.scale,
        this.bounds.latCorrectionFactor
      )[0];
      
      // Create position vector
      const position = new THREE.Vector3(normalizedCoord.x, 0.05, normalizedCoord.y);
      
      // Create circle using the facade
      const circleMesh = this.facade.createColoredCircle(position, color, 0.5);
      
      // Add to scene
      this.facade.addToScene(circleMesh);
      
      // Store reference
      this.coatOfArmSprites[polygon.id] = circleMesh;
      
      console.log(`Created colored circle for polygon ${polygon.id} at position:`, normalizedCoord);
    } catch (error) {
      console.error(`Error creating colored circle for polygon ${polygon.id}:`, error);
    }
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
    let ownerCoatOfArmsUrl = null;
    if (newOwner && this.ownerCoatOfArmsMap && this.ownerCoatOfArmsMap[newOwner]) {
      ownerCoatOfArmsUrl = this.ownerCoatOfArmsMap[newOwner];
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
   * Clean up resources
   */
  public cleanup() {
    console.log(`Cleaning up PolygonRenderer with ${this.polygonMeshes.length} meshes`);
    
    // Clean up all polygon meshes
    this.polygonMeshes.forEach(polygonMesh => {
      polygonMesh.cleanup();
    });
    
    // Clear the arrays and maps
    this.polygonMeshes = [];
    this.createdPolygonIds.clear();
    
    // Clean up coat of arms objects
    Object.values(this.coatOfArmSprites).forEach(obj => {
      this.facade.removeFromScene(obj);
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
    
    // Dispose of the facade
    this.facade.dispose();
  }
}
