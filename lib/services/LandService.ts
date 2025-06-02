/**
 * LandService
 * Handles land-related data and operations
 */

export class LandService {
  private static instance: LandService;
  private landImages: Record<string, HTMLImageElement> = {};
  private isLoadingImages: boolean = false;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): LandService {
    if (!LandService.instance) {
      LandService.instance = new LandService();
    }
    return LandService.instance;
  }

  /**
   * Preload land images for a set of polygons
   */
  public async preloadLandImages(polygons: any[]): Promise<Record<string, HTMLImageElement>> {
    if (this.isLoadingImages) {
      console.log('Already loading land images, waiting for completion...');
      return this.landImages;
    }

    console.log('Starting to preload land images for', polygons.length, 'polygons');
    
    this.isLoadingImages = true;
    
    try {
      let loadedCount = 0;
      let totalPolygons = 0;
      
      // Count valid polygons with IDs first
      for (let i = 0; i < polygons.length; i++) {
        const polygon = polygons[i];
        if (polygon && polygon.id) {
          totalPolygons++;
        }
      }
      
      if (totalPolygons === 0) {
        console.log('No valid polygons with IDs found for image loading');
        return this.landImages;
      }
      
      console.log(`Attempting to load ${totalPolygons} land images`);
      
      // Use a safer approach with for loop instead of forEach
      for (let i = 0; i < polygons.length; i++) {
        const polygon = polygons[i];
        if (!polygon || !polygon.id) continue;
        
        // Skip if we already have this image loaded
        if (this.landImages[polygon.id]) {
          loadedCount++;
          continue;
        }
        
        try {
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error(`Timeout loading image for polygon ${polygon.id}`));
            }, 5000); // 5 second timeout
            
            img.onload = () => {
              clearTimeout(timeoutId);
              this.landImages[polygon.id] = img;
              loadedCount++;
              resolve();
            };
            
            img.onerror = () => {
              clearTimeout(timeoutId);
              console.warn(`Failed to load image for polygon ${polygon.id}`);
              loadedCount++;
              reject(new Error(`Failed to load image for polygon ${polygon.id}`));
            };
            
            img.crossOrigin = "anonymous"; // Add cross-origin attribute to prevent CORS issues
            img.src = `/images/lands/${polygon.id}.png`;
          }).catch(error => {
            // Catch and log errors but continue loading other images
            console.error(`Error loading image for polygon ${polygon.id}:`, error);
          });
        } catch (error) {
          console.error(`Error processing image for polygon ${polygon.id}:`, error);
          loadedCount++;
        }
      }
      
      console.log(`Loaded ${Object.keys(this.landImages).length} land images (${loadedCount - Object.keys(this.landImages).length} failed)`);
      return this.landImages;
    } finally {
      this.isLoadingImages = false;
    }
  }

  /**
   * Get all loaded land images
   */
  public getLandImages(): Record<string, HTMLImageElement> {
    return this.landImages;
  }

  /**
   * Get a specific land image
   */
  public getLandImage(polygonId: string): HTMLImageElement | undefined {
    return this.landImages[polygonId];
  }

  /**
   * Get land image URL for a specific polygon
   */
  public getLandImageUrl(polygonId: string): Promise<string> {
    return Promise.resolve(`/images/lands/${polygonId}.png`);
  }

  /**
   * Clear all loaded land images
   */
  public clearLandImages(): void {
    this.landImages = {};
  }

  /**
   * Save custom image settings for a land
   * @param polygonId The ID of the polygon
   * @param settings The custom settings to save (position, size, and reference scale)
   */
  public async saveImageSettings(
    polygonId: string, 
    settings: { 
      lat?: number, // Now expects lat
      lng?: number, // Now expects lng
      x?: number, // Old field, might be present from spread
      y?: number, // Old field, might be present from spread
      width: number, 
      height: number, 
      referenceScale?: number
    }
  ): Promise<boolean> {
    try {
      // Ensure we are saving the new lat/lng format and removing old x/y if they exist from a spread.
      const settingsToSave: {
        lat: number,
        lng: number,
        width: number,
        height: number,
        referenceScale?: number
      } = {
        lat: settings.lat!, // Asserting lat/lng will be present
        lng: settings.lng!,
        width: settings.width,
        height: settings.height,
        referenceScale: settings.referenceScale !== undefined ? settings.referenceScale : window.currentScale || 3
      };

      if (settings.lat === undefined || settings.lng === undefined) {
        console.error(`Attempted to save imageSettings for ${polygonId} without lat/lng. Settings:`, settings);
        return false;
      }
      
      console.log(`Saving image settings for polygon ${polygonId} (lat/lng format):`, settingsToSave);
      const response = await fetch(`/api/lands/${polygonId}/image-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings: settingsToSave }),
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Successfully saved image settings for polygon ${polygonId}:`, data);
        return true;
      } else {
        console.error(`Failed to save image settings for polygon ${polygonId}:`, 
          await response.text());
        return false;
      }
    } catch (error) {
      console.error(`Error saving image settings for polygon ${polygonId}:`, error);
      return false;
    }
  }
}

// Export a singleton instance
export const landService = LandService.getInstance();
