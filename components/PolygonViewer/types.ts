export type ViewMode = 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'citizens' | 'guilds' | 'loans' | 'knowledge';
export type ActiveViewMode = 'buildings' | 'land' | 'markets' | 'citizens' | 'transport' | 'resources' | 'guilds' | 'governance' | 'loans' | 'knowledge';

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
  lastIncome?: number; // Add this property for income-based coloring
  buildingPoints?: {
    lat: number;
    lng: number;
    id?: string;
  }[]; // Add buildingPoints property for building locations
}

// Add Citizen interface
export interface Citizen {
  CitizenId: string;
  SocialClass: string;
  FirstName: string;
  LastName: string;
  Description: string;
  ImageUrl?: string;
  Wealth: string;
  Home: string; // Building ID
  Work?: string; // Business ID
  NeedsCompletionScore: number;
  CreatedAt: string;
}
