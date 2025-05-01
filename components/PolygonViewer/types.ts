export type ViewMode = 'buildings' | 'transport' | 'land';

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface Polygon {
  id: string;
  coordinates: Coordinate[];
  centroid?: Coordinate;
  historicalName?: string;
  englishName?: string;
  historicalDescription?: string;
  nameConfidence?: string;
  owner?: string; // Add owner field
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
