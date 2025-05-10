export type ViewMode = 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'citizens';
export type ActiveViewMode = 'buildings' | 'land' | 'markets' | 'citizens' | 'transport'; // Added transport to active views

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
