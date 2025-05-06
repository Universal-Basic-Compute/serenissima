import { Coordinate } from '../../components/PolygonViewer/types';

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
  return coordinates.map(coord => ({
    // Apply latitude correction factor to longitude values
    x: (coord.lng - centerLng) * scale * latCorrectionFactor,
    y: (coord.lat - centerLat) * scale
  }));
}
