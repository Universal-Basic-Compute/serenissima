export type ViewMode = 'buildings' | 'transport' | 'land';

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface Polygon {
  id: string;
  coordinates: Coordinate[];
  centroid?: Coordinate;
}
