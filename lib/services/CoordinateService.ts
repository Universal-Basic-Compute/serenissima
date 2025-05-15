/**
 * CoordinateService
 * Handles coordinate transformations between different coordinate systems:
 * - Lat/Lng (geographic coordinates)
 * - World coordinates (x, y in meters)
 * - Screen coordinates (pixels on canvas)
 */

export class CoordinateService {
  // Constants for Venice center coordinates
  private static readonly VENICE_CENTER_LAT = 45.4371;
  private static readonly VENICE_CENTER_LNG = 12.3326;
  private static readonly SCALE_FACTOR = 20000; // Scale factor for converting lat/lng to world coordinates
  private static readonly VERTICAL_SCALE = 1.4; // Vertical scale factor for isometric view

  /**
   * Convert lat/lng to world coordinates
   */
  public static latLngToWorld(lat: number, lng: number): { x: number, y: number } {
    return {
      x: (lng - this.VENICE_CENTER_LNG) * this.SCALE_FACTOR,
      y: (lat - this.VENICE_CENTER_LAT) * this.SCALE_FACTOR
    };
  }

  /**
   * Convert world coordinates to lat/lng
   */
  public static worldToLatLng(x: number, y: number): { lat: number, lng: number } {
    return {
      lat: y / this.SCALE_FACTOR + this.VENICE_CENTER_LAT,
      lng: x / this.SCALE_FACTOR + this.VENICE_CENTER_LNG
    };
  }

  /**
   * Convert world coordinates to screen coordinates (isometric projection)
   */
  public static worldToScreen(
    x: number, 
    y: number, 
    scale: number, 
    offset: { x: number, y: number }, 
    canvasWidth: number, 
    canvasHeight: number
  ): { x: number, y: number } {
    return {
      x: x * scale + canvasWidth / 2 + offset.x,
      y: (-y) * scale * this.VERTICAL_SCALE + canvasHeight / 2 + offset.y
    };
  }

  /**
   * Convert screen coordinates to world coordinates
   */
  public static screenToWorld(
    screenX: number, 
    screenY: number, 
    scale: number, 
    offset: { x: number, y: number }, 
    canvasWidth: number, 
    canvasHeight: number
  ): { x: number, y: number } {
    return {
      x: (screenX - canvasWidth / 2 - offset.x) / scale,
      y: -((screenY - canvasHeight / 2 - offset.y) / (scale * this.VERTICAL_SCALE))
    };
  }

  /**
   * Convert screen coordinates directly to lat/lng
   */
  public static screenToLatLng(
    screenX: number, 
    screenY: number, 
    scale: number, 
    offset: { x: number, y: number }, 
    canvasWidth: number, 
    canvasHeight: number
  ): { lat: number, lng: number } {
    const world = this.screenToWorld(screenX, screenY, scale, offset, canvasWidth, canvasHeight);
    return this.worldToLatLng(world.x, world.y);
  }

  /**
   * Convert lat/lng directly to screen coordinates
   */
  public static latLngToScreen(
    lat: number, 
    lng: number, 
    scale: number, 
    offset: { x: number, y: number }, 
    canvasWidth: number, 
    canvasHeight: number
  ): { x: number, y: number } {
    const world = this.latLngToWorld(lat, lng);
    return this.worldToScreen(world.x, world.y, scale, offset, canvasWidth, canvasHeight);
  }

  /**
   * Calculate distance between two lat/lng points in meters
   */
  public static calculateDistance(point1: {lat: number, lng: number}, point2: {lat: number, lng: number}): number {
    const R = 6371000; // Earth radius in meters
    const lat1 = point1.lat * Math.PI / 180;
    const lat2 = point2.lat * Math.PI / 180;
    const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
    const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Calculate isometric X coordinate
   */
  public static calculateIsoX(
    x: number, 
    y: number, 
    scale: number, 
    offset: { x: number, y: number }, 
    canvasWidth: number
  ): number {
    return x * scale + canvasWidth / 2 + offset.x;
  }

  /**
   * Calculate isometric Y coordinate
   */
  public static calculateIsoY(
    x: number, 
    y: number, 
    scale: number, 
    offset: { x: number, y: number }, 
    canvasHeight: number
  ): number {
    return (-y) * scale * this.VERTICAL_SCALE + canvasHeight / 2 + offset.y;
  }
}

// Export a singleton instance
export const coordinateService = new CoordinateService();
