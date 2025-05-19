export type ViewMode = 'buildings' | 'land' | 'transport' | 'resources' | 'contracts' | 'governance' | 'citizens' | 'guilds' | 'loans' | 'knowledge';
export type ActiveViewMode = 'buildings' | 'land' | 'contracts' | 'citizens' | 'transport' | 'resources' | 'guilds' | 'governance' | 'loans' | 'knowledge';

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
  coatOfArmsImageUrl?: string; // Add coat of arms image URL
  lastIncome?: number; // Add this property for income-based coloring
  buildingPoints?: {
    lat: number;
    lng: number;
    id?: string;
  }[]; // Add buildingPoints property for building locations
}

// Add Citizen interface
export interface Citizen {
  citizenid: string;
  socialclass: string;
  firstname: string;
  lastname: string;
  description: string;
  imageurl?: string;
  profileimage?: string;
  wealth: string;
  position?: {
    lat: number;
    lng: number;
  };
  needscompletionscore: number;
  createdat: string;
  home?: string;
  work?: string;
}
