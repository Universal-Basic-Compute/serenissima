import * as THREE from 'three';
import { normalizeCoordinates } from '../../components/PolygonViewer/utils';

export interface CoatOfArmsRendererProps {
  scene: THREE.Scene;
  bounds: {
    centerLat: number;
    centerLng: number;
    scale: number;
    latCorrectionFactor: number;
  };
}

export class CoatOfArmsRenderer {
  private scene: THREE.Scene;
  private bounds: any;
  private textureLoader: THREE.TextureLoader;
  private coatOfArmsSprites: Record<string, THREE.Object3D> = {};
  private ownerCoatOfArmsMap: Record<string, string> = {};
  private isRenderingCoatOfArms: boolean = false;
  private hasRenderedCoatOfArms: boolean = false;

  constructor({ scene, bounds }: CoatOfArmsRendererProps) {
    this.scene = scene;
    this.bounds = bounds;
    this.textureLoader = new THREE.TextureLoader();
  }

  public updateCoatOfArms(ownerCoatOfArmsMap: Record<string, string>): void {
    this.ownerCoatOfArmsMap = { ...this.ownerCoatOfArmsMap, ...ownerCoatOfArmsMap };
  }

  public createCoatOfArmsSprites(polygons: any[]): void {
    // Prevent concurrent or duplicate rendering
    if (this.isRenderingCoatOfArms) {
      console.log(`Already rendering coat of arms, skipping duplicate call`);
      return;
    }

    this.isRenderingCoatOfArms = true;

    // Remove any existing sprites first
    this.clearCoatOfArmsSprites();

    // Process each polygon with an owner
    polygons.forEach(polygon => {
      // Check for both 'owner' and 'User' properties
      const ownerValue = polygon.owner || polygon.User;

      if (!ownerValue) return;

      // Check if polygon has any valid position property
      if (!polygon.coatOfArmsCenter && !polygon.center && !polygon.centroid) {
        console.log(`Polygon ${polygon.id} has owner ${ownerValue} but no position property`);
        return;
      }

      // Get the coat of arms URL for the owner
      const coatOfArmsUrl = this.ownerCoatOfArmsMap[ownerValue];
      if (!coatOfArmsUrl) {
        console.log(`No coat of arms found for owner ${ownerValue}`);
        return;
      }

      // Create circular coat of arms
      this.createCircularCoatOfArms(polygon, coatOfArmsUrl);
    });

    this.hasRenderedCoatOfArms = true;
    this.isRenderingCoatOfArms = false;
  }

  public clearCoatOfArmsSprites(): void {
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

  private createCircularCoatOfArms(polygon: any, coatOfArmsUrl: string): void {
    // Check for all possible position properties, with fallbacks
    const positionCoord = polygon.coatOfArmsCenter || polygon.center || polygon.centroid;

    if (!positionCoord) {
      console.warn(`No valid position found for coat of arms on polygon ${polygon.id}`);
      return;
    }

    // Convert position to 3D position
    const normalizedCoord = normalizeCoordinates(
      [positionCoord],
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    )[0];

    // Create a plane geometry for the texture
    const sceneScale = this.bounds.scale;
    const spriteScale = Math.max(0.75, sceneScale / 667);
    const planeGeometry = new THREE.PlaneGeometry(spriteScale, spriteScale);
    const planeMaterial = new THREE.MeshBasicMaterial({
      map: null, // Will be set when texture loads
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      opacity: 0 // Start with opacity 0 for fade-in effect
    });

    // Create mesh and position it
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.position.set(normalizedCoord.x, 0.2, -normalizedCoord.y);
    plane.rotation.x = -Math.PI / 2 + Math.PI; // Rotate to lie flat and invert orientation
    plane.renderOrder = 10; // Ensure it renders on top of land

    // Mark this mesh as a coat of arms
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
        const circularTexture = this.createCircularTexture(texture, true);

        // Apply the texture to the plane material
        if (planeMaterial) {
          planeMaterial.map = circularTexture;
          planeMaterial.needsUpdate = true;

          // Adjust plane scale based on texture aspect ratio and scene scale
          if (texture.image && texture.image.width && texture.image.height) {
            const aspectRatio = texture.image.width / texture.image.height;
            const sceneScale = this.bounds.scale;
            const baseScale = Math.max(0.19, sceneScale / 2633);
            plane.scale.set(baseScale * aspectRatio, baseScale, 1);
          }

          // Add to scene after texture is loaded
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
        planeGeometry.dispose();
        planeMaterial.dispose();
      }
    );
  }

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
      ctx.fillStyle = '#FFF8E0';
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

  public setVisible(visible: boolean): void {
    Object.values(this.coatOfArmsSprites).forEach(sprite => {
      sprite.visible = visible;
    });
  }

  public cleanup(): void {
    this.clearCoatOfArmsSprites();
  }
}