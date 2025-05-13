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
    this.textureLoader.crossOrigin = 'anonymous';
  }

  public updateCoatOfArms(ownerCoatOfArmsMap: Record<string, string>): void {
    console.log("Updating coat of arms map with:", ownerCoatOfArmsMap);
    
    // Create a new map with properly formatted URLs
    const formattedMap: Record<string, string> = {};
    
    // Process each entry to ensure proper URL format
    Object.entries(ownerCoatOfArmsMap).forEach(([owner, url]) => {
      if (url) {
        let formattedUrl = url as string;
        
        // If the URL doesn't start with http, format it properly
        if (!formattedUrl.startsWith('http')) {
          // If it doesn't have a specific path but just a username, construct the standard path
          if (!formattedUrl.includes('/coat-of-arms/')) {
            formattedUrl = `/coat-of-arms/${owner}.png`;
          }
          
          // If it's a relative path, ensure it has a leading slash
          if (!formattedUrl.startsWith('/')) {
            formattedUrl = `/${formattedUrl}`;
          }
          
          // Always use serenissima.ai domain for production
          formattedUrl = `https://serenissima.ai${formattedUrl}`;
        }
        
        formattedMap[owner] = formattedUrl;
        console.log(`Formatted coat of arms URL for ${owner}: ${formattedUrl}`);
      }
    });
    
    this.ownerCoatOfArmsMap = { ...this.ownerCoatOfArmsMap, ...formattedMap };
    console.log("Updated coat of arms map:", this.ownerCoatOfArmsMap);
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
      let coatOfArmsUrl = this.ownerCoatOfArmsMap[ownerValue];
      
      // If no coat of arms URL found, try to construct one based on the owner name
      if (!coatOfArmsUrl) {
        coatOfArmsUrl = `/coat-of-arms/${ownerValue}.png`;
        console.log(`No coat of arms URL found for ${ownerValue}, using constructed URL: ${coatOfArmsUrl}`);
        
        // Add to the map for future use
        this.ownerCoatOfArmsMap[ownerValue] = coatOfArmsUrl;
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
    plane.userData.polygonId = polygon.id || polygon.BuildingId;
    
    // Get owner value for error handling
    const ownerValue = polygon.owner || polygon.User || "Unknown";

    // Create an array of URLs to try in order - prioritize serenissima.ai
    const urlsToTry = [
      // 1. Always try serenissima.ai domain first with the owner name
      `https://serenissima.ai/coat-of-arms/${ownerValue}.png`,
      
      // 2. Try the original URL with serenissima.ai domain
      `https://serenissima.ai${coatOfArmsUrl}`,
      
      // 3. Try with current origin as fallback
      `${window.location.origin}${coatOfArmsUrl}`,
      
      // 4. Try with current origin and owner name as last resort
      `${window.location.origin}/coat-of-arms/${ownerValue}.png`
    ];
    
    console.log(`Will try these URLs for ${ownerValue}:`, urlsToTry);

    // Function to try loading the next URL in the array
    const tryNextUrl = (index: number) => {
      if (index >= urlsToTry.length) {
        console.warn(`All URLs failed for ${ownerValue}, creating default coat of arms`);
        this.createDefaultCoatOfArms(polygon, ownerValue);
        
        // Clean up unused resources
        planeGeometry.dispose();
        planeMaterial.dispose();
        return;
      }
      
      const currentUrl = urlsToTry[index];
      console.log(`Trying URL ${index + 1}/${urlsToTry.length} for ${ownerValue}: ${currentUrl}`);
      
      // Create a texture loader with crossOrigin set
      const crossOriginLoader = new THREE.TextureLoader();
      crossOriginLoader.crossOrigin = 'anonymous';
      
      crossOriginLoader.load(
        currentUrl,
        (texture) => {
          console.log(`Successfully loaded texture for ${ownerValue} from ${currentUrl}`);
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
            
            // Update the coat of arms map with the successful URL
            this.ownerCoatOfArmsMap[ownerValue] = currentUrl;
          }
        },
        undefined,
        (error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.warn(`Failed to load from ${currentUrl}: ${errorMessage}`);
          // Try the next URL
          tryNextUrl(index + 1);
        }
      );
    };
    
    // Start trying URLs
    tryNextUrl(0);
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

  private createDefaultCitizenTexture(): THREE.Texture {
    // Create a canvas for the default texture
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Could not get canvas context');
      // Return a basic empty texture as fallback
      return new THREE.Texture();
    }

    // Draw a simple placeholder texture
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, size, size);
    
    // Add a border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, size - 8, size - 8);
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    return texture;
  }

  private createCircularTexture(texture: THREE.Texture, invert: boolean = false): THREE.Texture {
    // Check if texture.image exists
    if (!texture.image) {
      console.warn('Texture image is null, creating fallback texture');
      return this.createDefaultCitizenTexture();
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
      
      ctx.restore();

      // Create a new texture from the canvas
      const circularTexture = new THREE.CanvasTexture(canvas);
      circularTexture.needsUpdate = true;

      return circularTexture;
    } catch (error) {
      console.error('Error creating circular texture:', error);
      return texture; // Return the original texture as fallback
    }
  }

  public setVisible(visible: boolean): void {
    Object.values(this.coatOfArmsSprites).forEach(sprite => {
      sprite.visible = visible;
    });
  }

  private createDefaultCoatOfArms(polygon: any, ownerName: string): void {
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
      map: null, // Will be set when texture is created
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
    plane.userData.polygonId = polygon.id || polygon.BuildingId;

    // Create a canvas for the default coat of arms
    const canvas = document.createElement('canvas');
    const size = 512;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Could not get canvas context');
      return;
    }

    // Generate a deterministic color based on the owner name
    const getColorFromString = (str: string): string => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      
      // Generate a hue between 0 and 360
      const hue = Math.abs(hash) % 360;
      
      // Use a fixed saturation and lightness for better visibility
      return `hsl(${hue}, 70%, 60%)`;
    };

    // Get a color based on the owner name
    const baseColor = getColorFromString(ownerName);

    // Draw a circular background
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.fill();
    
    // Add a white border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Add the owner's initials
    ctx.font = 'bold 160px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Get the first letter of the owner name
    const initial = ownerName.charAt(0).toUpperCase();
    ctx.fillText(initial, size/2, size/2);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Apply the texture to the plane material
    planeMaterial.map = texture;
    planeMaterial.needsUpdate = true;

    // Add to scene
    this.scene.add(plane);

    // Store reference
    this.coatOfArmsSprites[polygon.id] = plane;

    // Add fade-in animation
    this.animateFadeIn(planeMaterial);
    
    console.log(`Created default coat of arms for owner ${ownerName} on polygon ${polygon.id}`);
  }

  public cleanup(): void {
    this.clearCoatOfArmsSprites();
  }
}
