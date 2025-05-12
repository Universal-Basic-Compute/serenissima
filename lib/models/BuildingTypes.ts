import * as THREE from 'three';

/**
 * Building position in latitude/longitude format
 */
export interface LatLngPosition {
  lat: number;
  lng: number;
}

/**
 * Building position in Three.js scene coordinates
 */
export interface ScenePosition {
  x: number;
  y: number;
  z: number;
}

/**
 * Union type for building positions
 */
export type BuildingPosition = LatLngPosition | ScenePosition;

/**
 * Building construction costs
 */
export interface BuildingCosts {
  ducats: number;
  timber?: number;
  stone?: number;
  iron?: number;
  glass?: number;
  cloth?: number;
  [key: string]: number | undefined;
}

/**
 * Core building data interface
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
  updated_at?: string;
  name?: string;
  description?: string;
  state?: 'construction' | 'complete' | 'damaged' | 'ruined';
  constructionProgress?: number;
  constructionCosts?: BuildingCosts;
  maintenanceCost?: number;
  incomeGeneration?: number;
  employmentCapacity?: number;
  owner?: string;
  mesh?: THREE.Object3D; // Reference to the 3D object (not persisted)
  connectionPoints?: {x: number, y: number, z: number}[]; // Connection points for all building types
  waterEdge?: {lat: number, lng: number}; // For dock buildings
}

/**
 * Building category for menu organization
 */
export interface BuildingCategory {
  name: string;
  description: string;
  buildings: BuildingDefinition[];
  subcategories?: BuildingCategory[];
}

/**
 * Building definition for available building types
 */
export interface BuildingDefinition {
  name: string;
  type: string;
  category: string;
  subcategory?: string;
  tier: number;
  size: 'Small' | 'Medium' | 'Large' | 'Extra Large';
  unlockCondition: string;
  shortDescription: string;
  fullDescription: string;
  flavorText?: string;
  constructionCosts: BuildingCosts;
  maintenanceCost: number;
  constructionTime: number;
  incomeGeneration: number;
  employmentCapacity: number;
  assets: {
    models: string;
    variants: string[];
    thumbnail: string;
  };
}

/**
 * Building placement validation result
 */
export interface PlacementResult {
  valid: boolean;
  reason?: string;
}

/**
 * Context for building placement validation
 */
export interface PlacementContext {
  landId: string;
  position: THREE.Vector3;
  existingBuildings: BuildingData[];
  terrain?: any; // Terrain data
  owner: string;
}
