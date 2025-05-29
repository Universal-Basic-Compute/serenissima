/**
 * Types for building data and positions
 */

/**
 * Represents a position with latitude and longitude
 */
export interface LatLngPosition {
  lat: number;
  lng: number;
}

/**
 * Represents a position in a 3D scene
 */
export interface ScenePosition {
  x: number;
  y: number;
  z: number;
}

/**
 * Union type for different position formats
 */
export type BuildingPosition = LatLngPosition | ScenePosition;

/**
 * Building data structure
 */
export interface BuildingData {
  id: string;
  type: string;
  land_id: string;
  position: BuildingPosition;
  rotation: number;
  variant: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  name: string;
  description: string;
  state: string;
  constructionProgress: number;
  owner: string;
}
