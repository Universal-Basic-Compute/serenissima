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

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    
    // Initialize texture loader
    if (!PolygonRendererFacade.sharedTextureLoader) {
      PolygonRendererFacade.sharedTextureLoader = new THREE.TextureLoader();
      PolygonRendererFacade.sharedTextureLoader.setCrossOrigin('anonymous');
    }
    this.textureLoader = PolygonRendererFacade.sharedTextureLoader;
    
    // Load shared textures if they don't exist yet
    this.loadSharedTextures();
  }
  
  /**
   * Load shared textures for all polygon instances
   */
  private loadSharedTextures(): void {
    if (this.isDisposed) return;
    
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
   * Create a standard material for land polygons
   */
  public createLandMaterial(): THREE.MeshStandardMaterial {
    if (this.isDisposed) {
      throw new Error('PolygonRendererFacade has been disposed');
    }
    
    return new THREE.MeshStandardMaterial({
      map: PolygonRendererFacade.sharedTextures.sandBaseColor,
      normalMap: PolygonRendererFacade.sharedTextures.sandNormalMap,
      roughnessMap: PolygonRendererFacade.sharedTextures.sandRoughnessMap,
      color: 0xf5e9c8, // Sand color
      side: THREE.DoubleSide,
      transparent: false,
      roughness: 0.8,
      metalness: 0.1
    });
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
    mesh.position.y = 0.2; // Slightly above water
    mesh.renderOrder = 1;
    
    // Apply polygon offset to prevent z-fighting
    if (material instanceof THREE.Material) {
      material.polygonOffset = true;
      material.polygonOffsetFactor = 1;
      material.polygonOffsetUnits = 1;
    }
    
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
   */
  public loadTexture(
    url: string,
    onLoad?: (texture: THREE.Texture) => void,
    onError?: (error: ErrorEvent) => void
  ): THREE.Texture {
    if (this.isDisposed) {
      throw new Error('PolygonRendererFacade has been disposed');
    }
    
    const texture = new THREE.Texture();
    
    this.textureLoader.load(
      url,
      (loadedTexture) => {
        texture.image = loadedTexture.image;
        texture.needsUpdate = true;
        if (onLoad) onLoad(texture);
      },
      undefined,
      (error) => {
        console.error(`Error loading texture ${url}:`, error);
        if (onError) onError(error);
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
   */
  public createCircularTexture(texture: THREE.Texture): THREE.Texture {
    if (this.isDisposed) {
      throw new Error('PolygonRendererFacade has been disposed');
    }
    
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
