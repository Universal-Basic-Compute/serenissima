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
  
  // Add a method to create a sprite for the coat of arms
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
  private users: Record<string, any> = {}; // Store users data

  // Create a static texture loader to be shared across instances
  private static sharedTextureLoader: THREE.TextureLoader | null = null;
  private static sharedTextures: {
    sandBaseColor?: THREE.Texture;
    sandNormalMap?: THREE.Texture;
    sandRoughnessMap?: THREE.Texture;
  } = {};

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
    
    // Initialize texture loader explicitly
    this.textureLoader = new THREE.TextureLoader();
    
    // Process users data to create coat of arms map
    if (users) {
      Object.values(users).forEach(user => {
        if (user.user_name && user.coat_of_arms_image) {
          this.ownerCoatOfArmsMap[user.user_name] = user.coat_of_arms_image;
        }
      });
      console.log(`Processed ${Object.keys(this.ownerCoatOfArmsMap).length} coat of arms from users data`);
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
      PolygonRenderer.sharedTextures.sandBaseColor = this.textureLoader.load(
        'https://threejs.org/examples/textures/terrain/grasslight-big.jpg'
      );
      PolygonRenderer.sharedTextures.sandNormalMap = this.textureLoader.load(
        'https://threejs.org/examples/textures/terrain/grasslight-big-nm.jpg'
      );
      PolygonRenderer.sharedTextures.sandRoughnessMap = this.textureLoader.load(
        'https://threejs.org/examples/textures/terrain/grasslight-big-ao.jpg'
      );
      
      // Configure texture settings once
      PolygonRenderer.sharedTextures.sandBaseColor.wrapS = 
      PolygonRenderer.sharedTextures.sandBaseColor.wrapT = THREE.RepeatWrapping;
      PolygonRenderer.sharedTextures.sandNormalMap.wrapS = 
      PolygonRenderer.sharedTextures.sandNormalMap.wrapT = THREE.RepeatWrapping;
      PolygonRenderer.sharedTextures.sandRoughnessMap.wrapS = 
      PolygonRenderer.sharedTextures.sandRoughnessMap.wrapT = THREE.RepeatWrapping;
      
      // Make the texture 4x bigger by reducing the repeat value to 1/4 of the original
      PolygonRenderer.sharedTextures.sandBaseColor.repeat.set(1.25, 1.25);
      PolygonRenderer.sharedTextures.sandNormalMap.repeat.set(1.25, 1.25);
      PolygonRenderer.sharedTextures.sandRoughnessMap.repeat.set(1.25, 1.25);
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
      // Process polygons in batches to prevent UI freezing
      const batchSize = 10; // Process 10 polygons at a time
      const totalPolygons = this.polygons.length;
      let processedCount = 0;
      
      const processBatch = (startIdx: number) => {
        const endIdx = Math.min(startIdx + batchSize, totalPolygons);
        
        for (let i = startIdx; i < endIdx; i++) {
          const polygon = this.polygons[i];
          
          if (polygon.coordinates && polygon.coordinates.length > 2) {
            try {
              // Get the owner's color from the users data
              let ownerColor = null;
              if (polygon.owner && this.users[polygon.owner] && this.users[polygon.owner].color) {
                ownerColor = this.users[polygon.owner].color;
              }
            
              // Get the owner's coat of arms URL if available
              let ownerCoatOfArmsUrl = null;
              if (polygon.owner && this.ownerCoatOfArmsMap && this.ownerCoatOfArmsMap[polygon.owner]) {
                ownerCoatOfArmsUrl = this.ownerCoatOfArmsMap[polygon.owner];
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
        
        // If there are more polygons to process, schedule the next batch
        if (endIdx < totalPolygons) {
          setTimeout(() => processBatch(endIdx), 0);
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
      color: this.activeView === 'land' ? '#7cac6a' : '#e6d2a8', // More yellow/tan color
      map: this.activeView !== 'land' ? this.sandBaseColor : null,
      normalMap: this.activeView !== 'land' ? this.sandNormalMap : null,
      roughnessMap: this.activeView !== 'land' ? this.sandRoughnessMap : null,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
      flatShading: false,
      wireframe: false,
      // Remove polygon edges by setting these properties:
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    
    const sampleMesh = new THREE.Mesh(sampleGeometry, sampleMaterial);
    sampleMesh.castShadow = true;
    sampleMesh.receiveShadow = true;
    
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
    
    // Update coat of arms sprites - recreate them when switching to land view
    if (activeView === 'land') {
      this.updateCoatOfArmsSprites();
    } else {
      // Remove sprites when not in land view
      Object.values(this.coatOfArmSprites).forEach(sprite => {
        this.scene.remove(sprite);
      });
      this.coatOfArmSprites = {};
    }
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
      }
    });
    
    console.log('Combined coat of arms map now has', Object.keys(this.ownerCoatOfArmsMap).length, 'entries');
    
    // If we're in land view, apply the new coat of arms textures
    if (this.activeView === 'land') {
      this.polygons.forEach((polygon) => {
        if (polygon.owner && this.ownerCoatOfArmsMap[polygon.owner]) {
          const lodPolygon = this.lodPolygons.find(lp => 
            lp.getMesh() === this.polygonMeshesRef.current[polygon.id]
          );
          
          if (lodPolygon) {
            lodPolygon.updateCoatOfArmsTexture(this.ownerCoatOfArmsMap[polygon.owner]);
          }
        }
      });
    }
    
    // Update the sprites
    this.updateCoatOfArmsSprites();
  }
  
  // Add a new method to create a colored circle sprite
  private createColoredCircleSprite(polygon: Polygon, color: string) {
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
    
    // Create a sprite material
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      sizeAttenuation: true
    });
    
    const sprite = new THREE.Sprite(material);
    
    // Position at the centroid
    const normalizedCoords = normalizeCoordinates(
      [polygon.centroid],
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    )[0];
    
    // Position higher above the land
    sprite.position.set(normalizedCoords.x, 0.5, -normalizedCoords.y);
    
    // Make sprites larger
    sprite.scale.set(4, 4, 1);
    
    // Add to scene and store reference
    this.scene.add(sprite);
    this.coatOfArmSprites[polygon.id] = sprite;
  }

  // Create and update coat of arms sprites with texture caching
  private updateCoatOfArmsSprites() {
    console.log('Updating coat of arms sprites, active view:', this.activeView);
    console.log('Owner coat of arms map has', Object.keys(this.ownerCoatOfArmsMap).length, 'entries');
    console.log('Users data has', Object.keys(this.users).length, 'entries');
    
    // Remove existing sprites
    Object.values(this.coatOfArmSprites).forEach(sprite => {
      this.scene.remove(sprite);
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
      (sprite.material as THREE.SpriteMaterial).dispose();
    });
    this.coatOfArmSprites = {};

    // Only create sprites if we're in land view
    if (this.activeView !== 'land') {
      console.log('Not in land view, skipping coat of arms sprites');
      return;
    }

    // Process each polygon with an owner
    this.polygons.forEach(polygon => {
      if (!polygon.owner || !polygon.centroid) return;
      
      // Get the coat of arms URL
      const coatOfArmsUrl = this.ownerCoatOfArmsMap[polygon.owner];
      
      // Get the owner's color from the users data
      let ownerColor = '#8B4513'; // Default brown color
      if (this.users[polygon.owner] && this.users[polygon.owner].color) {
        ownerColor = this.users[polygon.owner].color;
      }
      
      if (!coatOfArmsUrl) {
        // Create a colored circle sprite as fallback
        this.createColoredCircleSprite(polygon, ownerColor);
        return;
      }
      
      // Load the texture
      this.textureLoader.load(
        coatOfArmsUrl,
        (texture) => {
          // Create sprite with the texture directly (no circular masking)
          const material = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true,
            depthTest: true,
            depthWrite: true,
            sizeAttenuation: true
          });
          
          const sprite = new THREE.Sprite(material);
          
          // Position at the centroid
          const normalizedCoords = normalizeCoordinates(
            [polygon.centroid],
            this.bounds.centerLat,
            this.bounds.centerLng,
            this.bounds.scale,
            this.bounds.latCorrectionFactor
          )[0];
          
          // Position higher above the land to ensure visibility
          sprite.position.set(normalizedCoords.x, 0.5, -normalizedCoords.y);
          
          // Make sprites larger
          sprite.scale.set(4, 4, 1);
          
          // Add to scene and store reference
          this.scene.add(sprite);
          this.coatOfArmSprites[polygon.id] = sprite;
          
          console.log(`Added coat of arms sprite for ${polygon.id} at position:`, 
            normalizedCoords.x, 0.5, -normalizedCoords.y);
        },
        undefined,
        (error) => {
          console.error(`Error loading texture for ${polygon.owner}:`, error);
          // Create a colored circle as fallback
          this.createColoredCircleSprite(polygon, ownerColor);
        }
      );
    });
  }

  // Add this helper method to create a sprite for a polygon
  private createSpriteForPolygon(polygon: Polygon, texture: THREE.Texture) {
    const material = new THREE.SpriteMaterial({ 
      map: texture, // The texture should already be circular at this point
      transparent: true,
      depthTest: true, // Changed to true for proper depth sorting
      depthWrite: true,
      sizeAttenuation: true
    });
    
    const sprite = new THREE.Sprite(material);
    
    // Position at the centroid
    const normalizedCoords = normalizeCoordinates(
      [polygon.centroid],
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    )[0];
    
    // Position higher above the land to avoid z-fighting and ensure visibility
    sprite.position.set(normalizedCoords.x, 0.5, -normalizedCoords.y);
  
    // Make sprites larger for better visibility
    sprite.scale.set(4, 4, 1);
  
    // Add to scene and store reference
    this.scene.add(sprite);
    this.coatOfArmSprites[polygon.id] = sprite;
    
    console.log(`Added coat of arms sprite for ${polygon.id} owned by ${polygon.owner} at position:`, 
      normalizedCoords.x, 0.5, -normalizedCoords.y);
  }
  
  // Add helper function to create a circular texture
  private createCircularTexture(texture: THREE.Texture, ownerColor: string = '#8B4513'): THREE.Texture {
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
      ctx.fillStyle = ownerColor;
      ctx.fill();
      ctx.strokeStyle = '#000000';
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
      
      // Fill with the owner's color first as a background
      ctx.fillStyle = ownerColor;
      ctx.fill();
      
      // Add a stroke around the circle
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 8;
      ctx.stroke();
      
      // Create a new clipping path for the image
      ctx.save();
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2 - 8, 0, Math.PI * 2);
      ctx.clip();
      
      // Calculate dimensions to maintain aspect ratio
      let drawWidth = size;
      let drawHeight = size;
      let offsetX = 0;
      let offsetY = 0;
      
      if (texture.image.width > texture.image.height) {
        // Landscape image
        drawHeight = (texture.image.height / texture.image.width) * size;
        offsetY = (size - drawHeight) / 2;
      } else if (texture.image.height > texture.image.width) {
        // Portrait image
        drawWidth = (texture.image.width / texture.image.height) * size;
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
      ctx.fillStyle = ownerColor;
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 8;
      ctx.stroke();
      
      const fallbackTexture = new THREE.Texture(canvas);
      fallbackTexture.needsUpdate = true;
      return fallbackTexture;
    }
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
    if (newOwner && this.users[newOwner] && this.users[newOwner].color) {
      ownerColor = this.users[newOwner].color;
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

  public cleanup() {
    // Clean up all LOD polygons
    this.lodPolygons.forEach(lodPolygon => {
      lodPolygon.cleanup();
    });
    
    // Clean up coat of arms sprites
    Object.values(this.coatOfArmSprites).forEach(sprite => {
      this.scene.remove(sprite);
      sprite.material.dispose();
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
    });
    this.coatOfArmSprites = {};
    
    // Dispose of textures
    this.sandBaseColor.dispose();
    this.sandNormalMap.dispose();
    this.sandRoughnessMap.dispose();
  }
}
