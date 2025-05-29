/**
 * Utility functions for hover detection
 */

/**
 * Check if a point is inside a polygon
 */
export function isPointInPolygon(x: number, y: number, polygon: {x: number, y: number}[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if a point is inside a circle
 */
export function isPointInCircle(x: number, y: number, centerX: number, centerY: number, radius: number): boolean {
  return Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)) <= radius;
}

/**
 * Check if a point is inside a rectangle
 */
export function isPointInRect(x: number, y: number, rectX: number, rectY: number, width: number, height: number): boolean {
  return x >= rectX - width/2 && x <= rectX + width/2 && y >= rectY - height/2 && y <= rectY + height/2;
}

/**
 * Calculate distance between two geographic points using the Haversine formula
 */
export function calculateDistance(point1: {lat: number, lng: number}, point2: {lat: number, lng: number}): number {
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
