export interface Point {
  x: number;
  y: number;
}

export interface Canal {
  points: Point[];
  width: number;
  svgPath: string;
}

export interface Island {
  points: Point[];
  isCampo: boolean;
  svgPath: string;
}

export interface Bridge {
  start: Point;
  end: Point;
  width: number;
  svgPath: string;
}

export interface VeniceConfig {
  canalDensity: number;
  merchantDistrictDensity: number;
  residentialDistrictDensity: number;
  bridgeDensity: number;
  campoFrequency: number;
  erosionFactor: number;
  islandDensity?: number; // New option
  buildingDensity?: number; // New option
}

// Utility function to create a smooth path from points
export function createSmoothPath(points: Point[]): string {
  if (points.length < 2) return '';
  
  let path = `M ${points[0].x} ${points[0].y}`;
  
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i-1];
    const p1 = points[i];
    const p2 = points[i+1];
    
    // Calculate control points for smooth curve
    const cp1x = p1.x - (p1.x - p0.x) / 3;
    const cp1y = p1.y - (p1.y - p0.y) / 3;
    const cp2x = p1.x + (p2.x - p1.x) / 3;
    const cp2y = p1.y + (p2.y - p1.y) / 3;
    
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  
  return path;
}

// Add noise to a line to make it more organic
export function addNoise(points: Point[], noiseFactor: number): Point[] {
  return points.map((point, i) => {
    // Don't add noise to first and last points
    if (i === 0 || i === points.length - 1) return point;
    
    return {
      x: point.x + (Math.random() * 2 - 1) * noiseFactor,
      y: point.y + (Math.random() * 2 - 1) * noiseFactor
    };
  });
}

// Check if two line segments intersect
export function linesIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const det = (a2.x - a1.x) * (b2.y - b1.y) - (b2.x - b1.x) * (a2.y - a1.y);
  if (det === 0) return false;
  
  const lambda = ((b2.y - b1.y) * (b2.x - a1.x) + (b1.x - b2.x) * (b2.y - a1.y)) / det;
  const gamma = ((a1.y - a2.y) * (b2.x - a1.x) + (a2.x - a1.x) * (b2.y - a1.y)) / det;
  
  return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
}
