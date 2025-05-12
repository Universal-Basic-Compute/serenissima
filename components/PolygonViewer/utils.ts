import * as THREE from 'three';
import { Coordinate } from './types';

/**
 * Normalizes coordinates relative to center and applies scale
 */
export function normalizeCoordinates(
  coordinates: Coordinate[],
  centerLat: number,
  centerLng: number,
  scale: number,
  latCorrectionFactor: number
): { x: number; y: number }[] {
  // Log the input parameters for debugging
  /**console.log(`normalizeCoordinates called with:`, {
    centerLat,
    centerLng,
    scale,
    latCorrectionFactor
  });*/
  
  const result = coordinates.map(coord => {
    // Calculate intermediate values
    const lngDiff = coord.lng - centerLng;
    const latDiff = coord.lat - centerLat;
    
    // Log intermediate calculations
    //console.log(`Coordinate: lat=${coord.lat}, lng=${coord.lng}`);
    //console.log(`Differences: latDiff=${latDiff}, lngDiff=${lngDiff}`);
    
    // Apply scale
    const scaledLngDiff = lngDiff * scale;
    const scaledLatDiff = latDiff * scale;
    
    //console.log(`Scaled differences: scaledLatDiff=${scaledLatDiff}, scaledLngDiff=${scaledLngDiff}`);
    
    // Apply latitude correction to longitude (not latitude)
    const finalX = scaledLngDiff * latCorrectionFactor;
    const finalY = scaledLatDiff;
    
    //console.log(`Final normalized coordinates: x=${finalX}, y=${finalY}`);
    
    return {
      // Apply latitude correction factor to longitude values
      x: finalX,
      y: finalY
    };
  });
  
  return result;
}

/**
 * Creates a THREE.Shape from normalized coordinates
 */
export function createPolygonShape(normalizedCoords: { x: number; y: number }[]): THREE.Shape {
  const shape = new THREE.Shape();
  
  // Start the shape with the first point
  shape.moveTo(normalizedCoords[0].x, normalizedCoords[0].y);
  
  // Add the rest of the points
  for (let i = 1; i < normalizedCoords.length; i++) {
    shape.lineTo(normalizedCoords[i].x, normalizedCoords[i].y);
  }
  
  return shape;
}

/**
 * Calculates the bounds of polygon coordinates
 */
export function calculateBounds(polygons: { coordinates: Coordinate[] }[]) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  
  // Find the bounds of all polygon coordinates
  polygons.forEach(polygon => {
    if (polygon.coordinates && polygon.coordinates.length > 0) {
      polygon.coordinates.forEach(coord => {
        minLat = Math.min(minLat, coord.lat);
        maxLat = Math.max(maxLat, coord.lat);
        minLng = Math.min(minLng, coord.lng);
        maxLng = Math.max(maxLng, coord.lng);
      });
    }
  });
  
  // Calculate center and scale
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  
  // Calculate scale to fit polygons in a reasonable size
  // (normalize to roughly -50 to 50 units)
  const latRange = maxLat - minLat;
  const lngRange = maxLng - minLng;
  
  // Calculate the latitude correction factor
  // At Venezia's latitude (~45 degrees), longitude degrees are about 70% the length of latitude degrees
  const latCorrectionFactor = Math.cos(centerLat * Math.PI / 180);
  
  // Adjust the longitude range with the correction factor
  const correctedLngRange = lngRange * latCorrectionFactor;
  
  // Use the larger of the two ranges for scaling
  const maxRange = Math.max(latRange, correctedLngRange);
  const scale = maxRange > 0 ? 100 / maxRange : 1;
  
  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    centerLat,
    centerLng,
    scale,
    latCorrectionFactor
  };
}
