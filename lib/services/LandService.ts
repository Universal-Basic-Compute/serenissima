/**
 * LandService
 * Handles land-related data and operations, including client-side caching.
 */

const LAND_SERVICE_CACHE_KEY = 'landServiceCache';
const LAND_CACHE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface LandCache {
  images: Record<string, { src: string; timestamp: number }>;
  settings: Record<string, { data: any; timestamp: number }>;
}

export class LandService {
  private static instance: LandService;
  private landImages: Record<string, HTMLImageElement> = {}; // In-memory cache for loaded HTMLImageElement
  private isLoadingImages: boolean = false;

  private constructor() {}

  private _getLocalStorageCache(): LandCache {
    if (typeof window === 'undefined') {
      return { images: {}, settings: {} };
    }
    try {
      const cachedData = localStorage.getItem(LAND_SERVICE_CACHE_KEY);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        // Ensure both images and settings keys exist
        return {
          images: parsed.images || {},
          settings: parsed.settings || {}
        };
      }
    } catch (error) {
      console.error('Error reading land service cache from localStorage:', error);
    }
    return { images: {}, settings: {} };
  }

  private _setLocalStorageCache(cache: LandCache): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(LAND_SERVICE_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error('Error writing land service cache to localStorage:', error);
    }
  }

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
      console.log('LandService: Already loading land images, waiting for completion...');
      // Potentially return a promise that resolves when current loading is done
      return this.landImages;
    }

    console.log('LandService: Starting to preload land images for', polygons.length, 'polygons');
    this.isLoadingImages = true;
    const cache = this._getLocalStorageCache();
    let updatedCache = false;

    const promises = polygons.map(async (polygon) => {
      if (!polygon || !polygon.id) return;

      // Skip if already in memory cache
      if (this.landImages[polygon.id]) return;

      const expectedSrc = `/images/lands/${polygon.id}.png`;
      const cachedImageInfo = cache.images[polygon.id];

      if (cachedImageInfo && cachedImageInfo.src === expectedSrc && (Date.now() - cachedImageInfo.timestamp < LAND_CACHE_EXPIRY_MS)) {
        // Valid cache entry exists
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = cachedImageInfo.src;
        // We assume the browser has this cached, so it should load quickly.
        // For simplicity, we'll add it directly. For robustness, one might still use onload.
        this.landImages[polygon.id] = img;
        // console.log(`LandService: Image for ${polygon.id} taken from localStorage assumption (browser cache).`);
        return;
      }

      // Not cached, expired, or src mismatch: Load image
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => reject(new Error(`Timeout loading image for polygon ${polygon.id}`)), 15000);
          img.onload = () => {
            clearTimeout(timeoutId);
            this.landImages[polygon.id] = img;
            cache.images[polygon.id] = { src: img.src, timestamp: Date.now() };
            updatedCache = true;
            // console.log(`LandService: Image for ${polygon.id} loaded and cached in localStorage.`);
            resolve();
          };
          img.onerror = () => {
            clearTimeout(timeoutId);
            console.warn(`LandService: Failed to load image for polygon ${polygon.id} from ${expectedSrc}`);
            // Optionally, remove from cache or mark as failed if desired
            if (cache.images[polygon.id]) {
              delete cache.images[polygon.id];
              updatedCache = true;
            }
            reject(new Error(`Failed to load image for polygon ${polygon.id}`));
          };
          img.crossOrigin = "anonymous";
          img.src = expectedSrc;
        });
      } catch (error) {
        // console.error(`LandService: Error processing image for polygon ${polygon.id}:`, error);
      }
    });

    await Promise.allSettled(promises);

    if (updatedCache) {
      this._setLocalStorageCache(cache);
    }

    this.isLoadingImages = false;
    console.log(`LandService: Preloading complete. ${Object.keys(this.landImages).length} images in memory cache.`);
    return this.landImages;
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
        console.log(`LandService: Successfully saved image settings for polygon ${polygonId}:`, data);
        
        // Cache the saved settings
        const cache = this._getLocalStorageCache();
        cache.settings[polygonId] = { data: settingsToSave, timestamp: Date.now() };
        this._setLocalStorageCache(cache);
        console.log(`LandService: Image settings for ${polygonId} cached in localStorage.`);
        return true;
      } else {
        console.error(`LandService: Failed to save image settings for polygon ${polygonId}:`, 
          await response.text());
        return false;
      }
    } catch (error) {
      console.error(`LandService: Error saving image settings for polygon ${polygonId}:`, error);
      return false;
    }
  }

  /**
   * Get stored image settings for a land polygon from localStorage.
   * @param polygonId The ID of the polygon
   * @returns The cached settings if found and not expired, otherwise null.
   */
  public getStoredImageSettings(polygonId: string): any | null {
    const cache = this._getLocalStorageCache();
    const cachedSetting = cache.settings[polygonId];

    if (cachedSetting && (Date.now() - cachedSetting.timestamp < LAND_CACHE_EXPIRY_MS)) {
      console.log(`LandService: Retrieved image settings for ${polygonId} from localStorage cache.`);
      return cachedSetting.data;
    }
    // console.log(`LandService: No valid cached image settings for ${polygonId}.`);
    return null;
  }
}

// Export a singleton instance
export const landService = LandService.getInstance();
