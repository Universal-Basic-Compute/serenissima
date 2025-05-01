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
  private coatOfArmSprites: Record<string, THREE.Sprite> = {};

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
                }
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
      color: '#e6d2a8', // More yellow/tan color
      map: this.sandBaseColor,
      normalMap: this.sandNormalMap,
      roughnessMap: this.sandRoughnessMap,
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
    
    if (this.activeView === 'land') {
      // For land view, use a more terrain-like material
      sampleMaterial.color.set('#7cac6a'); // More green for land view
      sampleMaterial.roughness = 0.9;
      sampleMaterial.metalness = 0.0;
    }
    
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
      }
    );
    
    this.lodPolygons.push(lodPolygon);
    this.polygonMeshesRef.current['sample'] = lodPolygon.getMesh();
    
    console.log('Added sample polygon to scene');
  }
  
  public update(selectedPolygonId: string | null = null) {
    // Update LOD for all polygons
    this.lodPolygons.forEach(lodPolygon => {
      lodPolygon.updateLOD(this.camera.position);
    });
    
    // Update selection state
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
    
    // Update coat of arms sprites - show in land view, hide in other views
    this.updateCoatOfArmsSprites();
  }

  public updateQuality(performanceMode: boolean) {
    this.performanceMode = performanceMode;
    
    // Update all LOD polygons with the new quality setting
    this.lodPolygons.forEach(lodPolygon => {
      lodPolygon.updateQuality(performanceMode);
    });
  }
  
  public updateOwnerCoatOfArms(ownerCoatOfArmsMap: Record<string, string>) {
    this.ownerCoatOfArmsMap = ownerCoatOfArmsMap;
    this.updateCoatOfArmsSprites();
  }

  // Create and update coat of arms sprites with texture caching
  private updateCoatOfArmsSprites() {
    // Remove existing sprites
    Object.values(this.coatOfArmSprites).forEach(sprite => {
      this.scene.remove(sprite);
    });
    this.coatOfArmSprites = {};

    // Only create sprites if we're in land view
    if (this.activeView !== 'land') return;

    // Create a cache for textures to avoid loading the same texture multiple times
    const textureCache: Record<string, THREE.Texture> = {};
    
    // Create new sprites for each polygon with an owner
    const ownersToProcess = new Set<string>();
    
    // First, identify all unique owners that need sprites
    this.polygons.forEach(polygon => {
      if (polygon.owner && polygon.centroid && this.ownerCoatOfArmsMap[polygon.owner]) {
        ownersToProcess.add(polygon.owner);
      }
    });
    
    // Process owners in batches
    const processOwners = (owners: string[]) => {
      owners.forEach(owner => {
        // Load texture if not already in cache
        if (!textureCache[owner]) {
          textureCache[owner] = this.textureLoader.load(this.ownerCoatOfArmsMap[owner]);
          textureCache[owner].minFilter = THREE.LinearFilter; // Improve texture quality
        }
      });
      
      // Now create sprites for all polygons with these owners
      this.polygons.forEach(polygon => {
        if (polygon.owner && polygon.centroid && owners.includes(polygon.owner)) {
          // Use cached texture
          const texture = textureCache[polygon.owner];
          
          const material = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true,
            depthTest: true,
            depthWrite: false,
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
          
          // Position slightly above the land
          sprite.position.set(normalizedCoords.x, 5, -normalizedCoords.y);
          
          // Make the sprite a good size
          sprite.scale.set(8, 8, 1);
          
          // Add to scene and store reference
          this.scene.add(sprite);
          this.coatOfArmSprites[polygon.id] = sprite;
        }
      });
    };
    
    // Process all owners at once if there are few, otherwise batch them
    const ownersArray = Array.from(ownersToProcess);
    if (ownersArray.length <= 5) {
      processOwners(ownersArray);
    } else {
      // Process in batches of 5
      for (let i = 0; i < ownersArray.length; i += 5) {
        const batch = ownersArray.slice(i, i + 5);
        setTimeout(() => processOwners(batch), i * 100); // Stagger loading
      }
    }
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
