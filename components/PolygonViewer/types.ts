export type ViewMode = 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance';
export type ActiveViewMode = 'buildings' | 'land' | 'markets'; // Add this new type for active views
export type ActiveViewMode = 'buildings' | 'land' | 'markets'; // Add this new type for active views

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface Polygon {
  id: string;
  coordinates: Coordinate[];
  centroid?: Coordinate;
  center?: Coordinate; // Original centroid
  coatOfArmsCenter?: Coordinate; // Center point for coat of arms display
  historicalName?: string;
  englishName?: string;
  historicalDescription?: string;
  nameConfidence?: string;
  owner?: string;
  areaInSquareMeters?: number; // Add area field
  coatOfArmsImage?: string; // Add coat of arms image URL
  simulatedIncome?: number; // Add this property for income-based coloring
}

// Add this to the existing types
export interface Bridge {
  id: string;
  startPoint: Coordinate;
  endPoint: Coordinate;
  startLandId: string;
  endLandId: string;
  name?: string;
  englishName?: string;
  description?: string;
  nameConfidence?: string;
}
