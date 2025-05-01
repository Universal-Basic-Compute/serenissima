import * as THREE from 'three';
import { MutableRefObject } from 'react';
import { Polygon, ViewMode } from './types';
import { normalizeCoordinates, createPolygonShape } from './utils';
import LODPolygon from './LODPolygon';

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
  private lodPolygons: LODPolygon[] = [];
  private ownerCoatOfArmsMap: Record<string, string> = {}; // Map of owner to coat of arms URL
  public hasUpdatedCoatOfArms: boolean = false; // Flag to track if coat of arms have been updated
  
  // Add a method to create a sprite for the coat of arms
  // Add method to create a sprite for the coat of arms
  private createCoatOfArmsSprite(coatOfArmsUrl: string) {
    // Remove any existing sprite
    if (this.coatOfArmsSprite) {
      this.scene.remove(this.coatOfArmsSprite);
      (this.coatOfArmsSprite.material as THREE.SpriteMaterial).map?.dispose();
      (this.coatOfArmsSprite.material as THREE.SpriteMaterial).dispose();
    }
    
    // Load the texture for the sprite
    this.textureLoader.load(
      coatOfArmsUrl,
      (texture) => {
        // Create a sprite material with the texture
        const spriteMaterial = new THREE.SpriteMaterial({ 
          map: texture,
          color: this.ownerColor ? new THREE.Color(this.ownerColor) : new THREE.Color(0xffffff),
          transparent: true,
          depthTest: false // Ensure visibility
        });
        
        // Create a sprite
        this.coatOfArmsSprite = new THREE.Sprite(spriteMaterial);
        
        // Position the sprite at the center of the polygon, slightly above it
        if (this.polygon.centroid) {
          const normalizedCoords = normalizeCoordinates(
            [this.polygon.centroid],
            this.bounds.centerLat,
            this.bounds.centerLng,
            this.bounds.scale,
            this.bounds.latCorrectionFactor
          )[0];
          
          this.coatOfArmsSprite.position.set(normalizedCoords.x, 0.5, -normalizedCoords.y);
        } else {
          // If no centroid, use the mesh position
          const center = this.mesh.position.clone();
          center.y += 0.5; // Position above the land
          this.coatOfArmsSprite.position.copy(center);
        }
        
        // Scale the sprite to cover most of the land
        const size = 3; // Adjust based on your scene scale
        this.coatOfArmsSprite.scale.set(size, size, 1);
        
        // Only show in land view
        this.coatOfArmsSprite.visible = this.activeView === 'land';
        
        // Add to scene
        this.scene.add(this.coatOfArmsSprite);
      },
      undefined,
      (error) => {
        console.error('Error loading coat of arms sprite texture:', error);
      }
    );
  }
  private coatOfArmSprites: Record<string, THREE.Sprite> = {};
  private ownerColorMap: Record<string, string> = {}; // Map of owner to color
  private users: Record<string, any> = {}; // Store users data

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
      Object.values(users).forEach(user => {
        if (user.user_name) {
          // Store coat of arms image if available
          if (user.coat_of_arms_image) {
            this.ownerCoatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          }
          
          // Store color if available
          if (user.color) {
            this.ownerColorMap[user.user_name] = user.color;
            console.log(`Stored color for ${user.user_name}: ${user.color}`);
          }
        }
      });
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
  
  private renderPolygons() {
    console.log(`Rendering ${this.polygons.length} polygons`);
    
    if (this.polygons.length > 0) {
      try {
        // Create a frustum for culling
        const frustum = new THREE.Frustum();
        const projScreenMatrix = new THREE.Matrix4();
        projScreenMatrix.multiplyMatrices(
          this.camera.projectionMatrix, 
          this.camera.matrixWorldInverse
        );
        frustum.setFromProjectionMatrix(projScreenMatrix);
        
        // Process polygons in smaller batches with longer delays to prevent UI freezing
        const batchSize = 3; // Further reduced from 5 to 3 polygons at a time
        const totalPolygons = this.polygons.length;
        let processedCount = 0;
      
      const processBatch = (startIdx: number) => {
        const endIdx = Math.min(startIdx + batchSize, totalPolygons);
        
        for (let i = startIdx; i < endIdx; i++) {
          const polygon = this.polygons[i];
          
          if (polygon.coordinates && polygon.coordinates.length > 2) {
            try {
              // Skip if not in view frustum (approximate check using centroid)
              if (polygon.centroid) {
                const centroidPos = new THREE.Vector3(
                  (polygon.centroid.lng - this.bounds.centerLng) * this.bounds.scale * this.bounds.latCorrectionFactor,
                  0,
                  -(polygon.centroid.lat - this.bounds.centerLat) * this.bounds.scale
                );
                
                // Add a bounding sphere around the centroid
                const boundingSphere = new THREE.Sphere(centroidPos, 10); // Approximate radius
                
                // Skip if not in view
                if (!frustum.intersectsSphere(boundingSphere)) {
                  continue;
                }
              }
              
              // Get the owner's color from the users data
              let ownerColor = null;
              if (polygon.owner) {
                if (this.ownerColorMap[polygon.owner]) {
                  ownerColor = this.ownerColorMap[polygon.owner];
                  console.log(`Using stored color for ${polygon.owner}: ${ownerColor}`);
                } else if (this.users[polygon.owner] && this.users[polygon.owner].color) {
                  ownerColor = this.users[polygon.owner].color;
                  // Also store in the color map for future use
                  this.ownerColorMap[polygon.owner] = ownerColor;
                  console.log(`Found color for ${polygon.owner} in users data: ${ownerColor}`);
                } else {
                  // Use default color if no owner color is specified
                  ownerColor = '#7cac6a'; // Default green color
                }
                
                // Debug log for ConsiglioDeiDieci specifically
                if (polygon.owner === 'ConsiglioDeiDieci') {
                  console.log(`ConsiglioDeiDieci polygon color: ${ownerColor}`);
                  console.log(`ConsiglioDeiDieci user data:`, this.users['ConsiglioDeiDieci']);
                }
              }
            
              // Get the owner's coat of arms URL if available
              let ownerCoatOfArmsUrl = null;
              if (polygon.owner && this.ownerCoatOfArmsMap && this.ownerCoatOfArmsMap[polygon.owner]) {
                ownerCoatOfArmsUrl = this.ownerCoatOfArmsMap[polygon.owner];
              }
              
              // Log the color and coat of arms for debugging
              if (polygon.owner) {
                console.log(`Creating polygon ${polygon.id} with owner ${polygon.owner}, color: ${ownerColor}, coat of arms: ${ownerCoatOfArmsUrl ? 'yes' : 'no'}`);
              }
              
              const lodPolygon = new LODPolygon(
                this.scene,
                polygon,
                this.bounds,
                this.activeView,
                this.performanceMode,
                this.textureLoader,
                {
                  sandBaseColor: this.sandBaseColor,
                  sandNormalMap: this.sandNormalMap,
                  sandRoughnessMap: this.sandRoughnessMap
                },
                ownerColor, // Pass the owner's color
                ownerCoatOfArmsUrl // Pass the owner's coat of arms URL
              );
              
              // Add this line to set a consistent render order based on polygon ID:
              const renderOrderBase = 10; // Base value to ensure it's above water
              const renderOrderOffset = parseInt(polygon.id.replace(/\D/g, '')) % 100 || 0; // Get a stable number from the ID
              lodPolygon.getMesh().renderOrder = renderOrderBase + renderOrderOffset;
              
              // Force a high render order for all polygons to fix edge issues
              lodPolygon.getMesh().renderOrder = 10;
            
              this.lodPolygons.push(lodPolygon);
              
              // Store reference to the mesh
              this.polygonMeshesRef.current[polygon.id] = lodPolygon.getMesh();
              
              processedCount++;
            } catch (error) {
              console.error(`Error creating polygon ${i}:`, error);
            }
          } else {
            console.warn(`Polygon ${i} has invalid coordinates:`, polygon.coordinates);
          }
        }
        
        // If there are more polygons to process, schedule the next batch with increased delay
        if (endIdx < totalPolygons) {
          setTimeout(() => processBatch(endIdx), 50); // Increased from 0 to 50ms
          console.log(`Processed ${processedCount}/${totalPolygons} polygons...`);
        } else {
          console.log(`Completed rendering all ${processedCount} polygons`);
        }
      };
      
      // Start processing the first batch
      processBatch(0);
    } else {
      console.warn('No polygons to display');
      this.createSamplePolygon();
    }
  }
  
  private createSamplePolygon() {
    // Add a sample polygon for testing
    const sampleShape = new THREE.Shape();
    // Make the sample polygon wider to account for latitude correction
    const sampleWidth = 10 / this.bounds.latCorrectionFactor;
    sampleShape.moveTo(-sampleWidth, -10);
    sampleShape.lineTo(-sampleWidth, 10);
    sampleShape.lineTo(sampleWidth, 10);
    sampleShape.lineTo(sampleWidth, -10);
    
    const extrudeSettings = {
      steps: 1,
      depth: 0.04, // 75% thinner
      bevelEnabled: false // Disable bevel completely
    };
    
    const sampleGeometry = new THREE.ExtrudeGeometry(sampleShape, extrudeSettings);
    sampleGeometry.rotateX(-Math.PI / 2);
    
    const sampleMaterial = new THREE.MeshStandardMaterial({
      color: '#e6d2a8', // Always use sand/beige color
      map: this.activeView !== 'land' ? this.sandBaseColor : null,
      normalMap: this.activeView !== 'land' ? this.sandNormalMap : null,
      roughnessMap: this.activeView !== 'land' ? this.sandRoughnessMap : null,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.FrontSide, // Changed from DoubleSide to FrontSide
      flatShading: false,
      wireframe: false,
      // Remove polygon edges by setting these properties:
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      // Explicitly disable shadows
      castShadow: false,
      receiveShadow: false
    });
    
    const sampleMesh = new THREE.Mesh(sampleGeometry, sampleMaterial);
    sampleMesh.castShadow = false;
    sampleMesh.receiveShadow = false;
    
    // Store the original material properties explicitly
    sampleMesh.userData.originalEmissive = new THREE.Color(0, 0, 0);
    sampleMesh.userData.originalEmissiveIntensity = 0;
    
    // Create a LOD polygon for the sample
    const lodPolygon = new LODPolygon(
      this.scene,
      { id: 'sample', coordinates: [] },
      this.bounds,
      this.activeView,
      this.performanceMode,
      this.textureLoader,
      {
        sandBaseColor: this.sandBaseColor,
        sandNormalMap: this.sandNormalMap,
        sandRoughnessMap: this.sandRoughnessMap
      },
      '#7cac6a' // Default green color for sample
    );
    
    this.lodPolygons.push(lodPolygon);
    this.polygonMeshesRef.current['sample'] = lodPolygon.getMesh();
    
    console.log('Added sample polygon to scene');
  }
  
  public update(selectedPolygonId: string | null = null) {
    // No need to update LOD anymore
    // Just update selection state
    this.updateSelectionState(selectedPolygonId);
  }
  
  // Add this new method to update selection state
  public updateSelectionState(selectedPolygonId: string | null) {
    // Update selection state for all LOD polygons
    this.lodPolygons.forEach(lodPolygon => {
      const polygonId = this.polygons.find(
        p => lodPolygon.getMesh() === this.polygonMeshesRef.current[p.id]
      )?.id;
      
      if (polygonId) {
        // Apply selection state based on ID match
        lodPolygon.updateSelectionState(polygonId === selectedPolygonId);
      }
    });
  }
  
  public updateViewMode(activeView: ViewMode) {
    this.activeView = activeView;
    
    // Update all LOD polygons with the new view mode
    this.lodPolygons.forEach(lodPolygon => {
      lodPolygon.updateViewMode(activeView);
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
  private updatePolygonOwnerColors() {
    console.log('Updating all polygon owner colors');
    this.polygons.forEach(polygon => {
      if (polygon.owner) {
        // Find the corresponding LOD polygon
        const lodPolygon = this.lodPolygons.find(lp => 
          lp.getMesh() === this.polygonMeshesRef.current[polygon.id]
        );
        
        if (lodPolygon) {
          // Get the owner's color
          let ownerColor = null;
          if (this.ownerColorMap[polygon.owner]) {
            ownerColor = this.ownerColorMap[polygon.owner];
          } else if (this.users[polygon.owner] && this.users[polygon.owner].color) {
            ownerColor = this.users[polygon.owner].color;
            // Store for future use
            this.ownerColorMap[polygon.owner] = ownerColor;
          }
          
          if (ownerColor) {
            console.log(`Applying color ${ownerColor} to polygon ${polygon.id} owned by ${polygon.owner}`);
            lodPolygon.updateOwner(polygon.owner, ownerColor);
          }
        }
      }
    });
  }

  public updateQuality(performanceMode: boolean) {
    this.performanceMode = performanceMode;
    
    // Update all LOD polygons with the new quality setting
    this.lodPolygons.forEach(lodPolygon => {
      lodPolygon.updateQuality(performanceMode);
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
  private updateCoatOfArmsSprites() {
    console.log('Updating coat of arms sprites, active view:', this.activeView);
    
    // Remove existing coat of arms objects
    Object.values(this.coatOfArmSprites).forEach(obj => {
      this.scene.remove(obj);
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
    });
    this.coatOfArmSprites = {};

    // Only create coat of arms if we're in land view
    if (this.activeView !== 'land') {
      console.log('Not in land view, skipping coat of arms textures');
      return;
    }

    console.log('Creating coat of arms for land view, polygons count:', this.polygons.length);
    
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
      }
      
      // Find the corresponding LOD polygon
      const lodPolygon = this.lodPolygons.find(lp => 
        lp.getMesh() === this.polygonMeshesRef.current[polygon.id]
      );
      
      if (!lodPolygon) {
        console.warn(`Could not find LOD polygon for ${polygon.id}`);
        return;
      }
      
      // Always update the owner color first
      lodPolygon.updateOwner(polygon.owner, ownerColor);
      
      if (coatOfArmsUrl) {
        console.log(`Applying coat of arms texture for ${polygon.id} with URL: ${coatOfArmsUrl}`);
        // Apply the coat of arms texture directly to the land shape
        lodPolygon.updateCoatOfArmsTexture(coatOfArmsUrl);
      } else if (polygon.centroid) {
        console.log(`Creating colored circle for ${polygon.id} with color: ${ownerColor}`);
        // Create a colored circle texture on the land as fallback
        this.createColoredCircleOnLand(polygon, ownerColor);
      }
    });
  }

  // Add this helper method to create a flat texture on the land for a polygon
  private createFlatTextureForPolygon(polygon: Polygon, texture: THREE.Texture) {
    // Create a flat plane for the coat of arms
    const planeSize = 4; // Size of the plane
    const geometry = new THREE.PlaneGeometry(planeSize, planeSize);
    
    // Create material with the texture
    const material = new THREE.MeshBasicMaterial({ 
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true
    });
    
    // Create mesh
    const plane = new THREE.Mesh(geometry, material);
    
    // Position at the centroid
    const normalizedCoords = normalizeCoordinates(
      [polygon.centroid],
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    )[0];
    
    // Position slightly above the land to avoid z-fighting
    plane.position.set(normalizedCoords.x, 0.05, -normalizedCoords.y);
    
    // Rotate to lay flat on the ground (90 degrees around X axis)
    plane.rotation.x = -Math.PI / 2;
    
    // Add to scene and store reference
    this.scene.add(plane);
    this.coatOfArmSprites[polygon.id] = plane;
    
    console.log(`Added flat coat of arms for ${polygon.id} owned by ${polygon.owner} at position:`, 
      normalizedCoords.x, 0.05, -normalizedCoords.y);
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
    // Create a canvas
    const canvas = document.createElement('canvas');
    const size = 256; // Larger canvas for better quality
    canvas.width = size;
    canvas.height = size;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Draw a colored circle with border
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 8;
    ctx.stroke();
    
    // Create a texture from the canvas
    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    
    // Create a flat plane for the colored circle - increase size for better visibility
    const planeSize = 2.5; // Increased for better visibility
    const geometry = new THREE.PlaneGeometry(planeSize, planeSize);
    
    // Create material with the texture
    const material = new THREE.MeshBasicMaterial({ 
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true
    });
    
    // Create mesh
    const plane = new THREE.Mesh(geometry, material);
    
    // Position at the centroid
    const normalizedCoords = normalizeCoordinates(
      [polygon.centroid],
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    )[0];
    
    // Position higher above the land to avoid z-fighting
    plane.position.set(normalizedCoords.x, 0.25, -normalizedCoords.y); // Increased height
    
    // Rotate to lay flat on the ground (90 degrees around X axis)
    plane.rotation.x = -Math.PI / 2;
    
    // Set a high renderOrder to ensure it's always on top
    plane.renderOrder = 10;
    
    // Add to scene and store reference
    this.scene.add(plane);
    this.coatOfArmSprites[polygon.id] = plane;
  }

  // Add method to update polygon owner
  public updatePolygonOwner(polygonId: string, newOwner: string) {
    // Find the polygon in our list
    const polygon = this.polygons.find(p => p.id === polygonId);
    if (!polygon) return;
    
    // Update the polygon's owner
    polygon.owner = newOwner;
    
    // Find the corresponding LOD polygon
    const lodPolygon = this.lodPolygons.find(lp => 
      lp.getMesh() === this.polygonMeshesRef.current[polygonId]
    );
    
    if (!lodPolygon) return;
    
    // Get the owner's color from the users data
    let ownerColor = null;
    if (newOwner) {
      if (this.ownerColorMap[newOwner]) {
        ownerColor = this.ownerColorMap[newOwner];
        console.log(`Using stored color for ${newOwner}: ${ownerColor}`);
      } else if (this.users[newOwner] && this.users[newOwner].color) {
        ownerColor = this.users[newOwner].color;
        // Also store in the color map for future use
        this.ownerColorMap[newOwner] = ownerColor;
        console.log(`Found color for ${newOwner} in users data: ${ownerColor}`);
      } else {
        // Use default color if no owner color is specified
        ownerColor = '#7cac6a'; // Default green color
      }
    }
    
    // Get the owner's coat of arms URL if available
    let ownerCoatOfArmsUrl = null;
    if (newOwner && this.ownerCoatOfArmsMap && this.ownerCoatOfArmsMap[newOwner]) {
      ownerCoatOfArmsUrl = this.ownerCoatOfArmsMap[newOwner];
    }
    
    // Update the LOD polygon with the new owner's color and coat of arms
    lodPolygon.updateOwner(newOwner, ownerColor);
    
    if (ownerCoatOfArmsUrl) {
      lodPolygon.updateCoatOfArmsTexture(ownerCoatOfArmsUrl);
    }
    
    // Update coat of arms sprites
    this.updateCoatOfArmsSprites();
  }
  
  // Add method to update hover state
  public updateHoverState(hoveredPolygonId: string | null) {
    console.log('Updating hover state for polygon:', hoveredPolygonId);
    
    // Update hover state for all LOD polygons
    this.lodPolygons.forEach(lodPolygon => {
      if (!lodPolygon) return;
      
      try {
        const polygonId = this.polygons.find(
          p => p && lodPolygon.getMesh() === this.polygonMeshesRef.current[p.id]
        )?.id;
        
        if (polygonId) {
          // Apply hover state based on ID match
          lodPolygon.updateHoverState(polygonId === hoveredPolygonId);
        }
      } catch (error) {
        console.error('Error updating hover state for polygon:', error);
      }
    });
  }

  // Add method to create shore effects for islands
  private createShoreEffects() {
    if (this.performanceMode) return; // Skip in performance mode
    
    console.log('Creating shore effects for islands...');
    
    this.polygons.forEach(polygon => {
      if (!polygon.coordinates || polygon.coordinates.length < 3) return;
      
      const normalizedCoords = normalizeCoordinates(
        polygon.coordinates,
        this.bounds.centerLat,
        this.bounds.centerLng,
        this.bounds.scale,
        this.bounds.latCorrectionFactor
      );
      
      // Create a slightly larger shape for the shore
      const shoreShape = createPolygonShape(normalizedCoords);
      
      // Create a slightly larger extrusion for the shore
      const shoreExtrudeSettings = {
        steps: 1,
        depth: 0.01,  // Very thin
        bevelEnabled: true,
        bevelThickness: 0.2,
        bevelSize: 0.3,
        bevelSegments: 3
      };
      
      const shoreGeometry = new THREE.ExtrudeGeometry(shoreShape, shoreExtrudeSettings);
      shoreGeometry.rotateX(-Math.PI / 2);
      
      // Create a gradient material for the shore
      const shoreMaterial = new THREE.MeshStandardMaterial({
        color: 0xf0e68c,  // Light sand color
        roughness: 1.0,
        metalness: 0.0,
        transparent: true,
        opacity: 0.7,
        side: THREE.FrontSide
      });
      
      // Load custom sand texture for the shore
      this.textureLoader.load('/textures/sand.jpg', 
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(8, 8);  // More repetition for smaller detail
          shoreMaterial.map = texture;
          shoreMaterial.needsUpdate = true;
          console.log('Shore sand texture loaded successfully');
        },
        undefined,
        (error) => {
          console.error('Error loading shore sand texture:', error);
        }
      );
      
      const shoreMesh = new THREE.Mesh(shoreGeometry, shoreMaterial);
      shoreMesh.position.y = -0.05;  // Position slightly below the main land
      
      this.scene.add(shoreMesh);
    });
  }
  
  public cleanup() {
    // Clean up all LOD polygons
    this.lodPolygons.forEach(lodPolygon => {
      lodPolygon.cleanup();
    });
    
    // Clean up coat of arms objects (planes or sprites)
    Object.values(this.coatOfArmSprites).forEach(obj => {
      this.scene.remove(obj);
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
    });
    this.coatOfArmSprites = {};
    
    // Dispose of textures
    this.sandBaseColor.dispose();
    this.sandNormalMap.dispose();
    this.sandRoughnessMap.dispose();
  }
}
