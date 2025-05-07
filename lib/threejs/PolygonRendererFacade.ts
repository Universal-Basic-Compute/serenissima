import * as THREE from 'three';
import { Polygon, ViewMode } from '../../components/PolygonViewer/types';
import { MutableRefObject } from 'react';

/**
 * Facade for Three.js polygon rendering operations
 * Hides implementation details and provides a clean interface
 */
export class PolygonRendererFacade {
  private scene: THREE.Scene;
  private textureLoader: THREE.TextureLoader;
  private static sharedTextureLoader: THREE.TextureLoader | null = null;
  private static sharedTextures: {
    sandBaseColor?: THREE.Texture;
    sandNormalMap?: THREE.Texture;
    sandRoughnessMap?: THREE.Texture;
  } = {};
  private isDisposed: boolean = false;
  private isLandView: boolean = false;

  constructor(scene: THREE.Scene, activeView?: ViewMode) {
    this.scene = scene;
    this.isLandView = activeView === 'land';
    
    // Initialize texture loader
    if (!PolygonRendererFacade.sharedTextureLoader) {
      PolygonRendererFacade.sharedTextureLoader = new THREE.TextureLoader();
      PolygonRendererFacade.sharedTextureLoader.setCrossOrigin('anonymous');
    }
    this.textureLoader = PolygonRendererFacade.sharedTextureLoader;
    
    // Load shared textures if don't exist yet and not in land view
    if (!this.isLandView) {
      this.loadSharedTextures();
    } else {
      console.log('Land view active: Skipping shared texture loading');
    }
  }
  
  /**
   * Load shared textures for all polygon instances
   */
  private loadSharedTextures(): void {
    if (this.isDisposed) return;
    
    if (this.isLandView) {
      console.log('Land view active: Skipping shared texture loading');
      return;
    }
    
    if (!PolygonRendererFacade.sharedTextures.sandBaseColor) {
      console.log('Loading shared textures...');
      
      // Load sand texture
      PolygonRendererFacade.sharedTextures.sandBaseColor = this.textureLoader.load(
        '/textures/sand.jpg',
        (texture) => {
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
      
      // Load normal map
      PolygonRendererFacade.sharedTextures.sandNormalMap = this.textureLoader.load(
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
      
      // Load roughness map
      PolygonRendererFacade.sharedTextures.sandRoughnessMap = this.textureLoader.load(
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
  }
  
  /**
   * Get the shared sand texture
   */
  public getSandTexture(): THREE.Texture | undefined {
    return PolygonRendererFacade.sharedTextures.sandBaseColor;
  }
  
  /**
   * Get the shared sand normal map
   */
  public getSandNormalMap(): THREE.Texture | undefined {
    return PolygonRendererFacade.sharedTextures.sandNormalMap;
  }
  
  /**
   * Get the shared sand roughness map
   */
  public getSandRoughnessMap(): THREE.Texture | undefined {
    return PolygonRendererFacade.sharedTextures.sandRoughnessMap;
  }
  
  /**
   * Create a material for land polygons
   * @param forceBasicMaterial If true, creates a MeshBasicMaterial without textures
   */
  public createLandMaterial(forceBasicMaterial: boolean = false): THREE.Material {
    if (this.isDisposed) {
      throw new Error('PolygonRendererFacade has been disposed');
    }
    
    // In land view or when forced, use a simple MeshBasicMaterial without textures
    if (this.isLandView || forceBasicMaterial) {
      return new THREE.MeshBasicMaterial({
        color: 0xf5e9c8, // Sand color
        side: THREE.DoubleSide,
        transparent: false,
        depthWrite: true
      });
    }
    
    // For other views, use MeshStandardMaterial with textures
    const material = new THREE.MeshStandardMaterial({
      map: PolygonRendererFacade.sharedTextures.sandBaseColor,
      normalMap: PolygonRendererFacade.sharedTextures.sandNormalMap,
      roughnessMap: PolygonRendererFacade.sharedTextures.sandRoughnessMap,
      color: 0xf5e9c8, // Sand color
      side: THREE.DoubleSide,
      transparent: false,
      roughness: 0.8,
      metalness: 0.1,
      // Remove any depth offset that might create shadow-like effects
      depthWrite: true,
      polygonOffset: false,
      polygonOffsetFactor: 0,
      polygonOffsetUnits: 0
    });
    
    // Set shadow properties on the material instance instead
    material.userData.receiveShadow = false;
    
    return material;
  }
  
  /**
   * Create a mesh for a polygon
   */
  public createPolygonMesh(
    geometry: THREE.ShapeGeometry,
    material: THREE.Material
  ): THREE.Mesh {
    if (this.isDisposed) {
      throw new Error('PolygonRendererFacade has been disposed');
    }
    
    const mesh = new THREE.Mesh(geometry, material);
    
    // Configure mesh properties
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0; // Exactly at water level
    mesh.renderOrder = 1;
    
    // Remove polygon offset
    if (material instanceof THREE.Material) {
      material.polygonOffset = false;
    }
    
    // Disable shadows
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    
    // Add userData to identify this as a polygon
    mesh.userData = {
      isPolygon: true,
      alwaysVisible: true
    };
    
    // Set a high render order to ensure it renders on top
    mesh.renderOrder = 50;
    
    return mesh;
  }
  
  /**
   * Create a colored circle for a polygon owner
   */
  public createColoredCircle(
    position: THREE.Vector3,
    color: string,
    size: number = 0.8
  ): THREE.Mesh {
    if (this.isDisposed) {
      throw new Error('PolygonRendererFacade has been disposed');
    }
    
    // Create a circle geometry
    const circleGeometry = new THREE.CircleGeometry(size, 32);
    const circleMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    
    // Create mesh and position it
    const circleMesh = new THREE.Mesh(circleGeometry, circleMaterial);
    circleMesh.position.copy(position);
    circleMesh.position.y = 0.15; // Higher above ground for better visibility
    circleMesh.rotation.x = -Math.PI / 2; // Rotate to lie flat
    circleMesh.renderOrder = 100; // Ensure it renders on top of everything
    
    return circleMesh;
  }
  
  /**
   * Load a texture with error handling
   * In land mode, returns a placeholder texture without loading from network
   */
  public loadTexture(
    url: string,
    onLoad?: (texture: THREE.Texture) => void,
    onError?: (error: Error) => void,
    isLandMode?: boolean
  ): THREE.Texture {
    if (this.isDisposed) {
      throw new Error('PolygonRendererFacade has been disposed');
    }
    
    // In land mode, return a placeholder texture without loading from network
    if (this.isLandView || isLandMode) {
      console.log('Land mode active: Using placeholder texture instead of loading:', url);
      const placeholderTexture = new THREE.Texture();
      
      // Create a simple canvas with a colored circle
      const canvas = document.createElement('canvas');
      const size = 64; // Small size for performance
      canvas.width = size;
      canvas.height = size;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#8B4513'; // Brown color
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
        ctx.fill();
      }
      
      placeholderTexture.image = canvas;
      placeholderTexture.needsUpdate = true;
      
      if (onLoad) onLoad(placeholderTexture);
      return placeholderTexture;
    }
    
    // Normal texture loading for other modes
    const texture = new THREE.Texture();
    
    // Handle both external and local URLs
    const textureUrl = url.startsWith('http') 
      ? url 
      : `${window.location.origin}${url}`;
    
    this.textureLoader.load(
      textureUrl,
      (loadedTexture) => {
        texture.image = loadedTexture.image;
        texture.needsUpdate = true;
        if (onLoad) onLoad(texture);
      },
      undefined,
      (error: unknown) => {
        console.error(`Error loading texture ${textureUrl}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (onError) onError(new Error(`Failed to load texture: ${errorMessage}`));
      }
    );
    
    return texture;
  }
  
  /**
   * Add an object to the scene
   */
  public addToScene(object: THREE.Object3D): void {
    if (this.isDisposed) {
      throw new Error('PolygonRendererFacade has been disposed');
    }
    
    this.scene.add(object);
  }
  
  /**
   * Remove an object from the scene
   */
  public removeFromScene(object: THREE.Object3D): void {
    if (this.isDisposed) {
      throw new Error('PolygonRendererFacade has been disposed');
    }
    
    this.scene.remove(object);
  }
  
  /**
   * Create a circular texture from an existing texture
   * In land mode, creates a simple colored circle without processing the input texture
   */
  public createCircularTexture(texture: THREE.Texture, isLandMode: boolean = false): THREE.Texture {
    if (this.isDisposed) {
      throw new Error('PolygonRendererFacade has been disposed');
    }
    
    // In land mode or if texture.image doesn't exist, create a simple colored circle
    if (isLandMode || !texture.image) {
      console.log('Creating simple colored circle texture for land mode');
      
      // Create a canvas for a simple texture
      const canvas = document.createElement('canvas');
      const size = 64; // Smaller size for better performance
      canvas.width = size;
      canvas.height = size;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return texture;
      
      // Draw a colored circle as fallback
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
      ctx.fillStyle = '#8B4513'; // Default brown color
      ctx.fill();
      
      // Thinner border for performance
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Create a new texture from the canvas
      const simpleTexture = new THREE.Texture(canvas);
      simpleTexture.needsUpdate = true;
      return simpleTexture;
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
   * Create a polygon-shaped texture from an existing texture
   * In land mode, creates a simple colored shape without processing the input texture
   */
  public createPolygonShapedTexture(
    texture: THREE.Texture, 
    polygonCoords: {x: number, y: number}[],
    ownerName?: string,
    isLandMode: boolean = false
  ): THREE.Texture {
    if (this.isDisposed) {
      throw new Error('PolygonRendererFacade has been disposed');
    }
    
    // In land mode or if texture.image doesn't exist or polygon coords are invalid, create a simple shape
    if (isLandMode || !texture.image || polygonCoords.length < 3) {
      console.log('Creating simple colored shape texture for land mode');
      return this.createCircularTexture(texture, isLandMode);
    }
    
    // Calculate bounds of the polygon
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    polygonCoords.forEach(coord => {
      minX = Math.min(minX, coord.x);
      maxX = Math.max(maxX, coord.x);
      minY = Math.min(minY, coord.y);
      maxY = Math.max(maxY, coord.y);
    });
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    // Create a canvas to draw the masked image
    const canvas = document.createElement('canvas');
    const size = 512; // Use a power of 2 for better texture performance
    canvas.width = size;
    canvas.height = size;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return texture; // Fallback if context creation fails
    
    try {
      // Clear the canvas first
      ctx.clearRect(0, 0, size, size);
      
      // Draw the polygon shape on the canvas
      ctx.beginPath();
      
      // Scale and center the polygon shape to fit the canvas
      const scale = Math.min(size / width, size / height) * 0.8;
      const offsetX = size/2 - (minX + width/2) * scale;
      const offsetY = size/2 - (minY + height/2) * scale;
      
      // Draw the polygon path
      ctx.moveTo(
        polygonCoords[0].x * scale + offsetX,
        polygonCoords[0].y * scale + offsetY
      );
      for (let i = 1; i < polygonCoords.length; i++) {
        ctx.lineTo(
          polygonCoords[i].x * scale + offsetX,
          polygonCoords[i].y * scale + offsetY
        );
      }
      ctx.closePath();
      
      // Create clipping region
      ctx.save();
      ctx.clip();
      
      // Draw the coat of arms image inside the clipped region
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
        
        ctx.drawImage(texture.image, imgX, imgY, drawWidth, drawHeight);
      }
      
      // Restore context and add a border
      ctx.restore();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      
      // Add owner name text if provided
      if (ownerName) {
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(ownerName, size/2, size/2);
        ctx.fillText(ownerName, size/2, size/2);
      }
      
      // Create a new texture from the canvas
      const shapedTexture = new THREE.Texture(canvas);
      shapedTexture.needsUpdate = true;
      
      return shapedTexture;
    } catch (error) {
      console.error('Error creating polygon-shaped texture:', error);
      // Fall back to circular texture on error
      return this.createCircularTexture(texture);
    }
  }
  
  /**
   * Force a render update
   */
  public forceRender(): void {
    if (this.isDisposed) return;
    
    if (this.scene.userData.forceRender) {
      this.scene.userData.forceRender();
    }
  }
  
  /**
   * Dispose of resources
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    
    // Note: We don't dispose shared textures here as they might be used by other instances
  }
}
