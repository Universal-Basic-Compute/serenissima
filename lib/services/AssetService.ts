/**
 * AssetService
 * Handles asset loading and caching for images and other resources
 */

import { eventBus, EventTypes } from '../utils/eventBus';

// Add this to EventTypes
EventTypes.COAT_OF_ARMS_LOADED = 'COAT_OF_ARMS_LOADED';

export class AssetService {
  private coatOfArmsImages: Record<string, HTMLImageElement> = {};
  private buildingImages: Record<string, string> = {};
  private isLoadingCoatOfArms: boolean = false;
  
  /**
   * Load coat of arms images
   */
  public async loadCoatOfArmsImages(ownerCoatOfArmsMap: Record<string, string>): Promise<Record<string, HTMLImageElement>> {
    this.isLoadingCoatOfArms = true;
    
    try {
      // Debug log to see what's being passed in
      console.log('Loading coat of arms images for owners:', Object.keys(ownerCoatOfArmsMap));
      
      // Preload images
      const imagePromises: Promise<void>[] = [];
      const newImages: Record<string, HTMLImageElement> = {};
      
      // Target size for coat of arms images (50px is our display size)
      const targetSize = 100; // Slightly larger than display size for better quality
      
      // Create a copy of the current images to avoid modifying state directly
      const updatedImages = {...this.coatOfArmsImages};
      let hasNewImages = false;
      
      Object.entries(ownerCoatOfArmsMap).forEach(([owner, url]) => {
        // Skip if we already have this image loaded
        if (updatedImages[owner]) {
          return;
        }
        
        if (url) {
          // Create an array of URLs to try in order
          const urlsToTry = [
            // 1. Try with our proxy route first (avoids CORS issues)
            `${window.location.origin}/coat-of-arms/${owner}.png`,
            
            // 2. Use the URL from the API if it's from our domain
            url && url.startsWith(window.location.origin) ? url as string : null,
            
            // 3. Try with serenissima.ai domain through our proxy - use owner citizenname, not land ID
            `/coat-of-arms/external/${encodeURIComponent(`https://serenissima.ai/coat-of-arms/${owner}.png`)}`
          ].filter(Boolean); // Remove null entries
          
          // Debug log to see what URLs we're trying
          console.log(`Trying to load coat of arms for owner: ${owner}`, urlsToTry);
          
          // Create a promise that tries each URL in sequence
          const tryLoadImage = async (): Promise<HTMLImageElement> => {
            // Add default fallback URL to the array of URLs to try
            const allUrlsToTry = [
              ...urlsToTry,
              // Add a default fallback image as the last resort
              `${window.location.origin}/coat-of-arms/default.png`
            ];
        
            for (let i = 0; i < allUrlsToTry.length; i++) {
              try {
                const currentUrl = allUrlsToTry[i];
            
                const img = new Image();
                img.crossOrigin = "anonymous"; // Important for CORS
            
                // Create a promise for this specific URL
                const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
                  img.onload = () => {
                    // Resize the image using canvas before storing
                    const resizedImg = this.resizeImageToCanvas(img, targetSize);
                    resolve(resizedImg);
                  };
                  img.onerror = () => {
                    // Don't throw an error on the last attempt (default image)
                    if (i === allUrlsToTry.length - 1) {
                      console.warn(`All image URLs failed for ${owner}, using generated avatar`);
                      // Return a generated avatar instead
                      const canvas = document.createElement('canvas');
                      canvas.width = targetSize;
                      canvas.height = targetSize;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        // Draw a colored circle with the owner's initial
                        this.createDefaultCircularAvatar(ctx, owner, targetSize/2, targetSize/2, targetSize);
                        const generatedImg = new Image();
                        generatedImg.src = canvas.toDataURL('image/png');
                        resolve(generatedImg);
                      } else {
                        reject(new Error(`Failed to create canvas context for ${owner}`));
                      }
                    } else {
                      reject(new Error(`Failed to load image from ${currentUrl}`));
                    }
                  };
                  img.src = currentUrl;
                });
            
                // Wait for this URL to load or fail
                return await loadPromise;
              } catch (error) {
                // If we're at the last URL and it failed, we'll handle it in the onerror handler above
                if (i === allUrlsToTry.length - 1) {
                  console.error(`All URLs failed for ${owner}:`, error);
                  throw error;
                }
                // Otherwise continue to the next URL
              }
            }
        
            // This should never be reached due to the throw above, but TypeScript needs it
            throw new Error("All URLs failed to load");
          };
          
          // Add the promise to our array
          const imagePromise = tryLoadImage()
            .then(img => {
              newImages[owner] = img;
              updatedImages[owner] = img;
              hasNewImages = true;
            })
            .catch(error => {
              console.error(`All URLs failed for ${owner}:`, error);
              // We'll handle this case in the createDefaultCircularAvatar function
            });
          
          imagePromises.push(imagePromise.catch(error => {
            console.warn(`Error loading coat of arms for ${owner}:`, error);
            // Return null to prevent the Promise.allSettled from failing
            return null;
          }));
        }
      });
      
      // Wait for all images to either load or fail
      await Promise.allSettled(imagePromises);
      
      // Only update state if we have new images
      if (hasNewImages) {
        this.coatOfArmsImages = updatedImages;
        
        // Emit event
        eventBus.emit(EventTypes.COAT_OF_ARMS_LOADED, {
          coatOfArmsImages: this.coatOfArmsImages
        });
      }
      
      return this.coatOfArmsImages;
    } catch (error) {
      console.error('Error loading coat of arms images:', error);
      return this.coatOfArmsImages;
    } finally {
      this.isLoadingCoatOfArms = false;
    }
  }
  
  /**
   * Get building image path
   */
  public async getBuildingImagePath(buildingType: string, variant?: string): Promise<string> {
    const cacheKey = variant ? `${buildingType}_${variant}` : buildingType;
    
    // Check cache first
    if (this.buildingImages[cacheKey]) {
      return this.buildingImages[cacheKey];
    }
    
    try {
      // Try the direct flat path first
      const flatImagePath = `/images/buildings/${buildingType}.jpg`;
      
      // Check if the image exists
      try {
        const response = await fetch(flatImagePath, { method: 'HEAD' });
        if (response.ok) {
          this.buildingImages[cacheKey] = flatImagePath;
          return flatImagePath;
        }
      } catch (error) {
        console.log(`Image not found at ${flatImagePath}, trying alternative paths`);
      }
      
      // If direct path fails, try the API
      const response = await fetch(`/api/search-building-image?type=${encodeURIComponent(buildingType)}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.imagePath) {
          this.buildingImages[cacheKey] = data.imagePath;
          return data.imagePath;
        } else {
          // Use fallback image if no specific image found
          this.buildingImages[cacheKey] = '/images/buildings/market_stall.jpg';
          return '/images/buildings/market_stall.jpg';
        }
      } else {
        this.buildingImages[cacheKey] = '/images/buildings/market_stall.jpg';
        return '/images/buildings/market_stall.jpg';
      }
    } catch (error) {
      console.error('Error fetching building image path:', error);
      this.buildingImages[cacheKey] = '/images/buildings/market_stall.jpg';
      return '/images/buildings/market_stall.jpg';
    }
  }
  
  /**
   * Helper function to resize an image using canvas
   */
  private resizeImageToCanvas(img: HTMLImageElement, targetSize: number): HTMLImageElement {
    // Create a canvas element
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.warn('Could not get canvas context for image resizing');
      return img; // Return original if canvas context not available
    }
    
    // Determine dimensions while maintaining aspect ratio
    let width = targetSize;
    let height = targetSize;
    
    if (img.width > img.height) {
      // Landscape image
      height = (img.height / img.width) * targetSize;
    } else if (img.height > img.width) {
      // Portrait image
      width = (img.width / img.height) * targetSize;
    }
    
    // Set canvas size
    canvas.width = width;
    canvas.height = height;
    
    // Draw the image on the canvas, resized
    ctx.drawImage(img, 0, 0, width, height);
    
    // Create a new image from the canvas
    const resizedImg = new Image();
    resizedImg.src = canvas.toDataURL('image/png');
    
    return resizedImg;
  }
  
  /**
   * Create a default circular avatar for owners without coat of arms
   */
  private createDefaultCircularAvatar(
    ctx: CanvasRenderingContext2D, 
    owner: string, 
    x: number, 
    y: number, 
    size: number
  ): void {
    try {
      // Save the current context state
      ctx.save();
      
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
      const baseColor = getColorFromString(owner);
      
      // Draw a circular background
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = baseColor;
      ctx.fill();
      
      // Add a white border
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Add the owner's initials
      ctx.font = `bold ${size * 0.4}px Arial`;
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Get the first letter of the owner name, handle empty strings
      const initial = owner && owner.length > 0 ? owner.charAt(0).toUpperCase() : '?';
      ctx.fillText(initial, x, y);
      
      // Restore the context state
      ctx.restore();
    } catch (error) {
      console.error('Error creating default avatar:', error);
      
      // Absolute fallback - just draw a gray circle with a question mark
      try {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#888888';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = `bold ${size * 0.4}px Arial`;
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x, y);
        ctx.restore();
      } catch (e) {
        // If even this fails, just silently continue
        console.error('Critical error in fallback avatar rendering:', e);
      }
    }
  }
  
  /**
   * Get coat of arms images
   */
  public getCoatOfArmsImages(): Record<string, HTMLImageElement> {
    return this.coatOfArmsImages;
  }
  
  /**
   * Check if coat of arms images are loading
   */
  public isLoadingCoatOfArmsImages(): boolean {
    return this.isLoadingCoatOfArms;
  }
}

// Export a singleton instance
export const assetService = new AssetService();
